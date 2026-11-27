import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {d1Shim} from './d1-shim.js';
import {handleQuiz} from '../server/quiz.js';

test('퀴즈는 그룹과 역할을 격리하고 교사가 최종 채점을 확정한다',async()=>{
  const LAB_DB=d1Shim();
  LAB_DB.raw.exec(readFileSync(new URL('../migrations/0003_quizzes.sql',import.meta.url),'utf8'));
  LAB_DB.raw.exec(readFileSync(new URL('../migrations/0004_quiz_timer.sql',import.meta.url),'utf8'));
  LAB_DB.raw.exec(readFileSync(new URL('../migrations/0005_quiz_shuffle.sql',import.meta.url),'utf8'));
  const student={id:'student-1',groupId:'legacy',authVersion:1,active:true,name:'테스트학생'};
  LAB_DB.raw.prepare('INSERT INTO Students (id,grp,data) VALUES (?,?,?)').run(student.id,'legacy',JSON.stringify(student));
  const teacher={role:'teacher',groupId:'legacy',owner:true};
  const pupil={role:'student',groupId:'legacy',id:student.id,authVersion:1};
  const env={LAB_DB};
  const call=(action,p={},actor=teacher)=>handleQuiz(action,p,actor,env);
  const created=await call('quiz.create',{title:'효소 퀴즈',questions:[
    {id:'a',type:'ox',prompt:'효소는 단백질이다.',points:2,accepted:'O'},
    {id:'b',type:'short',prompt:'효소가 결합하는 물질은?',points:3,accepted:'기질, substrate'},
    {id:'c',type:'essay',prompt:'효소 특이성을 설명하세요.',points:5,rubric:'활성 부위와 기질의 구조를 설명'}
  ]});
  assert.equal((await call('quiz.list',{},pupil)).quizzes.length,0);
  await call('quiz.status',{id:created.id,status:'open'});
  const view=await call('quiz.attempt',{quizId:created.id},pupil);
  assert.equal(view.quiz.questions[0].accepted,undefined);
  assert.equal(view.quiz.questions[2].rubric,undefined);
  const answers={a:'O',b:' substrate ',c:'활성 부위에 맞는 기질이 결합한다.'};
  const draft=await call('quiz.save',{quizId:created.id,answers,version:view.attempt.version},pupil);
  assert.equal(draft.status,'draft');
  const submitted=await call('quiz.submit',{quizId:created.id,answers,version:draft.version},pupil);
  assert.equal(submitted.status,'submitted');
  const pending=await call('quiz.attempt',{quizId:created.id},pupil);
  assert.equal(pending.attempt.grading,undefined);
  const result=await call('quiz.results',{id:created.id});
  assert.equal(result.attempts[0].grading.a.score,2);
  assert.equal(result.attempts[0].grading.b.score,3);
  assert.equal(result.attempts[0].grading.c.score,null);
  await call('quiz.grade',{id:submitted.id,version:submitted.version,scores:{a:2,b:3,c:4},feedback:{c:'활성 부위 설명이 좋습니다.'}});
  const graded=await call('quiz.attempt',{quizId:created.id},pupil);
  assert.equal(graded.attempt.grading.c.score,4);
  await assert.rejects(call('quiz.results',{id:created.id},pupil),{status:403});
  await assert.rejects(call('quiz.attempt',{quizId:created.id},{...pupil,groupId:'other'}),{status:401});
});

test('제한 시간은 첫 열람부터 시작하며 만료 시 저장된 답안을 제출한다',async()=>{
  const LAB_DB=d1Shim();for(const name of ['0003_quizzes.sql','0004_quiz_timer.sql','0005_quiz_shuffle.sql'])LAB_DB.raw.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const student={id:'timer-student',groupId:'legacy',authVersion:1,active:true,name:'시간시험'};
  LAB_DB.raw.prepare('INSERT INTO Students (id,grp,data) VALUES (?,?,?)').run(student.id,'legacy',JSON.stringify(student));
  const env={LAB_DB},teacher={role:'teacher',groupId:'legacy',owner:true},pupil={role:'student',groupId:'legacy',id:student.id,authVersion:1};
  const call=(a,p={},u=teacher)=>handleQuiz(a,p,u,env);
  const {id}=await call('quiz.create',{title:'시간제 퀴즈',timeLimitMinutes:10,questions:[{id:'q',type:'ox',prompt:'정답은 O',points:5,accepted:'O'}]});
  await call('quiz.status',{id,status:'open'});
  const started=await call('quiz.attempt',{quizId:id},pupil);
  assert.ok(Date.parse(started.attempt.deadlineAt)>Date.now());
  const saved=await call('quiz.save',{quizId:id,version:started.attempt.version,answers:{q:'O'}},pupil);
  LAB_DB.raw.prepare('UPDATE LabQuizAttempts SET deadlineAt=? WHERE id=?').run('2020-01-01T00:00:00.000Z',saved.id);
  const expired=await call('quiz.attempt',{quizId:id},pupil);
  assert.equal(expired.attempt.status,'submitted');
  assert.equal((await call('quiz.results',{id})).attempts[0].grading.q.score,5);
  await assert.rejects(call('quiz.save',{quizId:id,version:expired.attempt.version,answers:{q:'X'}},pupil),{status:409});
});

test('선택형·짝맞추기·순서맞추기는 정답을 숨기고 정확히 채점한다',async()=>{
  const LAB_DB=d1Shim();for(const name of ['0003_quizzes.sql','0004_quiz_timer.sql','0005_quiz_shuffle.sql'])LAB_DB.raw.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const student={id:'student-2',groupId:'legacy',authVersion:1,active:true,name:'테스트학생'};
  LAB_DB.raw.prepare('INSERT INTO Students (id,grp,data) VALUES (?,?,?)').run(student.id,'legacy',JSON.stringify(student));
  const env={LAB_DB},teacher={role:'teacher',groupId:'legacy',owner:true},pupil={role:'student',groupId:'legacy',id:student.id,authVersion:1};
  const call=(a,p={},u=teacher)=>handleQuiz(a,p,u,env);
  const {id}=await call('quiz.create',{title:'세포 소기관',questions:[
    {id:'choice',type:'choice',prompt:'단백질 합성 장소는?',points:2,choices:['핵','리보솜','골지체'],correct:1},
    {id:'match',type:'match',prompt:'소기관과 기능을 연결하세요.',points:3,pairs:[{left:'핵',right:'유전 정보'},{left:'리보솜',right:'단백질 합성'}]},
    {id:'order',type:'order',prompt:'단백질 분비 경로를 순서대로.',points:4,items:['리보솜','소포체','골지체']}
  ]});
  await call('quiz.status',{id,status:'open'});
  const publicQuiz=(await call('quiz.attempt',{quizId:id},pupil)).quiz;
  assert.equal(publicQuiz.questions[0].correct,undefined);
  assert.equal(publicQuiz.questions[1].pairs[0],'핵');
  assert.equal(publicQuiz.questions[1].options[0],'단백질 합성');
  assert.equal(publicQuiz.questions[2].items,undefined);
  const answers={choice:'1',match:JSON.stringify(['유전 정보','단백질 합성']),order:JSON.stringify(['리보솜','소포체','골지체'])};
  const started=await call('quiz.attempt',{quizId:id},pupil);
  await call('quiz.submit',{quizId:id,answers,version:started.attempt.version},pupil);
  const grading=(await call('quiz.results',{id})).attempts[0].grading;
  assert.deepEqual([grading.choice.score,grading.match.score,grading.order.score],[2,3,4]);
});

test('보기·유형별 문항 섞기를 켜도 재입장과 자동 채점이 일치한다',async()=>{
  const LAB_DB=d1Shim();for(const name of ['0003_quizzes.sql','0004_quiz_timer.sql','0005_quiz_shuffle.sql'])LAB_DB.raw.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const student={id:'shuffle-student',groupId:'legacy',authVersion:1,active:true,name:'섞기학생'};
  LAB_DB.raw.prepare('INSERT INTO Students (id,grp,data) VALUES (?,?,?)').run(student.id,'legacy',JSON.stringify(student));
  const env={LAB_DB},teacher={role:'teacher',groupId:'legacy',owner:true},pupil={role:'student',groupId:'legacy',id:student.id,authVersion:1};
  const call=(action,p={},actor=teacher)=>handleQuiz(action,p,actor,env);
  const {id}=await call('quiz.create',{title:'섞기 퀴즈',shuffleChoices:true,shuffleQuestions:true,questions:[
    {id:'c1',type:'choice',prompt:'A를 고르세요',points:2,choices:['A','B','C','D'],correct:0},
    {id:'o1',type:'ox',prompt:'O를 고르세요',points:1,accepted:'O'},
    {id:'c2',type:'choice',prompt:'C를 고르세요',points:2,choices:['A','B','C','D'],correct:2},
    {id:'o2',type:'ox',prompt:'X를 고르세요',points:1,accepted:'X'}
  ]});
  await call('quiz.status',{id,status:'open'});
  const first=await call('quiz.attempt',{quizId:id},pupil);
  const reopened=await call('quiz.attempt',{quizId:id},pupil);
  assert.deepEqual(first.quiz.questions,reopened.quiz.questions);
  assert.deepEqual(first.quiz.questions.map((q)=>q.type),['choice','choice','ox','ox']);
  const firstChoice=first.quiz.questions.find((q)=>q.id==='c1');
  assert.equal(firstChoice.choices[firstChoice.choiceOrder.indexOf(0)],'A');
  await call('quiz.submit',{quizId:id,version:first.attempt.version,answers:{c1:'0',o1:'O',c2:'2',o2:'X'}},pupil);
  const result=await call('quiz.results',{id});
  assert.equal(Object.values(result.attempts[0].grading).reduce((sum,grade)=>sum+grade.score,0),6);
  assert.deepEqual(result.quiz.questions.map((q)=>q.id),['c1','o1','c2','o2']);
});

test('이미지·밑줄·하이라이트 문항을 저장하고 학생에게 안전한 구조만 전달한다',async()=>{
  const LAB_DB=d1Shim();for(const name of ['0003_quizzes.sql','0004_quiz_timer.sql','0005_quiz_shuffle.sql'])LAB_DB.raw.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const student={id:'rich-student',groupId:'legacy',authVersion:1,active:true,name:'이미지학생'};
  LAB_DB.raw.prepare('INSERT INTO Students (id,grp,data) VALUES (?,?,?)').run(student.id,'legacy',JSON.stringify(student));
  const env={LAB_DB},teacher={role:'teacher',groupId:'legacy',owner:true},pupil={role:'student',groupId:'legacy',id:student.id,authVersion:1};
  const call=(action,p={},actor=teacher)=>handleQuiz(action,p,actor,env);
  const image='11111111-2222-4333-8444-555555555555';
  const question={type:'ox',points:2,accepted:'O',promptParts:[{text:'<효소>가 작용한다.',underline:true,highlight:true},{image}]};
  const {id}=await call('quiz.create',{title:'그림 문제',questions:[question]});
  await call('quiz.status',{id,status:'open'});
  const view=await call('quiz.attempt',{quizId:id},pupil);
  assert.deepEqual(view.quiz.questions[0].promptParts,question.promptParts);
  assert.equal(view.quiz.questions[0].prompt,'<효소>가 작용한다.[이미지]');
  assert.equal(view.quiz.questions[0].accepted,undefined);
  await assert.rejects(call('quiz.create',{title:'위험한 그림',questions:[{...question,promptParts:[{image:'javascript:alert(1)'}]}]}),{status:400});
});
