const state = {
  role: null,
  student: null,
  classes: [],
  activity: null,
  selectedStudentId: null,
  selectedFriendId: null,
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
  $('#student-login-form').addEventListener('submit', loginStudent);
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

async function loginStudent(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  try {
    const result = await api('/api/auth/student', {
      method: 'POST',
      body: { classCode: form.get('classCode'), studentNo: Number(form.get('studentNo')), name: form.get('name'), pin: form.get('pin') },
    });
    state.role = 'student';
    formElement.reset();
    await showStudentView();
    if (result.pinCreated) toast('개인 PIN이 등록되었습니다. 다음 로그인에도 같은 PIN을 사용하세요.');
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
  renderOwnProfile(data.student);
  $('#no-activity').classList.toggle('hidden', Boolean(data.activity));
  $('#student-content').classList.toggle('hidden', !data.activity);
  $('#activity-badge').textContent = data.activity ? statusNames[data.activity.status] : '대기 중';
  if (!data.activity) return;

  renderTarget(data);
  renderGuess(data);
  renderDrawCards(data);
  renderMissions(data);
  renderGuestbook(data.guestbook);
  renderFriendSpaces(data.classmates);
  renderIncomingProofs(data.incomingProofs);
  renderBoard(data.board || []);
  $('#guestbook-target').innerHTML = '<option value="">친구를 선택하세요</option>' + data.classmates
    .map((student) => `<option value="${student.id}">${student.student_no}번 ${esc(student.name)}</option>`).join('');
}

function renderOwnProfile(student) {
  const image = $('#profile-avatar-image');
  const fallback = $('#profile-avatar-fallback');
  const hasPhoto = Boolean(student.profilePhotoUrl);
  image.hidden = !hasPhoto;
  fallback.hidden = hasPhoto;
  if (hasPhoto) image.src = student.profilePhotoUrl;
  else image.removeAttribute('src');
  fallback.textContent = student.name.slice(0, 1) || 'ME';
  $('#delete-profile-photo').classList.toggle('hidden', !hasPhoto);
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

function renderGuess(data) {
  const section = $('#guess-section');
  const content = $('#guess-content');
  const revealed = data.activity.status === 'revealed';
  const visible = Boolean(data.assignment && (revealed || data.activity.status === 'active'));
  section.classList.toggle('hidden', !visible);
  if (!visible) return;

  if (revealed) {
    const actual = data.guess?.actual_giver_name
      ? `${data.guess.actual_giver_no}번 ${esc(data.guess.actual_giver_name)}`
      : '확인할 수 없음';
    if (!data.guess?.guessed_giver_id || data.guess.status !== 'submitted') {
      content.innerHTML = `<div class="guess-state"><span class="guess-icon">?</span><div><h3>최종 제출하지 않았어요</h3><p>나의 실제 마니또는 <strong>${actual}</strong> 학생이었습니다.</p></div></div>`;
      return;
    }
    const picked = `${data.guess.guessed_student_no}번 ${esc(data.guess.guessed_student_name)}`;
    content.innerHTML = data.guess.is_correct
      ? `<div class="guess-state correct"><span class="guess-icon">✓</span><div><h3>정답이에요!</h3><p><strong>${picked}</strong> 학생을 정확히 맞혔습니다.</p></div></div>`
      : `<div class="guess-state wrong"><span class="guess-icon">×</span><div><h3>아쉽지만 정답이 아니에요</h3><p>내 선택은 <strong>${picked}</strong>, 실제 마니또는 <strong>${actual}</strong> 학생이었습니다.</p></div></div>`;
    return;
  }

  if (data.activity.guessing_open) {
    if (data.guess?.status === 'submitted') {
      content.innerHTML = `<div class="guess-state"><span class="guess-icon">✓</span><div><h3>최종 제출 완료</h3><p><strong>${data.guess.guessed_student_no}번 ${esc(data.guess.guessed_student_name)}</strong> 학생으로 제출했습니다. 정체 공개를 기다려 주세요.</p></div></div>`;
      return;
    }
    const savedName = data.guess?.guessed_giver_id ? `${data.guess.guessed_student_no}번 ${esc(data.guess.guessed_student_name)}` : '';
    const options = data.classmates.map((student) => `<option value="${student.student_no}번 ${esc(student.name)}"></option>`).join('');
    content.innerHTML = `<form id="guess-form" class="guess-form"><label>나를 도와준 마니또 이름<input name="guessedStudentName" list="guess-student-list" value="${savedName}" placeholder="이름 또는 번호를 입력하세요" autocomplete="off" required><datalist id="guess-student-list">${options}</datalist></label><div class="guess-save-actions"><button class="secondary-btn" type="submit" name="guessAction" value="draft">임시저장</button><button class="primary-btn warm" type="submit" name="guessAction" value="submit">최종 제출</button></div><p class="guess-help">임시저장은 다시 고칠 수 있습니다. 최종 제출 후에는 수정할 수 없습니다.</p></form>`;
    return;
  }

  content.innerHTML = data.guess
    ? `<div class="guess-state"><span class="guess-icon">${data.guess.status === 'submitted' ? '✓' : '…'}</span><div><h3>${data.guess.status === 'submitted' ? '최종 제출 완료' : '임시저장 후 마감되었습니다'}</h3><p><strong>${data.guess.guessed_student_no}번 ${esc(data.guess.guessed_student_name)}</strong> 학생을 선택했습니다. 정체 공개를 기다려 주세요.</p></div></div>`
    : `<div class="guess-state"><span class="guess-icon">—</span><div><h3>추측이 마감되었습니다</h3><p>제출된 선택이 없습니다. 정체 공개를 기다려 주세요.</p></div></div>`;
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

function renderMissions(data) {
  const missions = data.missions;
  if (!missions.length) {
    const canDraw = data.assignment && ['drawing', 'active'].includes(data.activity.status);
    $('#mission-list').innerHTML = canDraw
      ? `<div class="mission-draw-box"><span class="mission-draw-icon">✦</span><h3>제주 미션 3개를 뽑아 볼까요?</h3><p>간식 선물 1개·여행 도움 1개·제주 여행 편지 1개가 반드시 나옵니다.<br>한 번 뽑으면 바꿀 수 없어요.</p><button id="draw-missions" class="primary-btn warm" type="button">필수 미션 3개 뽑기</button><small>위험한 장소에서는 촬영하지 말고, 친구의 얼굴은 동의를 받은 경우에만 찍어 주세요.</small></div>`
      : `<div class="empty">${data.assignment ? '지금은 미션을 뽑을 수 없습니다.' : '먼저 마니또 카드를 뽑아 주세요.'}</div>`;
    return;
  }
  const approved = missions.filter((mission) => mission.proof_status === 'approved').length;
  $('#mission-list').innerHTML = `<div class="mission-progress"><span>미션 완료</span><strong>${approved} / ${missions.length}</strong></div>` + missions.map((mission) => {
    const status = mission.proof_status || '미제출';
    const existingPhoto = mission.photoUrl || '';
    return `<article class="mission-item">
      <div class="mission-head"><div><span class="mission-category ${esc(mission.category)}">${missionCategoryName(mission.category)}</span><h3>${esc(mission.title)}</h3><p>${esc(mission.description || '미션을 수행하고 인증을 남겨 주세요.')}</p></div><span class="mini-status ${esc(status)}">${proofStatusName(status)}</span></div>
      ${mission.teacher_note ? `<p class="teacher-note">선생님 메모: ${esc(mission.teacher_note)}</p>` : ''}
      <form class="mission-form" data-mission-id="${mission.id}">
        <textarea name="proofText" rows="2" maxlength="1000" placeholder="어떻게 미션을 수행했나요?">${esc(mission.proof_text || '')}</textarea>
        <div class="gallery-upload">
          <div><b>사진으로 인증하기</b><small>휴대전화 사진첩·갤러리에서 사진 한 장을 선택하세요.</small></div>
          <label class="gallery-picker"><span aria-hidden="true">▣</span><strong data-photo-label>${existingPhoto ? '다른 사진 선택' : '사진첩에서 사진 선택'}</strong><input name="photo" type="file" accept="image/*" data-photo-input></label>
        </div>
        <div class="mission-photo-preview" data-existing-url="${esc(existingPhoto)}" ${existingPhoto ? '' : 'hidden'}>
          <img src="${existingPhoto ? esc(existingPhoto) : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}" alt="${existingPhoto ? '현재 등록된 미션 인증 사진' : '선택한 미션 인증 사진 미리보기'}">
          <div><b data-photo-name>${existingPhoto ? '현재 등록된 사진' : ''}</b><small data-photo-size>${existingPhoto ? '새 사진을 선택하지 않으면 이 사진이 유지됩니다.' : ''}</small></div>
          <button type="button" data-clear-photo ${existingPhoto ? 'hidden' : ''}>선택 취소</button>
        </div>
        <button class="secondary-btn" type="submit">${mission.proof_id ? '인증 다시 제출' : '미션 인증 제출'}</button>
      </form>
    </article>`;
  }).join('');
}

function renderGuestbook(entries) {
  $('#guestbook-list').innerHTML = entries.length ? entries.map((entry) => `<article class="note-item"><div class="note-head"><h3>${esc(entry.author_name)}</h3><span class="mini-status">${entry.visibility === 'private' ? '나만 보기' : entry.display_mode === 'anonymous' ? '공개 · 익명' : '공개'}</span></div><p>${esc(entry.message)}</p><small>${formatDate(entry.created_at)}</small></article>`).join('') : '<div class="empty">아직 도착한 방명록이 없습니다.</div>';
}

function renderFriendSpaces(classmates) {
  if (!classmates.length) {
    $('#friend-space-list').innerHTML = '<div class="empty">방문할 친구가 없습니다.</div>';
    $('#friend-space-detail').innerHTML = '아직 방문할 수 있는 친구 공간이 없습니다.';
    return;
  }
  $('#friend-space-list').innerHTML = classmates.map((student) => `<button class="friend-space-button ${student.id === state.selectedFriendId ? 'active' : ''}" data-friend-space="${student.id}" type="button">${student.profilePhotoUrl ? `<img src="${esc(student.profilePhotoUrl)}" alt="${esc(student.name)} 프로필 사진" loading="lazy">` : `<span>${student.student_no}</span>`}<b>${esc(student.name)}</b><small>미니홈피 방문</small></button>`).join('');
  if (!state.selectedFriendId || !classmates.some((student) => student.id === state.selectedFriendId)) {
    state.selectedFriendId = null;
    $('#friend-space-detail').classList.add('empty');
    $('#friend-space-detail').innerHTML = '위에서 방문할 친구를 선택하세요.';
  }
}

async function openFriendSpace(studentId) {
  state.selectedFriendId = studentId;
  $$('#friend-space-list [data-friend-space]').forEach((button) => button.classList.toggle('active', Number(button.dataset.friendSpace) === studentId));
  const detail = $('#friend-space-detail');
  detail.classList.add('empty');
  detail.innerHTML = '친구의 미니홈피를 불러오는 중…';
  try {
    const data = await api(`/api/student/spaces/${studentId}`);
    detail.classList.remove('empty');
    const notes = data.guestbook.length ? data.guestbook.map((entry) => `<article class="mini-home-note"><div class="note-head"><h3>${esc(entry.author_name)}</h3><span class="mini-status">${entry.display_mode === 'anonymous' ? '익명' : '이름 공개'}</span></div><p>${esc(entry.message)}</p><small>${formatDate(entry.created_at)}</small></article>`).join('') : '<div class="empty">아직 공개된 방명록이 없어요. 첫 번째 글을 남겨 보세요!</div>';
    const avatar = data.student.profilePhotoUrl ? `<img src="${esc(data.student.profilePhotoUrl)}" alt="${esc(data.student.name)} 프로필 사진">` : `<span>${esc(data.student.name.slice(0, 1))}</span>`;
    detail.innerHTML = `<header class="mini-home-header"><div class="mini-home-person"><div class="mini-home-avatar">${avatar}</div><div><span>${data.student.student_no}번의 공간</span><h3>${esc(data.student.name)}님의 미니홈피</h3><p>공개된 방명록만 친구들에게 보여요.</p></div></div><button class="secondary-btn" data-write-to-friend="${data.student.id}" type="button">방명록 남기기</button></header><div class="mini-home-notes">${notes}</div>`;
  } catch (error) {
    detail.classList.add('empty');
    detail.textContent = error.message;
  }
}

function renderIncomingProofs(entries) {
  $('#incoming-proof-list').innerHTML = entries.length ? entries.map((entry) => `<article class="note-item"><div class="note-head"><h3>${esc(entry.mission_title)}</h3><span class="mini-status approved">승인됨</span></div><p>${esc(entry.proof_text || '사진으로 마음을 전했어요.')}</p>${entry.photoUrl ? `<img class="review-image" src="${entry.photoUrl}" alt="나를 위한 미션 인증 사진" loading="lazy">` : ''}<small>${esc(entry.author_name)} · ${formatDate(entry.submitted_at)}</small></article>`).join('') : '<div class="empty">아직 공개된 활동 인증이 없습니다.</div>';
}

function renderBoard(entries) {
  $('#board-list').innerHTML = entries.length ? entries.map((entry) => `<article class="board-post"><div class="note-head"><h3>${esc(entry.author_name)}</h3><span class="mini-status">${entry.display_mode === 'anonymous' ? '익명' : '공개'}</span></div><p>${esc(entry.message)}</p><small>${formatDate(entry.created_at)}</small></article>`).join('') : '<div class="empty">첫 번째 게시글을 남겨 보세요.</div>';
}

function bindStudentActions() {
  $('#guess-content').addEventListener('submit', async (event) => {
    const formElement = event.target.closest('#guess-form');
    if (!formElement) return;
    event.preventDefault();
    const form = new FormData(formElement);
    const action = event.submitter?.value === 'submit' ? 'submit' : 'draft';
    const enteredName = String(form.get('guessedStudentName') || '').trim();
    const classmates = state.student?.classmates || [];
    const normalized = enteredName.replace(/\s+/g, '');
    const matches = classmates.filter((student) => `${student.student_no}번${student.name}`.replace(/\s+/g, '') === normalized || student.name.replace(/\s+/g, '') === normalized);
    if (matches.length !== 1) return toast(matches.length > 1 ? '동명이인이 있습니다. 번호와 이름을 함께 입력해 주세요.' : '같은 반 학생의 이름을 목록에서 선택해 주세요.');
    if (action === 'submit' && !confirm(`${matches[0].student_no}번 ${matches[0].name} 학생을 나의 마니또로 최종 제출할까요?\n최종 제출 후에는 수정할 수 없습니다.`)) return;
    const buttons = [...formElement.querySelectorAll('button[type="submit"]')];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      await api('/api/student/guess', { method: 'POST', body: { guessedStudentId: Number(matches[0].id), action } });
      toast(action === 'submit' ? '마니또 추측을 최종 제출했습니다.' : '마니또 추측을 임시저장했습니다. 다시 수정할 수 있어요.');
      await loadStudentDashboard();
    } catch (error) {
      toast(error.message);
      buttons.forEach((button) => { button.disabled = false; });
    }
  });
  $('#profile-photo-input').addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const photo = input.files?.[0];
    if (!photo) return;
    if (!photo.type.startsWith('image/') || photo.size > 5 * 1024 * 1024) {
      input.value = '';
      return toast('5MB 이하의 이미지 파일을 선택하세요.');
    }
    const form = new FormData();
    form.set('photo', photo);
    input.disabled = true;
    try {
      await api('/api/student/profile-photo', { method: 'POST', formData: form });
      toast('프로필 사진을 꾸몄습니다.');
      await loadStudentDashboard();
    } catch (error) { toast(error.message); }
    finally { input.disabled = false; input.value = ''; }
  });
  $('#delete-profile-photo').addEventListener('click', async () => {
    if (!confirm('프로필 사진을 삭제할까요?')) return;
    try {
      await api('/api/student/profile-photo', { method: 'DELETE' });
      toast('프로필 사진을 삭제했습니다.');
      await loadStudentDashboard();
    } catch (error) { toast(error.message); }
  });
  $('#mission-list').addEventListener('click', async (event) => {
    const button = event.target.closest('#draw-missions');
    if (!button) return;
    button.disabled = true;
    button.textContent = '미션을 고르는 중…';
    try {
      await api('/api/student/missions/draw', { method: 'POST', body: {} });
      toast('제주 미션 3개가 정해졌습니다!');
      await loadStudentDashboard();
    } catch (error) {
      toast(error.message);
      button.disabled = false;
      button.textContent = '필수 미션 3개 뽑기';
    }
  });
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
    await loadStudentDashboard();
  });
  $('#guestbook-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const targetStudentId = Number(form.get('targetStudentId'));
      await api('/api/student/guestbook', { method: 'POST', body: { targetStudentId, displayMode: form.get('displayMode'), visibility: form.get('visibility'), message: form.get('message') } });
      formElement.reset();
      toast('방명록을 남겼습니다.');
      await loadStudentDashboard();
      if (state.selectedFriendId === targetStudentId) await openFriendSpace(targetStudentId);
    } catch (error) { toast(error.message); }
  });
  $('#friend-space-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-friend-space]');
    if (button) openFriendSpace(Number(button.dataset.friendSpace));
  });
  $('#friend-space-detail').addEventListener('click', (event) => {
    const button = event.target.closest('[data-write-to-friend]');
    if (!button) return;
    $('#guestbook-target').value = button.dataset.writeToFriend;
    $('#guestbook-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#guestbook-form textarea').focus();
  });
  $('#board-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api('/api/student/board', { method: 'POST', body: { displayMode: form.get('displayMode'), message: form.get('message') } });
      formElement.querySelector('textarea').value = '';
      toast('자유게시판에 글을 등록했습니다.');
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
  $('#mission-list').addEventListener('change', (event) => {
    const input = event.target.closest('[data-photo-input]');
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      input.value = '';
      toast('사진 파일만 선택할 수 있습니다.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      input.value = '';
      toast('사진은 8MB 이하로 선택해 주세요.');
      return;
    }
    if (input.dataset.previewUrl) URL.revokeObjectURL(input.dataset.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    input.dataset.previewUrl = previewUrl;
    const form = input.closest('.mission-form');
    const preview = form.querySelector('.mission-photo-preview');
    preview.hidden = false;
    preview.querySelector('img').src = previewUrl;
    preview.querySelector('img').alt = '선택한 미션 인증 사진 미리보기';
    preview.querySelector('[data-photo-name]').textContent = file.name || '선택한 사진';
    preview.querySelector('[data-photo-size]').textContent = `${(file.size / 1024 / 1024).toFixed(1)}MB · 제출 전에 사진을 확인해 주세요.`;
    preview.querySelector('[data-clear-photo]').hidden = false;
    form.querySelector('[data-photo-label]').textContent = '사진 변경하기';
  });
  $('#mission-list').addEventListener('click', (event) => {
    const clearButton = event.target.closest('[data-clear-photo]');
    if (!clearButton) return;
    const form = clearButton.closest('.mission-form');
    const input = form.querySelector('[data-photo-input]');
    if (input.dataset.previewUrl) URL.revokeObjectURL(input.dataset.previewUrl);
    delete input.dataset.previewUrl;
    input.value = '';
    const preview = form.querySelector('.mission-photo-preview');
    const existingPhoto = preview.dataset.existingUrl;
    if (existingPhoto) {
      preview.querySelector('img').src = existingPhoto;
      preview.querySelector('img').alt = '현재 등록된 미션 인증 사진';
      preview.querySelector('[data-photo-name]').textContent = '현재 등록된 사진';
      preview.querySelector('[data-photo-size]').textContent = '새 사진을 선택하지 않으면 이 사진이 유지됩니다.';
      clearButton.hidden = true;
      form.querySelector('[data-photo-label]').textContent = '다른 사진 선택';
    } else {
      preview.hidden = true;
      form.querySelector('[data-photo-label]').textContent = '사진첩에서 사진 선택';
    }
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
  $('#code-class-select').addEventListener('change', (event) => {
    const selected = state.classes.find((item) => item.id === Number(event.target.value));
    $('#class-code-form [name=accessCode]').value = selected?.access_code || '';
  });
  $('#class-code-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const classId = Number(form.get('classId'));
    try {
      const result = await api(`/api/admin/classes/${classId}/access-code`, { method: 'POST', body: { accessCode: form.get('accessCode') } });
      toast(`학생 접속 코드를 ${result.accessCode}(으)로 변경했습니다.`);
      await loadClasses();
      if (state.activity?.activity.class_id === classId) await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
  });
  $('#exclusion-class-select').addEventListener('change', (event) => loadAssignmentExclusions(Number(event.target.value)));
  $('#exclusion-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const classId = Number(form.get('classId'));
    try {
      await api(`/api/admin/classes/${classId}/exclusions`, { method: 'POST', body: { studentAId: Number(form.get('studentAId')), studentBId: Number(form.get('studentBId')) } });
      toast('두 학생의 마니또 배정 제외 관계를 추가했습니다.');
      await loadAssignmentExclusions(classId);
    } catch (error) { toast(error.message); }
  });
  $('#exclusion-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-delete-exclusion]');
    if (!button || !confirm('이 제외 관계를 삭제할까요?')) return;
    try {
      await api(`/api/admin/exclusions/${button.dataset.deleteExclusion}`, { method: 'DELETE' });
      toast('제외 관계를 삭제했습니다.');
      await loadAssignmentExclusions(Number($('#exclusion-class-select').value));
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
    if (button.dataset.status === 'revealed') {
      const submitted = (state.activity.guesses || []).filter((guess) => guess.guess_status === 'submitted').length;
      const total = state.activity.students.filter((student) => student.active).length;
      if (!confirm(`현재 ${submitted}/${total}명이 마니또 추측을 최종 제출했습니다.\n추측 접수를 마감하고 정체를 공개할까요?`)) return;
    }
    try {
      await api(`/api/admin/activities/${state.activity.activity.id}/status`, { method: 'POST', body: { status: button.dataset.status } });
      toast(`활동 단계를 '${statusNames[button.dataset.status]}' 상태로 변경했습니다.`);
      await loadActivity(state.activity.activity.id);
      await loadClasses();
    } catch (error) { toast(error.message); }
  });
  $('#open-guesses').addEventListener('click', async (event) => {
    if (!state.activity || !confirm('학생들의 마니또 추측 접수를 시작할까요?')) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api(`/api/admin/activities/${state.activity.activity.id}/guessing`, { method: 'POST', body: { action: 'open' } });
      toast('마니또 추측 접수를 열었습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  $('#close-guesses').addEventListener('click', async (event) => {
    if (!state.activity || !confirm('추측 접수를 마감할까요? 학생들은 더 이상 선택을 바꿀 수 없습니다.')) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await api(`/api/admin/activities/${state.activity.activity.id}/guessing`, { method: 'POST', body: { action: 'close' } });
      toast('마니또 추측 접수를 마감했습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  $('#copy-guess-winners').addEventListener('click', async () => {
    const winners = (state.activity?.guesses || []).filter((guess) => Number(guess.is_correct) === 1);
    if (!winners.length) return toast('아직 정답자가 없습니다.');
    const text = winners.map((guess) => `${guess.student_no}번 ${guess.student_name}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(`정답자 ${winners.length}명의 명단을 복사했습니다.`);
    } catch {
      toast('명단을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.');
    }
  });
  $('#mission-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.activity) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`/api/admin/activities/${state.activity.activity.id}/missions`, { method: 'POST', body: { category: form.get('category'), title: form.get('title'), description: form.get('description') } });
      formElement.reset();
      toast('미션을 추가했습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
  });
  $('#install-jeju-missions').addEventListener('click', async (event) => {
    if (!state.activity || !confirm('제주 수학여행용 랜덤 미션 18개를 이 활동에 등록할까요?')) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await api(`/api/admin/activities/${state.activity.activity.id}/missions/jeju`, { method: 'POST', body: {} });
      toast(`제주 미션 ${result.count}개를 등록했습니다.`);
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  $('#reset-draw').addEventListener('click', async () => {
    if (!state.activity || !confirm('모든 학생의 카드 선택을 초기화할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    try {
      await api(`/api/admin/activities/${state.activity.activity.id}/reset`, { method: 'POST', body: { confirm: 'RESET' } });
      toast('카드 선택을 초기화했습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
  });
  $('#full-reset-activity').addEventListener('click', async (event) => {
    if (!state.activity) return;
    const resetPins = $('#full-reset-pins').checked;
    const answer = prompt(`선택한 활동의 배정·미션 결과·인증사진·방명록이 모두 삭제됩니다.${resetPins ? '\n학생들의 PIN도 모두 초기화됩니다.' : ''}\n\n계속하려면 '전체초기화'를 입력하세요.`);
    if (answer !== '전체초기화') {
      if (answer !== null) toast('확인 문구가 일치하지 않아 취소했습니다.');
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await api(`/api/admin/activities/${state.activity.activity.id}/full-reset`, { method: 'POST', body: { confirm: 'FULL_RESET', resetPins } });
      const deleted = result.deleted;
      toast(`전체 초기화 완료 · 배정 ${deleted.assignments}건, 인증 ${deleted.proofs}건, 메시지 ${deleted.guestbooks}건 삭제`);
      $('#full-reset-pins').checked = false;
      await loadActivity(state.activity.activity.id);
      await loadClasses();
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
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
  $('#board-admin-list').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-board-post-id]');
    if (!button || !state.activity) return;
    try {
      await api(`/api/admin/board/${button.dataset.boardPostId}/visibility`, { method: 'POST', body: { hidden: button.dataset.hidden !== '1' } });
      toast('자유게시판 글의 표시 상태를 변경했습니다.');
      await loadActivity(state.activity.activity.id);
    } catch (error) { toast(error.message); }
  });
  $('#student-space-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-student-space]');
    if (!button || !state.activity) return;
    state.selectedStudentId = Number(button.dataset.studentSpace);
    renderStudentSpaces(state.activity);
  });
  $('#student-space-detail').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-reset-student-pin]');
    if (!button || !state.activity) return;
    const student = state.activity.students.find((item) => item.id === Number(button.dataset.resetStudentPin));
    if (!student || !confirm(`${student.student_no}번 ${student.name} 학생의 PIN을 초기화할까요?\n기존 활동 기록은 유지되고, 학생은 다음 로그인에서 새 PIN을 정하게 됩니다.`)) return;
    button.disabled = true;
    try {
      await api(`/api/admin/students/${student.id}/reset-pin`, { method: 'POST', body: {} });
      toast(`${student.name} 학생의 PIN을 초기화했습니다.`);
      await loadActivity(state.activity.activity.id);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  });
  $('#select-all-student-pins').addEventListener('change', (event) => {
    $$('[data-student-pin-select]').forEach((input) => { input.checked = event.target.checked; });
    updatePinSelectionCount();
  });
  $('#student-space-list').addEventListener('change', (event) => {
    if (event.target.matches('[data-student-pin-select]')) updatePinSelectionCount();
  });
  $('#reset-selected-pins').addEventListener('click', () => resetPins(false));
  $('#reset-all-pins').addEventListener('click', () => resetPins(true));
}

function updatePinSelectionCount() {
  const inputs = $$('[data-student-pin-select]');
  const selected = inputs.filter((input) => input.checked).length;
  $('#selected-pin-count').textContent = `${selected}명 선택`;
  $('#select-all-student-pins').checked = inputs.length > 0 && selected === inputs.length;
  $('#select-all-student-pins').indeterminate = selected > 0 && selected < inputs.length;
}

async function resetPins(all) {
  if (!state.activity) return;
  const studentIds = $$('[data-student-pin-select]:checked').map((input) => Number(input.value));
  if (!all && !studentIds.length) return toast('PIN을 초기화할 학생을 선택하세요.');
  const count = all ? state.activity.students.filter((student) => student.active).length : studentIds.length;
  if (!confirm(`${all ? '전체 학생' : `선택한 ${count}명`}의 PIN을 초기화할까요?\n학생은 다음 로그인에서 새 PIN을 정하게 됩니다.`)) return;
  try {
    const result = await api(`/api/admin/classes/${state.activity.activity.class_id}/reset-pins`, { method: 'POST', body: all ? { all: true } : { studentIds } });
    toast(`${result.count}명의 PIN을 초기화했습니다.`);
    await loadActivity(state.activity.activity.id);
  } catch (error) { toast(error.message); }
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
  const exclusionClass = $('#exclusion-class-select');
  if (!exclusionClass.value && data.classes.length) exclusionClass.value = String(data.classes[0].id);
  if (exclusionClass.value) await loadAssignmentExclusions(Number(exclusionClass.value));
}

async function loadAssignmentExclusions(classId) {
  if (!classId) {
    $('#exclusion-list').innerHTML = '<div class="empty">학급을 선택해 주세요.</div>';
    return;
  }
  try {
    const data = await api(`/api/admin/classes/${classId}/exclusions`);
    const options = '<option value="">학생을 선택하세요</option>' + data.students.map((student) => `<option value="${student.id}">${student.student_no}번 ${esc(student.name)}</option>`).join('');
    const first = $('#exclusion-student-a');
    const second = $('#exclusion-student-b');
    const previousFirst = first.value;
    const previousSecond = second.value;
    first.innerHTML = options;
    second.innerHTML = options;
    if ([...first.options].some((option) => option.value === previousFirst)) first.value = previousFirst;
    if ([...second.options].some((option) => option.value === previousSecond)) second.value = previousSecond;
    $('#exclusion-list').innerHTML = data.exclusions.length ? data.exclusions.map((item) => `<article class="exclusion-item"><div><b>${item.student_a_no}번 ${esc(item.student_a_name)}</b><span>↔</span><b>${item.student_b_no}번 ${esc(item.student_b_name)}</b></div><small>양방향 배정 제외</small><button class="danger-btn" data-delete-exclusion="${item.id}" type="button">삭제</button></article>`).join('') : '<div class="empty">등록된 제외 관계가 없습니다.</div>';
  } catch (error) {
    $('#exclusion-list').innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
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
  const guessSubmitted = (data.guesses || []).filter((guess) => guess.guess_status === 'submitted').length;
  $('#guess-progress-label').textContent = `${guessSubmitted} / ${activeStudents}명 제출`;
  const canManageGuessing = data.activity.status === 'active';
  $('#open-guesses').classList.toggle('hidden', !canManageGuessing || Boolean(data.activity.guessing_open));
  $('#close-guesses').classList.toggle('hidden', !canManageGuessing || !Boolean(data.activity.guessing_open));
  $('#mission-admin-list').innerHTML = data.missions.length ? data.missions.map((mission) => `<span>${missionCategoryName(mission.category)} · ${esc(mission.title)}</span>`).join('') : '<span>등록된 미션 없음</span>';
  renderAdminRecords(data);
  renderStudentSpaces(data);
}

function renderAdminRecords(data) {
  const guesses = data.guesses || [];
  const revealed = data.activity.status === 'revealed';
  const submitted = guesses.filter((guess) => guess.guess_status === 'submitted').length;
  const drafts = guesses.filter((guess) => guess.guess_status === 'draft').length;
  const correct = revealed ? guesses.filter((guess) => Number(guess.is_correct) === 1).length : 0;
  const wrong = revealed ? guesses.filter((guess) => guess.is_correct !== null && guess.is_correct !== undefined && Number(guess.is_correct) === 0).length : 0;
  const pending = guesses.length - submitted - drafts;
  $('#guess-admin-summary').innerHTML = `<span>최종 제출 <b>${submitted}/${guesses.length}명</b></span><span>임시저장 <b>${drafts}명</b></span>${revealed ? `<span class="correct">정답 <b>${correct}명</b></span><span class="wrong">오답 <b>${wrong}명</b></span>` : '<span>정체 공개 후 정오답 표시</span>'}<span>미작성 <b>${pending}명</b></span>`;
  $('#copy-guess-winners').disabled = !revealed || correct === 0;
  $('#guess-admin-list').innerHTML = guesses.length ? `<table><thead><tr><th>학생</th><th>선택한 친구</th><th>실제 마니또</th><th>결과</th><th>제출 시각</th></tr></thead><tbody>${guesses.map((guess) => {
    const pickedStudent = guess.guessed_giver_id ? `${guess.guessed_student_no}번 ${esc(guess.guessed_student_name)}` : '미작성';
    const actualGiver = revealed ? (guess.actual_giver_id ? `${guess.actual_giver_no}번 ${esc(guess.actual_giver_name)}` : '배정 전') : '정체 공개 후 표시';
    const result = guess.guess_status === 'draft'
      ? '<span class="mini-status">임시저장</span>'
      : guess.guess_status === 'submitted' && !revealed
      ? '<span class="mini-status approved">최종 제출</span>'
      : guess.is_correct === null || guess.is_correct === undefined
      ? '<span class="mini-status">미작성</span>'
      : Number(guess.is_correct) === 1
        ? '<span class="mini-status approved">정답</span>'
        : '<span class="mini-status rejected">오답</span>';
    return `<tr><td>${guess.student_no}번 ${esc(guess.student_name)}</td><td>${pickedStudent}</td><td>${actualGiver}</td><td>${result}</td><td>${guess.final_submitted_at ? formatDate(guess.final_submitted_at) : guess.updated_at ? `임시 ${formatDate(guess.updated_at)}` : '-'}</td></tr>`;
  }).join('')}</tbody></table>` : '<div class="empty">활동 학생이 없습니다.</div>';
  $('#assignment-list').innerHTML = data.assignments.length ? `<table><thead><tr><th>카드</th><th>뽑은 학생</th><th>마니또 대상</th><th>미션 현황</th><th>선택 시각</th></tr></thead><tbody>${data.assignments.map((item) => `<tr><td>${item.card_index}</td><td>${item.giver_no}번 ${esc(item.giver_name)}</td><td>${item.receiver_no}번 ${esc(item.receiver_name)}</td><td>${item.mission_count ? `${item.approved_count} / ${item.mission_count} 승인` : '미션 미추첨'}</td><td>${formatDate(item.chosen_at)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">아직 카드를 뽑은 학생이 없습니다.</div>';
  $('#proof-admin-list').innerHTML = data.proofs.length ? data.proofs.map((proof) => `<article class="review-item"><div class="review-head"><div><h3>${proof.student_no}번 ${esc(proof.student_name)} · ${esc(proof.mission_title)}</h3><p>${esc(proof.proof_text || '사진 인증')}</p></div><span class="mini-status ${esc(proof.status)}">${proofStatusName(proof.status)}</span></div>${proof.photoUrl ? `<img class="review-image" src="${proof.photoUrl}" alt="미션 인증 사진" loading="lazy">` : ''}<div class="review-actions"><button class="secondary-btn" data-proof-id="${proof.id}" data-proof-status="approved" type="button">승인</button><button class="danger-btn" data-proof-id="${proof.id}" data-proof-status="rejected" type="button">반려</button></div></article>`).join('') : '<div class="empty">제출된 인증이 없습니다.</div>';
  $('#guestbook-admin-list').innerHTML = data.guestbook.length ? data.guestbook.map((entry) => `<article class="review-item"><div class="review-head"><div><h3>${esc(entry.author_name)} → ${esc(entry.target_name)}</h3><p>${esc(entry.message)}</p></div><span class="mini-status">${entry.visibility === 'private' ? '받는 학생만' : entry.display_mode === 'anonymous' ? '전체 공개 · 익명' : '전체 공개'}</span></div><div class="review-actions"><button class="${entry.hidden ? 'secondary-btn' : 'danger-btn'}" data-entry-id="${entry.id}" data-hidden="${entry.hidden}" type="button">${entry.hidden ? '다시 표시' : '숨기기'}</button></div></article>`).join('') : '<div class="empty">작성된 방명록이 없습니다.</div>';
  $('#board-admin-list').innerHTML = data.board.length ? data.board.map((entry) => `<article class="review-item"><div class="review-head"><div><h3>${entry.student_no}번 ${esc(entry.author_name)}</h3><p>${esc(entry.message)}</p><small>${formatDate(entry.created_at)}</small></div><span class="mini-status">${entry.display_mode === 'anonymous' ? '학생에게 익명' : '이름 공개'}</span></div><div class="review-actions"><button class="${entry.hidden ? 'secondary-btn' : 'danger-btn'}" data-board-post-id="${entry.id}" data-hidden="${entry.hidden}" type="button">${entry.hidden ? '다시 표시' : '숨기기'}</button></div></article>`).join('') : '<div class="empty">작성된 자유게시판 글이 없습니다.</div>';
}

function renderStudentSpaces(data) {
  const students = data.students.filter((student) => student.active);
  if (!students.length) {
    $('#student-space-list').innerHTML = '<div class="empty">등록된 학생이 없습니다.</div>';
    $('#student-space-detail').innerHTML = '<div class="empty">학생 명단을 먼저 등록하세요.</div>';
    return;
  }
  if (!students.some((student) => student.id === state.selectedStudentId)) state.selectedStudentId = students[0].id;
  $('#student-space-list').innerHTML = students.map((student) => {
    const receivedGuestbooks = data.guestbook.filter((entry) => entry.target_student_id === student.id).length;
    const giver = data.assignments.find((assignment) => assignment.receiver_id === student.id);
    const receivedProofs = giver ? data.proofs.filter((proof) => proof.student_id === giver.giver_id).length : 0;
    return `<div class="student-space-row"><label class="student-pin-check" title="PIN 초기화 대상으로 선택"><input type="checkbox" value="${student.id}" data-student-pin-select aria-label="${student.student_no}번 ${esc(student.name)} PIN 초기화 대상으로 선택"></label><button class="student-space-button ${student.id === state.selectedStudentId ? 'active' : ''}" data-student-space="${student.id}" type="button"><span>${student.student_no}번</span><b>${esc(student.name)}</b><small>메시지 ${receivedGuestbooks} · 인증 ${receivedProofs}</small></button></div>`;
  }).join('');
  updatePinSelectionCount();

  const student = students.find((item) => item.id === state.selectedStudentId);
  const givesTo = data.assignments.find((assignment) => assignment.giver_id === student.id);
  const receivesFrom = data.assignments.find((assignment) => assignment.receiver_id === student.id);
  const receivedGuestbooks = data.guestbook.filter((entry) => entry.target_student_id === student.id);
  const sentGuestbooks = data.guestbook.filter((entry) => entry.author_student_id === student.id);
  const sentProofs = data.proofs.filter((proof) => proof.student_id === student.id);
  const boardPosts = data.board.filter((entry) => entry.author_student_id === student.id);
  const receivedProofs = receivesFrom ? data.proofs.filter((proof) => proof.student_id === receivesFrom.giver_id) : [];
  const relationship = `<div class="student-space-summary"><div><span>내가 챙길 친구</span><strong>${givesTo ? `${givesTo.receiver_no}번 ${esc(givesTo.receiver_name)}` : '아직 미배정'}</strong></div><div><span>나를 챙기는 마니또</span><strong>${receivesFrom ? `${receivesFrom.giver_no}번 ${esc(receivesFrom.giver_name)}` : '아직 미배정'}</strong></div></div>`;
  $('#student-space-detail').classList.remove('empty');
  $('#student-space-detail').innerHTML = `<div class="student-space-title"><div><span class="class-code">${student.student_no}번</span><h2>${esc(student.name)} 학생의 공간</h2></div><div class="student-space-tools"><span class="mini-status ${student.pin_initialized ? 'approved' : ''}">${student.pin_initialized ? 'PIN 등록됨' : 'PIN 설정 대기'}</span><button class="danger-btn" data-reset-student-pin="${student.id}" type="button">PIN 초기화</button></div></div>
    ${relationship}
    ${studentSpaceSection('받은 방명록', `${receivedGuestbooks.length}건`, receivedGuestbooks.map((entry) => guestbookSpaceCard(entry, '받음')).join(''))}
    ${studentSpaceSection('마니또에게 받은 미션 인증', `${receivedProofs.length}건`, receivedProofs.map((proof) => proofSpaceCard(proof, receivesFrom ? `${receivesFrom.giver_no}번 ${receivesFrom.giver_name}` : '')).join(''))}
    ${studentSpaceSection('내가 보낸 미션 인증', `${sentProofs.length}건`, sentProofs.map((proof) => proofSpaceCard(proof, givesTo ? `${givesTo.receiver_no}번 ${givesTo.receiver_name}에게` : '')).join(''))}
    ${studentSpaceSection('작성한 방명록', `${sentGuestbooks.length}건`, sentGuestbooks.map((entry) => guestbookSpaceCard(entry, `${esc(entry.target_name)}에게`)).join(''))}
    ${studentSpaceSection('작성한 자유게시판 글', `${boardPosts.length}건`, boardPosts.map(boardSpaceCard).join(''))}`;
}

function studentSpaceSection(title, count, content) {
  return `<section class="student-space-section"><header><h3>${title}</h3><span>${count}</span></header><div class="student-space-items">${content || '<div class="empty compact-empty">아직 기록이 없습니다.</div>'}</div></section>`;
}

function guestbookSpaceCard(entry, direction) {
  return `<article class="space-entry"><div class="space-entry-head"><b>${direction} · ${esc(entry.author_name)} → ${esc(entry.target_name)}</b><span class="mini-status">${entry.hidden ? '숨김' : entry.display_mode === 'anonymous' ? '학생에게 익명' : '공개'}</span></div><p>${esc(entry.message)}</p><small>${formatDate(entry.created_at)}</small></article>`;
}

function proofSpaceCard(proof, relation) {
  return `<article class="space-entry"><div class="space-entry-head"><div><b>${esc(proof.mission_title)}</b>${relation ? `<small>${relation}</small>` : ''}</div><span class="mini-status ${esc(proof.status)}">${proofStatusName(proof.status)}</span></div><p>${esc(proof.proof_text || '사진으로 인증했습니다.')}</p>${proof.photoUrl ? `<a class="space-photo-link" href="${esc(proof.photoUrl)}" target="_blank" rel="noopener"><img src="${esc(proof.photoUrl)}" alt="미션 인증 사진" loading="lazy"><span>사진 크게 보기</span></a>` : ''}<small>${formatDate(proof.submitted_at)}</small></article>`;
}

function boardSpaceCard(entry) {
  return `<article class="space-entry"><div class="space-entry-head"><b>${entry.display_mode === 'anonymous' ? '익명으로 작성' : '이름 공개'}</b><span class="mini-status">${entry.hidden ? '숨김' : '표시 중'}</span></div><p>${esc(entry.message)}</p><small>${formatDate(entry.created_at)}</small></article>`;
}

function renderCredentials(rows) {
  $('#credential-card').classList.remove('hidden');
  $('#credential-list').innerHTML = rows.map((row) => `<tr><td>${row.studentNo}</td><td>${esc(row.name)}</td><td><b>${row.pin ? esc(row.pin) : '학생이 첫 로그인에서 설정'}</b></td></tr>`).join('');
  $('#credential-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearRecords() {
  $('#guess-admin-summary').innerHTML = '';
  $('#guess-admin-list').innerHTML = '<div class="empty">활동을 선택해 주세요.</div>';
  $('#copy-guess-winners').disabled = true;
  $('#assignment-list').innerHTML = '<div class="empty">활동을 선택해 주세요.</div>';
  $('#proof-admin-list').innerHTML = '';
  $('#guestbook-admin-list').innerHTML = '';
  $('#board-admin-list').innerHTML = '';
  $('#student-space-list').innerHTML = '<div class="empty">활동을 선택해 주세요.</div>';
  $('#student-space-detail').classList.add('empty');
  $('#student-space-detail').innerHTML = '왼쪽에서 학생을 선택하세요.';
  state.selectedStudentId = null;
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
  showOnly('#welcome-view');
  $('#logout-btn').classList.add('hidden');
  const tab = $(`.tab[data-tab="${tabId}"]`);
  if (tab) tab.click();
}

function proofStatusName(status) {
  return ({ submitted: '검토 대기', approved: '승인됨', rejected: '다시 제출', 미제출: '미제출' })[status] || status;
}

function missionCategoryName(category) {
  return ({ snack: '간식 선물', help: '여행 도움', memory: '제주 추억', general: '일반 미션' })[category] || '일반 미션';
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
