import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('한글 조회용 보고서·참고자료·피드백·한국시간과 그룹 조인',()=>{
  const c=vm.createContext({});vm.runInContext(readFileSync(new URL('../google-apps-script/Views.gs',import.meta.url),'utf8'),c);
  const students=[{id:'s',year:2026,grade:2,classNo:3,number:4,name:'가상학생(위탁)',active:true,courseClasses:['2-1'],passwordHash:'never-expose-hash'}];
  const reports=[{id:'r',studentId:'s',assessmentId:'a',title:'효소 탐구',status:'submitted',updatedAt:'2026-11-09T01:00:00Z',submittedAt:'2026-11-09T02:00:00Z',fields:[{id:'text',title:'선정 이유',type:'text'},{id:'refs',title:'참고자료',type:'references'}],content:{text:'탐구 내용',refs:[{title:'논문',author:'연구자',source:'https://example.org'}]}}];
  const tables={Students:students,Assessments:[{id:'a',title:'효소 탐구',year:2026,status:'open'}],Reports:reports,Reviews:[{reportId:'r',status:'revision',feedback:'보완하세요'}],Publications:[]};
  const v=c.labViewData_(tables,[{id:'legacy',title:'연구그룹'}]);
  assert.equal(v['학생 명단'].rows[0][5],'20304');assert.equal(v['학생 명단'].rows[0][6],'가상학생');
  assert.equal(v['제출 현황'].rows[0][5],'검토 대기');assert.equal(v['제출 현황'].rows[0][6],'2026-11-09 10:00:00');
  assert.equal(v['제출 현황'].headers[8],'GPT 복사용 전체 보고서');
  assert.match(v['제출 현황'].rows[0][8],/\[1\. 선정 이유\]\n탐구 내용/);
  assert.match(v['제출 현황'].rows[0][8],/\[2\. 참고자료\]\n1\. 논문 · 연구자 · https:\/\/example\.org/);
  assert.equal(v['보고서 내용'].rows.length,2);assert.match(v['보고서 내용'].rows[1][8],/논문 · 연구자/);
  assert.equal(v['교사 피드백'].rows[0][5],'보완 요청');assert.ok(!JSON.stringify(v).includes('never-expose-hash'));
  tables.Reports[0].groupId='other';const other=c.labViewData_(tables,[]);assert.equal(other['보고서 내용'].rows[0][3],'학생 정보 확인 필요');
});
test('보고서가 없는 학생은 복사용 셀이 비어 있고 긴 보고서는 원본 확인을 안내한다',()=>{
  const c=vm.createContext({});vm.runInContext(readFileSync(new URL('../google-apps-script/Views.gs',import.meta.url),'utf8'),c);
  const student={id:'s',year:2026,grade:2,classNo:1,number:1,name:'학생',active:true};
  const tables={Students:[student],Assessments:[{id:'a',title:'탐구',year:2026,status:'open'}],Reports:[],Reviews:[],Publications:[]};
  assert.equal(c.labViewData_(tables,[] )['제출 현황'].rows[0][8],'');
  tables.Reports=[{id:'r',studentId:'s',assessmentId:'a',title:'탐구',status:'draft',fields:[{id:'text',title:'내용',type:'text'}],content:{text:'가'.repeat(49000)}}];
  assert.match(c.labViewData_(tables,[])['제출 현황'].rows[0][8],/한 셀 글자 수 제한/);
});
