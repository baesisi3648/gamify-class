import {studentQuestionOrder} from './quiz-order.js';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const parse = (value) => JSON.parse(value || '[]');
const clean = (value) => String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase('ko');
const quizRow = (row, teacher = false, attemptId = '') => row && ({ id:row.id, title:row.title, status:row.status, timeLimitMinutes:row.timeLimitMinutes||0,
  shuffleChoices:!!row.shuffleChoices,shuffleQuestions:!!row.shuffleQuestions,
  questions:teacher ? parse(row.questions) : studentQuestionOrder(parse(row.questions).map((q) => ({id:q.id,type:q.type,prompt:q.prompt,points:q.points,hint:q.hint||'',
    choices:q.type==='choice'?q.choices:undefined,
    pairs:q.type==='match'?q.pairs.map((v)=>v.left):undefined,
    options:q.type==='match'?q.pairs.map((v)=>v.right).reverse():q.type==='order'?[...q.items].reverse():undefined})),{shuffleChoices:!!row.shuffleChoices,shuffleQuestions:!!row.shuffleQuestions},attemptId),
  updatedAt:row.updatedAt });
const attemptRow = (row, teacher = false) => row && ({ id:row.id, quizId:row.quizId, studentId:teacher ? row.studentId : undefined,
  answers:parse(row.answers), status:row.status, version:row.version, updatedAt:row.updatedAt, deadlineAt:row.deadlineAt||null,
  grading:teacher || row.status === 'graded' ? parse(row.grading) : undefined });
const question = (raw) => {
  const type=String(raw.type||'');
  if (!['choice','short','ox','essay','match','order'].includes(type)) fail(400,'문항 유형을 선택하세요.');
  const prompt=String(raw.prompt||'').trim();
  const points=Number(raw.points);
  if (!prompt || prompt.length>1000 || !Number.isInteger(points) || points<1 || points>100) fail(400,'문항과 1~100점 배점을 확인하세요.');
  const accepted=['short','ox'].includes(type) ? String(raw.accepted||'').split(/\n|,/).map((s)=>s.trim()).filter(Boolean).slice(0,20) : [];
  if (['short','ox'].includes(type) && !accepted.length) fail(400,'O/X·단답형의 정답을 입력하세요.');
  if (type==='ox' && accepted.some((s)=>!['O','X'].includes(s.toUpperCase()))) fail(400,'O/X 정답은 O 또는 X로 입력하세요.');
  const rubric=String(raw.rubric||'').trim().slice(0,3000);
  if (type==='essay' && !rubric) fail(400,'서술형 채점 기준을 입력하세요.');
  const choices=type==='choice' ? (Array.isArray(raw.choices)?raw.choices:[]).map((v)=>String(v||'').trim()).filter(Boolean).slice(0,8) : [];
  const correct=type==='choice' ? Number(raw.correct) : 0;
  if(type==='choice' && (choices.length<2 || !Number.isInteger(correct) || correct<0 || correct>=choices.length)) fail(400,'선택형은 보기 2개 이상과 정답 보기를 지정하세요.');
  const pairs=type==='match' ? (Array.isArray(raw.pairs)?raw.pairs:[]).map((v)=>({left:String(v?.left||'').trim(),right:String(v?.right||'').trim()})).slice(0,10) : [];
  if(type==='match' && (pairs.length<2 || pairs.some((v)=>!v.left||!v.right))) fail(400,'짝맞추기는 두 쌍 이상을 완성하세요.');
  const items=type==='order' ? (Array.isArray(raw.items)?raw.items:[]).map((v)=>String(v||'').trim()).slice(0,10) : [];
  if(type==='order' && (items.length<2 || items.some((v)=>!v))) fail(400,'순서맞추기는 두 단계 이상을 입력하세요.');
  return {id:String(raw.id||crypto.randomUUID()),type,prompt,points,accepted,rubric,choices,correct,pairs,items,strict:raw.strict===true,hint:String(raw.hint||'').trim().slice(0,500)};
};
function automatic(q,answer) {
  if(q.type==='essay') return {score:null,source:'teacher-pending',feedback:''};
  let correct=false;
  if(q.type==='choice') correct=Number(answer)===q.correct && answer!=='';
  else if(q.type==='match'||q.type==='order') {
    try { const values=JSON.parse(answer);correct=Array.isArray(values)&&values.length===(q.type==='match'?q.pairs:q.items).length &&
      values.every((v,i)=>clean(v)===clean(q.type==='match'?q.pairs[i].right:q.items[i])); } catch {correct=false;}
  } else correct=q.accepted.some((v)=>q.strict?String(v).normalize('NFKC').trim()===String(answer).normalize('NFKC').trim():clean(v)===clean(answer));
  return {score:correct?q.points:0,source:'automatic',feedback:''};
}
async function getQuiz(db,id,groupId) {
  const row=await db.prepare('SELECT * FROM LabQuizzes WHERE id = ? AND groupId = ?').bind(id,groupId).first();
  if(!row) fail(404,'퀴즈를 찾을 수 없습니다.');
  return row;
}
async function getAttempt(db,quizId,user) {
  return db.prepare('SELECT * FROM LabQuizAttempts WHERE quizId = ? AND groupId = ? AND studentId = ?').bind(quizId,user.groupId,user.id).first();
}
async function finishExpired(db,quiz,attempt) {
  if (!attempt || attempt.status!=='draft' || !attempt.deadlineAt || Date.now()<Date.parse(attempt.deadlineAt)) return attempt;
  const questions=parse(quiz.questions),answers=parse(attempt.answers);
  const grading=Object.fromEntries(questions.map((q)=>[q.id,automatic(q,answers[q.id]||'')]));
  const now=new Date().toISOString();
  await db.prepare("UPDATE LabQuizAttempts SET status='submitted',grading=?,version=version+1,updatedAt=? WHERE id=? AND version=? AND status='draft'").bind(JSON.stringify(grading),now,attempt.id,attempt.version).run();
  return db.prepare('SELECT * FROM LabQuizAttempts WHERE id=?').bind(attempt.id).first();
}
export async function handleQuiz(action,p,user,env) {
  if(!env.LAB_DB) fail(503,'퀴즈 저장소가 연결되지 않았습니다.');
  const db=env.LAB_DB, groupId=String(user.groupId||'legacy'), teacher=user.role==='teacher';
  if(groupId!=='legacy') {
    const stored=await db.prepare('SELECT data FROM Settings WHERE id=?').bind('group:'+groupId).first();
    const group=stored ? JSON.parse(stored.data).value : null;
    if(!group) fail(401,'연구 그룹을 다시 선택해 로그인하세요.');
    if(teacher && !user.owner && user.groupVersion!==group.authVersion) fail(401,'그룹 암호가 변경되었습니다. 다시 로그인하세요.');
  }
  if(!teacher) {
    const stored=await db.prepare('SELECT data FROM Students WHERE id=?').bind(user.id).first();
    const student=stored && JSON.parse(stored.data);
    if(!student || student.groupId!==groupId && !(groupId==='legacy'&&!student.groupId) || student.active===false || student.authVersion!==user.authVersion) fail(401,'학생 계정으로 다시 로그인하세요.');
  }
  if(action==='quiz.list') {
    const {results}=await db.prepare('SELECT * FROM LabQuizzes WHERE groupId = ? ORDER BY createdAt DESC').bind(groupId).all();
    return {quizzes:results.filter((r)=>teacher||r.status!=='hidden').map((r)=>quizRow(r,teacher))};
  }
  if(action==='quiz.attempt') {
    if(teacher) fail(403,'학생 전용 요청입니다.');
    const quiz=await getQuiz(db,String(p.quizId||''),groupId);
    if(quiz.status==='hidden') fail(403,'현재 응시할 수 없는 퀴즈입니다.');
    let attempt=await getAttempt(db,quiz.id,user);
    if(!attempt && quiz.status==='open') {
      const now=new Date().toISOString(),deadlineAt=quiz.timeLimitMinutes ? new Date(Date.now()+quiz.timeLimitMinutes*60000).toISOString() : null;
      await db.prepare('INSERT OR IGNORE INTO LabQuizAttempts (id,quizId,groupId,studentId,answers,grading,status,version,createdAt,updatedAt,deadlineAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),quiz.id,groupId,user.id,'{}','{}','draft',1,now,now,deadlineAt).run();
      attempt=await getAttempt(db,quiz.id,user);
    }
    return {quiz:quizRow(quiz,false,attempt?.id),attempt:attemptRow(await finishExpired(db,quiz,attempt))};
  }
  if(action==='quiz.save' || action==='quiz.submit') {
    if(teacher) fail(403,'학생 전용 요청입니다.');
    const quiz=await getQuiz(db,String(p.quizId||''),groupId);
    if(quiz.status!=='open') fail(403,'현재 응시할 수 없는 퀴즈입니다.');
    const existing=await finishExpired(db,quiz,await getAttempt(db,quiz.id,user));
    if(!existing) fail(409,'퀴즈 화면을 다시 열어 시작하세요.');
    if(existing.status!=='draft') fail(409,'제출되었거나 제한 시간이 끝난 퀴즈입니다. 다시 불러오세요.');
    if(existing && Number(p.version)!==existing.version) fail(409,'다른 화면에서 답안이 변경됐습니다. 다시 불러오세요.');
    const questions=parse(quiz.questions), input=p.answers && typeof p.answers==='object' ? p.answers : {};
    const answers=Object.fromEntries(questions.map((q)=>[q.id,String(input[q.id]||'').slice(0,4000)]));
    const submit=action==='quiz.submit';
    const grading=submit ? Object.fromEntries(questions.map((q)=>[q.id,automatic(q,answers[q.id])])) : {};
    const now=new Date().toISOString(), id=existing?.id||crypto.randomUUID();
    const result=await db.prepare('UPDATE LabQuizAttempts SET answers=?,grading=?,status=?,version=version+1,updatedAt=? WHERE id=? AND version=? AND status=? AND (deadlineAt IS NULL OR deadlineAt>?)').bind(JSON.stringify(answers),JSON.stringify(grading),submit?'submitted':'draft',now,id,existing.version,'draft',now).run();
    if(!result.meta.changes) fail(409,'답안이 변경됐거나 제한 시간이 끝났습니다. 다시 불러오세요.');
    return {id,version:existing.version+1,status:submit?'submitted':'draft',deadlineAt:existing.deadlineAt||null};
  }
  if(!teacher) fail(403,'교사 전용 요청입니다.');
  if(action==='quiz.create') {
    const title=String(p.title||'').trim();
    const questions=Array.isArray(p.questions) ? p.questions.map(question) : [];
    if(!title || title.length>120 || !questions.length || questions.length>50) fail(400,'제목과 1~50개 문항을 확인하세요.');
    const timeLimitMinutes=Number(p.timeLimitMinutes||0);
    if(!Number.isInteger(timeLimitMinutes)||timeLimitMinutes<0||timeLimitMinutes>180) fail(400,'제한 시간은 없음 또는 1~180분으로 설정하세요.');
    const shuffleChoices=p.shuffleChoices===true,shuffleQuestions=p.shuffleQuestions===true;
    const id=crypto.randomUUID(),now=new Date().toISOString();
    await db.prepare('INSERT INTO LabQuizzes (id,groupId,title,status,questions,createdAt,updatedAt,timeLimitMinutes,shuffleChoices,shuffleQuestions) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,groupId,title,'hidden',JSON.stringify(questions),now,now,timeLimitMinutes,Number(shuffleChoices),Number(shuffleQuestions)).run();
    return {id};
  }
  if(action==='quiz.status') {
    const quiz=await getQuiz(db,String(p.id||''),groupId);
    if(!['hidden','open','closed'].includes(p.status)) fail(400,'운영 상태를 확인하세요.');
    await db.prepare('UPDATE LabQuizzes SET status=?,updatedAt=? WHERE id=? AND groupId=?').bind(p.status,new Date().toISOString(),quiz.id,groupId).run();
    return {ok:true};
  }
  if(action==='quiz.results') {
    const quiz=await getQuiz(db,String(p.id||''),groupId);
    const {results}=await db.prepare('SELECT a.*,s.data AS studentData FROM LabQuizAttempts a LEFT JOIN Students s ON s.id=a.studentId WHERE a.quizId=? AND a.groupId=? ORDER BY a.updatedAt DESC').bind(quiz.id,groupId).all();
    const attempts=await Promise.all(results.map(async(r)=>({...attemptRow(await finishExpired(db,quiz,r),true),student:JSON.parse(r.studentData||'{}').name||r.studentId})));
    return {quiz:quizRow(quiz,true),attempts};
  }
  if(action==='quiz.grade') {
    const row=await db.prepare('SELECT a.* FROM LabQuizAttempts a JOIN LabQuizzes q ON q.id=a.quizId WHERE a.id=? AND a.groupId=? AND q.groupId=?').bind(String(p.id||''),groupId,groupId).first();
    if(!row || row.status==='draft') fail(404,'제출한 답안을 찾을 수 없습니다.');
    if(row.version!==Number(p.version)) fail(409,'답안이 변경됐습니다. 다시 불러오세요.');
    const quiz=await getQuiz(db,row.quizId,groupId), current=parse(row.grading), scores=p.scores||{};
    for(const q of parse(quiz.questions)) {
      const value=Number(scores[q.id]);
      if(!Number.isFinite(value)||value<0||value>q.points) fail(400,'각 문항의 점수를 0점부터 배점 사이로 입력하세요.');
      current[q.id]={score:value,source:'teacher',feedback:String(p.feedback?.[q.id]||'').slice(0,2000)};
    }
    const result=await db.prepare('UPDATE LabQuizAttempts SET grading=?,status=?,version=version+1,updatedAt=? WHERE id=? AND version=?').bind(JSON.stringify(current),'graded',new Date().toISOString(),row.id,row.version).run();
    if(!result.meta.changes) fail(409,'채점 결과가 변경됐습니다. 다시 불러오세요.');
    return {ok:true};
  }
  fail(404,'지원하지 않는 퀴즈 요청입니다.');
}
