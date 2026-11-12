import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, completeContent } from './fixture.js';
const fails = (fn,status) => assert.throws(fn,(e)=>e.status===status);
function submitted(f) {
  const r=f.run('report.open',{assessmentId:'enzyme-structure'},f.student);
  return f.run('report.submit',{id:r.id,version:r.version,content:completeContent()},f.student);
}
test('동일 학생·탐구는 하나의 보고서이고 타인은 조회/수정할 수 없다',()=>{
  const f=fixture(),r=f.run('report.open',{assessmentId:'enzyme-structure'},f.student);
  assert.equal(f.run('report.open',{assessmentId:'enzyme-structure'},f.student).id,r.id);
  fails(()=>f.run('report.save',{id:r.id,version:0,content:{}},f.other),404);
  assert.equal(f.run('myReports',{},f.other).reports.length,0);
  fails(()=>f.run('reports.list',{},f.student),403);
  fails(()=>f.run('auth.lookup',{},f.student),403);
});
test('저장 버전 역전 차단; 최신 글과 서버 버전을 유지',()=>{
  const f=fixture(),r=f.run('report.open',{assessmentId:'enzyme-structure'},f.student);
  f.run('report.save',{id:r.id,version:0,content:{selection:'최신 글'}},f.student);
  fails(()=>f.run('report.save',{id:r.id,version:0,content:{selection:'오래된 글'}},f.student),409);
  assert.equal(f.db.all('Reports')[0].content.selection,'최신 글');
});
test('필수 항목과 참고 자료 검사; 제출 후 잠금; 보완 후 재제출',()=>{
  const f=fixture(),r=f.run('report.open',{assessmentId:'enzyme-structure'},f.student);
  fails(()=>f.run('report.submit',{id:r.id,version:0,content:{}},f.student),400);
  const content=completeContent();content.references[0].author='';
  fails(()=>f.run('report.submit',{id:r.id,version:0,content},f.student),400);
  const s=submitted(f);
  fails(()=>f.run('report.save',{id:s.id,version:s.version,content:{}},f.student),409);
  f.run('review',{id:s.id,version:s.version,status:'revision',feedback:'근거를 추가하세요.'});
  const revised=f.db.all('Reports')[0];
  const again=f.run('report.submit',{id:s.id,version:revised.version,content:completeContent()},f.student);
  assert.equal(again.status,'submitted');
});
test('반려된 보고서는 기존 내용을 유지한 채 수정하고 다시 제출할 수 있다',()=>{
  const f=fixture(), submittedReport=submitted(f);
  f.run('review',{id:submittedReport.id,version:submittedReport.version,status:'rejected',feedback:'다시 작성해 주세요.'});
  const rejected=f.run('myReports',{},f.student).reports[0];
  assert.equal(rejected.status,'rejected');
  assert.equal(rejected.content.topic,completeContent().topic);
  const content={...rejected.content,topic:'다시 쓴 탐구 주제'};
  const saved=f.run('report.save',{id:rejected.id,version:rejected.version,content},f.student);
  assert.equal(saved.content.topic,'다시 쓴 탐구 주제');
  assert.equal(f.run('report.submit',{id:saved.id,version:saved.version,content},f.student).status,'submitted');
});
test('승인과 공개 분리; 익명 공개; 공개 수정본 보존; 공개 취소',()=>{
  const f=fixture(),r=submitted(f);
  fails(()=>f.run('publication.generate',{id:r.id}),409);
  f.run('review',{id:r.id,version:r.version,status:'approved',feedback:''});
  let p=f.run('publication.generate',{id:r.id});
  assert.equal(f.run('archive',{},{}).works.length,0);
  fails(()=>f.run('publication.publish',{id:p.id,version:p.version,consent:false}),400);
  p=f.run('publication.publish',{id:p.id,version:p.version,consent:true});
  const publicData=f.run('archive',{},{}).works[0];
  assert.equal(publicData.displayName,'익명의 연구자');
  assert.equal(publicData.studentId,undefined);assert.equal(publicData.reportId,undefined);
  assert.ok(!JSON.stringify(publicData).includes('가상연구자1'));
  const title=p.draft.title;
  p=f.run('publication.save',{id:p.id,version:p.version,content:{...p.draft,title:'수정본'}});
  assert.equal(f.run('archive',{},{}).works[0].title,title);
  p=f.run('publication.publish',{id:p.id,version:p.version,consent:true});
  assert.equal(f.db.all('PublicationVersions').length,2);
  assert.equal(f.db.all('PublicationVersions')[0].content.title,title);
  p=f.run('publication.hide',{id:p.id,version:p.version});
  assert.equal(f.run('archive',{},{}).works.length,0);
  assert.equal(f.db.all('Reports').length,1);
});
test('설정 편집은 기존 보고서 항목을 바꾸지 않고 새 탐구 생성 가능',()=>{
  const f=fixture(),r=f.run('report.open',{assessmentId:'enzyme-structure'},f.student);
  const a=f.run('assessments.list').assessments[0];
  f.run('assessment.save',{...a,fields:[{id:'new_question',title:'새 질문',required:true,type:'text'}]});
  assert.equal(f.db.all('Reports')[0].fields.length,10);
  const newReport=f.run('report.open',{assessmentId:a.id},f.other);
  assert.equal(newReport.fields.length,1);
  assert.equal(r.fields[0].id,'topic');
  assert.equal(r.fields[1].id,'selection');
});
test('운영 기간과 학생 비활성/접속 코드 변경을 서버에서 검사',()=>{
  const f=fixture(),a=f.run('assessments.list').assessments[0];
  f.run('assessment.save',{...a,deadline:'2026-11-06T00:00:00.000Z'});
  fails(()=>f.run('report.open',{assessmentId:a.id},f.student),409);
  f.run('student.update',{id:f.student.id,active:false});
  fails(()=>f.run('myReports',{},f.student),401);
});
test('중복 명단과 다른 이름으로 기존 학번 덮어쓰기 방지',()=>{
  const f=fixture();
  const row={year:2026,grade:2,classNo:1,number:1,name:'가상연구자1',passwordHash:'a'.repeat(32)+':'+ 'b'.repeat(64)};
  f.run('students.import',{students:[row]});assert.equal(f.db.all('Students').length,2);
  fails(()=>f.run('students.import',{students:[{...row,name:'다른 사람'}]}),409);
  assert.equal(f.db.all('Students')[0].name,'가상연구자1');
});
