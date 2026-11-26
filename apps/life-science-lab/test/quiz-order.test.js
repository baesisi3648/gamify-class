import test from 'node:test';
import assert from 'node:assert/strict';
import {studentQuestionOrder} from '../server/quiz-order.js';

test('문항 섞기는 유형을 묶고 응시 기록마다 순서를 고정한다',()=>{
  const questions=[
    {id:'o1',type:'ox'}, {id:'c1',type:'choice',choices:['A','B','C','D']},
    {id:'o2',type:'ox'}, {id:'c2',type:'choice',choices:['E','F','G','H']},
    {id:'o3',type:'ox'}, {id:'c3',type:'choice',choices:['I','J','K','L']}
  ];
  const settings={shuffleQuestions:true,shuffleChoices:true};
  const first=studentQuestionOrder(questions,settings,'attempt-1');
  assert.deepEqual(first,studentQuestionOrder(questions,settings,'attempt-1'));
  assert.deepEqual(first.map((q)=>q.type),['ox','ox','ox','choice','choice','choice']);
  assert.deepEqual(first.map((q)=>q.id).sort(),questions.map((q)=>q.id).sort());
  for(const question of first.filter((q)=>q.type==='choice')){
    assert.deepEqual(question.choiceOrder.slice().sort(),[0,1,2,3]);
    assert.deepEqual(question.choices,question.choiceOrder.map((index)=>questions.find((q)=>q.id===question.id).choices[index]));
  }
  assert.deepEqual(studentQuestionOrder(questions,{},'attempt-1'),questions);
});
