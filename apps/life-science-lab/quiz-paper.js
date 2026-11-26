const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function answerText(question, raw) {
  if (raw == null || raw === '') return '미작성';
  if (question.type === 'choice') {
    const index = Number(raw);
    return Number.isInteger(index) && question.choices?.[index] != null
      ? `${index + 1}. ${question.choices[index]}` : String(raw);
  }
  if (question.type === 'match' || question.type === 'order') {
    let values;
    try { values = JSON.parse(raw); } catch { return String(raw); }
    if (!Array.isArray(values)) return String(raw);
    if (question.type === 'match') return values.map((value, index) => `${question.pairs?.[index]?.left || index + 1} → ${value || '미작성'}`).join('\n');
    return values.map((value, index) => `${index + 1}. ${value || '미작성'}`).join('\n');
  }
  return String(raw);
}

export function renderQuizPaper(quiz, attempt) {
  const questions = quiz.questions || [];
  const total = questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
  const graded = attempt.status === 'graded';
  const earned = graded ? questions.reduce((sum, question) => sum + Number(attempt.grading?.[question.id]?.score || 0), 0) : null;
  const status = {draft:'작성 중',submitted:'채점 대기',graded:'채점 완료'}[attempt.status] || attempt.status;
  return `<article id="quiz-printable" class="quiz-paper"><header class="quiz-paper-header"><p class="quiz-paper-kicker">LIFE SCIENCE · QUIZ RESPONSE</p><h2>${escapeHtml(quiz.title)}</h2><div class="quiz-paper-meta"><span>이름 <strong>${escapeHtml(attempt.student)}</strong></span><span>상태 <strong>${escapeHtml(status)}</strong></span><span>점수 <strong>${graded ? `${earned} / ${total}점` : `채점 대기 / ${total}점`}</strong></span></div></header><div class="quiz-paper-questions">${questions.map((question, index) => {
    const grade = attempt.grading?.[question.id];
    const score = graded ? `<span class="quiz-paper-score">${escapeHtml(grade?.score ?? 0)} / ${escapeHtml(question.points)}점</span>` : `<span class="quiz-paper-score">${escapeHtml(question.points)}점</span>`;
    const feedback = graded && grade?.feedback ? `<p class="quiz-paper-feedback"><strong>교사 피드백</strong><br>${escapeHtml(grade.feedback)}</p>` : '';
    return `<section class="quiz-paper-question"><div class="quiz-paper-question-head"><h3><span>${String(index + 1).padStart(2,'0')}</span> ${escapeHtml(question.prompt)}</h3>${score}</div><p class="quiz-paper-label">학생 답안</p><div class="quiz-paper-answer">${escapeHtml(answerText(question, attempt.answers?.[question.id]))}</div>${feedback}</section>`;
  }).join('')}</div><footer class="quiz-paper-footer">${questions.length}문항 · 총 ${total}점</footer></article>`;
}
