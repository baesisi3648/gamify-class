import test from 'node:test';
import assert from 'node:assert/strict';
import { reportDocumentHTML, reportFileName } from '../report-document.js';

test('report document includes identity, answers and references without executing student markup', () => {
  const report = {
    title:'효소 탐구', status:'submitted', updatedAt:'2026-11-09T02:00:00.000Z',
    fields:[{id:'summary',title:'탐구 내용',type:'text'},{id:'references',title:'참고 자료',type:'references'}],
    content:{summary:'첫째 줄\n<script>alert(1)</script>',references:[{title:'논문 <1>',author:'연구자',source:'https://example.org'}]}
  };
  const html=reportDocumentHTML(report,{year:2026,grade:2,classNo:3,number:9,name:'가상 학생'},{school:'테스트학교',subject:'세포와 물질대사',title:'테스트 그룹'});
  assert.match(html,/테스트학교/);
  assert.match(html,/2학년 3반 9번/);
  assert.match(html,/가상 학생/);
  assert.match(html,/2026\. 11\. 09\./);
  assert.match(html,/첫째 줄\n&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/논문 &lt;1&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.equal(reportFileName(report,{grade:2,classNo:3,number:9,name:'가상 학생'}),'효소 탐구_2-3-9_가상 학생.pdf');
});

test('optional enzyme photo is rendered only when a site image URL is supplied',()=>{
  const report={id:'r-photo',title:'효소 탐구',status:'draft',fields:[],content:{},createdAt:'2026-11-12T00:00:00Z'};
  assert.doesNotMatch(reportDocumentHTML(report),/report-photo/);
  const html=reportDocumentHTML(report,{name:'가상 학생'},{},{photoUrl:'blob:https://lab.test/photo'});
  assert.match(html,/효소 관련 사진/);assert.match(html,/blob:https:\/\/lab\.test\/photo/);
});
