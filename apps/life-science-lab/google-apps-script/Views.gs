/* Human-readable derived views. Never rename, clear, or modify LAB_COLUMNS tabs. */
function labViewData_(tables, groups) {
  const labels={draft:'작성 중',submitted:'검토 대기',approved:'승인',revision:'보완 요청',rejected:'반려',open:'운영 중',closed:'마감',hidden:'비공개'};
  const groupId=(r)=>r.groupId || 'legacy';
  const groupMap=new Map(groups.map((g)=>[g.id,g.title]));
  const group=(r)=>groupMap.get(groupId(r)) || '그룹 미확인';
  const name=(v)=>String(v || '').replace(/[（(]\s*(?:공동|위탁)\s*[)）]/g,'').trim();
  const code=(s)=>String(s.grade)+String(s.classNo).padStart(2,'0')+String(s.number).padStart(2,'0');
  const courses=(s)=>(s.courseClasses || []).join(', ');
  const date=(v)=>v && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)+9*3600000).toISOString().slice(0,19).replace('T',' ') : (v || '');
  const students=tables.Students.slice().sort((a,b)=>group(a).localeCompare(group(b),'ko') || a.grade-b.grade || a.classNo-b.classNo || a.number-b.number);
  const studentMap=new Map(students.map((s)=>[s.id,s]));
  const reportMap=new Map(tables.Reports.map((r)=>[r.studentId+':'+r.assessmentId,r]));
  const reportIds=new Map(tables.Reports.map((r)=>[r.id,r]));
  const identity=(r)=>{const s=studentMap.get(r.studentId);return s && groupId(s)===groupId(r) ? [code(s),name(s.name),courses(s)] : ['','학생 정보 확인 필요',''];};
  const answer=(f,value)=>f.type==='references' ? (Array.isArray(value)?value:[]).map((v,i)=>`${i+1}. ${[v.title,v.author,v.source].filter(Boolean).join(' · ')}`).join('\n') : String(value ?? '');
  const copyText=(r,s)=>{
    if(!r)return '';
    const sections=(r.fields || []).map((f,i)=>`[${i+1}. ${f.title}]\n${answer(f,r.content?.[f.id]) || '(미작성)'}`);
    const text=[`탐구 제목: ${r.title}`,`학생: ${code(s)} ${name(s.name)}`,`제출 상태: ${labels[r.status] || r.status}`,...sections].join('\n\n');
    return text.length<=49000 ? text : '보고서 전체 내용이 구글 시트의 한 셀 글자 수 제한을 초과했습니다. "보고서 내용" 탭에서 항목별 원문을 확인하세요.';
  };
  const views={};
  views['학생 명단']={headers:['연구 그룹','학년도','학년','소속 반','번호','학번','이름','수업 반','이용 상태','PIN 등록 상태'],rows:students.map((s)=>[group(s),s.year,s.grade,s.classNo,s.number,code(s),name(s.name),courses(s),s.active?'이용 가능':'이용 중지',s.passwordHash?'등록됨':'미등록'])};
  views['탐구 활동']={headers:['연구 그룹','학년도','과목','탐구 제목','분야','운영 상태','시작일','마감일','탐구 안내'],rows:tables.Assessments.map((a)=>[group(a),a.year,a.subject,a.title,a.category,labels[a.status] || a.status,date(a.startAt) || '별도 안내',date(a.deadline) || '별도 안내',a.guide])};
  const progress=[];
  for(const a of tables.Assessments)for(const s of students.filter((s)=>s.active && s.year===a.year && groupId(s)===groupId(a))){const r=reportMap.get(s.id+':'+a.id);progress.push([group(a),a.title,code(s),name(s.name),courses(s),r?(labels[r.status] || r.status):'미참여',date(r?.updatedAt),date(r?.submittedAt),copyText(r,s)]);}
  views['제출 현황']={headers:['연구 그룹','탐구 제목','학번','이름','수업 반','제출 상태','최근 저장일','최종 제출일','GPT 복사용 전체 보고서'],rows:progress};
  const content=[];
  for(const r of tables.Reports)for(const [i,f] of (r.fields || []).entries()){
    const value=r.content?.[f.id];
    const body=f.type==='references' ? (Array.isArray(value)?value:[]).map((v)=>[v.title,v.author,v.source].filter(Boolean).join(' · ')).join('\n') : String(value || '');
    content.push([group(r),r.title,...identity(r),labels[r.status] || r.status,i+1,f.title,body]);
  }
  views['보고서 내용']={headers:['연구 그룹','탐구 제목','학번','이름','수업 반','제출 상태','항목 순서','항목명','작성 내용'],rows:content};
  views['교사 피드백']={headers:['연구 그룹','탐구 제목','학번','이름','수업 반','검토 결과','피드백','검토일'],rows:tables.Reviews.map((v)=>{const r=reportIds.get(v.reportId);return [group(v),r?.title || '',...(r?identity(r):['','','']),labels[v.status] || v.status,v.feedback,date(v.createdAt)];})};
  views['전시 현황']={headers:['연구 그룹','학년도','분야','전시 제목','공개 상태','공개일','공개 버전'],rows:tables.Publications.map((p)=>[group(p),p.year,p.category,p.published?.title || p.draft?.title || '',p.visible?'공개 중':'비공개',date(p.publishedAt),p.publishedVersion || 0])};
  views['연구 그룹']={headers:['그룹명','학년도','학기','과목','학교'],rows:groups.map((g)=>[g.title,g.year,g.semester,g.subject,g.school])};
  return views;
}
function labRefreshViews_(sheet,db) {
  const tables=Object.fromEntries(['Students','Assessments','Reports','Reviews','Publications'].map((key)=>[key,db.all(key)]));
  const groups=LabDomain.execute(db,'groups.list',{}, {},labContext_()).groups;
  const views=labViewData_(tables,groups);
  const updated=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd HH:mm:ss');
  // A text cell must never become a formula, even when supplied by a student.
  const safe=(v)=>typeof v==='string' && /^[=+\-@\t\r]/.test(v) ? "'"+v : (v ?? '');
  // Verify every target before clearing any derived rows. Never adopt a user tab by name alone.
  for(const title of Object.keys(views)){
    const tab=sheet.getSheetByName(title);
    if(!tab || tab.getRange(1,1,1,1).getValues()[0][0]!=='연구소 조회용 · '+title)throw new Error('조회용 시트 구성을 확인하세요: '+title);
  }
  for(const [title,view] of Object.entries(views)){
    const tab=sheet.getSheetByName(title);
    if(!tab || tab.getRange(1,1,1,1).getValues()[0][0]!=='연구소 조회용 · '+title)throw new Error('조회용 시트 구성을 확인하세요: '+title);
    const height=Math.max(tab.getLastRow(),view.rows.length+3);
    if(height>tab.getMaxRows())tab.insertRowsAfter(tab.getMaxRows(),height-tab.getMaxRows());
    tab.getRange(3,1,1,view.headers.length).setValues([view.headers]);
    if(height>3)tab.getRange(4,1,height-3,view.headers.length).clearContent();
    if(view.rows.length)tab.getRange(4,1,view.rows.length,view.headers.length).setValues(view.rows.map((row)=>row.map(safe)));
    tab.getRange(2,1,1,2).setValues([['최근 갱신 (한국 시간)',updated]]);
  }
  SpreadsheetApp.flush();
  return {updatedAt:updated,sheets:Object.keys(views).length,students:tables.Students.length};
}
