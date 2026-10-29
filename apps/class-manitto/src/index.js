import { chooseReceiver } from './matching.js';

const COOKIE_NAME = 'manitto_session';
const STUDENT_SESSION_DAYS = 14;
const ADMIN_SESSION_HOURS = 12;
const JEJU_MISSIONS = [
  ['snack', '제주 간식과 응원 쪽지', '제주에서 고른 포장 간식에 짧은 응원 쪽지를 붙여 마니또에게 몰래 전달하고 사진으로 인증하세요.'],
  ['snack', '숙소 비밀 간식 찾기', '숙소 안의 안전한 장소에 포장된 젤리·사탕·과자를 숨기고, 마니또가 찾을 수 있는 힌트 사진을 올리세요. 발견 후에는 반드시 회수 여부를 확인하세요.'],
  ['snack', '감귤 간식 선물', '감귤과 관련된 포장 간식 하나를 골라 마니또에게 전달하고 사진으로 인증하세요.'],
  ['snack', '여행 간식 꾸러미', '작은 간식 두 가지를 여행 꾸러미처럼 준비해 마니또에게 전하고 인증하세요.'],
  ['snack', '숙소 야식 선물', '숙소에서 먹을 수 있는 컵라면이나 포장 간식을 준비해 전달하고 인증하세요.'],
  ['snack', '행운의 음료 선물', '마니또가 좋아할 것 같은 음료에 짧은 행운 메시지를 붙여 전달하고 인증하세요.'],
  ['help', '여행 준비 도우미', '마니또가 이동이나 준비 과정에서 곤란해할 때 자연스럽게 한 가지를 도와주고, 상황을 알아볼 수 있는 사진과 글로 인증하세요.'],
  ['help', '식사 시간 챙김 미션', '식사 시간에 마니또의 물·수저·휴지 등을 자연스럽게 챙겨 주고 인증하세요.'],
  ['help', '분실물 지킴이', '버스나 숙소에서 이동하기 전 마니또가 두고 가는 물건이 없는지 살펴주고 글이나 사진으로 인증하세요.'],
  ['help', '단체사진 도우미', '단체사진을 찍을 때 마니또가 빠지지 않고 잘 나올 수 있도록 챙겨 주고 인증하세요.'],
  ['help', '피곤할 때 응원하기', '여행 중 마니또가 피곤해 보일 때 따뜻한 응원 메시지나 작은 도움을 건네고 인증하세요.'],
  ['help', '숙소 정리 도우미', '숙소에서 마니또가 해야 할 정리나 준비를 한 가지 자연스럽게 도와주고 인증하세요.'],
  ['memory', '제주 풍경 하트', '아름다운 제주 풍경을 배경으로 손이나 소품으로 하트를 만들어 찍고 마니또를 위한 한마디와 함께 올리세요.'],
  ['memory', '마니또에게 보여 줄 제주', '마니또에게 꼭 보여주고 싶은 제주 풍경을 촬영해 그 이유와 함께 올리세요.'],
  ['memory', '돌하르방 추억 사진', '돌하르방과 재미있는 포즈 또는 구도로 사진을 찍어 마니또에게 선물하세요.'],
  ['memory', '제주 별명 만들기', '마니또에게 어울리는 제주 여행 별명을 지어 풍경 사진과 함께 올리세요.'],
  ['memory', '칭찬 한 장면', '여행 중 마니또가 잘하거나 배려한 순간을 찾아, 개인정보가 드러나지 않는 사진과 칭찬 글로 인증하세요.'],
  ['memory', '제주 여행 편지', '제주를 떠나기 전 마니또에게 전할 짧은 여행 편지를 쓰고 제주 풍경과 함께 인증하세요.'],
];

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) {
        return addSecurityHeaders(await env.ASSETS.fetch(request));
      }
      if (!env.DB) return json({ error: 'D1 데이터베이스가 연결되지 않았습니다.' }, 503);
      if (request.method !== 'GET') verifySameOrigin(request);
      return addSecurityHeaders(await routeApi(request, env, url));
    } catch (error) {
      console.error(error);
      const status = error.status || 500;
      return addSecurityHeaders(json({ error: status === 500 ? '서버에서 문제가 발생했습니다.' : error.message }, status));
    }
  },
};

async function routeApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  if (method === 'POST' && pathname === '/api/auth/student') return studentLogin(request, env);
  if (method === 'POST' && pathname === '/api/auth/admin') return adminLogin(request, env);
  if (method === 'POST' && pathname === '/api/auth/logout') return logout(request, env);
  if (method === 'GET' && pathname === '/api/session') return sessionView(request, env);
  if (method === 'GET' && pathname === '/api/draw/board') return drawBoard(url, env);

  if (method === 'GET' && pathname === '/api/student/dashboard') return studentDashboard(request, env);
  const studentSpaceMatch = pathname.match(/^\/api\/student\/spaces\/(\d+)$/);
  if (method === 'GET' && studentSpaceMatch) return studentPublicSpace(request, env, Number(studentSpaceMatch[1]));
  if (method === 'POST' && pathname === '/api/student/draw') return drawCard(request, env);
  if (method === 'POST' && pathname === '/api/student/missions/draw') return drawStudentMissions(request, env);
  if (method === 'POST' && pathname === '/api/student/guestbook') return addGuestbook(request, env);
  if (method === 'POST' && pathname === '/api/student/board') return addBoardPost(request, env);
  if (method === 'POST' && pathname === '/api/student/proofs') return submitProof(request, env);
  if (method === 'POST' && pathname === '/api/student/guess') return submitManittoGuess(request, env);
  if (method === 'POST' && pathname === '/api/student/profile-photo') return updateProfilePhoto(request, env);
  if (method === 'DELETE' && pathname === '/api/student/profile-photo') return deleteProfilePhoto(request, env);

  const photoMatch = pathname.match(/^\/api\/photos\/(\d+)$/);
  if (method === 'GET' && photoMatch) return getProofPhoto(request, env, Number(photoMatch[1]));
  const profilePhotoMatch = pathname.match(/^\/api\/profile-photos\/(\d+)$/);
  if (method === 'GET' && profilePhotoMatch) return getProfilePhoto(request, env, Number(profilePhotoMatch[1]));

  if (method === 'GET' && pathname === '/api/admin/classes') return listClasses(request, env);
  if (method === 'POST' && pathname === '/api/admin/classes') return createClass(request, env);
  if (method === 'POST' && pathname === '/api/admin/students/import') return importStudents(request, env);

  const classCodeMatch = pathname.match(/^\/api\/admin\/classes\/(\d+)\/access-code$/);
  if (method === 'POST' && classCodeMatch) return updateClassAccessCode(request, env, Number(classCodeMatch[1]));
  const classStudentsMatch = pathname.match(/^\/api\/admin\/classes\/(\d+)\/students$/);
  if (method === 'GET' && classStudentsMatch) return listStudents(request, env, Number(classStudentsMatch[1]));
  const classExclusionsMatch = pathname.match(/^\/api\/admin\/classes\/(\d+)\/exclusions$/);
  if (method === 'GET' && classExclusionsMatch) return listAssignmentExclusions(request, env, Number(classExclusionsMatch[1]));
  if (method === 'POST' && classExclusionsMatch) return addAssignmentExclusion(request, env, Number(classExclusionsMatch[1]));
  const exclusionMatch = pathname.match(/^\/api\/admin\/exclusions\/(\d+)$/);
  if (method === 'DELETE' && exclusionMatch) return deleteAssignmentExclusion(request, env, Number(exclusionMatch[1]));
  const resetStudentPinMatch = pathname.match(/^\/api\/admin\/students\/(\d+)\/reset-pin$/);
  if (method === 'POST' && resetStudentPinMatch) return resetStudentPin(request, env, Number(resetStudentPinMatch[1]));
  const resetClassPinsMatch = pathname.match(/^\/api\/admin\/classes\/(\d+)\/reset-pins$/);
  if (method === 'POST' && resetClassPinsMatch) return resetClassPins(request, env, Number(resetClassPinsMatch[1]));

  if (method === 'POST' && pathname === '/api/admin/activities') return createActivity(request, env);
  const activityMatch = pathname.match(/^\/api\/admin\/activities\/(\d+)$/);
  if (method === 'GET' && activityMatch) return activityDetail(request, env, Number(activityMatch[1]));
  const statusMatch = pathname.match(/^\/api\/admin\/activities\/(\d+)\/status$/);
  if (method === 'POST' && statusMatch) return updateActivityStatus(request, env, Number(statusMatch[1]));
  const guessingMatch = pathname.match(/^\/api\/admin\/activities\/(\d+)\/guessing$/);
  if (method === 'POST' && guessingMatch) return updateGuessingWindow(request, env, Number(guessingMatch[1]));
  const resetMatch = pathname.match(/^\/api\/admin\/activities\/(\d+)\/reset$/);
  if (method === 'POST' && resetMatch) return resetDraw(request, env, Number(resetMatch[1]));
  const fullResetMatch = pathname.match(/^\/api\/admin\/activities\/(\d+)\/full-reset$/);
  if (method === 'POST' && fullResetMatch) return fullResetActivity(request, env, Number(fullResetMatch[1]));
  const missionMatch = pathname.match(/^\/api\/admin\/activities\/(\d+)\/missions$/);
  if (method === 'POST' && missionMatch) return createMission(request, env, Number(missionMatch[1]));
  const jejuMissionMatch = pathname.match(/^\/api\/admin\/activities\/(\d+)\/missions\/jeju$/);
  if (method === 'POST' && jejuMissionMatch) return installJejuMissions(request, env, Number(jejuMissionMatch[1]));
  const reviewMatch = pathname.match(/^\/api\/admin\/proofs\/(\d+)\/review$/);
  if (method === 'POST' && reviewMatch) return reviewProof(request, env, Number(reviewMatch[1]));
  const hideMatch = pathname.match(/^\/api\/admin\/guestbook\/(\d+)\/visibility$/);
  if (method === 'POST' && hideMatch) return setGuestbookVisibility(request, env, Number(hideMatch[1]));
  const boardHideMatch = pathname.match(/^\/api\/admin\/board\/(\d+)\/visibility$/);
  if (method === 'POST' && boardHideMatch) return setBoardPostVisibility(request, env, Number(boardHideMatch[1]));

  throw httpError(404, '요청한 기능을 찾을 수 없습니다.');
}

async function studentLogin(request, env) {
  if (!env.SESSION_SECRET) throw httpError(503, '세션 비밀 변수가 설정되지 않았습니다.');
  const body = await readJson(request);
  const classCode = clean(body.classCode).toUpperCase();
  const studentNo = Number(body.studentNo);
  const name = normalizeName(body.name);
  const pin = clean(body.pin);
  if (!classCode || !Number.isInteger(studentNo) || !name || !pin) throw httpError(400, '반 코드, 번호, 이름, PIN을 모두 입력하세요.');

  const student = await env.DB.prepare(`
    SELECT s.*, c.access_code, c.name AS class_name
    FROM students s JOIN classes c ON c.id = s.class_id
    WHERE c.access_code = ? AND s.student_no = ? AND s.normalized_name = ? AND s.active = 1
  `).bind(classCode, studentNo, name).first();
  if (!student) throw httpError(401, '학생 정보를 확인할 수 없습니다.');
  let pinCreated = false;
  if (!student.pin_initialized) {
    if (!/^\d{4}$/.test(pin)) throw httpError(400, '처음 사용할 개인 PIN은 숫자 4자리로 정하세요.');
    const secured = await hashSecret(pin);
    await env.DB.prepare('UPDATE students SET pin_hash=?,pin_salt=?,pin_initialized=1 WHERE id=? AND pin_initialized=0')
      .bind(secured.hash, secured.salt, student.id).run();
    pinCreated = true;
  } else if (!(await verifySecret(pin, student.pin_salt, student.pin_hash))) {
    throw httpError(401, '학생 정보를 확인할 수 없습니다.');
  }

  const session = await createSession(env, { role: 'student', studentId: student.id, classId: student.class_id, hours: STUDENT_SESSION_DAYS * 24 });
  return withCookie(json({ ok: true, role: 'student', name: student.name, className: student.class_name, pinCreated }), session.cookie, request, STUDENT_SESSION_DAYS * 86400);
}

async function adminLogin(request, env) {
  const body = await readJson(request);
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) throw httpError(503, '관리자 비밀 변수가 설정되지 않았습니다.');
  if (!constantEqual(clean(body.password), env.ADMIN_PASSWORD)) throw httpError(401, '관리자 비밀번호가 올바르지 않습니다.');
  const session = await createSession(env, { role: 'admin', studentId: null, classId: null, hours: ADMIN_SESSION_HOURS });
  return withCookie(json({ ok: true, role: 'admin' }), session.cookie, request, ADMIN_SESSION_HOURS * 3600);
}

async function logout(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(`${token}.${env.SESSION_SECRET || ''}`)).run();
  const response = json({ ok: true });
  response.headers.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return response;
}

async function sessionView(request, env) {
  const session = await getSession(request, env, false);
  if (!session) return json({ authenticated: false });
  if (session.role === 'student') {
    const student = await env.DB.prepare(`SELECT s.name, s.student_no, c.name AS class_name, c.access_code
      FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=?`).bind(session.student_id).first();
    return json({ authenticated: true, role: 'student', student });
  }
  return json({ authenticated: true, role: 'admin' });
}

async function drawBoard(url, env) {
  const code = clean(url.searchParams.get('code')).toUpperCase();
  if (!code) throw httpError(400, '반 코드를 입력하세요.');
  const row = await env.DB.prepare(`
    SELECT a.id, a.title, a.status, c.name AS class_name,
      (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id AND s.active=1) AS student_count
    FROM classes c JOIN activities a ON a.class_id=c.id
    WHERE c.access_code=? AND a.status IN ('drawing','active','revealed')
    ORDER BY a.id DESC LIMIT 1
  `).bind(code).first();
  if (!row) throw httpError(404, '진행 중인 마니또 활동이 없습니다.');
  const used = await env.DB.prepare('SELECT card_index FROM assignments WHERE activity_id=? ORDER BY card_index').bind(row.id).all();
  return json({ ...row, usedCards: used.results.map((item) => item.card_index) });
}

async function studentDashboard(request, env) {
  const session = await requireRole(request, env, 'student');
  const student = await env.DB.prepare(`SELECT s.id, s.name, s.student_no, s.class_id, s.profile_photo_key, c.name AS class_name, c.access_code
    FROM students s JOIN classes c ON c.id=s.class_id WHERE s.id=?`).bind(session.student_id).first();
  const activity = await env.DB.prepare(`SELECT * FROM activities WHERE class_id=? AND status <> 'closed' ORDER BY id DESC LIMIT 1`)
    .bind(student.class_id).first();
  if (!activity) return json({ student: withProfilePhoto(student), activity: null });

  const assignment = await env.DB.prepare(`
    SELECT a.card_index, a.chosen_at, r.id AS receiver_id, r.student_no AS receiver_no, r.name AS receiver_name
    FROM assignments a JOIN students r ON r.id=a.receiver_id
    WHERE a.activity_id=? AND a.giver_id=?
  `).bind(activity.id, student.id).first();
  const savedGuess = await env.DB.prepare(`
    SELECT mg.guessed_giver_id, mg.status, mg.submitted_at, mg.final_submitted_at, mg.updated_at,
      guessed.student_no AS guessed_student_no, guessed.name AS guessed_student_name
    FROM manitto_guesses mg JOIN students guessed ON guessed.id=mg.guessed_giver_id
    WHERE mg.activity_id=? AND mg.student_id=?
  `).bind(activity.id, student.id).first();
  let guess = savedGuess || null;
  if (activity.status === 'revealed') {
    const actualGiver = await env.DB.prepare(`
      SELECT giver.id AS actual_giver_id, giver.student_no AS actual_giver_no, giver.name AS actual_giver_name
      FROM assignments a JOIN students giver ON giver.id=a.giver_id
      WHERE a.activity_id=? AND a.receiver_id=?
    `).bind(activity.id, student.id).first();
    guess = {
      ...(savedGuess || { guessed_giver_id: null, guessed_student_no: null, guessed_student_name: null, status: null, submitted_at: null, final_submitted_at: null, updated_at: null }),
      ...(actualGiver || { actual_giver_id: null, actual_giver_no: null, actual_giver_name: null }),
      is_correct: Boolean(savedGuess?.status === 'submitted' && actualGiver && Number(savedGuess.guessed_giver_id) === Number(actualGiver.actual_giver_id)),
    };
  }
  const missions = await env.DB.prepare(`
    SELECT m.*, p.id AS proof_id, p.proof_text, p.photo_key, p.status AS proof_status, p.teacher_note, p.submitted_at
    FROM student_missions sm
    JOIN missions m ON m.id=sm.mission_id
    LEFT JOIN mission_proofs p ON p.mission_id=m.id AND p.student_id=sm.student_id
    WHERE sm.activity_id=? AND sm.student_id=? AND m.active=1
    ORDER BY CASE sm.category WHEN 'snack' THEN 1 WHEN 'help' THEN 2 WHEN 'memory' THEN 3 ELSE 4 END
  `).bind(activity.id, student.id).all();
  const guestbook = await env.DB.prepare(`
    SELECT g.id, g.message, g.display_mode, g.visibility, g.created_at,
      CASE WHEN g.display_mode='public' OR ?='revealed' THEN s.name ELSE '익명의 친구' END AS author_name
    FROM guestbook_entries g JOIN students s ON s.id=g.author_student_id
    WHERE g.activity_id=? AND g.target_student_id=? AND g.hidden=0 ORDER BY g.id DESC
  `).bind(activity.status, activity.id, student.id).all();
  const incomingProofs = await env.DB.prepare(`
    SELECT p.id, p.proof_text, p.photo_key, p.status, p.submitted_at, m.title AS mission_title,
      CASE WHEN ?='revealed' THEN giver.name ELSE '비밀 마니또' END AS author_name
    FROM assignments a
    JOIN students giver ON giver.id=a.giver_id
    JOIN mission_proofs p ON p.student_id=a.giver_id AND p.status='approved'
    JOIN missions m ON m.id=p.mission_id AND m.activity_id=a.activity_id
    WHERE a.activity_id=? AND a.receiver_id=? ORDER BY p.submitted_at DESC
  `).bind(activity.status, activity.id, student.id).all();
  const classmates = await env.DB.prepare('SELECT id, student_no, name, profile_photo_key FROM students WHERE class_id=? AND active=1 AND id<>? ORDER BY student_no')
    .bind(student.class_id, student.id).all();
  const usedCards = await env.DB.prepare('SELECT card_index FROM assignments WHERE activity_id=? ORDER BY card_index').bind(activity.id).all();
  const board = await env.DB.prepare(`
    SELECT b.id,b.message,b.display_mode,b.created_at,
      CASE WHEN b.display_mode='public' THEN s.name ELSE '익명의 친구' END AS author_name
    FROM board_posts b JOIN students s ON s.id=b.author_student_id
    WHERE b.activity_id=? AND b.hidden=0 ORDER BY b.id DESC LIMIT 100
  `).bind(activity.id).all();
  return json({
    student: withProfilePhoto(student),
    activity,
    assignment,
    guess,
    missions: missions.results.map((m) => ({ ...m, photoUrl: m.photo_key ? `/api/photos/${m.proof_id}` : null })),
    guestbook: guestbook.results,
    incomingProofs: incomingProofs.results.map((p) => ({ ...p, photoUrl: p.photo_key ? `/api/photos/${p.id}` : null })),
    classmates: classmates.results.map(withProfilePhoto),
    usedCards: usedCards.results.map((item) => item.card_index),
    board: board.results,
  });
}

async function studentPublicSpace(request, env, targetStudentId) {
  const session = await requireRole(request, env, 'student');
  const target = await env.DB.prepare(`SELECT id,student_no,name,profile_photo_key FROM students
    WHERE id=? AND class_id=? AND active=1`).bind(targetStudentId, session.class_id).first();
  if (!target || target.id === session.student_id) throw httpError(404, '친구의 미니홈피를 찾을 수 없습니다.');
  const activity = await env.DB.prepare(`SELECT id,status FROM activities
    WHERE class_id=? AND status <> 'closed' ORDER BY id DESC LIMIT 1`).bind(session.class_id).first();
  if (!activity) throw httpError(404, '진행 중인 활동이 없습니다.');
  const entries = await env.DB.prepare(`SELECT g.id,g.message,g.display_mode,g.created_at,
      CASE WHEN g.display_mode='public' THEN a.name ELSE '익명의 친구' END AS author_name
    FROM guestbook_entries g JOIN students a ON a.id=g.author_student_id
    WHERE g.activity_id=? AND g.target_student_id=? AND g.visibility='public' AND g.hidden=0
    ORDER BY g.id DESC`).bind(activity.id, target.id).all();
  return json({ student: withProfilePhoto(target), guestbook: entries.results });
}

async function submitManittoGuess(request, env) {
  const session = await requireRole(request, env, 'student');
  const body = await readJson(request);
  const status = body.action === 'submit' ? 'submitted' : body.action === 'draft' ? 'draft' : '';
  if (!status) throw httpError(400, '임시저장 또는 최종 제출을 선택하세요.');
  const guessedGiverId = Number(body.guessedStudentId);
  if (!Number.isInteger(guessedGiverId) || guessedGiverId === Number(session.student_id)) {
    throw httpError(400, '나의 마니또로 예상되는 친구를 선택하세요.');
  }

  const activity = await env.DB.prepare(`SELECT id,class_id,status,guessing_open FROM activities
    WHERE class_id=? AND status<>'closed' ORDER BY id DESC LIMIT 1`).bind(session.class_id).first();
  const guessingAllowed = activity?.status === 'drawing'
    || (activity?.status === 'active' && activity.guessing_open);
  if (!activity || !guessingAllowed) {
    throw httpError(409, '지금은 마니또를 추측하는 시간이 아닙니다.');
  }
  const candidate = await env.DB.prepare(`SELECT id FROM students
    WHERE id=? AND class_id=? AND active=1`).bind(guessedGiverId, session.class_id).first();
  if (!candidate) throw httpError(400, '같은 반의 학생을 선택하세요.');
  const incomingAssignment = await env.DB.prepare(`SELECT id FROM assignments
    WHERE activity_id=? AND receiver_id=?`).bind(activity.id, session.student_id).first();
  if (!incomingAssignment) throw httpError(409, '마니또 배정이 완료되지 않아 아직 추측할 수 없습니다.');

  const existing = await env.DB.prepare('SELECT status FROM manitto_guesses WHERE activity_id=? AND student_id=?')
    .bind(activity.id, session.student_id).first();
  if (existing?.status === 'submitted') throw httpError(409, '이미 최종 제출하여 추측을 바꿀 수 없습니다.');

  await env.DB.prepare(`
    INSERT INTO manitto_guesses(activity_id,student_id,guessed_giver_id,status,final_submitted_at)
    VALUES(?,?,?,?,CASE WHEN ?='submitted' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(activity_id,student_id) DO UPDATE SET
      guessed_giver_id=excluded.guessed_giver_id,
      status=excluded.status,
      final_submitted_at=excluded.final_submitted_at,
      updated_at=CURRENT_TIMESTAMP
  `).bind(activity.id, session.student_id, guessedGiverId, status, status).run();
  return json({ ok: true, status });
}

async function drawStudentMissions(request, env) {
  const session = await requireRole(request, env, 'student');
  const activity = await env.DB.prepare(`
    SELECT a.* FROM activities a
    WHERE a.class_id=? AND a.status IN ('drawing','active')
    ORDER BY a.id DESC LIMIT 1
  `).bind(session.class_id).first();
  if (!activity) throw httpError(409, '지금은 미션을 뽑을 수 없습니다.');

  const assignment = await env.DB.prepare('SELECT id FROM assignments WHERE activity_id=? AND giver_id=?')
    .bind(activity.id, session.student_id).first();
  if (!assignment) throw httpError(409, '먼저 마니또 카드를 뽑아 주세요.');

  const existing = await env.DB.prepare('SELECT COUNT(*) AS count FROM student_missions WHERE activity_id=? AND student_id=?')
    .bind(activity.id, session.student_id).first();
  if (Number(existing?.count) > 0) throw httpError(409, '이미 제주 미션을 뽑았습니다.');

  const selected = [];
  for (const category of ['snack', 'help', 'memory']) {
    const memoryCondition = category === 'memory' ? "AND title='제주 여행 편지'" : '';
    const mission = await env.DB.prepare(`
      SELECT id FROM missions
      WHERE activity_id=? AND active=1 AND category=? ${memoryCondition}
      ORDER BY RANDOM() LIMIT 1
    `).bind(activity.id, category).first();
    if (!mission) throw httpError(409, category === 'memory'
      ? '교사가 제주 여행 편지 미션을 먼저 등록해야 합니다.'
      : '교사가 제주 미션 묶음을 먼저 등록해야 합니다.');
    selected.push({ category, missionId: mission.id });
  }

  await env.DB.batch(selected.map(({ category, missionId }) => env.DB.prepare(`
    INSERT OR IGNORE INTO student_missions(activity_id,student_id,mission_id,category)
    VALUES(?,?,?,?)
  `).bind(activity.id, session.student_id, missionId, category)));
  return json({ ok: true, count: selected.length });
}

async function drawCard(request, env) {
  const session = await requireRole(request, env, 'student');
  const body = await readJson(request);
  const cardIndex = Number(body.cardIndex);
  const activity = await env.DB.prepare(`SELECT * FROM activities WHERE class_id=? AND status='drawing' ORDER BY id DESC LIMIT 1`)
    .bind(session.class_id).first();
  if (!activity) throw httpError(409, '지금은 카드 뽑기 시간이 아닙니다.');

  const studentsResult = await env.DB.prepare('SELECT id, student_no, name FROM students WHERE class_id=? AND active=1 ORDER BY student_no')
    .bind(session.class_id).all();
  const students = studentsResult.results;
  if (!Number.isInteger(cardIndex) || cardIndex < 1 || cardIndex > students.length) throw httpError(400, '올바른 카드를 선택하세요.');

  const existing = await env.DB.prepare('SELECT receiver_id FROM assignments WHERE activity_id=? AND giver_id=?')
    .bind(activity.id, session.student_id).first();
  if (existing) throw httpError(409, '이미 마니또 카드를 뽑았습니다.');
  const selectedCard = await env.DB.prepare('SELECT id FROM assignments WHERE activity_id=? AND card_index=?')
    .bind(activity.id, cardIndex).first();
  if (selectedCard) throw httpError(409, '방금 다른 친구가 고른 카드입니다. 다른 카드를 선택하세요.');

  const assignments = await env.DB.prepare('SELECT giver_id, receiver_id FROM assignments WHERE activity_id=?').bind(activity.id).all();
  const exclusions = await env.DB.prepare(`
    SELECT student_a_id, student_b_id
    FROM assignment_exclusions
    WHERE class_id=?
  `).bind(session.class_id).all();
  const fixedPairs = new Map(assignments.results.map((row) => [row.giver_id, row.receiver_id]));
  const forbiddenPairs = new Set();
  for (const row of exclusions.results) {
    forbiddenPairs.add(`${row.student_a_id}:${row.student_b_id}`);
    forbiddenPairs.add(`${row.student_b_id}:${row.student_a_id}`);
  }
  const assignedGivers = new Set(fixedPairs.keys());
  const usedReceivers = new Set(fixedPairs.values());
  const remainingGivers = students.map((s) => s.id).filter((id) => !assignedGivers.has(id));
  const remainingReceivers = students.map((s) => s.id).filter((id) => !usedReceivers.has(id));
  const receiverId = chooseReceiver({
    giverId: session.student_id,
    remainingGivers,
    remainingReceivers,
    fixedPairs,
    preventMutual: Boolean(activity.prevent_mutual),
    forbiddenPairs,
  });
  if (!receiverId) throw httpError(409, '안전한 배정을 만들 수 없습니다. 교사가 뽑기를 초기화한 뒤 다시 시도해 주세요.');

  try {
    await env.DB.prepare('INSERT INTO assignments(activity_id,giver_id,receiver_id,card_index) VALUES(?,?,?,?)')
      .bind(activity.id, session.student_id, receiverId, cardIndex).run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw httpError(409, '다른 친구의 선택과 겹쳤습니다. 카드를 다시 선택하세요.');
    throw error;
  }
  const receiver = students.find((s) => s.id === receiverId);
  return json({ ok: true, cardIndex, receiver: { studentNo: receiver.student_no, name: receiver.name } });
}

async function addGuestbook(request, env) {
  const session = await requireRole(request, env, 'student');
  const body = await readJson(request);
  const targetId = Number(body.targetStudentId);
  const mode = body.displayMode === 'public' ? 'public' : 'anonymous';
  const visibility = body.visibility === 'private' ? 'private' : 'public';
  const message = clean(body.message);
  if (!message || message.length > 500) throw httpError(400, '방명록은 1~500자로 작성하세요.');
  const activity = await env.DB.prepare(`SELECT * FROM activities WHERE class_id=? AND status IN ('drawing','active','revealed') ORDER BY id DESC LIMIT 1`)
    .bind(session.class_id).first();
  if (!activity) throw httpError(409, '방명록을 작성할 수 있는 활동이 없습니다.');
  const target = await env.DB.prepare('SELECT id FROM students WHERE id=? AND class_id=? AND active=1').bind(targetId, session.class_id).first();
  if (!target || targetId === session.student_id) throw httpError(400, '같은 반의 다른 친구를 선택하세요.');
  await env.DB.prepare(`INSERT INTO guestbook_entries(activity_id,author_student_id,target_student_id,display_mode,visibility,message) VALUES(?,?,?,?,?,?)`)
    .bind(activity.id, session.student_id, targetId, mode, visibility, message).run();
  return json({ ok: true });
}

async function addBoardPost(request, env) {
  const session = await requireRole(request, env, 'student');
  const body = await readJson(request);
  const displayMode = body.displayMode === 'public' ? 'public' : 'anonymous';
  const message = clean(body.message);
  if (!message || message.length > 500) throw httpError(400, '게시글은 1~500자로 작성하세요.');
  const activity = await env.DB.prepare(`SELECT id FROM activities
    WHERE class_id=? AND status IN ('drawing','active','revealed') ORDER BY id DESC LIMIT 1`)
    .bind(session.class_id).first();
  if (!activity) throw httpError(409, '자유게시판을 이용할 수 있는 활동이 없습니다.');
  await env.DB.prepare(`INSERT INTO board_posts(activity_id,author_student_id,display_mode,message) VALUES(?,?,?,?)`)
    .bind(activity.id, session.student_id, displayMode, message).run();
  return json({ ok: true });
}

async function submitProof(request, env) {
  const session = await requireRole(request, env, 'student');
  const form = await request.formData();
  const missionId = Number(form.get('missionId'));
  const proofText = clean(form.get('proofText'));
  const photo = form.get('photo');
  const mission = await env.DB.prepare(`
    SELECT m.id, m.activity_id
    FROM student_missions sm
    JOIN missions m ON m.id=sm.mission_id
    JOIN activities a ON a.id=m.activity_id
    WHERE m.id=? AND sm.student_id=? AND a.class_id=?
      AND a.status IN ('drawing','active','revealed') AND m.active=1
  `).bind(missionId, session.student_id, session.class_id).first();
  if (!mission) throw httpError(400, '제출할 수 있는 미션이 아닙니다.');
  if (!proofText && !(photo instanceof File && photo.size)) throw httpError(400, '인증 글이나 사진 중 하나를 등록하세요.');
  if (proofText.length > 1000) throw httpError(400, '인증 글은 1,000자 이내로 작성하세요.');

  let photoKey = null;
  if (photo instanceof File && photo.size) {
    if (!env.PHOTOS) throw httpError(503, '사진 저장소가 연결되지 않았습니다.');
    if (!photo.type.startsWith('image/') || photo.size > 8 * 1024 * 1024) throw httpError(400, '8MB 이하의 이미지 파일만 등록할 수 있습니다.');
    const extension = safeExtension(photo.name, photo.type);
    photoKey = `${mission.activity_id}/${session.student_id}/${crypto.randomUUID()}.${extension}`;
    await env.PHOTOS.put(photoKey, photo.stream(), { httpMetadata: { contentType: photo.type } });
  }

  const previous = await env.DB.prepare('SELECT photo_key FROM mission_proofs WHERE mission_id=? AND student_id=?').bind(missionId, session.student_id).first();
  await env.DB.prepare(`
    INSERT INTO mission_proofs(mission_id,student_id,proof_text,photo_key,status,teacher_note,submitted_at,reviewed_at)
    VALUES(?,?,?,?, 'submitted','',CURRENT_TIMESTAMP,NULL)
    ON CONFLICT(mission_id,student_id) DO UPDATE SET
      proof_text=excluded.proof_text,
      photo_key=COALESCE(excluded.photo_key,mission_proofs.photo_key),
      status='submitted', teacher_note='', submitted_at=CURRENT_TIMESTAMP, reviewed_at=NULL
  `).bind(missionId, session.student_id, proofText, photoKey).run();
  if (photoKey && previous?.photo_key && previous.photo_key !== photoKey) await env.PHOTOS.delete(previous.photo_key);
  return json({ ok: true });
}

async function getProofPhoto(request, env, proofId) {
  const session = await getSession(request, env, true);
  const proof = await env.DB.prepare(`
    SELECT p.photo_key, p.status, p.student_id, s.class_id, a.receiver_id
    FROM mission_proofs p
    JOIN students s ON s.id=p.student_id
    JOIN missions m ON m.id=p.mission_id
    LEFT JOIN assignments a ON a.activity_id=m.activity_id AND a.giver_id=p.student_id
    WHERE p.id=?
  `).bind(proofId).first();
  if (!proof?.photo_key) throw httpError(404, '사진을 찾을 수 없습니다.');
  const studentCanView = session.role === 'student'
    && session.class_id === proof.class_id
    && (session.student_id === proof.student_id || (session.student_id === proof.receiver_id && proof.status === 'approved'));
  if (session.role !== 'admin' && !studentCanView) throw httpError(403, '사진을 볼 권한이 없습니다.');
  const object = await env.PHOTOS.get(proof.photo_key);
  if (!object) throw httpError(404, '사진 파일을 찾을 수 없습니다.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

async function updateProfilePhoto(request, env) {
  const session = await requireRole(request, env, 'student');
  if (!env.PHOTOS) throw httpError(503, '사진 저장소가 연결되지 않았습니다.');
  const form = await request.formData();
  const photo = form.get('photo');
  if (!(photo instanceof File) || !photo.size) throw httpError(400, '프로필 사진을 선택하세요.');
  if (!photo.type.startsWith('image/') || photo.size > 5 * 1024 * 1024) {
    throw httpError(400, '5MB 이하의 이미지 파일만 등록할 수 있습니다.');
  }
  const current = await env.DB.prepare('SELECT profile_photo_key FROM students WHERE id=? AND class_id=?')
    .bind(session.student_id, session.class_id).first();
  if (!current) throw httpError(404, '학생 정보를 찾을 수 없습니다.');
  const extension = safeExtension(photo.name, photo.type);
  const photoKey = `profiles/${session.class_id}/${session.student_id}/${crypto.randomUUID()}.${extension}`;
  await env.PHOTOS.put(photoKey, photo.stream(), { httpMetadata: { contentType: photo.type } });
  try {
    await env.DB.prepare('UPDATE students SET profile_photo_key=? WHERE id=? AND class_id=?')
      .bind(photoKey, session.student_id, session.class_id).run();
  } catch (error) {
    await env.PHOTOS.delete(photoKey);
    throw error;
  }
  if (current.profile_photo_key && current.profile_photo_key !== photoKey) await env.PHOTOS.delete(current.profile_photo_key);
  return json({ ok: true, profilePhotoUrl: profilePhotoUrl(session.student_id, photoKey) });
}

async function deleteProfilePhoto(request, env) {
  const session = await requireRole(request, env, 'student');
  const current = await env.DB.prepare('SELECT profile_photo_key FROM students WHERE id=? AND class_id=?')
    .bind(session.student_id, session.class_id).first();
  if (!current) throw httpError(404, '학생 정보를 찾을 수 없습니다.');
  await env.DB.prepare('UPDATE students SET profile_photo_key=NULL WHERE id=? AND class_id=?')
    .bind(session.student_id, session.class_id).run();
  if (env.PHOTOS && current.profile_photo_key) await env.PHOTOS.delete(current.profile_photo_key);
  return json({ ok: true });
}

async function getProfilePhoto(request, env, studentId) {
  const session = await getSession(request, env, true);
  const student = await env.DB.prepare('SELECT class_id,profile_photo_key FROM students WHERE id=? AND active=1')
    .bind(studentId).first();
  if (!student?.profile_photo_key) throw httpError(404, '프로필 사진을 찾을 수 없습니다.');
  if (session.role !== 'admin' && session.class_id !== student.class_id) throw httpError(403, '사진을 볼 권한이 없습니다.');
  if (!env.PHOTOS) throw httpError(503, '사진 저장소가 연결되지 않았습니다.');
  const object = await env.PHOTOS.get(student.profile_photo_key);
  if (!object) throw httpError(404, '프로필 사진 파일을 찾을 수 없습니다.');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('Content-Disposition', 'inline');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

async function listClasses(request, env) {
  await requireRole(request, env, 'admin');
  const rows = await env.DB.prepare(`
    SELECT c.*, COUNT(DISTINCT s.id) AS student_count,
      (SELECT id FROM activities a WHERE a.class_id=c.id ORDER BY a.id DESC LIMIT 1) AS activity_id,
      (SELECT status FROM activities a WHERE a.class_id=c.id ORDER BY a.id DESC LIMIT 1) AS activity_status
    FROM classes c LEFT JOIN students s ON s.class_id=c.id AND s.active=1
    GROUP BY c.id ORDER BY c.school_year DESC, c.name
  `).all();
  return json({ classes: rows.results });
}

async function createClass(request, env) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const name = clean(body.name);
  const schoolYear = Number(body.schoolYear) || new Date().getFullYear();
  const accessCode = (clean(body.accessCode) || randomCode(6)).toUpperCase();
  if (!name || name.length > 40 || !/^[A-Z0-9]{4,10}$/.test(accessCode)) throw httpError(400, '반 이름과 4~10자리 영문·숫자 반 코드를 확인하세요.');
  try {
    const result = await env.DB.prepare('INSERT INTO classes(name,access_code,school_year) VALUES(?,?,?)')
      .bind(name, accessCode, schoolYear).run();
    return json({ ok: true, id: result.meta.last_row_id, accessCode });
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw httpError(409, '이미 사용 중인 반 코드입니다.');
    throw error;
  }
}

async function updateClassAccessCode(request, env, classId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const accessCode = clean(body.accessCode).toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(accessCode)) throw httpError(400, '접속 코드는 4~10자리 영문·숫자로 입력하세요.');
  const classRow = await env.DB.prepare('SELECT id,access_code FROM classes WHERE id=?').bind(classId).first();
  if (!classRow) throw httpError(404, '학급을 찾을 수 없습니다.');
  try {
    await env.DB.prepare('UPDATE classes SET access_code=? WHERE id=?').bind(accessCode, classId).run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw httpError(409, '이미 다른 학급에서 사용 중인 코드입니다.');
    throw error;
  }
  return json({ ok: true, accessCode, previousAccessCode: classRow.access_code });
}

async function importStudents(request, env) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const classId = Number(body.classId);
  const classRow = await env.DB.prepare('SELECT id FROM classes WHERE id=?').bind(classId).first();
  if (!classRow) throw httpError(404, '반을 찾을 수 없습니다.');
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 50) throw httpError(400, '학생은 한 번에 1~50명까지 등록할 수 있습니다.');

  const seen = new Set();
  const prepared = [];
  for (const row of body.rows) {
    const studentNo = Number(row.studentNo);
    const name = clean(row.name);
    const pin = clean(row.pin);
    if (!Number.isInteger(studentNo) || studentNo < 1 || studentNo > 99 || !name || (pin && !/^\d{4}$/.test(pin)) || seen.has(studentNo)) {
      throw httpError(400, '학생 번호·이름·PIN 또는 중복 번호를 확인하세요.');
    }
    seen.add(studentNo);
    const secured = await hashSecret(pin || randomToken(24));
    prepared.push({ studentNo, name, normalizedName: normalizeName(name), pin: pin || null, pinInitialized: pin ? 1 : 0, ...secured });
  }
  const statements = prepared.map((row) => env.DB.prepare(`
    INSERT INTO students(class_id,student_no,name,normalized_name,pin_hash,pin_salt,pin_initialized,active)
    VALUES(?,?,?,?,?,?,?,1)
    ON CONFLICT(class_id,student_no) DO UPDATE SET
      name=excluded.name, normalized_name=excluded.normalized_name,
      pin_hash=CASE WHEN excluded.pin_initialized=1 THEN excluded.pin_hash ELSE students.pin_hash END,
      pin_salt=CASE WHEN excluded.pin_initialized=1 THEN excluded.pin_salt ELSE students.pin_salt END,
      pin_initialized=CASE WHEN excluded.pin_initialized=1 THEN 1 ELSE students.pin_initialized END,
      active=1
  `).bind(classId, row.studentNo, row.name, row.normalizedName, row.hash, row.salt, row.pinInitialized));
  await env.DB.batch(statements);
  return json({ ok: true, count: prepared.length, credentials: prepared.map(({ studentNo, name, pin }) => ({ studentNo, name, pin })) });
}

async function listStudents(request, env, classId) {
  await requireRole(request, env, 'admin');
  const rows = await env.DB.prepare(`SELECT id,student_no,name,active,pin_initialized,created_at FROM students WHERE class_id=? ORDER BY student_no`).bind(classId).all();
  return json({ students: rows.results });
}

async function listAssignmentExclusions(request, env, classId) {
  await requireRole(request, env, 'admin');
  const classRow = await env.DB.prepare('SELECT id,name FROM classes WHERE id=?').bind(classId).first();
  if (!classRow) throw httpError(404, '학급을 찾을 수 없습니다.');
  const [students, exclusions] = await Promise.all([
    env.DB.prepare('SELECT id,student_no,name FROM students WHERE class_id=? AND active=1 ORDER BY student_no').bind(classId).all(),
    env.DB.prepare(`SELECT e.id,e.student_a_id,e.student_b_id,
        a.student_no AS student_a_no,a.name AS student_a_name,
        b.student_no AS student_b_no,b.name AS student_b_name
      FROM assignment_exclusions e
      JOIN students a ON a.id=e.student_a_id
      JOIN students b ON b.id=e.student_b_id
      WHERE e.class_id=? ORDER BY a.student_no,b.student_no`).bind(classId).all(),
  ]);
  return json({ class: classRow, students: students.results, exclusions: exclusions.results });
}

async function addAssignmentExclusion(request, env, classId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const firstId = Number(body.studentAId);
  const secondId = Number(body.studentBId);
  if (!Number.isInteger(firstId) || !Number.isInteger(secondId) || firstId === secondId) {
    throw httpError(400, '서로 다른 학생 두 명을 선택하세요.');
  }
  const students = await env.DB.prepare(`SELECT id FROM students
    WHERE class_id=? AND active=1 AND id IN (?,?)`).bind(classId, firstId, secondId).all();
  if (students.results.length !== 2) throw httpError(400, '같은 학급의 학생 두 명을 선택하세요.');
  const studentAId = Math.min(firstId, secondId);
  const studentBId = Math.max(firstId, secondId);
  const conflict = await env.DB.prepare(`SELECT a.id FROM assignments a
    JOIN activities x ON x.id=a.activity_id
    WHERE x.class_id=? AND x.status<>'closed'
      AND ((a.giver_id=? AND a.receiver_id=?) OR (a.giver_id=? AND a.receiver_id=?))
    LIMIT 1`).bind(classId, studentAId, studentBId, studentBId, studentAId).first();
  if (conflict) throw httpError(409, '두 학생이 현재 활동에서 이미 서로 배정되었습니다. 카드 뽑기를 초기화한 뒤 추가하세요.');
  await env.DB.prepare(`INSERT OR IGNORE INTO assignment_exclusions(class_id,student_a_id,student_b_id)
    VALUES(?,?,?)`).bind(classId, studentAId, studentBId).run();
  return json({ ok: true });
}

async function deleteAssignmentExclusion(request, env, exclusionId) {
  await requireRole(request, env, 'admin');
  const result = await env.DB.prepare('DELETE FROM assignment_exclusions WHERE id=?').bind(exclusionId).run();
  if (!result.meta.changes) throw httpError(404, '제외 관계를 찾을 수 없습니다.');
  return json({ ok: true });
}

async function resetStudentPin(request, env, studentId) {
  await requireRole(request, env, 'admin');
  const student = await env.DB.prepare('SELECT id,name FROM students WHERE id=?').bind(studentId).first();
  if (!student) throw httpError(404, '학생을 찾을 수 없습니다.');
  const secured = await hashSecret(randomToken(24));
  await env.DB.prepare('UPDATE students SET pin_hash=?,pin_salt=?,pin_initialized=0 WHERE id=?')
    .bind(secured.hash, secured.salt, studentId).run();
  await env.DB.prepare("DELETE FROM sessions WHERE role='student' AND student_id=?").bind(studentId).run();
  return json({ ok: true, name: student.name });
}

async function resetClassPins(request, env, classId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const classRow = await env.DB.prepare('SELECT id,name FROM classes WHERE id=?').bind(classId).first();
  if (!classRow) throw httpError(404, '학급을 찾을 수 없습니다.');
  const active = await env.DB.prepare('SELECT id FROM students WHERE class_id=? AND active=1 ORDER BY student_no')
    .bind(classId).all();
  const activeIds = new Set(active.results.map((student) => Number(student.id)));
  const requestedIds = Array.isArray(body.studentIds)
    ? [...new Set(body.studentIds.map(Number).filter((id) => Number.isInteger(id) && activeIds.has(id)))]
    : [];
  const ids = body.all === true ? [...activeIds] : requestedIds;
  if (!ids.length) throw httpError(400, 'PIN을 초기화할 학생을 선택하세요.');

  const updates = [];
  for (const studentId of ids) {
    const secured = await hashSecret(randomToken(24));
    updates.push(env.DB.prepare('UPDATE students SET pin_hash=?,pin_salt=?,pin_initialized=0 WHERE id=? AND class_id=?')
      .bind(secured.hash, secured.salt, studentId, classId));
  }
  const placeholders = ids.map(() => '?').join(',');
  updates.push(env.DB.prepare(`DELETE FROM sessions WHERE role='student' AND class_id=? AND student_id IN (${placeholders})`)
    .bind(classId, ...ids));
  await env.DB.batch(updates);
  return json({ ok: true, count: ids.length, className: classRow.name });
}

async function createActivity(request, env) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const classId = Number(body.classId);
  const title = clean(body.title) || '우리 반 마니또';
  const preventMutual = body.preventMutual === false ? 0 : 1;
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM students WHERE class_id=? AND active=1').bind(classId).first();
  if (!count || count.count < 2) throw httpError(400, '학생을 2명 이상 등록한 뒤 활동을 만드세요.');
  const openActivity = await env.DB.prepare(`SELECT id,title,status FROM activities
    WHERE class_id=? AND status <> 'closed' ORDER BY id DESC LIMIT 1`).bind(classId).first();
  if (openActivity) throw httpError(409, `이미 진행 중인 '${openActivity.title}' 활동이 있습니다. 기존 활동을 종료한 뒤 새 활동을 만드세요.`);
  const result = await env.DB.prepare(`INSERT INTO activities(class_id,title,prevent_mutual,starts_at,ends_at) VALUES(?,?,?,?,?)`)
    .bind(classId, title, preventMutual, nullableText(body.startsAt), nullableText(body.endsAt)).run();
  return json({ ok: true, id: result.meta.last_row_id });
}

async function activityDetail(request, env, activityId) {
  await requireRole(request, env, 'admin');
  const activity = await env.DB.prepare(`SELECT a.*,c.name AS class_name,c.access_code FROM activities a JOIN classes c ON c.id=a.class_id WHERE a.id=?`)
    .bind(activityId).first();
  if (!activity) throw httpError(404, '활동을 찾을 수 없습니다.');
  const [students, assignments, missions, proofs, guestbook, board, guesses] = await Promise.all([
    env.DB.prepare('SELECT id,student_no,name,active,pin_initialized FROM students WHERE class_id=? ORDER BY student_no').bind(activity.class_id).all(),
    env.DB.prepare(`SELECT a.*,g.student_no AS giver_no,g.name AS giver_name,r.student_no AS receiver_no,r.name AS receiver_name,
      (SELECT COUNT(*) FROM student_missions sm WHERE sm.activity_id=a.activity_id AND sm.student_id=a.giver_id) AS mission_count,
      (SELECT COUNT(*) FROM mission_proofs p JOIN missions m ON m.id=p.mission_id WHERE m.activity_id=a.activity_id AND p.student_id=a.giver_id AND p.status='approved') AS approved_count
      FROM assignments a JOIN students g ON g.id=a.giver_id JOIN students r ON r.id=a.receiver_id WHERE a.activity_id=? ORDER BY a.chosen_at`).bind(activityId).all(),
    env.DB.prepare('SELECT * FROM missions WHERE activity_id=? ORDER BY id').bind(activityId).all(),
    env.DB.prepare(`SELECT p.*,m.title AS mission_title,s.student_no,s.name AS student_name
      FROM mission_proofs p JOIN missions m ON m.id=p.mission_id JOIN students s ON s.id=p.student_id
      WHERE m.activity_id=? ORDER BY p.submitted_at DESC`).bind(activityId).all(),
    env.DB.prepare(`SELECT g.*,a.name AS author_name,t.name AS target_name
      FROM guestbook_entries g JOIN students a ON a.id=g.author_student_id JOIN students t ON t.id=g.target_student_id
      WHERE g.activity_id=? ORDER BY g.id DESC`).bind(activityId).all(),
    env.DB.prepare(`SELECT b.*,s.student_no,s.name AS author_name
      FROM board_posts b JOIN students s ON s.id=b.author_student_id
      WHERE b.activity_id=? ORDER BY b.id DESC`).bind(activityId).all(),
    env.DB.prepare(`SELECT s.id AS student_id,s.student_no,s.name AS student_name,
      mg.guessed_giver_id,mg.status AS guess_status,mg.submitted_at,mg.final_submitted_at,mg.updated_at,
      guessed.student_no AS guessed_student_no,guessed.name AS guessed_student_name,
      actual.giver_id AS actual_giver_id,giver.student_no AS actual_giver_no,giver.name AS actual_giver_name,
      CASE WHEN mg.id IS NULL OR mg.status<>'submitted' THEN NULL WHEN mg.guessed_giver_id=actual.giver_id THEN 1 ELSE 0 END AS is_correct
      FROM students s
      LEFT JOIN manitto_guesses mg ON mg.activity_id=? AND mg.student_id=s.id
      LEFT JOIN students guessed ON guessed.id=mg.guessed_giver_id
      LEFT JOIN assignments actual ON actual.activity_id=? AND actual.receiver_id=s.id
      LEFT JOIN students giver ON giver.id=actual.giver_id
      WHERE s.class_id=? AND s.active=1 ORDER BY s.student_no`).bind(activityId, activityId, activity.class_id).all(),
  ]);
  return json({ activity, students: students.results, assignments: assignments.results, missions: missions.results,
    proofs: proofs.results.map((p) => ({ ...p, photoUrl: p.photo_key ? `/api/photos/${p.id}` : null })), guestbook: guestbook.results, board: board.results,
    guesses: guesses.results });
}

async function updateActivityStatus(request, env, activityId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const status = clean(body.status);
  const allowed = new Set(['draft', 'drawing', 'active', 'revealed', 'closed']);
  if (!allowed.has(status)) throw httpError(400, '올바른 활동 단계를 선택하세요.');
  const activity = await env.DB.prepare('SELECT * FROM activities WHERE id=?').bind(activityId).first();
  if (!activity) throw httpError(404, '활동을 찾을 수 없습니다.');
  if (status === 'active') {
    const counts = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM students WHERE class_id=? AND active=1) AS students,
      (SELECT COUNT(*) FROM assignments WHERE activity_id=?) AS assignments`).bind(activity.class_id, activityId).first();
    if (counts.students !== counts.assignments) throw httpError(409, `아직 ${counts.students - counts.assignments}명이 카드를 뽑지 않았습니다.`);
  }
  if (['drawing', 'active', 'revealed'].includes(status)) {
    const statusUpdate = status === 'revealed'
      ? env.DB.prepare("UPDATE activities SET status=?,guessing_open=0,guessing_closed_at=COALESCE(guessing_closed_at,CURRENT_TIMESTAMP) WHERE id=?").bind(status, activityId)
      : status === 'active'
        ? env.DB.prepare('UPDATE activities SET status=?,guessing_open=1,guessing_closed_at=NULL WHERE id=?').bind(status, activityId)
        : env.DB.prepare('UPDATE activities SET status=? WHERE id=?').bind(status, activityId);
    await env.DB.batch([
      env.DB.prepare("UPDATE activities SET status='closed' WHERE class_id=? AND id<>? AND status<>'closed'")
        .bind(activity.class_id, activityId),
      statusUpdate,
    ]);
  } else {
    if (status === 'closed') {
      await env.DB.prepare("UPDATE activities SET status=?,guessing_open=0,guessing_closed_at=COALESCE(guessing_closed_at,CURRENT_TIMESTAMP) WHERE id=?")
        .bind(status, activityId).run();
    } else {
      await env.DB.prepare('UPDATE activities SET status=? WHERE id=?').bind(status, activityId).run();
    }
  }
  return json({ ok: true, status });
}

async function updateGuessingWindow(request, env, activityId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const action = clean(body.action);
  if (!['open', 'close'].includes(action)) throw httpError(400, '추측 열기 또는 마감을 선택하세요.');
  const activity = await env.DB.prepare('SELECT id,class_id,status,guessing_open FROM activities WHERE id=?').bind(activityId).first();
  if (!activity) throw httpError(404, '활동을 찾을 수 없습니다.');
  if (activity.status !== 'active') throw httpError(409, '활동 중 상태에서만 마니또 추측을 운영할 수 있습니다.');

  if (action === 'open') {
    const counts = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM students WHERE class_id=? AND active=1) AS students,
      (SELECT COUNT(*) FROM assignments WHERE activity_id=?) AS assignments`).bind(activity.class_id, activityId).first();
    if (Number(counts.students) !== Number(counts.assignments)) {
      throw httpError(409, '모든 학생의 카드 뽑기가 끝난 뒤 추측을 열 수 있습니다.');
    }
    await env.DB.prepare('UPDATE activities SET guessing_open=1,guessing_closed_at=NULL WHERE id=?').bind(activityId).run();
  } else {
    await env.DB.prepare('UPDATE activities SET guessing_open=0,guessing_closed_at=CURRENT_TIMESTAMP WHERE id=?').bind(activityId).run();
  }
  return json({ ok: true, guessingOpen: action === 'open' });
}

async function resetDraw(request, env, activityId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  if (body.confirm !== 'RESET') throw httpError(400, '초기화 확인 문구가 필요합니다.');
  const activity = await env.DB.prepare('SELECT status FROM activities WHERE id=?').bind(activityId).first();
  if (!activity) throw httpError(404, '활동을 찾을 수 없습니다.');
  if (!['draft', 'drawing'].includes(activity.status)) throw httpError(409, '활동 시작 후에는 배정을 초기화할 수 없습니다.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM manitto_guesses WHERE activity_id=?').bind(activityId),
    env.DB.prepare('DELETE FROM student_missions WHERE activity_id=?').bind(activityId),
    env.DB.prepare('DELETE FROM assignments WHERE activity_id=?').bind(activityId),
    env.DB.prepare("UPDATE activities SET status='draft',guessing_open=0,guessing_closed_at=NULL WHERE id=?").bind(activityId),
  ]);
  return json({ ok: true });
}

async function fullResetActivity(request, env, activityId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  if (body.confirm !== 'FULL_RESET') throw httpError(400, '전체 초기화 확인 문구가 필요합니다.');
  const activity = await env.DB.prepare('SELECT id,class_id FROM activities WHERE id=?').bind(activityId).first();
  if (!activity) throw httpError(404, '활동을 찾을 수 없습니다.');

  const [proofRows, counts] = await Promise.all([
    env.DB.prepare(`SELECT p.photo_key FROM mission_proofs p JOIN missions m ON m.id=p.mission_id
      WHERE m.activity_id=? AND p.photo_key IS NOT NULL`).bind(activityId).all(),
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM assignments WHERE activity_id=?) AS assignments,
      (SELECT COUNT(*) FROM student_missions WHERE activity_id=?) AS student_missions,
      (SELECT COUNT(*) FROM mission_proofs p JOIN missions m ON m.id=p.mission_id WHERE m.activity_id=?) AS proofs,
      (SELECT COUNT(*) FROM guestbook_entries WHERE activity_id=?) AS guestbooks,
      (SELECT COUNT(*) FROM board_posts WHERE activity_id=?) AS board_posts,
      (SELECT COUNT(*) FROM manitto_guesses WHERE activity_id=?) AS guesses
    `).bind(activityId, activityId, activityId, activityId, activityId, activityId).first(),
  ]);

  const statements = [
    env.DB.prepare('DELETE FROM mission_proofs WHERE mission_id IN (SELECT id FROM missions WHERE activity_id=?)').bind(activityId),
    env.DB.prepare('DELETE FROM guestbook_entries WHERE activity_id=?').bind(activityId),
    env.DB.prepare('DELETE FROM board_posts WHERE activity_id=?').bind(activityId),
    env.DB.prepare('DELETE FROM manitto_guesses WHERE activity_id=?').bind(activityId),
    env.DB.prepare('DELETE FROM student_missions WHERE activity_id=?').bind(activityId),
    env.DB.prepare('DELETE FROM assignments WHERE activity_id=?').bind(activityId),
    env.DB.prepare("UPDATE activities SET status='draft',guessing_open=0,guessing_closed_at=NULL WHERE id=?").bind(activityId),
  ];
  if (body.resetPins === true) {
    statements.push(env.DB.prepare('UPDATE students SET pin_initialized=0 WHERE class_id=? AND active=1').bind(activity.class_id));
    statements.push(env.DB.prepare("DELETE FROM sessions WHERE role='student' AND class_id=?").bind(activity.class_id));
  }
  await env.DB.batch(statements);

  const photoKeys = proofRows.results.map((row) => row.photo_key).filter(Boolean);
  if (env.PHOTOS && photoKeys.length) {
    for (let index = 0; index < photoKeys.length; index += 1000) {
      await env.PHOTOS.delete(photoKeys.slice(index, index + 1000));
    }
  }
  return json({ ok: true, resetPins: body.resetPins === true, deleted: { ...counts, photos: photoKeys.length } });
}

async function createMission(request, env, activityId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const title = clean(body.title);
  const description = clean(body.description);
  const category = ['snack', 'help', 'memory', 'general'].includes(body.category) ? body.category : 'general';
  if (!title || title.length > 80 || description.length > 1000) throw httpError(400, '미션 제목과 설명 길이를 확인하세요.');
  const result = await env.DB.prepare('INSERT INTO missions(activity_id,title,description,due_at,category) VALUES(?,?,?,?,?)')
    .bind(activityId, title, description, nullableText(body.dueAt), category).run();
  return json({ ok: true, id: result.meta.last_row_id });
}

async function installJejuMissions(request, env, activityId) {
  await requireRole(request, env, 'admin');
  const activity = await env.DB.prepare('SELECT id FROM activities WHERE id=?').bind(activityId).first();
  if (!activity) throw httpError(404, '활동을 찾을 수 없습니다.');
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM missions WHERE activity_id=? AND category IN ('snack','help','memory')")
    .bind(activityId).first();
  if (Number(existing?.count) > 0) throw httpError(409, '이미 제주 랜덤 미션이 등록되어 있습니다.');
  await env.DB.batch(JEJU_MISSIONS.map(([category, title, description]) => env.DB.prepare(`
    INSERT INTO missions(activity_id,title,description,category) VALUES(?,?,?,?)
  `).bind(activityId, title, description, category)));
  return json({ ok: true, count: JEJU_MISSIONS.length });
}

async function reviewProof(request, env, proofId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  const status = body.status === 'approved' ? 'approved' : body.status === 'rejected' ? 'rejected' : null;
  if (!status) throw httpError(400, '승인 또는 반려를 선택하세요.');
  await env.DB.prepare('UPDATE mission_proofs SET status=?,teacher_note=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(status, clean(body.teacherNote).slice(0, 500), proofId).run();
  return json({ ok: true });
}

async function setGuestbookVisibility(request, env, entryId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  await env.DB.prepare('UPDATE guestbook_entries SET hidden=? WHERE id=?').bind(body.hidden ? 1 : 0, entryId).run();
  return json({ ok: true });
}

async function setBoardPostVisibility(request, env, postId) {
  await requireRole(request, env, 'admin');
  const body = await readJson(request);
  await env.DB.prepare('UPDATE board_posts SET hidden=? WHERE id=?').bind(body.hidden ? 1 : 0, postId).run();
  return json({ ok: true });
}

async function createSession(env, { role, studentId, classId, hours }) {
  const token = randomToken(32);
  const tokenHash = await sha256(`${token}.${env.SESSION_SECRET || ''}`);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,role,student_id,class_id,expires_at) VALUES(?,?,?,?,?)')
    .bind(tokenHash, role, studentId, classId, expiresAt).run();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(new Date().toISOString()).run();
  return { cookie: token, expiresAt };
}

async function getSession(request, env, required) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) {
    if (required) throw httpError(401, '로그인이 필요합니다.');
    return null;
  }
  const hash = await sha256(`${token}.${env.SESSION_SECRET || ''}`);
  const session = await env.DB.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?')
    .bind(hash, new Date().toISOString()).first();
  if (!session && required) throw httpError(401, '로그인이 만료되었습니다.');
  return session || null;
}

async function requireRole(request, env, role) {
  const session = await getSession(request, env, true);
  if (session.role !== role) throw httpError(403, '이 화면을 사용할 권한이 없습니다.');
  return session;
}

async function hashSecret(value) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = bytesToBase64(saltBytes);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { salt, hash: bytesToBase64(new Uint8Array(bits)) };
}

async function verifySecret(value, salt, expected) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: base64ToBytes(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return constantEqual(bytesToBase64(new Uint8Array(bits)), expected);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function verifySameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw httpError(403, '허용되지 않은 요청입니다.');
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw httpError(415, 'JSON 형식의 요청이 필요합니다.');
  try { return await request.json(); } catch { throw httpError(400, '요청 내용을 읽을 수 없습니다.'); }
}

function withCookie(response, token, request, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  response.headers.append('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  return response;
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function clean(value) { return String(value ?? '').trim(); }
function nullableText(value) { const text = clean(value); return text || null; }
function profilePhotoUrl(studentId, key) {
  return key ? `/api/profile-photos/${studentId}?v=${encodeURIComponent(key.split('/').pop())}` : null;
}
function withProfilePhoto(student) {
  if (!student) return student;
  const { profile_photo_key: key, ...safeStudent } = student;
  return { ...safeStudent, profilePhotoUrl: profilePhotoUrl(student.id, key) };
}
export function normalizeName(value) {
  return clean(value)
    .replace(/\s+/g, '')
    .replace(/\(공동\)$/u, '')
    .replace(/선생님$/u, '')
    .toLocaleLowerCase('ko-KR');
}
function constantEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('');
}
function randomToken(length) { return bytesToBase64(crypto.getRandomValues(new Uint8Array(length))).replace(/[+/=]/g, ''); }
function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function safeExtension(name, type) {
  const fromName = clean(name).split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(fromName)) return fromName;
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[type] || 'img';
}
