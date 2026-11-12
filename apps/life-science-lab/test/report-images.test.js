import test from 'node:test';
import assert from 'node:assert/strict';
import { handleReportImage } from '../server/report-images.js';
import { signSession } from '../server/auth.js';

const secret='report-image-test-secret';
const png=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
function bucket() {
  const objects=new Map();
  return {
    objects,
    async get(key){const value=objects.get(key);return value?{body:value.body,size:value.body.byteLength,httpMetadata:value.httpMetadata,customMetadata:value.customMetadata}:null;},
    async put(key,body,options){objects.set(key,{body:new Uint8Array(body),...options});},
    async delete(key){objects.delete(key);}
  };
}
async function cookie(user){return 'lab_session='+await signSession(user,secret);}
async function request(method,id,user,body,contentType='image/png',origin='https://lab.test') {
  return new Request('https://lab.test/api/lab/report-image/'+id,{method,headers:{Cookie:await cookie(user),Origin:origin,...(body?{'Content-Type':contentType}:{})},...(body?{body}:{})});
}

test('선택 사진은 R2에만 저장되고 학생 본인과 교사가 조회한다',async()=>{
  const r2=bucket(),actions=[];
  const report={id:'report-one',studentId:'student-one',status:'draft'};
  const repo={execute:async(action)=>{actions.push(action);return action==='myReports'?{reports:[report]}:{reports:[{...report,student:{id:'student-one'}}]};}};
  const env={LAB_SESSION_SECRET:secret,REPORT_IMAGES:r2};
  const student={role:'student',id:'student-one',authVersion:1,groupId:'class-a'};
  const put=await handleReportImage(await request('PUT',report.id,student,png),env,repo);
  assert.equal(put.status,200);assert.equal(r2.objects.size,1);
  assert.deepEqual(actions,['myReports']);
  assert.equal(actions.includes('report.save'),false);
  const get=await handleReportImage(await request('GET',report.id,student),env,repo);
  assert.equal(get.status,200);assert.equal(get.headers.get('Content-Type'),'image/png');
  assert.deepEqual(new Uint8Array(await get.arrayBuffer()),png);
  const teacher={role:'teacher',groupId:'class-a'};
  assert.equal((await handleReportImage(await request('GET',report.id,teacher),env,repo)).status,200);
  assert.equal((await handleReportImage(await request('PUT',report.id,teacher,png),env,repo)).status,403);
});

test('사진 형식, 소유권, 작성 상태와 요청 출처를 검증한다',async()=>{
  const r2=bucket(),env={LAB_SESSION_SECRET:secret,REPORT_IMAGES:r2};
  const student={role:'student',id:'student-one',authVersion:1,groupId:'class-a'};
  const repo={execute:async()=>({reports:[{id:'report-one',studentId:'student-one',status:'submitted'}]})};
  assert.equal((await handleReportImage(await request('PUT','report-one',student,png),env,repo)).status,403);
  const draftRepo={execute:async()=>({reports:[{id:'report-one',studentId:'student-one',status:'draft'}]})};
  assert.equal((await handleReportImage(await request('PUT','report-one',student,png,'text/plain'),env,draftRepo)).status,415);
  assert.equal((await handleReportImage(await request('PUT','report-one',student,png,'image/png','https://attacker.test'),env,draftRepo)).status,403);
  const missingRepo={execute:async()=>({reports:[]})};
  assert.equal((await handleReportImage(await request('GET','report-one',student),env,missingRepo)).status,404);
});
