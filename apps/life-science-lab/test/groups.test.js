import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.js';
const hash='a'.repeat(32)+':'+ 'b'.repeat(64);
function group(f,subject='세포와 물질대사') {
  const g=f.run('groups.create',{year:2027,semester:'1',subject,school:'가상학교',passwordHash:hash},{role:'teacher',owner:true});
  return {g,teacher:{role:'teacher',groupId:g.id,groupVersion:g.version}};
}
test('그룹 생성은 전체 관리자만, 공개 목록에 암호나 학생 정보 노출 없음',()=>{
  const f=fixture();assert.throws(()=>f.run('groups.create',{},f.teacher),/전체 관리자/);
  const {g,teacher}=group(f);
  assert.match(g.title,/2027학년도 1학기/);
  const listed=f.run('groups.list',{},{});assert.equal(listed.groups.length,2);assert.ok(!JSON.stringify(listed).includes(hash));
  assert.equal(f.run('students.list',{},teacher).students.length,0);
  assert.equal(f.run('bootstrap',{groupId:g.id},{}).assessments[0].fields.length,10);
  assert.equal(f.run('students.list').students.length,2);
});
test('다른 그룹 ID·학번·보고서·탐구·전시본 접근 및 덮어쓰기 차단',()=>{
  const f=fixture(),{g,teacher}=group(f);
  f.run('students.import',{students:[{year:2027,grade:2,classNo:1,number:1,name:'가상학생(공동)',courseClass:'2-3',passwordHash:hash}]},teacher);
  const s=f.run('students.list',{},teacher).students[0];assert.equal(s.name,'가상학생');assert.deepEqual(s.courseClasses,['2-3']);
  const actor={role:'student',groupId:g.id,id:s.id,authVersion:1};
  const otherReport=f.run('report.open',{assessmentId:globalThis.LAB_SEED.id},f.student);
  assert.throws(()=>f.run('report.save',{id:otherReport.id,version:0,content:{}},actor),/찾을 수 없습니다/);
  assert.throws(()=>f.run('student.update',{id:f.student.id,active:false},teacher),/찾을 수 없습니다/);
  assert.throws(()=>f.run('review',{id:otherReport.id},teacher),/검토 대기/);
  assert.throws(()=>f.run('assessment.save',{...globalThis.LAB_SEED},teacher),/다른 그룹/);
  assert.throws(()=>f.run('students.list',{groupId:'legacy'},teacher),/그룹과 요청/);
  assert.equal(f.run('reports.list',{},teacher).reports.length,0);
  assert.equal(f.run('archive',{groupId:g.id},{}).works.length,0);
  assert.throws(()=>f.run('groups.enter',{targetId:'legacy'},teacher),/전체 관리자/);
  const ownAssessment=f.run('assessments.list',{},teacher).assessments[0];
  const report=f.run('report.open',{assessmentId:ownAssessment.id},actor);assert.equal(f.db.all('Reports').find((r) => r.id===report.id).groupId,g.id);
  assert.throws(()=>f.run('publication.hide',{id:'foreign',version:1},teacher),/찾을 수 없습니다/);
});
test('그룹 암호 변경은 기존 교사 세션 만료, 기존 학생 자료는 유지',()=>{
  const f=fixture(),{g,teacher}=group(f);
  const next=f.run('groups.update',{year:2027,semester:'2',subject:'생명과학',school:'가상학교',passwordHash:hash,version:g.version},teacher);
  assert.throws(()=>f.run('students.list',{},teacher),/암호가 변경/);
  assert.equal(f.run('me',{}, {...teacher,groupVersion:next.version}).group.title,next.title);
  assert.equal(f.run('students.list').students.length,2);
});
test('기존 데이터는 legacy에서만 유지, 재등록 시 공동 제외·코드와 보고서 보존',()=>{
  const f=fixture(),student=f.db.all('Students')[0];
  f.db.put('Students',{...student,name:student.name+'(공동)'});
  f.run('students.import',{students:[{...student,name:student.name,courseClass:'2-1'}]});
  const stored=f.db.all('Students').find((s) => s.id===student.id);
  assert.equal(stored.name,student.name);assert.equal(stored.passwordHash,student.passwordHash);assert.equal(stored.authVersion,1);
  assert.deepEqual(stored.courseClasses,['2-1']);
  f.run('students.import',{students:[{...student,courseClass:'2-2'}]});
  assert.deepEqual(f.run('students.list').students[0].courseClasses,['2-1','2-2']);
});
test('기존 위탁 학생은 순수 이름으로 로그인하고 재등록해도 ID·암호·보고서 유지',()=>{
  const f=fixture(),student=f.db.all('Students')[0];
  f.db.put('Students',{...student,name:student.name+'(위탁)'});
  const report=f.run('report.open',{assessmentId:globalThis.LAB_SEED.id},f.student);
  assert.equal(f.run('auth.lookup',{year:student.year,grade:student.grade,classNo:student.classNo,number:student.number,name:student.name},{role:'system'}).id,student.id);
  assert.equal(f.run('me',{},f.student).name,student.name);
  f.run('students.import',{students:[{...student,name:student.name+'（위탁）'}]});
  const saved=f.db.all('Students').find((s)=>s.id===student.id);
  assert.equal(saved.name,student.name);assert.equal(saved.passwordHash,student.passwordHash);assert.equal(saved.authVersion,1);
  assert.equal(f.run('myReports',{},f.student).reports[0].id,report.id);
});
