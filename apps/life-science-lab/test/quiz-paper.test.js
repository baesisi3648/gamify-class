import test from 'node:test';
import assert from 'node:assert/strict';
import {renderQuizPaper} from '../quiz-paper.js';

test('teacher paper shows every answer and confirmed grading without raw choice indexes', () => {
  const quiz={title:'효소 퀴즈',questions:[
    {id:'a',type:'choice',prompt:'효소를 고르세요',points:5,choices:['단백질','지질']},
    {id:'b',type:'match',prompt:'짝을 맞추세요',points:5,pairs:[{left:'핵',right:'DNA'},{left:'리보솜',right:'단백질'}]},
    {id:'c',type:'essay',prompt:'설명하세요',points:10}
  ]};
  const attempt={student:'홍길동',status:'graded',answers:{a:'0',b:'["DNA","단백질"]',c:'효소는 촉매다.'},grading:{a:{score:5},b:{score:5},c:{score:8,feedback:'좋습니다.'}}};
  const html=renderQuizPaper(quiz,attempt);
  assert.match(html,/홍길동/);
  assert.match(html,/18 \/ 20점/);
  assert.match(html,/1\. 단백질/);
  assert.match(html,/핵 → DNA/);
  assert.match(html,/효소는 촉매다\./);
  assert.match(html,/교사 피드백/);
  assert.equal((html.match(/class="quiz-paper-question"/g)||[]).length,3);
});

test('paper escapes untrusted text and handles missing answers', () => {
  const html=renderQuizPaper({title:'<script>',questions:[{id:'x',type:'short',prompt:'<b>문제</b>',points:2}]},{student:'<img>',status:'submitted',answers:{}});
  assert.doesNotMatch(html,/<script>|<img>|<b>문제/);
  assert.match(html,/미작성/);
  assert.match(html,/채점 대기/);
});
