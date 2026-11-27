import test from 'node:test';
import assert from 'node:assert/strict';
import {renderQuestionPrompt} from '../quiz-rich.js';

test('서식과 이미지를 안전하게 렌더링하고 기존 일반 문항도 유지한다',()=>{
  const id='11111111-2222-4333-8444-555555555555';
  const html=renderQuestionPrompt({promptParts:[
    {text:'<효소>',underline:true,highlight:false},
    {text:' 반응',underline:false,highlight:true},
    {image:id}
  ]});
  assert.match(html,/quiz-underlined/);
  assert.match(html,/quiz-highlighted/);
  assert.match(html,/&lt;효소&gt;/);
  assert.match(html,new RegExp('/api/lab/quiz-image/'+id));
  assert.doesNotMatch(html,/<효소>/);
  assert.equal(renderQuestionPrompt({prompt:'<b>기존 문제</b>'}),'&lt;b&gt;기존 문제&lt;/b&gt;');
});
