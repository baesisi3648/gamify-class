import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../server/api.js';
import { passwordHash, signSession } from '../server/auth.js';
const env={LAB_SESSION_SECRET:'test-only-session-secret-not-for-production',LAB_ADMIN_HASH:await passwordHash('test-teacher-password')};
const request=(action,payload={},cookie='',origin='https://lab.test')=>new Request('https://lab.test/api/lab/rpc',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({action,payload})});
test('브라우저는 내부 인증 작업과 타 역할 작업을 호출할 수 없다',async()=>{
  const repo={execute:()=>{throw new Error('must not execute')}};
  const cookie='lab_session='+await signSession({role:'student',id:'one',authVersion:1},env.LAB_SESSION_SECRET);
  assert.equal((await handle(request('students.list',{},cookie),env,repo)).status,403);
  assert.equal((await handle(request('auth.lookup',{},cookie),env,repo)).status,404);
  assert.equal((await handle(request('report.save',{},cookie,'https://attacker.test'),env,repo)).status,403);
  assert.equal((await handle(request('report.save'),env,repo)).status,401);
});
test('관리자 로그인 쿠키는 HttpOnly; 잘못된 암호 실패; 해시만 저장',async()=>{
  const calls=[];const repo={execute:async(action)=>{calls.push(action);return action==='auth.login'?{group:null,me:{role:'teacher'}}:{ok:true};}};
  const ok=await handle(request('login',{role:'teacher',password:'test-teacher-password'}),env,repo);
  assert.equal(ok.status,200);assert.deepEqual(calls,['auth.login']);assert.match(ok.headers.get('Set-Cookie'),/HttpOnly/);assert.match(ok.headers.get('Set-Cookie'),/Secure/);
  const bad=await handle(request('login',{role:'teacher',password:'wrong'}),env,repo);assert.equal(bad.status,401);
  let stored;
  const cookie='lab_session='+await signSession({role:'teacher'},env.LAB_SESSION_SECRET);
  const importing=await handle(request('students.import',{students:[{name:'가상학생',password:'test-pass-123'}]},cookie),env,{execute:async(a,p)=>{stored=p;return{count:1}}});
  assert.equal(importing.status,200);assert.equal(stored.students[0].password,undefined);
  assert.match(stored.students[0].passwordHash,/^[a-f0-9]{32}:[a-f0-9]{64}$/);
  const repeated=await handle(request('students.import',{students:[{name:'가상학생',password:'',passwordHash:'untrusted-hash'}]},cookie),env,{execute:async(a,p)=>{stored=p;return{count:1}}});
  assert.equal(repeated.status,200);assert.equal(stored.students[0].password,undefined);assert.equal(stored.students[0].passwordHash,undefined);
});
