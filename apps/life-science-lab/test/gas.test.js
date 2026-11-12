import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID, randomBytes } from 'node:crypto';
function gas() {
  const tabs=new Map(),props=new Map(),nonces=new Map();
  const sheet={
    getName:()=> 'Gamify Class - 생명과학 탐구 연구소',getId:()=> 'separate-test-sheet',
    getSheetByName:(name)=>tabs.get(name),
    insertSheet:(name)=>{
      const data=[];
      const tab={
        getLastRow:()=>data.length,getMaxRows:()=>1000,deleteRows:(start,count)=>{data.splice(start-1,count);},insertRowsAfter:()=>{},setFrozenRows:()=>{},setColumnWidths:()=>{},
        getRange:(row,col,height,width)=>{
          const range={
            getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>data[row-1+i]?.[col-1+j]??'')),
            setValues:(values)=>{values.forEach((v,i)=>{data[row-1+i]||=[];v.forEach((cell,j)=>data[row-1+i][col-1+j]=cell);});return range;},
            clearContent:()=>{for(let i=0;i<height;i++)if(data[row-1+i])for(let j=0;j<width;j++)data[row-1+i][col-1+j]='';return range;},
            setFontWeight:()=>range,setBackground:()=>range
          };return range;
        },data
      };tabs.set(name,tab);return tab;
    }
  };
  let locked=false;const lockStats={tries:0,cacheFails:false};
  const lock={waitLock:()=>{locked=true;},tryLock:()=>{lockStats.tries++;locked=true;return true;},hasLock:()=>locked,releaseLock:()=>{locked=false;}};
  const ctx=vm.createContext({
    SpreadsheetApp:{getActiveSpreadsheet:()=>sheet,openById:(id)=>{assert.equal(id,'separate-test-sheet');return sheet;},flush:()=>{}},
    PropertiesService:{getScriptProperties:()=>({getProperty:(k)=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
    LockService:{getScriptLock:()=>lock},CacheService:{getScriptCache:()=>({get:(k)=>nonces.get(k),put:(k,v)=>{if(k.startsWith('lab:pub:')&&lockStats.cacheFails)throw new Error('Argument too large');nonces.set(k,v);}})},
    Utilities:{Charset:{UTF_8:'UTF-8'},getUuid:randomUUID,formatDate:()=> '2026-11-09 10:00:00',computeHmacSha256Signature:(body,secret,charset)=>{assert.equal(charset,'UTF-8');return [...createHmac('sha256',secret).update(body,'utf8').digest()].map((v)=>v>127?v-256:v);}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:(body)=>({setMimeType:()=>JSON.parse(body)})}
  });
  for(const file of ['seed.js','domain.js','google-apps-script/Code.gs','google-apps-script/Views.gs'])vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),ctx);
  ctx.setupLifeScienceLab();
  function request(action,payload,actor={role:'teacher'}) {
    const body=JSON.stringify({action,payload,actor,timestamp:Date.now(),nonce:randomBytes(16).toString('hex')});
    const signature=createHmac('sha256',props.get('LAB_WEBHOOK_SECRET')).update(body).digest('hex');
    return {postData:{contents:JSON.stringify({body,signature})}};
  }
  return {ctx,tabs,props,request,lockStats};
}
test('Apps Script 실제 어댑터: 재초기화 보존, JSON 왕복, 수식 방지, 서명 및 재전송 차단',()=>{
  const g=gas();
  const rows=Array.from({length:29},(_,i)=>({year:2026,grade:2,classNo:1,number:i+1,name:i?'테스트'+i:'=IMPORTXML("bad")',passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)}));
  const req=g.request('students.import',{students:rows});
  assert.equal(g.ctx.doPost(req).ok,true);
  assert.equal(g.tabs.get('Students').data.length,30);
  assert.match(g.tabs.get('Students').data[1][5],/^"=/);
  g.ctx.setupLifeScienceLab();assert.equal(g.tabs.get('Students').data.length,30);
  const list=g.ctx.doPost(g.request('students.list',{}));
  assert.equal(list.result.students.length,29);
  assert.equal(list.result.students[0].name,'=IMPORTXML("bad")');
  assert.equal(g.ctx.doPost(req).ok,false);
  const tampered=g.request('students.list',{}),body=JSON.parse(tampered.postData.contents);body.signature='0'.repeat(64);
  assert.equal(g.ctx.doPost({postData:{contents:JSON.stringify(body)}}).status,403);
});
test('Apps Script에서 실패한 명단 검증은 일부 학생만 저장하지 않는다',()=>{
  const g=gas(),students=[1,2].map((i)=>({year:2026,grade:2,classNo:1,number:1,name:'중복'+i,passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)}));
  assert.equal(g.ctx.doPost(g.request('students.import',{students})).status,400);
  assert.equal(g.tabs.get('Students').data.length,1);
});
test('구 스키마는 열만 확장하며 기존 학생·암호·보고서 행 보존',()=>{
  const g=gas();
  const s={year:2026,grade:2,classNo:1,number:1,name:'보존가상학생',passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)};
  assert.equal(g.ctx.doPost(g.request('students.import',{students:[s]})).ok,true);
  const student=g.ctx.doPost(g.request('students.list',{})).result.students[0];
  assert.equal(g.ctx.doPost(g.request('report.open',{assessmentId:'enzyme-structure'},{role:'student',id:student.id,authVersion:1})).ok,true);
  for(const name of ['Students','Assessments','AssessmentFields','Reports','Reviews','Publications','PublicationVersions']){
    const width=g.tabs.get(name).data[0].length-(name==='Students'?2:1);
    g.tabs.get(name).data.forEach((r) => r.splice(width));
  }
  const before=structuredClone(g.tabs.get('Students').data[1]),report=structuredClone(g.tabs.get('Reports').data[1]);
  g.props.delete('LAB_SCHEMA_VERSION');
  assert.equal(g.ctx.doPost(g.request('bootstrap',{},{})).ok,true);
  assert.deepEqual(g.tabs.get('Students').data[1],before);assert.deepEqual(g.tabs.get('Reports').data[1],report);
  assert.equal(g.tabs.get('Students').data[0].at(-2),'groupId');
  assert.equal(g.ctx.doPost(g.request('students.list',{})).result.students.length,1);
});
test('최초 수동 실행과 서버 초기화는 동일한 비공개 연결키를 유지',()=>{
  const g=gas(),secret=g.props.get('LAB_WEBHOOK_SECRET');
  g.ctx.labBootstrapConfig_=()=>({spreadsheetId:'separate-test-sheet',secret});
  g.props.delete('LAB_WEBHOOK_SECRET');g.props.delete('LAB_SPREADSHEET_ID');
  g.ctx.setupLifeScienceLab();
  assert.equal(g.props.get('LAB_WEBHOOK_SECRET'),secret);
  const req=g.request('bootstrap',{},{});
  g.props.delete('LAB_WEBHOOK_SECRET');g.props.delete('LAB_SPREADSHEET_ID');
  const result=g.ctx.doPost(req);
  assert.equal(result.ok,true);assert.equal(result.result.assessments[0].fields.length,10);
  assert.equal(g.props.get('LAB_WEBHOOK_SECRET'),secret);
});
test('한글 조회 탭 갱신은 원본·PIN 해시를 보존하고 수식 주입 차단',()=>{
  const g=gas();
  const headers=g.ctx.labViewData_({Students:[],Assessments:[],Reports:[],Reviews:[],Publications:[]},[]);
  for(const [title,view] of Object.entries(headers))g.ctx.SpreadsheetApp.getActiveSpreadsheet().insertSheet(title).getRange(1,1,3,view.headers.length).setValues([['연구소 조회용 · '+title,...view.headers.slice(1).map(()=> '')],view.headers.map(()=>''),view.headers]);
  const rows=[{year:2026,grade:2,classNo:1,number:1,name:'=IMPORTXML("bad")',courseClass:'2-1',passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)}];
  assert.equal(g.ctx.doPost(g.request('students.import',{students:rows})).ok,true);
  const internal=['Students','Assessments','AssessmentFields','Reports','Reviews','Publications','PublicationVersions','Settings'];
  const before=JSON.stringify(internal.map((key)=>g.tabs.get(key).data));
  const response=g.ctx.doPost(g.request('sheets.refresh',{}, {role:'teacher',owner:true}));
  assert.equal(response.ok,true);assert.equal(response.result.views.students,1);assert.equal(response.result.views.sheets,7);
  assert.equal(JSON.stringify(internal.map((key)=>g.tabs.get(key).data)),before);
  assert.match(g.tabs.get('학생 명단').data[3][6],/^'=/);
  assert.equal(g.tabs.get('학생 명단').data[3][9],'등록됨');
  assert.ok(!JSON.stringify(g.tabs.get('학생 명단').data).includes('a'.repeat(32)));
  assert.equal(g.tabs.get('제출 현황').data[3][5],'미참여');
  assert.equal(g.ctx.doPost(g.request('sheets.refresh',{}, {role:'teacher'})).status,403);
  assert.equal(g.tabs.get('제출 현황').data[2][8],'GPT 복사용 전체 보고서');
});
test('조회 탭이 없어도 성공한 명단 저장을 실패로 보고하지 않음',()=>{
  const g=gas();
  const response=g.ctx.doPost(g.request('students.import',{students:[{year:2026,grade:2,classNo:1,number:1,name:'가상학생'}]},{role:'teacher',owner:true}));
  assert.equal(response.ok,true);assert.match(response.result.sheetWarning,/명단은 저장/);assert.equal(g.tabs.get('Students').data.length,2);
});

test('읽기 요청은 전역 잠금 없이 처리, 쓰기는 잠금 유지',()=>{
  const g=gas();
  const s={year:2026,grade:2,classNo:1,number:1,name:'잠금가상학생',passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)};
  g.lockStats.tries=0;
  assert.equal(g.ctx.doPost(g.request('students.import',{students:[s]})).ok,true);
  assert.equal(g.lockStats.tries,1);
  g.lockStats.tries=0;
  const login=g.ctx.doPost(g.request('auth.login',{year:2026,grade:2,classNo:1,number:1,name:'잠금가상학생'},{role:'system'}));
  assert.equal(login.ok,true);assert.equal(login.result.me.name,'잠금가상학생');
  for(const a of ['bootstrap','groups.list','archive'])assert.equal(g.ctx.doPost(g.request(a,{},{})).ok,true);
  assert.equal(g.lockStats.tries,0);
  const rated=g.ctx.doPost(g.request('auth.login',{year:2026,grade:2,classNo:1,number:1,name:'잠금가상학생',rateKeys:[{key:'k',limit:5}]},{role:'system'}));
  assert.equal(rated.ok,true);assert.equal(g.lockStats.tries,1);
});
test('공개 목록 캐시는 탐구 수정 시 즉시 갱신',()=>{
  const g=gas();
  const first=g.ctx.doPost(g.request('bootstrap',{},{})).result.assessments[0];
  assert.equal(g.ctx.doPost(g.request('bootstrap',{},{})).result.assessments[0].title,first.title);
  const edited={...first,title:'바뀐 제목',version:first.version};
  assert.equal(g.ctx.doPost(g.request('assessment.save',edited,{role:'teacher',owner:true})).ok,true);
  assert.equal(g.ctx.doPost(g.request('bootstrap',{},{})).result.assessments[0].title,'바뀐 제목');
});
test('만료된 로그인 카운터 행만 정리',()=>{
  const g=gas();
  g.ctx.doPost(g.request('auth.rate',{key:'old',limit:5},{role:'system'}));
  g.ctx.doPost(g.request('groups.create',{year:2026,semester:'2',subject:'생명',school:'가상',passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)},{role:'teacher',owner:true}));
  const tab=g.tabs.get('Settings');
  const row=tab.data.findIndex((r)=>String(r[0]).includes('rate:old'));
  tab.data[row][2]=JSON.stringify('2000-01-01T00:00:00.000Z');
  assert.equal(g.ctx.labPruneRateRows(),1);
  assert.ok(!tab.data.some((r)=>String(r[0]).includes('rate:')));
  assert.ok(tab.data.some((r)=>String(r[0]).includes('group:')));
});

test('캐시 저장이 실패해도 조회는 성공하고, 한글 대용량은 캐시하지 않음',()=>{
  const g=gas();g.lockStats.cacheFails=true;
  assert.equal(g.ctx.doPost(g.request('bootstrap',{},{})).ok,true);
  assert.equal(g.ctx.labUtf8Bytes_('가'.repeat(10)),30);assert.equal(g.ctx.labUtf8Bytes_('a😀'),5);
});
test('대체 카운터: 실패한 로그인 시도도 저장됨',()=>{
  const g=gas();
  const p={year:2026,grade:2,classNo:1,number:5,name:'없는학생',rateKeys:[{key:'id-x',limit:2}]};
  for(let i=0;i<2;i++)assert.equal(g.ctx.doPost(g.request('auth.login',{...p,claimHash:'a'.repeat(32)+':'+'b'.repeat(64)},{role:'system'})).ok,false);
  const third=g.ctx.doPost(g.request('auth.login',p,{role:'system'}));
  assert.equal(third.status,429);
});
test('D1 이전용: export.all 은 전체 기록(카운터 제외), sync.replaceAll 은 탭을 D1 사본으로 교체',()=>{
  const g=gas();
  const s={year:2026,grade:2,classNo:1,number:1,name:'이전가상학생',passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)};
  g.ctx.doPost(g.request('students.import',{students:[s]}));
  g.ctx.doPost(g.request('auth.rate',{key:'k',limit:5},{role:'system'}));
  assert.equal(g.ctx.doPost(g.request('export.all',{},{role:'teacher',owner:true})).status,403);
  const ex=g.ctx.doPost(g.request('export.all',{},{role:'system'}));
  assert.equal(ex.ok,true);assert.equal(ex.result.tables.Students[0].name,'이전가상학생');
  assert.ok(ex.result.tables.AssessmentFields.length>=10);assert.ok(!ex.result.tables.Settings.some((r)=>r.id.startsWith('rate:')));
  const tables={...ex.result.tables,Students:[{...ex.result.tables.Students[0],name:'바뀐이름'}],Reports:[]};
  const big='효'.repeat(20000);
  tables.Reports=[{id:'r1',studentId:ex.result.tables.Students[0].id,assessmentId:'enzyme-structure',title:'t',fields:[],content:{a:big},status:'draft',version:1,createdAt:'',updatedAt:'',submittedAt:'',groupId:'legacy'}];
  const rep=g.ctx.doPost(g.request('sync.replaceAll',{tables},{role:'system'}));
  assert.equal(rep.ok,true);assert.equal(rep.result.copied.Students,1);assert.equal(rep.result.copied.Settings,0);
  assert.match(g.tabs.get('Students').data[1][5],/바뀐이름/);
  assert.equal(g.tabs.get('Reports').data.length,2);
  assert.ok(!g.tabs.get('Settings').data.slice(1).some((r)=>String(r[0]).includes('rate:')));
});
test('sync.replaceAll: 시트 한도를 넘는 칸이 있으면 어떤 탭도 건드리지 않고 거부',()=>{
  const g=gas();
  const before=JSON.stringify(g.tabs.get('Assessments').data);
  const tables={Assessments:[{id:'x',title:'"'.repeat(30000),groupId:'legacy'}]};
  const r=g.ctx.doPost(g.request('sync.replaceAll',{tables},{role:'system'}));
  assert.equal(r.ok,false);assert.equal(r.status,400);
  assert.equal(JSON.stringify(g.tabs.get('Assessments').data),before);
});
