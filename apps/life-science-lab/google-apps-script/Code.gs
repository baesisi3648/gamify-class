/* Install with generated Domain.gs and Seed.gs. No Eco World bindings are used. */
const LAB_COLUMNS = {
  Students: ['id','year','grade','classNo','number','name','passwordHash','authVersion','active','createdAt','groupId','courseClasses'],
  Assessments: ['id','title','subject','category','year','description','guide','startAt','deadline','status','version','groupId'],
  AssessmentFields: ['id','assessmentId','title','guide','type','required','order','retired','groupId'],
  Reports: ['id','studentId','assessmentId','title','fields','content','status','version','createdAt','updatedAt','submittedAt','groupId'],
  Reviews: ['id','reportId','status','feedback','reviewer','createdAt','sequence','reportVersion','groupId'],
  Publications: ['id','reportId','category','year','draft','version','visible','published','publishedVersion','publishedAt','createdAt','groupId'],
  PublicationVersions: ['id','publicationId','version','content','createdAt','groupId'],
  Settings: ['id','value','expiresAt']
};
function labEnsureColumns_(sheet) {
  Object.keys(LAB_COLUMNS).forEach((name) => {
    let tab=sheet.getSheetByName(name);
    if(!tab) tab=sheet.insertSheet(name);
    const cols=LAB_COLUMNS[name];
    if(tab.getLastRow()>0) {
      const current=tab.getRange(1,1,1,cols.length).getValues()[0];
      while(current.length && current[current.length-1]==='')current.pop();
      if(!current.length || current.some((key,i) => key!==cols[i])) throw new Error(name+' 머리글이 다릅니다. 기존 데이터는 변경하지 않았습니다.');
      if(current.length===cols.length) return;
    }
    // Append-only schema migration. Never clear or rewrite student/report rows.
    tab.getRange(1,1,1,cols.length).setValues([cols]).setFontWeight('bold').setBackground('#eeeeee');
    tab.setFrozenRows(1);
  });
}
function setupLifeScienceLab() {
  const props = PropertiesService.getScriptProperties();
  const bootstrap = typeof labBootstrapConfig_ === 'function' ? labBootstrapConfig_() : null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet() || (bootstrap ? SpreadsheetApp.openById(bootstrap.spreadsheetId) : null);
  if (!sheet) throw new Error('새 연구소 스프레드시트에 연결된 Apps Script에서 실행하세요.');
  if (props.getProperty('LAB_SPREADSHEET_ID') && props.getProperty('LAB_SPREADSHEET_ID') !== sheet.getId()) throw new Error('다른 저장소로 변경할 수 없습니다.');
  if (sheet.getName() !== 'Gamify Class - 생명과학 탐구 연구소') throw new Error('연구소 전용 스프레드시트 이름을 확인하세요. 생태월드 시트는 사용하지 않습니다.');
  props.setProperty('LAB_SPREADSHEET_ID', sheet.getId());
  if (!props.getProperty('LAB_WEBHOOK_SECRET')) props.setProperty('LAB_WEBHOOK_SECRET', bootstrap?.secret || Utilities.getUuid() + Utilities.getUuid());
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    labEnsureColumns_(sheet);
    props.setProperty('LAB_SCHEMA_VERSION','2');
    const db = labStore_(sheet);
    if (!db.all('Assessments').some((a) => a.id === LAB_SEED.id)) {
      LabDomain.execute(db, 'assessment.save', LAB_SEED, { role: 'teacher' }, labContext_());
    }
    db.flush();
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}
function labContext_() { return { now: new Date().toISOString(), uuid: () => Utilities.getUuid() }; }
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const envelope = JSON.parse(e.postData.contents);
    if (typeof envelope.body !== 'string' || envelope.body.length > 150000) throw new Error('Invalid request');
    const props = PropertiesService.getScriptProperties();
    const bootstrap = typeof labBootstrapConfig_ === 'function' ? labBootstrapConfig_() : null;
    const secret = props.getProperty('LAB_WEBHOOK_SECRET') || bootstrap?.secret;
    if (!secret) throw new Error('Not configured');
    const signature = Utilities.computeHmacSha256Signature(envelope.body, secret, Utilities.Charset.UTF_8).map((v) => ((v + 256) % 256).toString(16).padStart(2, '0')).join('');
    if (!constantEqual_(signature, envelope.signature)) return labJson_({ ok: false, status: 403, error: '잘못된 서버 서명' });
    const req = JSON.parse(envelope.body);
    if (Math.abs(Date.now() - req.timestamp) > 60000 || !/^[a-f0-9]{32}$/.test(req.nonce)) throw new Error('Expired request');
    // First deployment may inject a private initializer, never a public endpoint.
    // Initialization is allowed only after a valid server signature.
    if (!props.getProperty('LAB_WEBHOOK_SECRET') && bootstrap) {
      props.setProperty('LAB_WEBHOOK_SECRET', bootstrap.secret);
      props.setProperty('LAB_SPREADSHEET_ID', bootstrap.spreadsheetId);
      setupLifeScienceLab();
    }
    const cache = CacheService.getScriptCache();
    if (cache.get(req.nonce)) throw new Error('Replayed request');
    cache.put(req.nonce, '1', 120);
    // Read-only actions skip the global script lock so 30 students logging in or
    // opening pages at once are not serialized behind each other and behind saves.
    // Writes (saves, claims, rate counters, imports) still take the lock.
    if (labIsReadOnly_(req) && props.getProperty('LAB_SCHEMA_VERSION')==='2') {
      const cacheKey = labPublicCacheKey_(cache, req);
      const hit = cacheKey && cache.get(cacheKey);
      if (hit) return labJson_({ ok: true, result: JSON.parse(hit) });
      const result = LabDomain.execute(labStore_(SpreadsheetApp.openById(props.getProperty('LAB_SPREADSHEET_ID'))), req.action, req.payload, req.actor, labContext_());
      if (cacheKey) labCachePut_(cache, cacheKey, JSON.stringify(result));
      return labJson_({ ok: true, result });
    }
    if (!lock.tryLock(15000)) return labJson_({ ok: false, status: 503, error: '접속이 몰려 처리가 늦어지고 있습니다. 10초 뒤 다시 시도하세요.' });
    const sheet=SpreadsheetApp.openById(props.getProperty('LAB_SPREADSHEET_ID'));
    if(props.getProperty('LAB_SCHEMA_VERSION')!=='2'){labEnsureColumns_(sheet);props.setProperty('LAB_SCHEMA_VERSION','2');}
    const db = labStore_(sheet);
    if (req.action === 'auth.login' && Array.isArray(req.payload && req.payload.rateKeys) && req.payload.rateKeys.length) {
      // Fallback rate counters (no Cloudflare limiter): commit them first so a later
      // login failure (401/409) can't discard the attempt count.
      req.payload.rateKeys.slice(0, 4).forEach((r) => { LabDomain.execute(db, 'auth.rate', r, req.actor, labContext_()); db.flush(); SpreadsheetApp.flush(); });
      req.payload.rateKeys = [];
    }
    const result = LabDomain.execute(db, req.action, req.payload, req.actor, labContext_());
    db.flush();
    if(req.action==='sheets.refresh') result.views=labRefreshViews_(sheet,db);
    // Roster registration is already saved if this optional derived-view update fails.
    // Never misreport a successful import as a failed student registration.
    if(req.action==='students.import' && req.actor?.owner){
      try{result.views=labRefreshViews_(sheet,db);}catch(error){result.sheetWarning='명단은 저장됐습니다. 한글 시트 새로고침을 실행하세요.';}
    }
    SpreadsheetApp.flush();
    // Bump after the sheet is flushed, so a lock-free read can't cache pre-write data under the new generation.
    if (LAB_PUBLIC_WRITES.indexOf(req.action) >= 0) labBumpPublicCache_(cache);
    return labJson_({ ok: true, result });
  } catch (error) {
    return labJson_({ ok: false, status: error.status || 500, error: error.status ? error.message : '저장소 설정 또는 처리 오류입니다. 교사에게 문의하세요.' });
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}
// Actions that never write. auth.login is read-only unless it carries rate counters
// (fallback when the Worker has no Cloudflare rate limiter) or a first-PIN claim.
const LAB_READ_ACTIONS = ['bootstrap','archive','groups.list','me','myReports','report.meta','students.list','assessments.list','reports.list','publications.list','auth.group','auth.lookup'];
function labIsReadOnly_(req) {
  if (req.action === 'auth.login') return !(req.payload && (req.payload.claimHash || (Array.isArray(req.payload.rateKeys) && req.payload.rateKeys.length)));
  return LAB_READ_ACTIONS.indexOf(req.action) >= 0;
}
// Public, identical-for-everyone responses are cached for 60s. Writes that change
// them bump the generation, so teachers' edits show up on the next request.
// Student autosaves do not bump it (they never change these public responses).
const LAB_PUBLIC_WRITES = ['assessment.save','groups.create','groups.update','publication.publish','publication.hide'];
const LAB_PUBLIC_CACHE = ['bootstrap','archive','groups.list'];
function labPublicCacheKey_(cache, req) {
  if (LAB_PUBLIC_CACHE.indexOf(req.action) < 0) return null;
  const gen = cache.get('lab:pubgen') || '0';
  return 'lab:pub:' + gen + ':' + req.action + ':' + String((req.payload && req.payload.groupId) || 'legacy').slice(0, 80);
}
function labBumpPublicCache_(cache) { cache.put('lab:pubgen', String(Date.now()) + Math.random().toString(36).slice(2, 6), 21600); }
function labUtf8Bytes_(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3; }
  return n;
}
// CacheService limit is 100KB per value. Caching is an optimization: never fail the read.
function labCachePut_(cache, key, text) {
  if (labUtf8Bytes_(text) > 90000) return;
  try { cache.put(key, text, 60); } catch (error) {}
}
/* Run once manually from the Apps Script editor (or after heavy use) to delete expired
   login rate-limit rows that accumulate in Settings. Students, reports, groups untouched. */
function labPruneRateRows() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('LAB_SPREADSHEET_ID'));
    const tab = sheet.getSheetByName('Settings'), width = LAB_COLUMNS.Settings.length, last = tab.getLastRow();
    if (last < 2) return 0;
    const rows = tab.getRange(2, 1, last - 1, width).getValues(), now = new Date().toISOString();
    const expired = [];
    rows.forEach((r, i) => {
      const id = r[0] === '' ? '' : JSON.parse(String(r[0])), exp = r[2] === '' ? null : JSON.parse(String(r[2]));
      if (String(id).indexOf('rate:') === 0 && (!exp || exp <= now)) expired.push(i + 2);
    });
    // Delete only expired rate rows, bottom-up in contiguous blocks. Group settings and
    // other rows are never cleared, so lock-free readers never see them missing.
    for (let i = expired.length - 1; i >= 0;) {
      let start = expired[i], count = 1;
      while (i - count >= 0 && expired[i - count] === start - 1) { start--; count++; }
      tab.deleteRows(start, count);
      i -= count;
    }
    SpreadsheetApp.flush();
    return expired.length;
  } finally { lock.releaseLock(); }
}
function labJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function constantEqual_(a, b) {
  b = String(b || ''); let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function labStore_(spreadsheet) {
  const cache = {};
  const load = (table) => {
    if (!LAB_COLUMNS[table]) throw new Error('Unknown table');
    if (!cache[table]) {
      const tab = spreadsheet.getSheetByName(table);
      if (!tab) throw new Error('Run setupLifeScienceLab first');
      const values = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, LAB_COLUMNS[table].length).getValues() : [];
      cache[table] = { tab, dirty: new Set(), rows: values.map((row, index) => {
        const data = {};
        LAB_COLUMNS[table].forEach((key, i) => { data[key] = row[i] === '' ? null : JSON.parse(String(row[i])); });
        return { data, row: index + 2 };
      }) };
    }
    return cache[table];
  };
  // Every cell is JSON encoded. Even a leading "=" is stored as text, not a formula.
  const put = (table, data) => {
    const collection = load(table);
    const match = collection.rows.find((v) => v.data.id === data.id && (table !== 'AssessmentFields' || v.data.assessmentId === data.assessmentId));
    const row = match?.row || collection.rows.length + 2;
    const cells = LAB_COLUMNS[table].map((key) => JSON.stringify(data[key] ?? null));
    if (cells.some((v) => v.length > 48000)) throw Object.assign(new Error('한 항목의 길이가 저장 한도를 초과했습니다.'), { status: 400 });
    collection.dirty.add(row);
    if (match) match.data = data; else collection.rows.push({ data, row });
  };
  return {
    all: (table) => load(table).rows.map((v) => v.data).filter((v) => table !== 'AssessmentFields' || !v.retired),
    put,
    flush: () => {
      // Validate first, then group adjacent rows to avoid one Sheets call per student.
      Object.keys(cache).forEach((table) => {
        const c = cache[table], rows = [...c.dirty].sort((a,b) => a-b);
        for (let i = 0; i < rows.length;) {
          const start = rows[i], values = [];
          let row = start;
          while (i < rows.length && rows[i] === row) {
            const record = c.rows.find((r) => r.row === row).data;
            values.push(LAB_COLUMNS[table].map((key) => JSON.stringify(record[key] ?? null)));
            i++; row++;
          }
          c.tab.getRange(start, 1, values.length, LAB_COLUMNS[table].length).setValues(values);
        }
        c.dirty.clear();
      });
    },
    replaceFields: (id, fields) => {
      load('AssessmentFields').rows.filter((v) => v.data.assessmentId === id && !fields.some((f) => f.id === v.data.id))
        .forEach((v) => put('AssessmentFields', { ...v.data, retired: true }));
      fields.forEach((f) => put('AssessmentFields', { ...f, retired: false }));
    }
  };
}
