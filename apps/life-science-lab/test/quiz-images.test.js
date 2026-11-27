import test from 'node:test';
import assert from 'node:assert/strict';
import {handleQuizImage} from '../server/quiz-images.js';
import {signSession} from '../server/auth.js';

test('교사만 이미지 업로드, 같은 그룹 로그인 사용자만 열람',async()=>{
  const objects=new Map();
  const env={LAB_SESSION_SECRET:'quiz-image-test-secret',REPORT_IMAGES:{
    async put(key,body,metadata){objects.set(key,{body:new Uint8Array(body),...metadata});},
    async get(key){return objects.get(key)||null;}
  }};
  const origin='https://example.test',png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
  const cookie=async(role,groupId)=>'lab_session='+await signSession({role,groupId,id:role},env.LAB_SESSION_SECRET);
  const upload=async(role,groupId,body=png)=>handleQuizImage(new Request(origin+'/api/lab/quiz-image',{method:'POST',headers:{Cookie:await cookie(role,groupId),Origin:origin,'Content-Type':'image/png'},body}),env);
  assert.equal((await upload('student','group-a')).status,403);
  assert.equal((await upload('teacher','group-a',new Uint8Array([1,2,3]))).status,415);
  const response=await upload('teacher','group-a');
  assert.equal(response.status,200);
  const id=(await response.json()).result.id;
  const get=async(groupId,authenticated=true)=>handleQuizImage(new Request(origin+'/api/lab/quiz-image/'+id,{headers:authenticated?{Cookie:await cookie('student',groupId)}:{}}),env);
  assert.equal((await get('group-a')).status,200);
  assert.equal((await get('group-b')).status,404);
  assert.equal((await get('group-a',false)).status,401);
});
