const state = {
  role: null,
  student: null,
  classes: [],
  activity: null,
  drawCeremonyMode: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const statusNames = { draft: '준비 중', drawing: '카드 뽑기', active: '활동 중', revealed: '정체 공개', closed: '종료' };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindTabs();
  bindAuthForms();
  bindStudentActions();
  bindAdminActions();
  bindLoginQr();
  $('#class-form [name=schoolYear]').value = new Date().getFullYear();
  try {
    const session = await api('/api/session');
    if (!session.authenticated) return;
    state.role = session.role;
    if (session.role === 'student') await showStudentView();
    if (session.role === 'admin') await showAdminView();
  } catch (error) {
    toast(error.message);
  }
}

function bindLoginQr() {
  const modal = $('#login-qr-modal');
  const openButton = $('#open-login-qr');
  const closeButton = $('#close-login-qr');
  const copyButton = $('#copy-login-qr');
  let previousFocus = null;

  const open = () => {
    previousFocus = document.activeElement;
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    closeButton.focus();
  };
  const close = () => {
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    previousFocus?.focus?.();
  };

  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) close();
  });
  copyButton.addEventListener('click', async () => {
    const originalText = copyButton.textContent;
    copyButton.disabled = true;
    copyButton.textContent = '이미지 복사 중…';
    try {
      const response = await fetch('/login-qr-large.png');
      if (!response.ok) throw new Error('QR 이미지를 불러오지 못했습니다.');
      const blob = await response.blob();
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('image-copy-unsupported');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('QR 이미지를 클립보드에 복사했습니다.');
    } catch {
      try {
        await navigator.clipboard.writeText('https://class-manitto.bsy0708.workers.dev/');
        toast('이미지 복사가 지원되지 않아 접속 주소를 복사했습니다.');
      } catch {
        toast('복사가 차단되었습니다. QR 다운로드를 이용해 주세요.');
      }
    } finally {
      copyButton.disabled = false;
      copyButton.textContent = originalText;
    }
  });
}

function bindTabs() {
  $$('.tab').forEach((button) => button.addEventListener('click', () => {
    $$('.tab').forEach((item) => item.classList.toggle('active', item === button));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.tab));
  }));
  $$('.admin-nav').forEach((button) => button.addEventListener('click', () => {
    $$('.admin-nav').forEach((item) => item.classList.toggle('active', item === button));
    $$('.admin-panel').forEach((panel) => panel.classList.toggle('active', panel.id === button.dataset.adminPanel));
  }));
}

function bindAuthForms() {
  $('#student-login-form').addEventListener('submit', (event) => loginStudent(event, false));
  $('#draw-login-form').addEventListener('submit', (event) => loginStudent(event, true));
  $('#admin-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api('/api/auth/admin', { method: 'POST', body: { password: form.get('password') } });
      state.role = 'admin';
      formElement.reset();
      await showAdminView();
    } catch (error) { toast(error.message); }
  });
  $('#logout-btn').addEventListener('click', () => logoutToWelcome());
}

async function loginStudent(event, drawMode) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    await api('/api/auth/student', {
      method: 'POST',
      body: { classCode: form.get('classCode'), studentNo: Number(form.get('studentNo')), name: form.get('name'), pin: form.get('pin') },
    });
    state.role = 'student';
    state.drawCeremonyMode = drawMode;
    formElement.reset();
    await showStudentView();
    if (drawMode && state.student?.assignment) {
      toast('이미 카드를 뽑은 학생입니다. 개인 공간에서 확인할 수 있어요.');
      await logoutToWelcome('draw-login');
      return;
    }
    if (drawMode) $('#draw-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { toast(error.message); }
}

async function showStudentView() {
  showOnly('#student-view');
  $('#logout-btn').classList.remove('hidden');
  await loadStudentDashboard();
}

async function loadStudentDashboard() {
  const data = await api('/api/student/dashboard');
  state.student = data;
  $('#student-name').textContent = data.student.name;
  $('#student-class').textContent = `${data.student.class_name} · ${data.student.student_no}번`;
  $('#no-activity').classList.toggle('hidden', Boolean(data.activity));
  $('#student-content').classList.toggle('hidden', !data.activity);
  $('#activity-badge').textContent = data.activity ? statusNames[data.activity.status] : '대기 중';
  if (!data.activity) return;

  renderTarget(data);
  renderDrawCards(data);
  renderMissions(data.missions);
  renderGuestbook(data.guestbook);
  renderIncomingProofs(data.incomingProofs);
  $('#guestbook-target').innerHTML = '<option value="">친구를 선택하세요</option>' + data.classmates
    .map((student) => `<option value="${student.id}">${student.student_no}번 ${esc(student.name)}</option>`).join('');
}

function renderTarget(data) {
  const target = $('#target-card');
  if (!data.assignment) {
    target.innerHTML = `<span class="label">MY MANITTO</span><h2>아직 비밀 카드를 뽑지 않았어요</h2><p>${data.activity.status === 'drawing' ? '아래 카드 중 한 장을 선택해 주세요.' : '선생님이 카드 뽑기 시간을 열어 줄 때까지 기다려 주세요.'}</p>`;
    return;
  }
  const visible = ['active', 'revealed', 'drawing'].includes(data.activity.status);
  target.innerHTML = `<span class="label">내가 몰래 챙겨 줄 친구</span><h2>${visible ? `${data.assignment.receiver_no}번 ${esc(data.assignment.receiver_name)}` : '비밀 친구'}</h2><p>작은 친절은 생각보다 오래 기억됩니다. 정체는 마지막 날까지 비밀!</p>`;
}

function renderDrawCards(data) {
  const section = $('#draw-section');
  const canDraw = data.activity.status === 'drawing' && !data.assignment;
  section.classList.toggle('hidden', !canDraw);
  if (!canDraw) return;
  const total = data.classmates.length + 1;
  const used = new Set(data.usedCards);
  $('#student-card-grid').innerHTML = Array.from({ length: total }, (_, index) => {
    const number = index + 1;
    return `<button class="draw-card" type="button" data-card="${number}" ${used.has(number) ? 'disabled' : ''}>${used.has(number) ? '선택됨' : `CARD ${String(number).padStart(2, '0')}`}</button>`;
  }).join('');
}

function renderMissions(missions) {
  $('#mission-list').innerHTML = missions.length ? missions.map((mission) => {
    const status = mission.proof_status || '미제출';
    return `<article class="mission-item">
      <div class="mission-head"><div><h3>${esc(mission.title)}</h3><p>${esc(mission.description || '미션을 수행하고 인증을 남겨 주세요.')}</p></div><span class="mini-status ${esc(status)}">${proofStatusName(status)}</span></div>
      ${mission.teacher_note ? `<p class="teacher-note">선생님 메모: ${esc(mission.teacher_note)}</p>` : ''}
      <form class="mission-form" data-mission-id="${mission.id}">
        <textarea name="proofText" rows="2" maxlength="1000" placeholder="어떻게 미션을 수행했나요?">${esc(mission.proof_text || '')}</textarea>
        <label>사진 선택<input name="photo" type="file" accept="image/*"></label>
        <button class="secondary-btn" type="submit">${mission.proof_id ? '인증 다시 제출' : '미션 인증 제출'}</button>
      </form>
    </article>`;
  }).join('') : '<div class="empty">아직 등록된 미션이 없습니다.</div>';
}

function renderGuestbook(entries) {
  $('#guestbook-list').innerHTML = entries.length ? entries.map((entry) => `<article class="note-item"><div class="note-head"><h3>${esc(entry.author_name)}</h3><span class="mini-status">${entry.display_mode === 'anonymous' ? '익명' : '공개'}</span></div><p>${esc(entry.message)}</p><small>${formatDate(entry.created_at)}</small></article>`).join('') : '<div class="empty">아직 도착한 방명록이 없습니다.</div>';
}

function renderIncomingProofs(entries) {
  $('#incoming-proof-list').innerHTML = entries.length ? entries.map((entry) => `<article class="note-item"><div class="note-head"><h3>${esc(entry.mission_title)}</h3><span class="mini-status approved">승인됨</span></div><p>${esc(entry.proof_text || '사진으로 마음을 전했어요.')}</p>${entry.photoUrl ? `<img class="review-image" src="${entry.photoUrl}" alt="나를 위한 미션 인증 사진" loading="lazy">` : ''}<small>${esc(entry.author_name)} · ${formatDate(entry.submitted_at)}</small></article>`).join('') : '<div class="empty">아직 공개된 활동 인증이 없습니다.</div>';
}

function bindStudentActions() {
  $('#student-card-grid').addEventListener('click', async (event) => {
    const card = event.target.closest('[data-card]');
    if (!card || card.disabled) return;
    card.disabled = true;
    try {
      const result = await api('/api/student/draw', { method: 'POST', body: { cardIndex: Number(card.dataset.card) } });
      $('#reveal-title').textContent = result.receiver.name;
      $('#reveal-number').textContent = `${result.receiver.studentNo}번 친구`;
      $('#reveal-modal').classList.remove('hidden');
    } catch (error) {
      toast(error.message);
      await loadStudentDashboard();
    }
  });
  $('#close-reveal').addEventListener('click', async () => {
    $('#reveal-modal').classList.add('hidden');
    if (state.drawCeremonyMode) {
      await logoutToWelcome('draw-login');
      toast('카드가 안전하게 닫혔습니다. 다음 학생이 로그인해 주세요.');
    } else {
      await loadStudentDashboard();
    }
  });
  $('#guestbook-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api('/api/student/guestbook', { method: 'POST', body: { targetStudentId: Number(form.get('targetStudentId')), displayMode: form.get('displayMode'), message: form.get('message') } });
      formElement.reset();
      toast('방명록을 남겼습니다.');
      await loadStudentDashboard();
    } catch (error) { toast(error.message); }
  });
  $('#mission-list').addEventListener('submit', async (event) => {
    const formElement = event.target.closest('.mission-form');
    if (!formElement) return;
    event.preventDefault();
    const form = new FormData(formElement);
    form.set('missionId', formElement.dataset.missionId);
    try {
      await api('/api/student/proofs', { method: 'POST', formData: form });
      toast('미션 인증을 제출했습니다.');
      await loadStudentDashboard();
    } catch (error) { toast(error.message); }
  });
}

async function showAdminView() {
  showOnly('#admin-view');
  $('#logout-btn').classList.remove('hidden');
  await loadClasses();
}

function bindAdminActions() {
  $('#refresh-admin').addEventListener('click', async () => { await loadClasses(); if (state.activity) await loadActivity(state.activity.activity.id); toast('새로고침했습니다.'); });
  $('#class-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await api('/api/admin/classes', { method: 'POST', body: { name: form.get('name'), schoolYear: Number(form.get('schoolYear')), accessCode: form.get('accessCode') } });
      toast(`학급을 만들었습니다. 반 코드는 ${result.accessCode}입니다.`);
      formElement.reset();
      $('#class-form [name=schoolYear]').value = new Date().getFullYear();
      await loadClasses();
    } catch (error) { toast(error.message); }
  });
  $('#roster-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rows = parseRoster(form.get('roster'));
    try {
      if (!rows.length) throw new Error('등록할 학생 명단을 입력하세요.');
      const credentials = [];
      for (let start = 0; start < rows.length; start += 4) {
        const result = await api('/api/admin/students/import', {
          method: 'POST',
          body: { classId: Number(form.get('classId')), rows: rows.slice(start, start + 4) },
        });
        credentials.push(...result.credentials);
      }
      renderCredentials(credentials);
      toast(`${credentials.length}명의 학생을 등록했습니다.`);
      await loadClasses();
    } catch (error) { toast(error.message); }
  });
  $('#activity-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api('/api/admin/activities', { method: 'POST', body: { classId: Number(form.get('classId')), title: form.get('title'), preventMutual: form.get('preventMutual') === 'on' } });
      toast('새 마니또 활동을 만들었습니다.');
      await loadClasses();
      await loadActivity(result.id);
    } catch (error) { toast(error.message); }
  });
  $('#activity-class-select').addEventListener('change', async (event) => {
    const selected = state.classes.find((item) => item.id === Number(event.target.value));
    if (selected?.activity_id) await loadActivity(selected.activity_id);
    else { state.activity = null; $('#activity-control').classList.add('hidden'); $('#activity-summary').textContent = '이 학급에는 아직 활동이 없습니다.'; clearRecords(); }
  });
  $('#activity-control').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-status]');
    if (!button || !state.activity) return;
    if (button.dataset.status === 'revealed' && !confirm('마니또의 정체를 학생들에게 공개할까요?')) return;
    try {
      await api(`/api/admin/activities/${state.activity.activity.id}/status`, { method: 'POST', body: { status: button.dataset.status } });
      toast(`활동 단계를 '${statusNames[button.dataset.status]}' 상태로 변경했습니다.`);
      await loadActivity(state.activity.activity.id);
      await loadClasses();
    } catch (error) { toast(error.message); }
  });
  $('#mission-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.activity) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`/api/admin/activities/${state.activity.activity.id}/missions`, { method: 'POST', body: { title: form.get('title'), description: form.get('description') } });
      formElement.reset();
      toast('미션을 추가했습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
  });
  $('#reset-draw').addEventListener('click', async () => {
    if (!state.activity || !confirm('모든 학생의 카드 선택을 초기화할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    try {
      await api(`/api/admin/activities/${state.activity.activity.id}/reset`, { method: 'POST', body: { confirm: 'RESET' } });
      toast('카드 선택을 초기화했습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
  });
  $('#proof-admin-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-proof-status]');
    if (!button || !state.activity) return;
    try {
      await api(`/api/admin/proofs/${button.dataset.proofId}/review`, { method: 'POST', body: { status: button.dataset.proofStatus, teacherNote: '' } });
      toast(button.dataset.proofStatus === 'approved' ? '인증을 승인했습니다.' : '인증을 반려했습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
  });
  $('#guestbook-admin-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-entry-id]');
    if (!button || !state.activity) return;
    try {
      await api(`/api/admin/guestbook/${button.dataset.entryId}/visibility`, { method: 'POST', body: { hidden: button.dataset.hidden !== '1' } });
      toast('방명록 표시 상태를 변경했습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
  });
}

async function loadClasses() {
  const data = await api('/api/admin/classes');
  state.classes = data.classes;
  const options = '<option value="">학급을 선택하세요</option>' + data.classes.map((item) => `<option value="${item.id}">${esc(item.name)} · ${esc(item.access_code)}</option>`).join('');
  $$('.class-select').forEach((select) => {
    const previous = select.value;
    select.innerHTML = options;
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  });
  $('#class-list').innerHTML = data.classes.length ? data.classes.map((item) => `<article class="class-item"><span class="class-code">${esc(item.access_code)}</span><h3>${esc(item.name)}</h3><p>${item.school_year}학년도 · 학생 ${item.student_count}명</p><span class="mini-status">${item.activity_status ? statusNames[item.activity_status] : '활동 없음'}</span></article>`).join('') : '<div class="empty">등록된 학급이 없습니다.</div>';
}

async function loadActivity(activityId) {
  const data = await api(`/api/admin/activities/${activityId}`);
  state.activity = data;
  $('#activity-control').classList.remove('hidden');
  $('#activity-summary').innerHTML = `<b>${esc(data.activity.title)}</b><br>${esc(data.activity.class_name)} · ${statusNames[data.activity.status]}`;
  $('#activity-class-select').value = String(data.activity.class_id);
  $('#admin-activity-status').textContent = statusNames[data.activity.status];
  $('#admin-activity-title').textContent = data.activity.title;
  $('#admin-activity-code').textContent = `${data.activity.class_name} · 반 코드 ${data.activity.access_code}`;
  const activeStudents = data.students.filter((student) => student.active).length;
  const picked = data.assignments.length;
  $('#draw-progress-label').textContent = `${picked} / ${activeStudents}명`;
  $('#draw-progress-bar').style.width = `${activeStudents ? (picked / activeStudents) * 100 : 0}%`;
  $('#mission-admin-list').innerHTML = data.missions.length ? data.missions.map((mission) => `<span>${esc(mission.title)}</span>`).join('') : '<span>등록된 미션 없음</span>';
  renderAdminRecords(data);
}

function renderAdminRecords(data) {
  $('#assignment-list').innerHTML = data.assignments.length ? `<table><thead><tr><th>카드</th><th>뽑은 학생</th><th>마니또 대상</th><th>선택 시각</th></tr></thead><tbody>${data.assignments.map((item) => `<tr><td>${item.card_index}</td><td>${item.giver_no}번 ${esc(item.giver_name)}</td><td>${item.receiver_no}번 ${esc(item.receiver_name)}</td><td>${formatDate(item.chosen_at)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">아직 카드를 뽑은 학생이 없습니다.</div>';
  $('#proof-admin-list').innerHTML = data.proofs.length ? data.proofs.map((proof) => `<article class="review-item"><div class="review-head"><div><h3>${proof.student_no}번 ${esc(proof.student_name)} · ${esc(proof.mission_title)}</h3><p>${esc(proof.proof_text || '사진 인증')}</p></div><span class="mini-status ${esc(proof.status)}">${proofStatusName(proof.status)}</span></div>${proof.photoUrl ? `<img class="review-image" src="${proof.photoUrl}" alt="미션 인증 사진" loading="lazy">` : ''}<div class="review-actions"><button class="secondary-btn" data-proof-id="${proof.id}" data-proof-status="approved" type="button">승인</button><button class="danger-btn" data-proof-id="${proof.id}" data-proof-status="rejected" type="button">반려</button></div></article>`).join('') : '<div class="empty">제출된 인증이 없습니다.</div>';
  $('#guestbook-admin-list').innerHTML = data.guestbook.length ? data.guestbook.map((entry) => `<article class="review-item"><div class="review-head"><div><h3>${esc(entry.author_name)} → ${esc(entry.target_name)}</h3><p>${esc(entry.message)}</p></div><span class="mini-status">${entry.display_mode === 'anonymous' ? '학생에게 익명' : '공개'}</span></div><div class="review-actions"><button class="${entry.hidden ? 'secondary-btn' : 'danger-btn'}" data-entry-id="${entry.id}" data-hidden="${entry.hidden}" type="button">${entry.hidden ? '다시 표시' : '숨기기'}</button></div></article>`).join('') : '<div class="empty">작성된 방명록이 없습니다.</div>';
}

function renderCredentials(rows) {
  $('#credential-card').classList.remove('hidden');
  $('#credential-list').innerHTML = rows.map((row) => `<tr><td>${row.studentNo}</td><td>${esc(row.name)}</td><td><b>${esc(row.pin)}</b></td></tr>`).join('');
  $('#credential-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearRecords() {
  $('#assignment-list').innerHTML = '<div class="empty">활동을 선택해 주세요.</div>';
  $('#proof-admin-list').innerHTML = '';
  $('#guestbook-admin-list').innerHTML = '';
}

function parseRoster(text) {
  return String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const parts = line.split(/\s*[,\t]\s*/);
    if (index === 0 && !/^\d+$/.test(parts[0])) return null;
    return { studentNo: Number(parts[0]), name: parts[1] || '', pin: parts[2] || '' };
  }).filter(Boolean);
}

async function api(path, options = {}) {
  const init = { method: options.method || 'GET', credentials: 'same-origin', headers: {} };
  if (options.formData) init.body = options.formData;
  else if (options.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const type = response.headers.get('Content-Type') || '';
  const data = type.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(data?.error || '요청을 처리하지 못했습니다.');
  return data;
}

function showOnly(selector) {
  ['#welcome-view', '#student-view', '#admin-view'].forEach((id) => $(id).classList.toggle('hidden', id !== selector));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function logoutToWelcome(tabId = 'student-login') {
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* 만료된 세션도 화면에서는 종료 */ }
  state.role = null;
  state.activity = null;
  state.student = null;
  state.drawCeremonyMode = false;
  showOnly('#welcome-view');
  $('#logout-btn').classList.add('hidden');
  const tab = $(`.tab[data-tab="${tabId}"]`);
  if (tab) tab.click();
}

function proofStatusName(status) {
  return ({ submitted: '검토 대기', approved: '승인됨', rejected: '다시 제출', 미제출: '미제출' })[status] || status;
}

function formatDate(value) {
  if (!value) return '';
  const parsed = new Date(String(value).includes('T') ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? String(value) : new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed);
}

let toastTimer;
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2800);
}
