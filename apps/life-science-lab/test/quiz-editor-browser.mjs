import {chromium,expect} from '@playwright/test';

const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage();
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
  await card.locator('[name=prompt]').fill('효소는?');
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
  if(created.questions[0].choices[created.questions[0].correct]!=='나')throw new Error('보기 이동 후 정답이 바뀌었습니다.');
  await browser.close();
} catch(error){await browser.close();throw error;}
