import { renderQuizPaper } from './quiz-paper.js';
const heading='<div class="page-heading"><span class="eyebrow">RESEARCH QUIZ</span><h1>퀴즈</h1><p>탐구에서 배운 내용을 확인하세요.</p></div>';
const qType={choice:'선택형',short:'단답형',ox:'O/X',essay:'서술형',match:'짝맞추기',order:'순서맞추기'};
const kinds=Object.entries(qType).map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join('');
function editorFields(type) {
  if(type==='choice')return '<div class="quiz-options" data-options></div><button type="button" data-add-option>보기 추가</button><p class="hint">정답 보기를 선택하세요.</p>';
  if(type==='short')return '<div class="quiz-options" data-options></div><button type="button" data-add-option>유사 정답 추가</button><label class="quiz-inline"><input type="checkbox" name="strict"> 띄어쓰기까지 맞아야 정답</label>';
  if(type==='ox')return '<div class="quiz-ox"><label><input type="radio" name="ox-answer" value="O" checked> O</label><label><input type="radio" name="ox-answer" value="X"> X</label></div>';
  if(type==='essay')return '<label>교사 채점 기준<textarea name="rubric" maxlength="3000" placeholder="핵심 개념과 배점 기준을 적어 주세요" required></textarea></label>';
  if(type==='match')return '<p class="hint">왼쪽 기준과 오른쪽 짝을 같은 줄에 입력하세요.</p><div class="quiz-options" data-options></div><button type="button" data-add-option>짝 추가</button>';
  return '<p class="hint">정답 순서대로 입력하세요. 학생에게는 섞어서 표시됩니다.</p><div class="quiz-options" data-options></div><button type="button" data-add-option>단계 추가</button>';
}
function addOption(card) {
  const type=card.querySelector('[name=type]').value, holder=card.querySelector('[data-options]');if(!holder)return;
  const n=holder.children.length, row=document.createElement('div');row.className='quiz-option-row';
  row.innerHTML=(type==='choice'?'<label class="quiz-correct"><input type="radio" name="correct-'+card.dataset.card+'" value="'+n+'" '+(!n?'checked':'')+' aria-label="'+(n+1)+'번 정답"></label>':type==='match'?'<span class="quiz-index">'+(n+1)+'</span>':'<span class="quiz-index">'+(n+1)+'</span>')+
    '<input class="quiz-option-input" maxlength="300" placeholder="'+(type==='match'?'기준':type==='order'?'단계':type==='short'?'허용 답안':'보기')+'" aria-label="'+(n+1)+'번 '+(type==='match'?'기준':'보기')+'" required>'+
    (type==='match'?'<span>→</span><input class="quiz-pair-input" maxlength="300" placeholder="짝" aria-label="'+(n+1)+'번 짝" required>':'')+
    '<button type="button" data-remove-option aria-label="보기 삭제">×</button>';
  holder.append(row);
}
function questionCard(number,type='choice') {
  const card=document.createElement('section');card.className='quiz-editor-card';card.dataset.card=crypto.randomUUID();
  card.innerHTML='<div class="quiz-editor-head"><strong>문제 '+number+'</strong><select name="type" aria-label="문제 유형">'+kinds+'</select><span class="quiz-editor-tools"><button type="button" data-duplicate aria-label="문제 복제">복제</button><button type="button" data-remove-card aria-label="문제 삭제">삭제</button></span></div><label class="quiz-prompt"><span class="sr-only">질문</span><textarea name="prompt" maxlength="1000" placeholder="질문 입력" required></textarea></label><div class="quiz-kind-fields"></div><div class="quiz-editor-foot"><label>배점 <input name="points" type="number" min="1" max="100" value="5" required></label><label>힌트 (선택) <input name="hint" maxlength="500" placeholder="학생에게 보여 줄 힌트"></label></div>';
  card.querySelector('[name=type]').value=type;
  const reset=()=>{card.querySelector('.quiz-kind-fields').innerHTML=editorFields(card.querySelector('[name=type]').value);for(let i=0;i<(['choice','match','order'].includes(card.querySelector('[name=type]').value)?4:card.querySelector('[name=type]').value==='short'?1:0);i++)addOption(card);};
  card.querySelector('[name=type]').onchange=reset;reset();return card;
}
function collect(card) {
  const type=card.querySelector('[name=type]').value;
  const row={type,prompt:card.querySelector('[name=prompt]').value,points:card.querySelector('[name=points]').value,hint:card.querySelector('[name=hint]').value};
  const options=[...card.querySelectorAll('.quiz-option-input')].map((el)=>el.value);
  if(type==='choice'){row.choices=options;row.correct=Number(card.querySelector('.quiz-correct input:checked')?.value||0);}
  if(type==='short'){row.accepted=options.join('\n');row.strict=card.querySelector('[name=strict]').checked;}
  if(type==='ox')row.accepted=card.querySelector('[name=ox-answer]:checked')?.value||'O';
  if(type==='essay')row.rubric=card.querySelector('[name=rubric]').value;
  if(type==='match')row.pairs=options.map((left,i)=>({left,right:card.querySelectorAll('.quiz-pair-input')[i].value}));
  if(type==='order')row.items=options;
  return row;
}
function answerControls(q,esc) {
  if(q.type==='ox')return '<div class="quiz-ox">'+['O','X'].map((v)=>'<label><input type="radio" name="'+esc(q.id)+'" value="'+v+'"> '+v+'</label>').join('')+'</div>';
  if(q.type==='choice')return '<div class="quiz-student-options">'+q.choices.map((v,i)=>'<label><input type="radio" name="'+esc(q.id)+'" value="'+i+'"> '+esc(v)+'</label>').join('')+'</div>';
  if(q.type==='match')return '<div class="quiz-student-options">'+q.pairs.map((v,i)=>'<label>'+esc(v)+' <select data-answer-index="'+i+'"><option value="">짝 선택</option>'+q.options.map((item)=>'<option value="'+esc(item)+'">'+esc(item)+'</option>').join('')+'</select></label>').join('')+'</div>';
  if(q.type==='order')return '<div class="quiz-student-options">'+q.options.map((_,i)=>'<label>'+ (i+1)+'번째 <select data-answer-index="'+i+'"><option value="">순서 선택</option>'+q.options.map((item)=>'<option value="'+esc(item)+'">'+esc(item)+'</option>').join('')+'</select></label>').join('')+'</div>';
  return q.type==='short'?'<input name="'+esc(q.id)+'" data-student-answer maxlength="4000" autocomplete="off" placeholder="정답 입력">':'<textarea name="'+esc(q.id)+'" data-student-answer maxlength="4000" rows="6" placeholder="직접 작성하세요"></textarea>';
}
export async function renderQuiz({main,api,user,esc,mode='full'}) {
  if(!user){main.innerHTML=heading+'<section class="panel"><h2>로그인이 필요합니다</h2><p>학생 또는 교사로 로그인하면 현재 연구 그룹의 퀴즈를 볼 수 있습니다.</p><a class="button primary" href="#lab">로그인</a></section>';return;}
  let current=null,quiz=null,attempt=null,results=null;
  const message=(value)=>{const el=main.querySelector('#quiz-message');if(el)el.textContent=value;};
  async function list(){
    const data=await api('quiz.list');
    main.innerHTML=(mode==='results'?'':heading)+'<p id="quiz-message" role="status"></p>'+(user.role==='teacher' && mode!=='results' ?
      '<section class="quiz-builder"><div class="quiz-builder-top"><h2>새 퀴즈 만들기</h2><p>문제를 추가하고 정답을 지정한 뒤 비공개로 저장하세요.</p></div><form id="quiz-create"><label class="quiz-title">퀴즈 제목<input name="title" maxlength="120" placeholder="예: 효소의 작용 원리" required></label><label class="quiz-time-setting">전체 제한 시간 (분) <input name="timeLimitMinutes" type="number" min="0" max="180" step="1" value="0" required><small>0분은 제한 없음 · 1~180분 설정 가능 · 학생이 처음 열 때 시작됩니다.</small></label><div id="quiz-questions"></div><div class="quiz-type-grid">'+Object.entries(qType).map(([id,label])=>'<button type="button" data-add-kind="'+id+'">＋ '+label+'</button>').join('')+'</div><div class="quiz-builder-actions"><span>서술형은 교사가 최종 채점합니다.</span><button class="primary">비공개로 저장</button></div></form></section>' : '')+
      '<section class="panel"><h2>'+ (user.role==='teacher'?'등록한 퀴즈':'응시 가능한 퀴즈')+'</h2><div class="quiz-list">'+(data.quizzes.length ? data.quizzes.map((q)=>'<article class="quiz-card"><div><h3>'+esc(q.title)+'</h3><p>'+q.questions.length+'문항 · '+(q.timeLimitMinutes?q.timeLimitMinutes+'분':'시간 제한 없음')+' · '+({hidden:'비공개',open:'응시 중',closed:'종료'}[q.status]||q.status)+'</p></div><div class="actions"><button type="button" data-open="'+esc(q.id)+'">'+(user.role==='teacher'?'답안·채점 보기':'응시하기')+'</button>'+(user.role==='teacher'?'<select aria-label="'+esc(q.title)+' 운영 상태" data-status="'+esc(q.id)+'"><option value="hidden"'+(q.status==='hidden'?' selected':'')+'>비공개</option><option value="open"'+(q.status==='open'?' selected':'')+'>응시 중</option><option value="closed"'+(q.status==='closed'?' selected':'')+'>종료</option></select>':'')+'</div></article>').join(''):'<p class="hint">아직 공개된 퀴즈가 없습니다.</p>')+'</div></section>';
    if(user.role==='teacher' && mode!=='results'){
      const holder=main.querySelector('#quiz-questions');
      const renumber=()=>[...holder.children].forEach((card,i)=>card.querySelector('.quiz-editor-head strong').textContent='문제 '+(i+1));
      const append=(type)=>{holder.append(questionCard(holder.children.length+1,type));};
      main.querySelectorAll('[data-add-kind]').forEach((button)=>button.onclick=()=>append(button.dataset.addKind));append('choice');
      holder.onclick=(e)=>{const card=e.target.closest('.quiz-editor-card');if(!card)return;
        if(e.target.closest('[data-add-option]'))addOption(card);
        if(e.target.closest('[data-remove-option]')){e.target.closest('.quiz-option-row').remove();[...card.querySelectorAll('.quiz-option-row')].forEach((row,i)=>{const radio=row.querySelector('[type=radio]');if(radio)radio.value=i;const index=row.querySelector('.quiz-index');if(index)index.textContent=i+1;});}
        if(e.target.closest('[data-remove-card]')){card.remove();renumber();}
        if(e.target.closest('[data-duplicate]')){const clone=questionCard(holder.children.length+1,card.querySelector('[name=type]').value);const original=collect(card);clone.querySelector('[name=prompt]').value=original.prompt;clone.querySelector('[name=points]').value=original.points;clone.querySelector('[name=hint]').value=original.hint;while(clone.querySelectorAll('.quiz-option-input').length<card.querySelectorAll('.quiz-option-input').length)addOption(clone);clone.querySelectorAll('.quiz-option-input').forEach((input,i)=>input.value=card.querySelectorAll('.quiz-option-input')[i]?.value||'');clone.querySelectorAll('.quiz-pair-input').forEach((input,i)=>input.value=card.querySelectorAll('.quiz-pair-input')[i]?.value||'');if(original.type==='choice')clone.querySelectorAll('.quiz-correct input')[original.correct].checked=true;if(original.type==='short')clone.querySelector('[name=strict]').checked=original.strict;if(original.type==='essay')clone.querySelector('[name=rubric]').value=original.rubric;if(original.type==='ox')clone.querySelector('[name=ox-answer][value="'+original.accepted+'"]').checked=true;holder.append(clone);}
      };
      main.querySelector('#quiz-create').onsubmit=async(e)=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{
        const rows=[...holder.children].map(collect);
        await api('quiz.create',{title:e.target.elements.title.value,timeLimitMinutes:Number(e.target.elements.timeLimitMinutes.value),questions:rows});await list();message('퀴즈를 비공개로 저장했습니다. 운영 상태를 응시 중으로 바꾸면 학생에게 공개됩니다.');
      }catch(err){message(err.message);}finally{button.disabled=false;}};
    }
    main.querySelectorAll('[data-open]').forEach((b)=>b.onclick=()=>user.role==='teacher'?showResults(b.dataset.open):showStudent(b.dataset.open));
    main.querySelectorAll('[data-status]').forEach((select)=>select.onchange=async()=>{try{await api('quiz.status',{id:select.dataset.status,status:select.value});await list();}catch(err){message(err.message);}});
  }
  async function showStudent(id){
    const data=await api('quiz.attempt',{quizId:id});quiz=data.quiz;attempt=data.attempt;
    main.innerHTML=heading+'<div class="actions"><button id="quiz-back">목록으로</button></div><p id="quiz-message" role="status"></p><section class="panel"><div class="quiz-session-head"><h2>'+esc(quiz.title)+'</h2><strong id="quiz-timer" aria-live="off"></strong></div><nav id="quiz-progress" class="quiz-progress" aria-label="문제 이동"></nav><p id="quiz-position" class="hint"></p><form id="quiz-answer" class="stack">'+quiz.questions.map((q,i)=>'<fieldset class="quiz-question" data-question="'+esc(q.id)+'" hidden><legend>'+(i+1)+'. '+esc(q.prompt)+' <small>'+q.points+'점</small></legend>'+answerControls(q,esc)+(q.hint?'<details><summary>힌트 보기</summary><p>'+esc(q.hint)+'</p></details>':'')+'</fieldset>').join('')+'<div class="quiz-navigation"><button type="button" id="quiz-prev">이전 문제</button><button type="button" id="quiz-save">임시 저장</button><button type="button" id="quiz-next">다음 문제</button><button class="primary" type="submit">최종 제출</button></div></form></section>';
    const form=main.querySelector('#quiz-answer');
    for(const q of quiz.questions){const value=attempt?.answers?.[q.id]||'';const field=form.querySelector('[data-question="'+CSS.escape(q.id)+'"]');if(['ox','choice'].includes(q.type)){const radio=[...field.querySelectorAll('[type=radio]')].find((el)=>el.value===value);if(radio)radio.checked=true;}else if(['match','order'].includes(q.type)){let values=[];try{values=JSON.parse(value);}catch{}field.querySelectorAll('[data-answer-index]').forEach((el,i)=>el.value=values[i]||'');}else form.elements.namedItem(q.id).value=value;}
    const fields=[...form.querySelectorAll('[data-question]')],progress=main.querySelector('#quiz-progress');let step=0,dirty=false,edit=0,saveDelay=null,saving=Promise.resolve(),timer=null;
    const answersFromForm=()=>Object.fromEntries(quiz.questions.map((q)=>{const field=form.querySelector('[data-question="'+CSS.escape(q.id)+'"]');return [q.id,['ox','choice'].includes(q.type)?(field.querySelector('input:checked')?.value||''):['match','order'].includes(q.type)?JSON.stringify([...field.querySelectorAll('[data-answer-index]')].map((el)=>el.value)):form.elements.namedItem(q.id).value];}));
    const answered=(q,value)=>{if(['match','order'].includes(q.type)){try{return JSON.parse(value).some(Boolean);}catch{return false;}}return !!String(value||'').trim();};
    const paint=()=>{const answers=answersFromForm();progress.innerHTML=quiz.questions.map((q,i)=>'<button type="button" data-step="'+i+'" class="'+(i===step?'active ':'')+(answered(q,answers[q.id])?'answered':'')+'" aria-label="'+(i+1)+'번 문제 '+(answered(q,answers[q.id])?'작성됨':'미작성')+'"'+(i===step?' aria-current="step"':'')+'>'+(i+1)+'</button>').join('');fields.forEach((field,i)=>field.hidden=i!==step);main.querySelector('#quiz-position').textContent=(step+1)+' / '+fields.length+'문제 · '+quiz.questions.filter((q)=>answered(q,answers[q.id])).length+'문제 작성';main.querySelector('#quiz-prev').disabled=step===0;main.querySelector('#quiz-next').disabled=step===fields.length-1;};
    const locked=quiz.status!=='open'||attempt && attempt.status!=='draft';if(locked){form.querySelectorAll('input,textarea,select,button').forEach((el)=>el.disabled=true);message(attempt?.status==='graded'?'교사 채점이 완료됐습니다. 총점 '+Object.values(attempt.grading||{}).reduce((n,g)=>n+(g.score||0),0)+'점':attempt?.status==='submitted'?'제출했습니다. 교사 채점을 기다려 주세요.':'응시가 종료된 퀴즈입니다.');}
    async function save(submit=false){
      clearTimeout(saveDelay);await saving;
      if(locked)return true;
      const answers=answersFromForm(),savedEdit=edit;
      if(submit){const missing=quiz.questions.filter((q)=>!answered(q,answers[q.id])).length;if(!confirm((missing?missing+'문제가 미작성입니다. ':'')+'최종 제출하면 수정할 수 없습니다. 제출할까요?'))return false;}
      if(!dirty&&!submit)return true;
      const task=api(submit?'quiz.submit':'quiz.save',{quizId:id,answers,version:attempt.version}).then((saved)=>{attempt={...attempt,...saved,answers};dirty=edit!==savedEdit;message(dirty?'새 입력 내용이 있어 다시 저장합니다.':submit?'최종 제출했습니다. 교사 채점을 기다려 주세요.':'임시 저장했습니다.');if(dirty)saveDelay=setTimeout(()=>save(),100);return true;}).catch((err)=>{message('저장 실패: '+err.message+' 답안은 현재 화면에 남아 있습니다. 다시 시도하세요.');return false;});
      saving=task;const ok=await task;if(submit&&ok){clearInterval(timer);await showStudent(id);}return ok;
    }
    async function move(next){if(next<0||next>=fields.length)return;if(!locked&&!(await save()))return;step=next;paint();fields[step].querySelector('input:not([type=radio]),textarea,select')?.focus();}
    progress.onclick=(e)=>{const button=e.target.closest('[data-step]');if(button)move(Number(button.dataset.step));};
    main.querySelector('#quiz-prev').onclick=()=>move(step-1);main.querySelector('#quiz-next').onclick=()=>move(step+1);
    main.querySelector('#quiz-save').onclick=()=>save();form.onsubmit=(e)=>{e.preventDefault();save(true);};
    main.querySelector('#quiz-back').onclick=async()=>{if(!locked&&!(await save()))return;clearInterval(timer);await list();};
    const changed=()=>{dirty=true;edit++;paint();clearTimeout(saveDelay);saveDelay=setTimeout(()=>save(),1200);};form.addEventListener('input',changed);form.addEventListener('change',changed);
    const timerLabel=main.querySelector('#quiz-timer');const tick=()=>{if(!form.isConnected){clearInterval(timer);return;}if(!attempt?.deadlineAt){timerLabel.textContent='시간 제한 없음';return;}const remaining=Math.max(0,Math.ceil((Date.parse(attempt.deadlineAt)-Date.now())/1000));timerLabel.textContent='남은 시간 '+Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');if(remaining>0&&remaining<=5&&dirty)save();if(!remaining&&!locked){clearInterval(timer);message('제한 시간이 끝났습니다. 마지막으로 저장된 답안이 제출됩니다.');showStudent(id);}};
    paint();tick();if(attempt?.deadlineAt&&!locked)timer=setInterval(tick,1000);
  }
  async function showResults(id){
    results=await api('quiz.results',{id});
    const qs=results.quiz.questions;
    main.innerHTML=(mode==='results'?'':heading)+'<div class="actions"><button id="quiz-back">퀴즈 목록으로</button></div><p id="quiz-message" role="status"></p><section class="panel"><h2>'+esc(results.quiz.title)+' · 제출 현황</h2>'+(results.attempts.length?results.attempts.map((a)=>'<article class="quiz-card"><div><h3>'+esc(a.student)+'</h3><p>'+({draft:'작성 중',submitted:'채점 대기',graded:'채점 완료'}[a.status]||a.status)+'</p></div><div class="actions"><button type="button" data-paper="'+esc(a.id)+'">시험지 보기</button><button type="button" data-grade="'+esc(a.id)+'">답안 채점</button></div></article>').join(''):'<p class="hint">아직 제출한 학생이 없습니다.</p>')+'</section><section id="quiz-detail"></section>';
    main.querySelector('#quiz-back').onclick=list;
    const detail=main.querySelector('#quiz-detail');
    main.querySelectorAll('[data-paper]').forEach((button)=>button.onclick=()=>{
      const attempt=results.attempts.find((row)=>row.id===button.dataset.paper);
      detail.innerHTML='<div class="quiz-paper-toolbar actions"><button type="button" data-print-quiz>인쇄</button><button type="button" class="primary" data-pdf-quiz>PDF 다운로드</button></div>'+renderQuizPaper(results.quiz,attempt);
      detail.scrollIntoView({behavior:'smooth'});
      detail.querySelector('[data-print-quiz]').onclick=()=>{
        document.body.classList.add('printing-quiz');
        window.addEventListener('afterprint',()=>document.body.classList.remove('printing-quiz'),{once:true});
        window.print();
      };
      detail.querySelector('[data-pdf-quiz]').onclick=async(event)=>{
        const pdfButton=event.currentTarget;pdfButton.disabled=true;
        try{
          if(typeof globalThis.html2pdf!=='function')await new Promise((resolve,reject)=>{
            const script=document.createElement('script');script.src='./vendor/html2pdf.bundle.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('PDF 도구를 불러오지 못했습니다.'));document.head.append(script);
          });
          await document.fonts.ready;
          const safeName=String(attempt.student||'학생').replace(/[\/:*?"<>|]/g,'_');
          await globalThis.html2pdf().set({margin:0,filename:'퀴즈_답안_'+safeName+'.pdf',image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy']}}).from(detail.querySelector('#quiz-printable')).save();
        }catch(error){message(error.message);}finally{pdfButton.disabled=false;}
      };
    });
    main.querySelectorAll('[data-grade]').forEach((button)=>button.onclick=()=>{
      const a=results.attempts.find((row)=>row.id===button.dataset.grade);
      detail.innerHTML='<section class="panel"><h2>'+esc(a.student)+' 답안 채점</h2><form id="quiz-grade" class="stack">'+qs.map((q,i)=>'<fieldset class="quiz-question"><legend>'+(i+1)+'. '+esc(q.prompt)+' <small>'+q.points+'점</small></legend><p class="quiz-answer-text">'+esc(a.answers?.[q.id]||'(미작성)')+'</p><p class="hint">'+(q.type==='essay'?'채점 기준: '+esc(q.rubric):q.type==='choice'?'정답: '+esc(q.choices[q.correct]):q.type==='match'?'정답 짝: '+esc(q.pairs.map((v)=>v.left+' → '+v.right).join(', ')):q.type==='order'?'정답 순서: '+esc(q.items.join(' → ')):'허용 답안: '+esc(q.accepted.join(', ')))+'</p><label>점수<input type="number" data-score="'+esc(q.id)+'" min="0" max="'+q.points+'" value="'+(a.grading?.[q.id]?.score??0)+'" required></label><label>피드백<textarea data-feedback="'+esc(q.id)+'" maxlength="2000">'+esc(a.grading?.[q.id]?.feedback||'')+'</textarea></label></fieldset>').join('')+'<button class="primary"'+(a.status==='draft'?' disabled':'')+'>교사 최종 점수 확정</button></form></section>';
      detail.scrollIntoView({behavior:'smooth'});
      detail.querySelector('form').onsubmit=async(e)=>{e.preventDefault();const scores={},feedback={};detail.querySelectorAll('[data-score]').forEach((el)=>scores[el.dataset.score]=Number(el.value));detail.querySelectorAll('[data-feedback]').forEach((el)=>feedback[el.dataset.feedback]=el.value);try{await api('quiz.grade',{id:a.id,version:a.version,scores,feedback});await showResults(id);message('최종 점수를 저장했습니다.');}catch(err){message(err.message);}};
    });
  }
  try{await list();}catch(err){main.innerHTML=heading+'<section class="panel"><p role="alert">'+esc(err.message)+'</p></section>';}
}
