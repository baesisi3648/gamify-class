import {chromium,expect} from '@playwright/test';
import {stat} from 'node:fs/promises';

const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage();
  let uploaded=0;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
  await page.route('**/api/lab/quiz-image',async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:{id:`11111111-2222-4333-8444-${String(++uploaded).padStart(12,'0')}`}})}));
  await page.route('**/api/lab/quiz-image/*',async(route)=>route.fulfill({status:200,contentType:'image/png',body:png}));
  await page.goto('http://localhost:8791/apps/life-science-lab/');
  await page.evaluate(async()=>{
    const {renderQuiz}=await import('./quiz.js');
    window.createdQuiz=null;
    const api=async(action,payload)=>{
      if(action==='quiz.list')return {quizzes:[]};
      if(action==='quiz.create'){window.createdQuiz=payload;return {id:'created'};}
      throw new Error(action);
    };
    const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    await renderQuiz({main:document.querySelector('#main'),api,user:{role:'teacher'},esc});
  });
  const card=page.locator('.quiz-editor-card').first();
  await page.locator('[name=title]').fill('효소 퀴즈');
  const editor=card.locator('[data-prompt-editor]');
  await editor.fill('효소는?');
  await editor.click();await page.keyboard.press('ControlOrMeta+A');
  await card.locator('[data-format=underline]').click();
  await editor.click();await page.keyboard.press('ControlOrMeta+A');
  await card.locator('[data-format=highlight]').click();
  await card.locator('[data-image-file]').setInputFiles({name:'효소.png',mimeType:'image/png',buffer:png});
  await expect(editor.locator('img')).toHaveCount(1);
  await editor.evaluate((element)=>{
    const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'붙여넣기.png',{type:'image/png'});
    const data=new DataTransfer();data.items.add(file);
    element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
  });
  await expect(editor.locator('img')).toHaveCount(2);
  for(const [index,text] of ['가','나','다','라'].entries())await card.locator('.quiz-option-input').nth(index).fill(text);
  await card.locator('.quiz-correct input').nth(1).check();
  await card.locator('[data-move-option=up]').nth(1).click();
  await expect(card.locator('.quiz-option-input').first()).toHaveValue('나');
  await expect(card.locator('.quiz-correct input').first()).toBeChecked();
  const beforeDrag=await card.locator('.quiz-option-input').evaluateAll((inputs)=>inputs.map((input)=>input.value));
  await card.locator('.quiz-option-row').last().scrollIntoViewIfNeeded();
  const from=await card.locator('.quiz-drag-handle').first().boundingBox();
  const to=await card.locator('.quiz-option-row').last().boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
  await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,to.y+to.height*0.7,{steps:10});
  await page.mouse.up();
  const afterDrag=await card.locator('.quiz-option-input').evaluateAll((inputs)=>inputs.map((input)=>input.value));
  if(JSON.stringify(beforeDrag)===JSON.stringify(afterDrag))throw new Error('끌어놓기로 보기 순서가 바뀌지 않았습니다.');
  await page.locator('[name=shuffleChoices]').check();
  await page.locator('[name=shuffleQuestions]').check();
  await page.locator('#quiz-create button.primary').click();
  const created=await page.evaluate(()=>window.createdQuiz);
  if(!created)throw new Error('퀴즈가 저장되지 않았습니다.');
  if(!created.shuffleChoices||!created.shuffleQuestions)throw new Error('섞기 설정이 저장되지 않았습니다.');
  if(created.questions[0].promptParts.filter((part)=>part.image).length!==2)throw new Error('파일·붙여넣기 이미지가 문제에 반영되지 않았습니다.');
  if(!created.questions[0].promptParts.some((part)=>part.underline)||!created.questions[0].promptParts.some((part)=>part.highlight))throw new Error('밑줄·하이라이트가 문제에 반영되지 않았습니다. '+JSON.stringify(created.questions[0].promptParts));
  if(created.questions[0].choices[created.questions[0].correct]!=='나')throw new Error('보기 이동 후 정답이 바뀌었습니다.');
  const studentPage=await browser.newPage();
  await studentPage.route('**/api/lab/quiz-image/*',async(route)=>route.fulfill({status:200,contentType:'image/png',body:png}));
  await studentPage.goto('http://localhost:8791/apps/life-science-lab/quiz.js');
  await studentPage.setContent('<main id="main"></main>');
  await studentPage.evaluate(async()=>{
    const {renderQuiz}=await import('./quiz.js');
    const quiz={id:'rich-demo',title:'그림 문제',status:'open',questions:[{id:'q1',type:'ox',prompt:'효소 그림',promptParts:[{text:'효소 그림',underline:true,highlight:true},{image:'11111111-2222-4333-8444-000000000001'}],points:2,hint:''}]};
    const api=async(action)=>action==='quiz.list'?{quizzes:[quiz]}:action==='quiz.attempt'?{quiz,attempt:{id:'attempt-1',status:'draft',answers:{},version:1}}:{quiz,attempts:[{id:'attempt-1',student:'학생',status:'submitted',answers:{q1:'O'},grading:{q1:{score:2}}}]};
    const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    await renderQuiz({main:document.querySelector('#main'),api,user:{role:'student'},esc});
  });
  await studentPage.locator('[data-open]').click();
  await expect(studentPage.locator('.quiz-question .quiz-underlined.quiz-highlighted')).toBeVisible();
  await expect(studentPage.locator('.quiz-question .quiz-prompt-image')).toBeVisible();
  await studentPage.evaluate(async()=>{
    const {renderQuiz}=await import('./quiz.js');
    const quiz={id:'rich-demo',title:'그림 문제',status:'open',questions:[{id:'q1',type:'ox',prompt:'효소 그림',promptParts:[{text:'효소 그림',underline:true,highlight:true},{image:'11111111-2222-4333-8444-000000000001'}],points:2,accepted:['O'],hint:''}]};
    const api=async(action)=>action==='quiz.list'?{quizzes:[quiz]}:{quiz,attempts:[{id:'attempt-1',student:'학생',status:'graded',answers:{q1:'O'},grading:{q1:{score:2}}}]};
    const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    await renderQuiz({main:document.querySelector('#main'),api,user:{role:'teacher'},esc,mode:'results'});
  });
  await studentPage.locator('[data-open]').click();
  await studentPage.locator('[data-paper]').click();
  await expect(studentPage.locator('.quiz-paper .quiz-prompt-image')).toBeVisible();
  const pdfReady=studentPage.waitForEvent('download');
  await studentPage.locator('[data-pdf-quiz]').click();
  const pdf=await pdfReady;
  if(!pdf.suggestedFilename().endsWith('.pdf')||(await stat(await pdf.path())).size<1000)throw new Error('이미지 포함 시험지 PDF가 생성되지 않았습니다.');
  await browser.close();
} catch(error){await browser.close();throw error;}
