const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const koreanDate = (value) => value ? new Date(value).toLocaleDateString('ko-KR', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }) : '작성 중';
const cleanFileName = (value) => String(value || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 60);

export function reportFileName(report, student) {
  return cleanFileName(`${report.title}_${student?.grade || ''}-${student?.classNo || ''}-${student?.number || ''}_${student?.name || '보고서'}`) + '.pdf';
}

export function reportDocumentHTML(report, student = {}, group = {}, options = {}) {
  const answer = (field) => {
    const value = report.content?.[field.id];
    if (field.type === 'references') {
      return Array.isArray(value) && value.length
        ? '<ol class="report-references">' + value.map((item) => '<li><strong>' + escapeHTML(item.title || '제목 미입력') + '</strong><br>' + escapeHTML([item.author, item.source].filter(Boolean).join(' · ')) + '</li>').join('') + '</ol>'
        : '<p class="report-empty">아직 작성하지 않았습니다.</p>';
    }
    return '<p class="report-answer">' + escapeHTML(value || '아직 작성하지 않았습니다.') + '</p>';
  };
  const identity = `${student.grade || '—'}학년 ${student.classNo || '—'}반 ${student.number || '—'}번`;
  return '<article class="report-document" id="printable-report" aria-label="탐구 보고서">' +
    '<header class="report-document-head"><p class="report-kicker">LIFE SCIENCE · RESEARCH REPORT</p><h1>' + escapeHTML(report.title) + '</h1><p class="report-subtitle">' + escapeHTML(group.subject || '생명과학 탐구') + ' · ' + escapeHTML(group.year || student.year || '') + '학년도</p></header>' +
    '<table class="report-identity"><tbody><tr><th>학교</th><td>' + escapeHTML(group.school || '—') + '</td><th>학번</th><td>' + escapeHTML(identity) + '</td></tr><tr><th>이름</th><td>' + escapeHTML(student.name || '—') + '</td><th>작성일</th><td>' + escapeHTML(koreanDate(report.submittedAt || report.updatedAt || report.createdAt)) + '</td></tr></tbody></table>' +
    '<div class="report-intro"><strong>탐구 주제</strong><span>' + escapeHTML(report.title) + '</span><strong>진행 상태</strong><span>' + escapeHTML(({draft:'작성 중',revision:'보완 중',submitted:'제출 완료',approved:'교사 승인',rejected:'반려'})[report.status] || report.status || '작성 중') + '</span></div>' +
    (report.fields || []).map((field, index) => '<section class="report-part"><h2><span>' + String(index + 1).padStart(2,'0') + '</span>' + escapeHTML(field.title) + '</h2>' + answer(field) + '</section>').join('') +
    (options.photoUrl ? '<figure class="report-photo"><figcaption>효소 관련 사진 <span>선택 첨부</span></figcaption><img src="' + escapeHTML(options.photoUrl) + '" alt="학생이 선택하여 첨부한 효소 관련 사진"></figure>' : '') +
    '<footer class="report-document-foot">생명과학 탐구 연구소 · ' + escapeHTML(group.title || '탐구 보고서') + '</footer></article>';
}
