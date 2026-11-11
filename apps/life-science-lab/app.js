import { ReportSaver } from './autosave.js';
import { parseRoster, prepareRoster, rosterCSV } from './roster.js';
import { reportDocumentHTML, reportFileName } from './report-document.js';
const $ = (s) => document.querySelector(s);
const main = $('#main'), clone = (v) => structuredClone(v);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const state = { user:null, groups:[],groupId:new URL(location.href).searchParams.get('group') || 'legacy', assessments:[], assessmentsGroup:null, assessmentError:'', assessmentRequest:null, groupsReady:false, restoringSession:true, works:[], reports:[], configured:false, saver:null, step:0, adminTab:'reports', students:[], publications:[] };
const statuses = { draft:'작성 중', submitted:'검토 대기', approved:'승인됨', revision:'보완 요청', rejected:'반려', open:'운영 중', closed:'마감', hidden:'비공개' };
const date = (v) => v ? new Date(v).toLocaleString('ko-KR', { timeZone:'Asia/Seoul', dateStyle:'short', timeStyle:'short' }) : '별도 안내';
const tag = (s) => '<span class="tag">' + esc(statuses[s] || s) + '</span>';
function toast(msg) { $('#toast').textContent = msg; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').hidden = true, 6500); }
async function api(action, payload = {}) {
  const response = await fetch('/api/lab/rpc', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ action,payload:{groupId:state.groupId,...payload} }), signal:AbortSignal.timeout(30000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('서버 연결을 확인해 주세요.'); }
  if (!response.ok) throw Object.assign(new Error(data.error || '요청 실패'), { status:response.status });
  if(data.result?.sheetWarning)console.warn('한글 조회 시트 갱신이 필요합니다. 학생 명단 저장은 완료됐습니다.');
  return data.result;
}
function errorBox(message) { return '<div class="notice error">' + esc(message) + '</div>'; }
function dialog(title, body) { $('#modal-title').textContent = title; $('#modal-body').innerHTML = body; if (!$('#modal').open) $('#modal').showModal(); }
$('#close-modal').onclick = () => $('#modal').close();
function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function studentAccessUrl() {
  const url = new URL(location.href);
  url.searchParams.set('group', state.groupId);
  url.hash = 'lab';
  return url.href;
}
async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement('textarea');
  input.value = value; input.readOnly = true; input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.append(input); input.select();
  const copied = document.execCommand('copy'); input.remove();
  if (!copied) throw new Error('주소를 복사하지 못했습니다. 주소를 길게 눌러 복사해 주세요.');
}
function makeQrCanvas(value, generator) {
  const code = generator(0, 'M');
  code.addData(value, 'Byte'); code.make();
  const cells = code.getModuleCount(), quiet = 4, scale = Math.max(4, Math.floor(232 / (cells + quiet * 2)));
  const size = (cells + quiet * 2) * scale, canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size; canvas.className = 'login-qr-canvas';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '현재 연구 그룹 학생 접속 QR코드');
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.fillStyle = '#0b1c36';
  for (let row = 0; row < cells; row++) for (let col = 0; col < cells; col++) {
    if (code.isDark(row, col)) ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
  }
  return canvas;
}
let qrModuleRequest;
async function renderLoginQr() {
  const holder = $('#login-qr-image'); if (!holder) return;
  holder.textContent = 'QR코드 생성 중…';
  qrModuleRequest ||= import('./vendor/qrcode.mjs');
  const generator = (await qrModuleRequest).default;
  if (!holder.isConnected) return;
  const url = studentAccessUrl(), canvas = makeQrCanvas(url, generator);
  holder.replaceChildren(canvas); holder.dataset.url = url;
  $('#login-share-url').textContent = url;
}
function qrBlob() {
  const canvas = $('.login-qr-canvas');
  if (!canvas) return Promise.reject(new Error('QR코드를 먼저 다시 열어 주세요.'));
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('QR 이미지를 만들지 못했습니다.')), 'image/png'));
}
function loginSharePanel() {
  return '<section class="login-qr-panel" aria-labelledby="login-qr-title"><div><p class="eyebrow">MOBILE ACCESS</p><h2 id="login-qr-title">휴대전화로 바로 접속</h2><p>카메라로 QR코드를 스캔하면 현재 연구 그룹의 학생 로그인 화면이 열립니다.</p></div><div id="login-qr-image" class="login-qr-image" aria-live="polite"></div><code id="login-share-url" class="login-share-url"></code><div class="login-qr-actions"><button type="button" data-action="copy-qr">QR 복사</button><button type="button" data-action="download-qr">PNG 다운로드</button><button type="button" data-action="copy-login-url">주소 복사</button></div></section>';
}
const scriptRequests = new Map();
function loadScript(src, ready) {
  if(ready())return Promise.resolve();
  if(scriptRequests.has(src))return scriptRequests.get(src);
  const request = new Promise((resolve,reject) => {
    const script=document.createElement('script');
    script.src=src;script.async=true;
    script.onload=() => {if(ready())resolve();else{script.remove();reject(new Error('필요한 도구를 시작하지 못했습니다. 다시 시도해 주세요.'));}};
    script.onerror=() => {script.remove();reject(new Error('필요한 도구를 내려받지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'));};
    document.head.append(script);
  }).catch((error) => {scriptRequests.delete(src);throw error;});
  scriptRequests.set(src,request);
  return request;
}
function identity() {
  $('#identity').innerHTML = state.user
    ? '<span>' + esc(state.user.name) + '</span><button class="small ghost" data-action="logout">로그아웃</button>'
    : '<a class="button small" href="#lab">로그인 ↗</a>';
  if(!$('#group-bar')) main.insertAdjacentHTML('beforebegin','<section id="group-bar" class="group-bar" aria-label="연구 그룹 선택"></section>');
  $('#group-bar').hidden=!state.groupsReady;
  $('#group-bar').innerHTML='<label>연구 그룹<select id="group-select">'+state.groups.map((g) => '<option value="'+esc(g.id)+'" '+(g.id===state.groupId?'selected':'')+'>'+esc(g.title)+'</option>').join('')+'</select></label><button class="small" data-action="group-link">학생 접속 링크 복사</button>';
  $('#group-select').onchange=async(e) => {try{await switchGroup(e.target.value);}catch(err){toast(err.message);identity();}};
}
async function loadGroup() {
  const groupId=state.groupId;
  if(state.assessmentsGroup===groupId)return;
  if(state.assessmentRequest?.groupId===groupId)return state.assessmentRequest.promise;
  state.assessmentError='';
  const promise=api('bootstrap',{groupId}).then((data)=>{
    if(state.groupId===groupId){state.assessments=data.assessments;state.assessmentsGroup=groupId;}
  }).catch((error)=>{
    if(state.groupId===groupId)state.assessmentError=error.message;
    throw error;
  }).finally(()=>{if(state.assessmentRequest?.groupId===groupId)state.assessmentRequest=null;});
  state.assessmentRequest={groupId,promise};
  return promise;
}
async function switchGroup(id) {
  if(state.saver && !(await state.saver.flush())) throw new Error('현재 보고서 저장을 완료한 뒤 그룹을 바꾸세요.');
  if(state.user?.owner) state.user=await api('groups.enter',{targetId:id});
  else if(state.user){if(!confirm('그룹을 바꾸면 로그아웃됩니다. 이동할까요?')){identity();return;}await api('logout');state.user=null;}
  state.saver?.stop();state.saver=null;state.groupId=id;state.roster=null;state.rosterCodes=null;state.students=[];state.reports=[];state.publications=[];state.works=[];state.assessments=[];state.assessmentsGroup=null;state.assessmentError='';
  const url=new URL(location.href);url.searchParams.set('group',id);url.hash='activities';history.replaceState(null,'',url);
  identity();await route();
}
async function boot() {
  identity(); await route();
  try {
    const health = await fetch('/api/lab/health').then((r) => r.json()); state.configured = health.configured;
    if (!state.configured) throw new Error('연결 준비');
  } catch {
    state.assessments = [clone(globalThis.LAB_SEED)];state.assessmentsGroup=state.groupId;
    $('#connection').hidden = false;
    $('#connection').textContent = '연구소 연결 준비 중 · 탐구 안내를 먼저 둘러볼 수 있습니다. 로그인·서버 저장은 교사의 Google Sheets 연결 후 사용할 수 있습니다.';
    state.restoringSession=false;
    if(!location.hash||location.hash==='#activities')activities();
    return;
  }
  if($('#login-form button[type="submit"]'))$('#login-form button[type="submit"]').disabled=false;
  const initialGroup=state.groupId;
  const [groupsResult,userResult]=await Promise.allSettled([api('groups.list'),api('me')]);
  if(groupsResult.status==='fulfilled'){
    state.groups=groupsResult.value.groups;state.groupsReady=true;
    if(state.groupId===initialGroup&&!state.groups.some((g)=>g.id===state.groupId)){
      state.groupId='legacy';state.assessments=[];state.assessmentsGroup=null;state.assessmentError='';
    }
  }else{
    $('#connection').hidden=false;
    $('#connection').textContent='연구 그룹을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.';
  }
  let restored=false;
  if(userResult.status==='fulfilled'&&!state.user){
    state.user=userResult.value;restored=true;
    if(state.user.groupId&&state.user.groupId!==state.groupId){state.groupId=state.user.groupId;state.assessments=[];state.assessmentsGroup=null;state.assessmentError='';}
  }
  state.restoringSession=false;
  identity();
  if($('#login-form .notice'))$('#login-form .notice').textContent=state.groups.find((g)=>g.id===state.groupId)?.title||'기존 연구실';
  const page=location.hash.slice(1).split('/')[0]||'activities';
  if(page==='activities')activities();
  else if(restored)await route();
}
async function route() {
  try {
    if (state.saver) { await state.saver.flush(); state.saver.stop(); }
    state.saver = null;
    const [page = 'activities', id] = location.hash.slice(1).split('/');
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page || (page === 'write' && a.dataset.nav === 'lab') || (page === 'work' && a.dataset.nav === 'archive')));
    if (page === 'activities') activities();
    else if (page === 'lab') await lab();
    else if (page === 'write') await editor(id);
    else if (page === 'archive') await archive();
    else if (page === 'work') await work(id);
    else if (page === 'teacher') await admin();
    else activities();
  } catch (e) { main.innerHTML = errorBox(e.message) + '<a class="button" href="#activities">탐구 활동으로</a>'; }
}
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (e) => { if (state.saver?.dirty) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('online', () => state.saver?.flush());
function scienceFigure() {
  return '<div class="science-figure" role="img" aria-label="생명과학 연구를 상징하는 분자 구조 개념 도식"><div class="figure-heading"><span>STRUCTURE &amp; FUNCTION</span><span class="figure-mark">LS / 01</span></div><svg viewBox="0 0 540 420" aria-hidden="true"><defs><pattern id="research-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#809cc2" stroke-opacity=".09" stroke-width=".6"/></pattern><linearGradient id="fold-blue" x1="0" x2="1" y2=".7"><stop stop-color="#afd0ff"/><stop offset=".5" stop-color="#719cd6"/><stop offset="1" stop-color="#365f99"/></linearGradient></defs><rect width="540" height="420" fill="url(#research-grid)"/><g fill="none" stroke="#6887b4" stroke-width=".6" opacity=".3"><circle cx="265" cy="213" r="139"/><circle cx="265" cy="213" r="112" stroke-dasharray="2 7"/><path d="M95 213h340M265 65v295"/></g><g fill="none" stroke-linecap="round"><path d="M166 254c-60-47 9-129 53-98s-29 113 23 128 107-65 71-94-97 23-72 68 94 5 102-30-72-73-55-111 81 8 74 43-78 26-88 79 63 70 90 31" stroke="url(#fold-blue)" stroke-width="13" opacity=".95"/><path d="M168 252c-58-46 9-127 51-96s-28 109 23 124 102-63 68-88-91 23-67 63 86 4 96-29-68-70-54-108 75 10 72 41-79 24-86 78 58 66 89 29" stroke="#d2e2fa" stroke-width="1" opacity=".65"/><path d="M152 291l-34 24H77M350 134l42-30h70M320 288l46 42h93" stroke="#7596c2" stroke-width=".8"/></g><g fill="#99b8e1"><circle cx="152" cy="291" r="3"/><circle cx="350" cy="134" r="3"/><circle cx="320" cy="288" r="3"/></g><g fill="#91acd0" font-family="monospace" font-size="8" letter-spacing="1.2"><text x="77" y="330">MOLECULAR INSIGHT</text><text x="397" y="94">INQUIRY</text><text x="379" y="345">RESEARCH NOTE</text></g><g stroke="#7996be" stroke-width="1"><path d="M40 65v10m-5-5h10M490 350v10m-5-5h10"/></g></svg><div class="figure-caption"><span>LIFE SCIENCE / CONCEPT DIAGRAM</span><span>RESEARCH LAB</span></div></div>';
}
function activities() {
  if(state.configured&&!state.restoringSession&&state.assessmentsGroup!==state.groupId&&!state.assessmentError){
    const groupId=state.groupId;
    void loadGroup().then(()=>{if(state.groupId===groupId&&(location.hash===''||location.hash==='#activities'))activities();}).catch(()=>{if(state.groupId===groupId&&(location.hash===''||location.hash==='#activities'))activities();});
  }
  const pending=state.restoringSession||(state.configured&&state.assessmentsGroup!==state.groupId);
  main.innerHTML = '<section class="hero"><div class="hero-copy"><span class="eyebrow">LIFE SCIENCE RESEARCH LAB</span><h1>생명과학의 질문을,<br><em>연구의 기록으로.</em></h1><p>자료를 검토하고, 근거를 기록하며,<br>탐구의 결과를 하나의 연구로 완성합니다.</p><div class="actions"><a class="button primary" href="#lab">나의 연구실 입장 →</a><a class="button ghost" href="#archive">탐구 아카이브 ↗</a></div></div>' + scienceFigure() + '</section>' +
    '<div class="section-heading"><div><p class="eyebrow">RESEARCH PROGRAMS</p><h2>탐구 프로그램</h2><p>주제별 연구 안내와 작성 항목을 확인하고 탐구를 시작하세요.</p></div><span class="tag">' + (pending?'불러오는 중':state.assessments.length+'개 탐구') + '</span></div><div class="grid activity-grid">' +
    (pending?'<article class="card"><div class="card-body"><h3>탐구 목록을 불러오는 중입니다.</h3><p>'+esc(state.assessmentError||'연구소에 먼저 입장하고 계셔도 됩니다.')+'</p>'+(state.assessmentError?'<button data-action="retry-assessments">다시 시도</button>':'')+'</div></article>':'') +
    state.assessments.map((a, i) => '<article class="card"><div class="card-art"><span>RESEARCH PROGRAM / ' + a.year + '</span><span class="research-number">' + String(i+1).padStart(2,'0') + '</span></div><div class="card-body"><div class="actions">' + tag(a.status) + '<small>' + esc(a.subject) + '</small></div><h3 style="margin-top:18px">' + esc(a.title) + '</h3><p>' + esc(a.description) + '</p><small>' + a.year + '학년도 · ' + a.fields.length + '개 연구 항목<br>시작 ' + date(a.startAt) + ' / 마감 ' + date(a.deadline) + '</small><div class="actions"><button class="primary" data-open="' + esc(a.id) + '">탐구 시작 →</button><button data-guide="' + esc(a.id) + '">수행평가 안내</button></div></div></article>').join('') +
    '<article class="card workflow-card"><div class="card-body"><span class="eyebrow">RESEARCH PROCESS</span><h3 style="margin-top:20px">탐구에서 전시까지</h3><p>질문과 근거가 쌓여 하나의 연구가 됩니다.</p><ol class="workflow-list"><li><span>01</span>탐구 질문 설정과 자료 조사</li><li><span>02</span>연구 노트 작성 및 제출</li><li><span>03</span>교사 검토와 연구 내용 보완</li><li><span>04</span>승인된 연구 결과의 아카이브 전시</li></ol><a href="#archive" class="button ghost">연구 아카이브 보기 ↗</a></div></article></div>';
}
function login(role) {
  const teacher = role === 'teacher';
  const first=!teacher && !!state.pinSetup;
  main.innerHTML = '<section class="login-layout"><div class="login-story"><p class="eyebrow">' + (teacher ? 'TEACHER STUDIO' : 'MY RESEARCH NOTE') + '</p><h1>' + (teacher ? '함께 자라는<br>탐구를 위해.' : '오늘의 질문을<br>기록해 볼까요?') + '</h1><p>' + (teacher ? '학생의 연구 과정을 살피고,<br>새로운 발견이 전시가 되도록 도와주세요.' : '선생님이 등록한 정보와<br>개별 접속 코드로 연구실에 입장하세요.') + '</p>' + (teacher ? '' : loginSharePanel()) + '</div><form id="login-form" class="login-form stack"><h2>' + (teacher ? '교사 로그인' : '학생 로그인') + '</h2>' +
    (teacher ? '' : '<div class="form-grid"><label>학년도<input name="year" type="number" min="2020" max="2100" value="' + (state.groups.find((g) => g.id===state.groupId)?.year || new Date().getFullYear()) + '" required></label><label>학년<input name="grade" type="number" min="1" max="12" required></label><label>반<input name="classNo" type="number" min="1" max="100" required></label><label>번호<input name="number" type="number" min="1" max="999" required></label><label class="span-all">이름<input name="name" autocomplete="username" required></label></div>') +
    '<div><label for="login-password">' + (teacher ? '관리자 비밀번호' : '개인 접속 코드') + '</label><div class="password-field"><input id="login-password" name="password" type="password" minlength="' + (teacher && state.groupId !== 'legacy' ? '7' : '8') + '" maxlength="128" autocomplete="current-password" required><button type="button" data-action="toggle-password" aria-controls="login-password" aria-label="비밀번호 표시" aria-pressed="false">보기</button></div></div><button type="submit" class="primary" ' + (!state.configured ? 'disabled' : '') + '>연구소 입장 →</button><div id="login-error" role="alert"></div><p class="hint">' + (state.configured ? '학생 명단과 보고서는 이 연구소 안에서만 관리됩니다.' : '교사의 저장소 연결이 완료되면 로그인할 수 있습니다.') + '</p><a href="#' + (teacher ? 'lab' : 'teacher') + '" class="hint">' + (teacher ? '학생으로 참여하기 →' : '교사 관리실 →') + '</a></form></section>';
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
    try { state.user = await api('login', { ...Object.fromEntries(new FormData(e.target)), role,setupPin:first }); state.pinSetup=false;identity(); await route(); }
    catch (err) { $('#login-error').textContent = err.message; btn.disabled = false; }
  };
  $('#login-form h2').insertAdjacentHTML('afterend','<p class="notice">'+esc(state.groups.find((g) => g.id===state.groupId)?.title || '기존 연구실')+'</p>');
  if(!teacher){
    void renderLoginQr().catch(() => { if ($('#login-qr-image')) $('#login-qr-image').textContent='QR코드를 만들지 못했습니다. 새로고침해 주세요.'; });
    const input=$('#login-password');input.minLength=4;
    $('label[for="login-password"]').textContent=first?'처음 사용할 PIN (숫자 4자리)':'개인 PIN 또는 기존 접속 코드';
    if(first){input.maxLength=4;input.pattern='[0-9]{4}';input.inputMode='numeric';input.autocomplete='new-password';
      input.closest('div').parentElement.insertAdjacentHTML('afterend','<label>PIN 다시 입력<input name="pinConfirm" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="new-password" required></label><p class="hint">명단에 등록된 학생만 가능합니다. 교사 안내에 따라 본인 정보로 등록하세요. 첫 등록 후에는 같은 PIN으로 로그인합니다.</p>');
    }
    $('#login-form h2').textContent=first?'학생 PIN 처음 등록':'학생 로그인';
    $('#login-form button[type="submit"]').textContent=first?'PIN 등록하고 입장':'연구소 입장 →';
    $('#login-error').insertAdjacentHTML('afterend','<button type="button" data-action="pin-mode">'+(first?'기존 PIN으로 로그인':'처음 접속: PIN 등록')+'</button>');
  }
}
function pinDialog(id) {
  const student=state.students.find((s)=>s.id===id);
  dialog('학생 PIN 관리 · '+student.name,'<form id="pin-form" class="stack"><p>'+esc(student.grade+'-'+student.classNo+'-'+student.number+' '+student.name)+'</p><label>새 PIN (숫자 4자리)<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="new-password" required></label><label>새 PIN 다시 입력<input name="confirm" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="new-password" required></label><button class="primary">새 PIN 저장</button><button type="button" data-allow-pin="'+esc(id)+'">학생이 PIN을 다시 정하도록 초기화</button><p class="hint">기존 PIN은 조회할 수 없습니다. 변경·초기화하면 해당 학생의 기존 로그인은 만료되지만 보고서는 유지됩니다.</p></form>');
  $('#pin-form').onsubmit=async(e)=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target)),button=e.submitter;
    if(values.pin!==values.confirm){toast('두 PIN이 서로 다릅니다.');return;}
    button.disabled=true;try{await api('student.update',{id,password:values.pin});$('#modal').close();toast('학생 PIN을 변경했습니다.');await students();}catch(err){toast(err.message);button.disabled=false;}
  };
}
async function lab() {
  if (!state.user || state.user.role !== 'student') return login('student');
  main.innerHTML = '<div class="page-heading"><span class="eyebrow">MY LABORATORY</span><h1>나의 연구실</h1><p class="loading">보고서를 불러오는 중입니다…</p></div>';
  const data = await api('myReports'); state.reports = data.reports;
  main.innerHTML = '<div class="page-heading"><span class="eyebrow">MY LABORATORY</span><h1>' + esc(state.user.name) + '의 연구 노트</h1><p class="muted">어제의 질문에서 오늘의 발견으로. 저장한 곳부터 이어서 탐구하세요.</p></div><div class="grid">' +
    (data.reports.length ? data.reports.map((r) => '<article class="card"><div class="card-body">' + tag(r.status) + '<h3 style="margin-top:20px">' + esc(r.title) + '</h3><p>최근 저장 ' + date(r.updatedAt) + '</p>' + (r.review?.feedback ? '<div class="notice">선생님 피드백<br>' + esc(r.review.feedback) + '</div>' : '') + '<a class="button primary" href="#write/' + esc(r.assessmentId) + '">' + (['draft','revision'].includes(r.status) ? '이어 쓰기' : '보고서 확인') + ' →</a></div></article>').join('') : '<div class="empty"><h3>첫 연구 노트를 펼쳐 보세요.</h3><p>탐구 활동에서 주제를 선택하면<br>여기에 연구 노트가 생깁니다.</p><a class="button primary" href="#activities">탐구 고르기 →</a></div>') + '</div>';
}
function backupKey(id) { return 'life-lab:draft:' + state.user.id + ':' + id; }
function backup(report) {
  try { const key = backupKey(state.saver.report.id); if (report) localStorage.setItem(key, JSON.stringify({ report, at: Date.now() })); else localStorage.removeItem(key); }
  catch { toast('이 기기의 복구본을 보관하지 못했습니다. 서버 저장 상태를 확인해 주세요.'); }
}
async function editor(id) {
  if (state.user?.role !== 'student') return login('student');
  main.innerHTML = '<div class="page-heading"><span class="eyebrow">RESEARCH NOTE</span><h1>연구 기록</h1><p class="loading">보고서를 불러오는 중입니다…</p></div>';
  const report = await api('report.open', { assessmentId:id });
  state.step = 0;
  state.saver = new ReportSaver(report, (r) => api('report.save', { id:r.id, version:r.version, content:r.content }),
    (status, message) => { if ($('#save-status')) { $('#save-status').dataset.state = status; $('#save-status').textContent = message; } }, backup);
  const writable = ['draft','revision'].includes(report.status);
  if (writable) {
    try {
      const raw = localStorage.getItem(backupKey(report.id)), saved = raw ? JSON.parse(raw) : null;
      if (saved && Date.now() - saved.at < 7 * 86400000 && saved.report.version === report.version && confirm('이 기기에 서버로 저장되지 않은 복구본이 있습니다. 이어서 작성할까요?')) {
        state.saver.change(saved.report.content);
      } else if (saved && saved.report.version !== report.version) {
        toast('서버와 다른 버전의 복구본이 있습니다. 아래 복구본 다운로드로 확인하세요.');
      }
    } catch { toast('복구본을 읽지 못했습니다. 서버에서 불러온 내용으로 시작합니다.'); }
  }
  main.innerHTML = '<div class="page-heading"><span class="eyebrow">RESEARCH NOTE / ' + report.fields.length + ' STEPS</span><h1>' + esc(report.title) + '</h1><div class="actions">' + tag(report.status) + '<a class="hint" href="#lab">← 나의 연구실</a></div></div>' +
    (report.review?.feedback ? '<div class="notice"><strong>선생님 피드백</strong><p class="prose">' + esc(report.review.feedback) + '</p></div>' : '') +
    '<div class="savebar"><span id="save-status" role="status" aria-live="polite">서버 기록 불러오기 완료 · ' + date(report.updatedAt) + '</span><div class="actions"><button class="small" data-action="retry-save">지금 저장</button><button class="small ghost" data-action="backup">복구본 다운로드</button><button class="small" data-action="reload-report">최신본 불러오기</button></div></div>' +
    '<div class="workspace"><aside><p id="progress-label" class="hint"></p><progress id="progress" max="100" value="0" aria-label="작성 진행률"></progress><nav id="steps" class="step-nav" aria-label="보고서 단계"></nav><div class="hint" style="margin-top:22px">자료 찾기<br>RISS · DBpia · KOCW<br>RCSB Protein Data Bank<br><br>확인되지 않은 수치는<br>‘자료 미확인’으로 기록하세요.</div></aside><section class="editor"><div id="editor-field"></div><div class="editor-meta"><span id="char-count"></span><span>최대 6,000자 / 항목</span></div><div class="actions"><button data-action="prev">← 이전</button><button data-action="next">다음 →</button><button class="primary" data-action="preview-report">전체 미리보기 · 제출</button></div></section></div>';
  if (!writable) $('[data-action="retry-save"]').disabled = true;
  renderStep();
}
const complete = (f, content) => f.type === 'references' ? (content[f.id] || []).some((r) => r.title && r.author && r.source) : !!String(content[f.id] || '').trim();
function progress() {
  const r = state.saver.report, done = r.fields.filter((f) => complete(f, r.content)).length;
  $('#progress-label').textContent = done + ' / ' + r.fields.length + '개 항목 작성';
  $('#progress').value = done / r.fields.length * 100;
  $('#steps').innerHTML = r.fields.map((f,i) => '<button data-step="' + i + '" class="' + (i === state.step ? 'active' : '') + '" aria-current="' + (i === state.step ? 'step' : 'false') + '"><span class="step-index">' + (complete(f,r.content) ? '✓' : String(i+1).padStart(2,'0')) + '</span>' + esc(f.title) + '</button>').join('');
}
function renderStep() {
  const r = state.saver.report, f = r.fields[state.step], locked = !['draft','revision'].includes(r.status);
  progress();
  $('#editor-field').innerHTML = '<span class="eyebrow">STEP ' + String(state.step+1).padStart(2,'0') + ' / ' + r.fields.length + '</span><h2>' + esc(f.title) + (f.required ? ' <small style="font-size:12px">필수</small>' : '') + '</h2><p class="editor-guide">' + esc(f.guide) + '</p>' +
    (f.type === 'references' ? '<div id="references"></div>' + (!locked ? '<button data-action="add-reference">+ 참고 자료 추가</button>' : '') :
      '<label><span class="hint">탐구 내용</span><textarea id="answer" data-student-answer maxlength="6000" ' + (locked ? 'readonly' : '') + ' placeholder="찾은 근거를 바탕으로 나의 생각을 직접 적어 보세요. 복사·붙여넣기는 사용할 수 없습니다.">' + esc(r.content[f.id] || '') + '</textarea></label>');
  if (f.type === 'references') renderReferences(); else $('#answer').oninput = () => { r.content[f.id] = $('#answer').value; changed(); };
  $('[data-action="prev"]').disabled = state.step === 0;
  $('[data-action="next"]').disabled = state.step === r.fields.length - 1;
  chars();
}
function chars() {
  const r = state.saver.report, value = r.content[r.fields[state.step].id];
  $('#char-count').textContent = (typeof value === 'string' ? value.length : JSON.stringify(value || []).length).toLocaleString() + '자';
}
function changed() { state.saver.change(state.saver.report.content); progress(); chars(); }
function renderReferences() {
  const r = state.saver.report, f = r.fields[state.step], list = r.content[f.id] || [], locked = !['draft','revision'].includes(r.status);
  $('#references').innerHTML = list.map((v,i) => '<div class="reference-row"><strong>자료 ' + (i+1) + '</strong>' + [['title','자료 제목',300],['author','저자 또는 기관',200],['source','URL 또는 서지 정보',800]].map(([key,label,max]) => '<label>' + label + '<input data-ref="' + i + '" data-key="' + key + '" maxlength="' + max + '" value="' + esc(v[key]) + '" ' + (locked ? 'readonly' : '') + '></label>').join('') + (!locked ? '<button class="small ghost" data-delete-ref="' + i + '">자료 삭제</button>' : '') + '</div>').join('') || '<p class="hint">아래 버튼으로 참고 자료를 추가하세요.</p>';
  $('#references').oninput = (e) => { if (e.target.dataset.ref === undefined) return; r.content[f.id][Number(e.target.dataset.ref)][e.target.dataset.key] = e.target.value; changed(); };
}
function blockAnswerTransfer(e) {
  if (state.user?.role !== 'student' || !e.target.closest?.('[data-student-answer]') || e.target.readOnly) return;
  e.preventDefault();
  toast('학생 탐구 내용은 복사하거나 붙여넣을 수 없습니다. 직접 작성해 주세요.');
}
for (const type of ['copy','cut','paste','drop','contextmenu']) document.addEventListener(type, blockAnswerTransfer);
document.addEventListener('beforeinput', (e) => {
  if (['insertFromPaste','insertFromDrop'].includes(e.inputType)) blockAnswerTransfer(e);
});
function reportHTML(r) {
  return reportDocumentHTML(r, r.student || state.user, state.user?.group || state.groups.find((g) => g.id === state.groupId));
}
function reportActions(r) {
  state.previewReport = r;
  return '<div class="report-toolbar actions"><button type="button" data-action="download-report-pdf" class="primary">PDF 다운로드</button><button type="button" data-action="print-report">인쇄</button><span class="hint">A4 보고서로 출력됩니다.</span></div>';
}
async function archive() {
  main.innerHTML = '<div class="page-heading"><span class="eyebrow">RESEARCH ARCHIVE</span><h1>탐구 아카이브</h1><p class="loading">공개된 탐구를 불러오는 중입니다…</p></div>';
  if (state.configured) { try { state.works = (await api('archive')).works; } catch (e) { toast(e.message); } }
  const works = state.works;
  main.innerHTML = '<div class="page-heading"><span class="eyebrow">A GROWING COLLECTION OF DISCOVERIES</span><h1>우리의 질문이 모이면,<br>하나의 전시가 됩니다.</h1><p class="muted">선생님의 검토와 공개 승인을 거친 탐구 작품을 만나 보세요.</p></div><div class="stats"><div><strong>' + works.length + '</strong><small>누적 공개 작품</small></div>' +
    [...new Set(works.map((w) => w.category))].map((c) => '<div><strong>' + works.filter((w) => w.category === c).length + '</strong><small>' + esc(c) + '</small></div>').join('') + '</div><div class="filters"><input id="work-search" type="search" placeholder="제목·탐구 내용 검색" aria-label="작품 검색"><select id="work-category" aria-label="탐구 분야"><option value="">모든 분야</option>' +
    [...new Set(works.map((w) => w.category))].map((c) => '<option>' + esc(c) + '</option>').join('') + '</select><select id="work-year" aria-label="학년도"><option value="">모든 학년도</option>' +
    [...new Set(works.map((w) => w.year))].sort((a,b) => b-a).map((y) => '<option>' + y + '</option>').join('') + '</select></div><div id="works"></div>';
  ['#work-search','#work-category','#work-year'].forEach((s) => $(s).oninput = renderWorks); renderWorks();
}
function renderWorks() {
  const q = $('#work-search').value.toLowerCase(), cat = $('#work-category').value, year = $('#work-year').value;
  const works = state.works.filter((w) => (!cat || w.category === cat) && (!year || String(w.year) === year) && JSON.stringify([w.title,w.summary,w.sections]).toLowerCase().includes(q));
  $('#works').innerHTML = works.length ? '<div class="grid">' + works.map((w) => '<article class="card"><div class="card-art"><span>' + w.year + ' COLLECTION</span>◈</div><div class="card-body">' + tag(w.category) + '<h3 style="margin-top:18px">' + esc(w.title) + '</h3><p>' + esc(w.summary || w.sections[0]?.body?.slice(0,100) || '') + '</p><small>' + esc(w.displayName) + ' · ' + date(w.publishedAt) + '</small><div class="actions"><a class="button primary" href="#work/' + esc(w.id) + '">전시 보기 →</a></div></div></article>').join('') + '</div>' : '<div class="empty"><h3>' + (state.works.length ? '검색 결과가 없습니다.' : '첫 번째 발견을 기다리고 있습니다.') + '</h3><p>공개 승인된 작품이 이곳에 차곡차곡 쌓입니다.</p></div>';
}
function infographic(w, compact = false) {
  return '<article class="infographic ' + (compact ? 'compact' : '') + '"><header><span class="eyebrow">LIFE SCIENCE / ' + esc(w.year || '') + '</span><h1>' + esc(w.title) + '</h1><p class="prose">' + esc(w.summary || '') + '</p><small>' + esc(w.displayName || '익명의 연구자') + ' · ' + esc(w.category || '') + '</small></header><div class="infographic-body">' +
    (w.sections || []).map((s,i) => '<section class="info-block"><span class="eyebrow">RECORD ' + String(i+1).padStart(2,'0') + '</span><h3>' + esc(s.title) + '</h3><div class="prose">' + esc(s.body) + '</div></section>').join('') + '</div></article>';
}
async function work(id) {
  main.innerHTML = '<div class="page-heading"><span class="eyebrow">RESEARCH ARCHIVE</span><h1>탐구 작품</h1><p class="loading">작품을 불러오는 중입니다…</p></div>';
  if (state.configured) state.works = (await api('archive')).works;
  const w = state.works.find((w) => w.id === id);
  main.innerHTML = '<div class="actions" style="margin-bottom:25px"><a href="#archive" class="button ghost">← 아카이브</a><button data-action="print">인쇄 / PDF 저장</button></div>' + (w ? infographic(w) : '<div class="empty">공개되지 않았거나 찾을 수 없는 작품입니다.</div>');
}
async function admin() {
  if (state.user?.role !== 'teacher') return login('teacher');
  main.innerHTML = '<div class="page-heading"><span class="eyebrow">TEACHER STUDIO</span><h1>탐구의 다음 단계를 함께.</h1><p class="muted">명단부터 피드백, 최종 전시까지 한곳에서 관리하세요.</p></div><div class="admin-tabs">' +
    [['reports','보고서 검토'],['students','학생 명단'],['assessments','탐구 활동 설정'],['publications','전시 관리'],['groups','그룹 관리']].map(([id,title]) => '<button data-tab="' + id + '" class="' + (id === state.adminTab ? 'active' : '') + '">' + title + '</button>').join('') +
    (state.user.owner?'<button data-action="refresh-sheets">한글 시트 새로고침</button>':'')+'<button data-action="refresh-admin" class="ghost">↻ 새로고침</button></div><div id="admin-content"><p class="loading">불러오는 중…</p></div>';
  if (state.adminTab === 'groups') await groups();
  else if (state.adminTab === 'students') await students();
  else if (state.adminTab === 'assessments') await assessments();
  else if (state.adminTab === 'publications') await publications();
  else await reports();
}
async function groups() {
  state.groups=(await api('groups.list')).groups;
  const current=state.user.group || state.groups.find((g) => g.id===state.groupId);
  const form=(id,g,create=false) => '<form id="'+id+'" class="panel stack"><h2>'+(create?'새 연구 그룹 만들기':'현재 그룹 설정')+'</h2><div class="form-grid">'+[['year','학년도','number',g.year],['semester','학기 (1 / 2 / 여름 / 겨울)','text',g.semester],['subject','과목','text',g.subject],['school','학교','text',g.school]].map(([key,label,type,value]) => '<label>'+label+'<input name="'+key+'" type="'+type+'" value="'+esc(value)+'" required maxlength="80" '+(key==='year'?'min="2020" max="2100"':'')+'></label>').join('')+'</div>'+(create || state.groupId!=='legacy' ? '<label>그룹 교사 암호'+(!create?' (유지하려면 비워 두세요)':'')+'<input name="password" type="password" minlength="7" maxlength="128" autocomplete="new-password" '+(create?'required':'')+'></label>':'<p class="hint">기존 연구실은 전체 관리자 암호를 사용합니다. 별도 교사 암호가 필요하면 새 그룹을 만드세요.</p>')+'<button class="primary">'+(create?'그룹 만들기':'그룹 설정 저장')+'</button></form>';
  $('#admin-content').innerHTML='<p class="notice">그룹마다 학생·탐구·보고서·전시본을 분리합니다. 그룹 교사는 자신의 그룹만 관리합니다. 새 그룹에는 효소 탐구 양식이 복사되며 학생 자료는 복사되지 않습니다.</p>'+form('group-update',current)+(state.user.owner ? form('group-create',{year:new Date().getFullYear(),semester:'2',subject:'',school:''},true):'')+'<div class="grid">'+(state.user.owner?state.groups:[current]).map((g) => '<article class="card"><div class="card-body"><h3>'+esc(g.title)+'</h3>'+(g.id===state.groupId?'<p class="hint">현재 그룹</p>':'<button data-enter-group="'+esc(g.id)+'">관리하기</button>')+'</div></article>').join('')+'</div>';
  for(const id of ['group-update','group-create']) if($('#'+id))$('#'+id).onsubmit=async(e) => {
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{
      const create=id==='group-create',payload=Object.fromEntries(new FormData(e.target));payload.version=state.user.groupVersion;
      const result=await api(create?'groups.create':'groups.update',payload);
      state.groups=(await api('groups.list')).groups;
      if(create){toast('새 그룹을 만들었습니다. 이 그룹으로 이동합니다.');await switchGroup(result.id);state.adminTab='students';location.hash='teacher';await route();}
      else if(state.user.owner){state.user=await api('me');identity();await groups();toast('그룹 설정을 저장했습니다.');}
      else{await api('logout');state.user=null;identity();await route();toast('설정을 저장했습니다. 그룹 교사 암호로 다시 로그인하세요.');}
    }catch(err){toast(err.message);button.disabled=false;}
  };
}
async function students() {
  state.students = (await api('students.list')).students;
  $('#admin-content').innerHTML = '<section class="panel"><h2>학생 명단 등록</h2><p class="hint">명단 머리글: 학년도, 학년, 반, 번호, 이름, 접속코드. 접속 코드는 8자 이상이며 학생에게 개별 전달하세요. 기존 학생은 중복 등록되지 않고 기존 코드가 유지됩니다.</p><div class="actions"><label>CSV / XLSX / XLS<input id="roster-file" type="file" accept=".csv,.xlsx,.xls" multiple></label><button data-action="roster-template">CSV 양식 다운로드</button></div><div id="roster-preview"></div><hr style="border:0;border-top:1px solid var(--line);margin:25px 0"><form id="student-form" class="form-grid">' +
    [['year','학년도','number',(state.user.group?.year || new Date().getFullYear())],['grade','학년','number',''],['classNo','반','number',''],['number','번호','number',''],['name','이름','text',''],['courseClass','수업 반','text',''],['password','PIN/기존 코드 (비우면 학생이 처음 등록)','password','']].map(([id,label,type,value]) => '<label>' + label + '<input name="' + id + '" type="' + type + '" value="' + value + '" ' + (id==='password' ? 'minlength="4" maxlength="128"' : '') + ' '+(id==='courseClass'||id==='password'?'':'required')+'></label>').join('') +
    '<button class="primary span-all">학생 직접 등록</button></form></section><section class="panel"><h2>' + state.students.length + '명의 연구자</h2><div class="table-wrap"><table><thead><tr><th>학년도</th><th>학번</th><th>이름</th><th>수업 반</th><th>상태</th><th>관리</th></tr></thead><tbody>' +
    state.students.map((s) => '<tr><td>' + s.year + '</td><td>' + s.grade + '-' + s.classNo + '-' + s.number + '</td><td>' + esc(s.name) + '</td><td>'+esc((s.courseClasses || []).join(', '))+'</td><td>' + (s.active ? (s.pinRegistered?'활성 · PIN/코드 등록됨':'활성 · PIN 미등록') : '비활성') + '</td><td><button data-reset-student="' + s.id + '">PIN 관리</button> <button data-toggle-student="' + s.id + '">' + (s.active ? '이용 중지' : '이용 허용') + '</button></td></tr>').join('') + '</tbody></table></div></section>';
  $('#student-form').onsubmit = async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api('students.import', { students:[Object.fromEntries(new FormData(e.target))] }); toast('학생을 등록했습니다.'); await students(); }
    catch (err) { toast(err.message); btn.disabled = false; }
  };
  state.roster = null;
  $('#roster-file').closest('.actions').insertAdjacentHTML('beforebegin', '<div class="form-grid"><label>기본 학년도<input id="roster-year" type="number" value="'+(state.user.group?.year || new Date().getFullYear())+'" min="2020" max="2100"></label><label>기본 학년<input id="roster-grade" type="number" min="1" max="12" placeholder="예: 2"></label><label>기본 반<input id="roster-class" type="number" min="1" max="100" placeholder="예: 1"></label><label>수업 반 (파일에서 자동 인식)<input id="roster-course" placeholder="예: 2-1"></label></div><p class="hint">나이스 명렬표는 번호·성명 열만 있어도 됩니다. 파일에 없는 학년도·학년·반을 지정하세요. 새 학생은 첫 접속에서 숫자 4자리 PIN을 직접 등록합니다. 별도의 접속 코드 발급·전달은 필요 없습니다. 기존 학생의 코드와 자료는 유지됩니다.</p>');
  $('#admin-content .panel > .hint').textContent = '명렬표를 업로드하고 미리보기를 확인한 뒤 등록하세요. 기존 학생의 코드와 자료는 유지됩니다.';
  $('#roster-file').onchange = readRoster;
  const courseOptions=[...new Set(state.students.flatMap((s) => s.courseClasses || []))].sort();
  $('#admin-content .panel:last-child .table-wrap').insertAdjacentHTML('beforebegin','<label>수업 반 필터<select id="student-course"><option value="">모든 수업 반</option>'+courseOptions.map((c) => '<option>'+esc(c)+'</option>').join('')+'</select></label>');
  $('#student-course').onchange=() => {$('#admin-content .panel:last-child tbody').querySelectorAll('tr').forEach((row,i) => row.hidden=!!$('#student-course').value && !(state.students[i].courseClasses || []).includes($('#student-course').value));};
  for (const id of ['roster-year','roster-grade','roster-class','roster-course']) $('#'+id).oninput = () => { state.roster=null; $('#roster-preview').innerHTML='설정이 변경되었습니다. 파일을 다시 선택하세요.'; $('#roster-file').value=''; };
}
async function readRoster(e) {
  state.roster = null; state.rosterCodes=null; $('#roster-preview').innerHTML = '';
  try {
    const files=Array.from(e.target.files); if(!files.length)return;
    $('#roster-preview').textContent='명단 파일을 준비하는 중입니다…';
    await loadScript('./vendor/xlsx.full.min.js',()=>!!window.XLSX);
    let data=[];
    for(const file of files) {
      if(file.size>5*1024*1024)throw new Error('5MB 이하의 명단 파일을 선택하세요.');
      const book=XLSX.read(await file.arrayBuffer(),{type:'array'});
      const names=book.SheetNames.filter((name) => book.Sheets[name] && book.Sheets[name]['!ref']);
      if(names.length!==1)throw new Error('명단이 있는 시트 하나만 남긴 파일을 업로드하세요.');
      const rows=XLSX.utils.sheet_to_json(book.Sheets[names[0]],{header:1,defval:''});
      data.push(...parseRoster(rows,{year:$('#roster-year').value,grade:$('#roster-grade').value,classNo:$('#roster-class').value,courseClass:$('#roster-course').value}));
    }
    if(data.length>100)throw new Error('한 번에 100명까지 등록할 수 있습니다. 파일을 나눠 등록하세요.');
    const keys=new Set();
    for(const s of data){const key=[s.year,s.grade,s.classNo,s.number].join(':');if(keys.has(key))throw new Error('여러 파일에 같은 학번이 중복되어 있습니다. 파일을 확인하세요.');keys.add(key);}
    const prepared=prepareRoster(data,state.students);
    const known=new Set(state.students.map((s)=>[s.year,s.grade,s.classNo,s.number].join(':')));
    const newCount=data.filter((s)=>!known.has([s.year,s.grade,s.classNo,s.number].join(':'))).length;
    state.roster=prepared.students;state.rosterCodes=prepared.codes;state.rosterDownloaded=!prepared.codes.length;
    $('#roster-preview').innerHTML='<div class="notice">'+files.length+'개 파일 · '+data.length+'명 확인 · 신규 '+newCount+'명 / 기존 '+(data.length-newCount)+'명 (기존 코드 유지)</div><div class="table-wrap"><table><thead><tr><th>학번</th><th>이름</th><th>수업 반</th></tr></thead><tbody>'+data.map((s) => '<tr><td>'+s.grade+'-'+s.classNo+'-'+s.number+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.courseClass || '')+'</td></tr>').join('')+'</tbody></table></div><div class="actions">'+(prepared.codes.length?'<button data-action="roster-codes">신규 학생 접속 코드 명단 다운로드</button>':'')+'<button class="primary" data-action="import-roster" '+(prepared.codes.length?'disabled':'')+'>이 명단 등록</button></div><p class="hint">이름의 (공동)·(위탁)은 제외했습니다. 원래 학번과 수업 반은 별도로 저장합니다. 새 학생은 첫 접속에서 PIN 등록을 선택해 숫자 4자리를 정하세요. 코드가 직접 입력된 파일만 코드 명단을 먼저 다운로드하세요. 원본 파일은 서버에 저장하지 않습니다.</p>';
  }catch(err){e.target.value='';$('#roster-preview').textContent=err.message;toast(err.message);}
}
async function reports() {
  const [r,s,a] = await Promise.all([api('reports.list'),api('students.list'),api('assessments.list')]);
  state.reports = r.reports; state.students = s.students; state.assessments = a.assessments;
  $('#admin-content').innerHTML = '<div class="filters"><select id="report-assessment" aria-label="탐구 선택"><option value="">모든 탐구</option>' + a.assessments.map((v) => '<option value="' + v.id + '">' + esc(v.title) + '</option>').join('') + '</select><select id="report-status" aria-label="보고서 상태"><option value="">모든 상태</option>' +
    Object.entries(statuses).filter(([k]) => ['draft','submitted','approved','revision','rejected'].includes(k)).map(([k,v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select><button data-action="export-reports">보고서 JSON 다운로드</button></div><div id="report-summary"></div><div class="panel table-wrap" id="report-table"></div>';
  $('#report-status').insertAdjacentHTML('afterend','<select id="report-course" aria-label="수업 반"><option value="">모든 수업 반</option>'+[...new Set(s.students.flatMap((v) => v.courseClasses || []))].sort().map((c) => '<option>'+esc(c)+'</option>').join('')+'</select>');
  $('#report-course').onchange=renderReportTable;
  $('#report-assessment').onchange = renderReportTable; $('#report-status').onchange = renderReportTable; renderReportTable();
}
function renderReportTable() {
  const aid = $('#report-assessment').value, status = $('#report-status').value;
  const course=$('#report-course').value;
  const reports = state.reports.filter((r) => (!aid || r.assessmentId === aid) && (!course || (r.student.courseClasses || []).includes(course)));
  const a = state.assessments.find((v) => v.id === aid);
  const pending = a ? state.students.filter((s) => s.active && s.year === a.year && (!course || (s.courseClasses || []).includes(course)) && !reports.some((r) => r.studentId === s.id)) : [];
  $('#report-summary').innerHTML = '<div class="stats" style="margin-bottom:20px"><div><strong>' + reports.length + '</strong><small>작성 보고서</small></div><div><strong>' + reports.filter((r) => r.status==='submitted').length + '</strong><small>검토 대기</small></div>' + (a ? '<div><strong>' + pending.length + '</strong><small>미참여</small></div>' : '') + '</div>';
  $('#report-table').innerHTML = '<table><thead><tr><th>학생</th><th>탐구</th><th>상태</th><th>제출일</th><th>검토</th></tr></thead><tbody>' +
    reports.filter((r) => !status || r.status === status).map((r) => '<tr><td>' + r.student.grade + '-' + r.student.classNo + '-' + r.student.number + ' ' + esc(r.student.name) + '</td><td>' + esc(r.title) + '</td><td>' + tag(r.status) + '</td><td>' + date(r.submittedAt) + '</td><td><button data-review="' + r.id + '">보고서 보기</button>' + (r.status === 'approved' ? ' <button data-generate="' + r.id + '">전시본 만들기</button>' : '') + '</td></tr>').join('') + '</tbody></table>' +
    (pending.length ? '<p class="hint">아직 시작하지 않음: ' + pending.map((s) => esc(s.classNo+'반 '+s.number+'번 '+s.name)).join(', ') + '</p>' : '');
}
function review(id) {
  const r = state.reports.find((v) => v.id === id);
  dialog('보고서 검토 · ' + r.student.name, reportActions(r) + reportHTML(r) + (r.review ? '<div class="notice">최근 검토: ' + esc(r.review.feedback) + '</div>' : '') +
    (r.status === 'submitted' ? '<form id="review-form" class="stack"><label>학생에게 보낼 피드백<textarea name="feedback" maxlength="4000" rows="4"></textarea></label><div class="actions"><button name="status" value="approved" class="primary">보고서 승인</button><button name="status" value="revision">보완 요청</button><button name="status" value="rejected" class="danger">반려</button></div><p class="hint">승인은 전시 공개가 아닙니다. 전시본을 확인한 후 별도로 공개하세요.</p></form>' : ''));
  if ($('#review-form')) $('#review-form').onsubmit = async (e) => {
    e.preventDefault(); const button = e.submitter; button.disabled = true;
    try { await api('review', { id, version:r.version, status:button.value, feedback:new FormData(e.target).get('feedback') }); $('#modal').close(); toast('검토 결과를 전달했습니다.'); await reports(); }
    catch (err) { toast(err.message); button.disabled = false; }
  };
}
async function assessments() {
  state.assessments = (await api('assessments.list')).assessments;
  $('#admin-content').innerHTML = '<div class="actions" style="margin-bottom:25px"><button data-action="new-assessment" class="primary">+ 새 탐구 만들기</button></div><div class="grid">' +
    state.assessments.map((a) => '<article class="card"><div class="card-body">' + tag(a.status) + '<h3 style="margin-top:20px">' + esc(a.title) + '</h3><p>' + a.year + '학년도 · ' + a.fields.length + '항목<br>' + esc(a.subject) + '</p><button data-edit-assessment="' + a.id + '">설정 편집</button></div></article>').join('') + '</div>';
}
function assessmentForm(id) {
  state.editAssessment = id ? clone(state.assessments.find((a) => a.id === id)) : { title:'',subject:'',category:'',description:'',guide:'',year:(state.user.group?.year || new Date().getFullYear()),status:'hidden',startAt:'',deadline:'',fields:[{id:'question',title:'탐구 질문',guide:'탐구하고 싶은 질문을 적어 주세요.',required:true,type:'text'}] };
  const a = state.editAssessment;
  const localTime = (v) => v ? new Date(Date.parse(v) - new Date(v).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
  dialog('탐구 활동 설정', '<form id="assessment-form" class="stack"><div class="form-grid">' +
    [['title','탐구 제목'],['subject','과목명'],['category','탐구 분야'],['year','학년도']].map(([key,label]) => '<label>' + label + '<input name="' + key + '" value="' + esc(a[key]) + '" ' + (key==='year' ? 'type="number" min="2020" max="2100"' : 'maxlength="120"') + ' required></label>').join('') +
    '<label>시작일 (기기 현지 시각)<input type="datetime-local" name="startAt" value="' + localTime(a.startAt) + '"></label><label>마감일 (기기 현지 시각)<input type="datetime-local" name="deadline" value="' + localTime(a.deadline) + '"></label><label>운영 상태<select name="status">' + ['hidden','open','closed'].map((s) => '<option value="' + s + '" ' + (a.status===s?'selected':'') + '>' + statuses[s] + '</option>').join('') + '</select></label></div><label>탐구 소개<textarea name="description" rows="2" maxlength="1000">' + esc(a.description) + '</textarea></label><label>수행평가 안내문<textarea name="guide" rows="4" maxlength="6000">' + esc(a.guide) + '</textarea></label><h3>작성 항목</h3><p class="hint">기존 보고서의 항목은 유지되며, 항목 변경은 이후 새로 시작하는 보고서부터 적용됩니다.</p><div id="fields" class="fields-list"></div><button type="button" data-action="add-field">+ 항목 추가</button><button class="primary">탐구 설정 저장</button></form>');
  renderFields();
  $('#assessment-form').onsubmit = async (e) => {
    e.preventDefault(); const b=e.submitter; b.disabled=true;
    try {
      const data=Object.fromEntries(new FormData(e.target));
      ['startAt','deadline'].forEach((k) => data[k] = data[k] ? new Date(data[k]).toISOString() : '');
      await api('assessment.save', { ...a,...data,fields:a.fields }); $('#modal').close(); toast('탐구를 저장했습니다.'); await assessments();
    } catch (err) { toast(err.message); b.disabled=false; }
  };
}
function renderFields() {
  $('#fields').innerHTML = state.editAssessment.fields.map((f,i) => '<div class="field-item" data-field="' + i + '"><label>항목명<input data-prop="title" value="' + esc(f.title) + '" required></label><label>입력 유형<select data-prop="type"><option value="text">서술형</option><option value="references" ' + (f.type==='references'?'selected':'') + '>참고 자료 목록</option></select></label><label class="span-all">작성 안내<textarea data-prop="guide" maxlength="1500">' + esc(f.guide) + '</textarea></label><label class="check"><input type="checkbox" data-prop="required" ' + (f.required?'checked':'') + '>필수 항목</label><div class="actions"><button type="button" data-move-field="' + i + '" data-direction="-1">↑</button><button type="button" data-move-field="' + i + '" data-direction="1">↓</button><button type="button" data-delete-field="' + i + '">삭제</button></div></div>').join('');
  $('#fields').oninput = (e) => { const i=e.target.closest('[data-field]')?.dataset.field, key=e.target.dataset.prop; if (key) state.editAssessment.fields[i][key]=key==='required'?e.target.checked:e.target.value; };
}
async function publications() {
  state.publications=(await api('publications.list')).publications;
  $('#admin-content').innerHTML = '<p class="notice">학생 실명·학번은 자동으로 공개되지 않습니다. 전시 내용을 검토하고 학교의 공개 동의 절차를 확인한 뒤 공개하세요.</p><div class="grid">' +
    state.publications.map((p) => '<article class="card"><div class="card-body">' + tag(p.visible?'공개 중 · v'+p.publishedVersion:'비공개') + '<h3 style="margin-top:20px">' + esc(p.draft.title) + '</h3><p>' + esc(p.category) + ' · ' + p.year + '</p><button data-edit-publication="' + p.id + '">전시 편집 · 미리보기</button>' + (p.visible?'<button class="ghost" data-hide-publication="' + p.id + '">공개 취소</button>':'') + '</div></article>').join('') + '</div>' +
    (!state.publications.length?'<div class="empty">승인한 보고서에서 ‘전시본 만들기’를 누르면 여기에서 관리할 수 있습니다.</div>':'');
}
function editPublication(id) {
  state.editPublication = clone(state.publications.find((p) => p.id===id));
  const p=state.editPublication;
  $('#admin-content').innerHTML = '<div class="actions" style="margin-bottom:20px"><button data-action="back-publications">← 전시 목록</button><span class="hint">수정본 저장 후 미리보기를 확인하고 공개하세요.</span></div><div class="publication-editor"><form id="publication-form" class="panel stack"><label>전시 제목<input name="title" maxlength="120" value="' + esc(p.draft.title) + '" required></label><label>표시명 (기본 익명)<input name="displayName" maxlength="40" value="' + esc(p.draft.displayName) + '"></label><label>핵심 소개 (교사 작성·확인)<textarea name="summary" maxlength="1200">' + esc(p.draft.summary) + '</textarea></label>' +
    p.draft.sections.map((s,i) => '<label>' + esc(s.title) + '<textarea data-section="' + i + '" maxlength="6000">' + esc(s.body) + '</textarea></label>').join('') + '<button class="primary">전시 수정본 저장</button><p id="publication-state" role="status"></p><label class="check"><input type="checkbox" id="publication-consent">과학적 내용, 개인정보 및 공개 동의를 확인했습니다.</label><button type="button" data-action="publish" class="lime">미리보기 확인 · 최종 공개</button></form><div id="publication-preview">' + infographic({...p,...p.draft},true) + '</div></div>';
  const form=$('#publication-form');
  form.oninput=() => {
    const data=Object.fromEntries(new FormData(form)); Object.assign(p.draft,data);
    form.querySelectorAll('[data-section]').forEach((el)=>p.draft.sections[el.dataset.section].body=el.value);
    state.publicationDirty=true; $('#publication-consent').checked=false;
    $('#publication-preview').innerHTML=infographic({...p,...p.draft},true);
    $('#publication-state').textContent='수정 내용을 먼저 저장해 주세요.';
  };
  // Consent itself should not mark content dirty or clear its own value.
  $('#publication-consent').oninput=(e)=>e.stopPropagation();
  state.publicationDirty=false;
  form.onsubmit=async(e)=>{
    e.preventDefault(); const btn=e.submitter;btn.disabled=true;
    try { state.editPublication=await api('publication.save',{id:p.id,version:state.editPublication.version,content:p.draft}); state.publicationDirty=false;$('#publication-state').textContent='수정본 저장 완료. 공개 전 미리보기를 확인하세요.'; }
    catch(err){toast(err.message);} finally{btn.disabled=false;}
  };
}
document.addEventListener('click', async (e) => {
  const b=e.target.closest('button'); if(!b) return;
  try {
    if(b.dataset.nav) return;
    if(b.dataset.guide){const a=state.assessments.find((a)=>a.id===b.dataset.guide);dialog(a.title,'<p class="prose">'+esc(a.guide)+'</p><p>시작 '+date(a.startAt)+' / 마감 '+date(a.deadline)+'</p>'+a.fields.map((f,i)=>'<section class="preview-section"><h3>'+(i+1)+'. '+esc(f.title)+'</h3><p>'+esc(f.guide)+'</p></section>').join(''));return;}
    if(b.dataset.open){ location.hash=state.user?.role==='student'?'write/'+b.dataset.open:'lab';return;}
    if(b.dataset.step!==undefined){state.step=Number(b.dataset.step);renderStep();return;}
    if(b.dataset.deleteRef!==undefined){const r=state.saver.report;r.content[r.fields[state.step].id].splice(Number(b.dataset.deleteRef),1);changed();renderReferences();return;}
    if(b.dataset.enterGroup){await switchGroup(b.dataset.enterGroup);location.hash='teacher';await admin();return;}
    if(b.dataset.tab){state.adminTab=b.dataset.tab;await admin();return;}
    if(b.dataset.review){review(b.dataset.review);return;}
    if(b.dataset.editAssessment){assessmentForm(b.dataset.editAssessment);return;}
    if(b.dataset.deleteField!==undefined){state.editAssessment.fields.splice(Number(b.dataset.deleteField),1);renderFields();return;}
    if(b.dataset.moveField!==undefined){const i=Number(b.dataset.moveField),j=i+Number(b.dataset.direction),fs=state.editAssessment.fields;if(j>=0&&j<fs.length)[fs[i],fs[j]]=[fs[j],fs[i]];renderFields();return;}
    if(b.dataset.resetStudent){pinDialog(b.dataset.resetStudent);return;}
    if(b.dataset.allowPin){if(!confirm('기존 PIN/접속 코드를 해제하고 학생이 새 PIN을 직접 등록하게 할까요? 보고서는 유지됩니다.'))return;b.disabled=true;await api('student.update',{id:b.dataset.allowPin,allowPinSetup:true});$('#modal').close();toast('처음 PIN 등록 화면에서 학생이 새 PIN을 정할 수 있습니다.');await students();return;}
    if(b.dataset.toggleStudent){const s=state.students.find((s)=>s.id===b.dataset.toggleStudent);await api('student.update',{id:s.id,active:!s.active});await students();return;}
    if(b.dataset.generate){b.disabled=true;await api('publication.generate',{id:b.dataset.generate});state.adminTab='publications';await admin();return;}
    if(b.dataset.editPublication){editPublication(b.dataset.editPublication);return;}
    if(b.dataset.hidePublication){const p=state.publications.find((p)=>p.id===b.dataset.hidePublication);await api('publication.hide',{id:p.id,version:p.version});await publications();return;}
    switch(b.dataset.action){
      case 'pin-mode':{const info=Object.fromEntries(new FormData($('#login-form')));state.pinSetup=!state.pinSetup;login('student');for(const k of ['year','grade','classNo','number','name'])if($('#login-form [name="'+k+'"]'))$('#login-form [name="'+k+'"]').value=info[k] || '';break;}
      case 'toggle-password':{
        const input=$('#login-password'), visible=input.type==='password';
        input.type=visible?'text':'password';
        b.textContent=visible?'숨기기':'보기';
        b.setAttribute('aria-pressed',String(visible));
        b.setAttribute('aria-label',visible?'비밀번호 숨기기':'비밀번호 표시');
        break;
      }
      case 'copy-login-url':
        await copyText(studentAccessUrl());toast('학생 접속 주소를 복사했습니다.');break;
      case 'copy-qr':{
        if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('이 브라우저는 QR 이미지 복사를 지원하지 않습니다. PNG 다운로드를 이용해 주세요.');
        const blob=await qrBlob();await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);toast('QR 이미지를 복사했습니다.');break;
      }
      case 'download-qr':{
        const blob=await qrBlob(),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download='생명과학-연구소-학생접속-QR.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;
      }
      case 'logout':
        if(state.saver && !(await state.saver.flush()) && !confirm('미저장 내용은 이 기기에 복구본으로 남습니다. 로그아웃할까요?'))return;
        b.disabled=true;state.saver?.stop();state.saver=null;await api('logout');state.user=null;state.reports=[];state.students=[];await route();identity();break;
      case 'prev':state.step--;renderStep();break;
      case 'next':state.step++;renderStep();break;
      case 'add-reference':{
        const r=state.saver.report,k=r.fields[state.step].id;r.content[k]||=[];
        if(r.content[k].length>=20)throw new Error('참고 자료는 최대 20개입니다.');
        r.content[k].push({title:'',author:'',source:''});changed();renderReferences();break;
      }
      case 'retry-save':if(state.saver)await state.saver.flush();break;
      case 'reload-report':if(confirm('이 기기의 미저장 내용은 복구본으로 보관하고 서버 최신본을 불러올까요?')){state.saver.stop();state.saver=null;await route();}break;
      case 'backup':{
        let stored=null;try{stored=JSON.parse(localStorage.getItem(backupKey(state.saver.report.id))||'null');}catch{}
        download('연구노트-복구본.json',JSON.stringify(stored?.report||state.saver.report,null,2));break;
      }
      case 'preview-report':{
        const r=state.saver.report;
        dialog('전체 보고서 미리보기',reportActions(r)+reportHTML(r)+(['draft','revision'].includes(r.status)?'<div class="notice">필수 항목과 출처를 확인하세요. 제출 후에는 교사가 보완을 요청해야 수정할 수 있습니다.</div><button class="primary" data-action="submit-report">최종 제출</button>':''));
        break;
      }
      case 'download-report-pdf':{
        b.disabled=true;
        try {
          await loadScript('./vendor/html2pdf.bundle.min.js',()=>typeof globalThis.html2pdf==='function');
          await document.fonts.ready;
          await html2pdf().set({margin:0,filename:reportFileName(state.previewReport,state.previewReport.student || state.user),image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',scrollX:0,scrollY:0},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy']}}).from($('#printable-report')).save();
        } finally { b.disabled=false; }
        break;
      }
      case 'print-report':{
        document.body.classList.add('printing-report');
        window.addEventListener('afterprint',()=>document.body.classList.remove('printing-report'),{once:true});
        window.print();
        break;
      }
      case 'submit-report':
        b.disabled=true;
        if(!(await state.saver.flush()))throw new Error('서버 저장을 완료한 후 제출하세요.');
        {const r=state.saver.report;await api('report.submit',{id:r.id,version:r.version,content:r.content});state.saver.stop();state.saver=null;$('#modal').close();toast('최종 제출했습니다. 선생님의 검토를 기다려 주세요.');await route();}break;
      case 'group-link':await copyText(studentAccessUrl());toast('현재 그룹의 학생 접속 링크를 복사했습니다.');break;
      case 'refresh-admin':await admin();break;
      case 'retry-assessments':state.assessmentError='';activities();break;
      case 'refresh-sheets':b.disabled=true;{const result=await api('sheets.refresh');toast(result.views?'구글 시트 한글 탭을 최신 내용으로 갱신했습니다.':'시트 갱신 요청을 완료했습니다.');b.disabled=false;}break;
      case 'roster-template':download('학생명단-양식.csv','\uFEFF학년도,학년,반,번호,이름,접속코드\n','text/csv;charset=utf-8');break;
      case 'roster-codes':download('신규학생-접속코드.csv',rosterCSV(state.rosterCodes),'text/csv;charset=utf-8');state.rosterDownloaded=true;$('[data-action=import-roster]').disabled=false;break;
      case 'import-roster':if(!state.roster || !state.rosterDownloaded)throw new Error('명단과 접속 코드 다운로드를 먼저 확인하세요.');b.disabled=true;const result=await api('students.import',{students:state.roster});state.roster=null;state.rosterCodes=null;await students();toast(result.sheetWarning || '명단을 등록했습니다.');break;
      case 'export-reports':download('탐구보고서-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state.reports,null,2));break;
      case 'new-assessment':assessmentForm();break;
      case 'add-field':if(state.editAssessment.fields.length>=20)throw new Error('항목은 최대 20개입니다.');state.editAssessment.fields.push({id:'field_'+crypto.randomUUID().slice(0,8),title:'',guide:'',type:'text',required:true});renderFields();break;
      case 'back-publications':await publications();break;
      case 'publish':
        if(state.publicationDirty)throw new Error('수정본을 먼저 저장해 주세요.');
        if(!$('#publication-consent').checked)throw new Error('내용 및 공개 동의 확인에 체크해 주세요.');
        if(!confirm('이 전시본을 모든 방문자가 볼 수 있도록 공개할까요?'))return;
        b.disabled=true;await api('publication.publish',{id:state.editPublication.id,version:state.editPublication.version,consent:true});toast('전시관에 공개했습니다.');await publications();break;
      case 'print':window.print();break;
    }
  } catch(err){toast(err.message);b.disabled=false;}
});
boot();
