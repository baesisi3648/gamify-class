PRAGMA foreign_keys = ON;

CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  access_code TEXT NOT NULL UNIQUE,
  school_year INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_no INTEGER NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, student_no)
);

CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','drawing','active','revealed','closed')),
  prevent_mutual INTEGER NOT NULL DEFAULT 1,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  giver_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  card_index INTEGER NOT NULL,
  chosen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(activity_id, giver_id),
  UNIQUE(activity_id, receiver_id),
  UNIQUE(activity_id, card_index),
  CHECK(giver_id <> receiver_id)
);

CREATE TABLE missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mission_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  proof_text TEXT NOT NULL DEFAULT '',
  photo_key TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected')),
  teacher_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  UNIQUE(mission_id, student_id)
);

CREATE TABLE guestbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  author_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  display_mode TEXT NOT NULL DEFAULT 'anonymous' CHECK(display_mode IN ('anonymous','public')),
  message TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('student','admin')),
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_students_class ON students(class_id, active, student_no);
CREATE INDEX idx_activities_class ON activities(class_id, created_at DESC);
CREATE INDEX idx_assignments_activity ON assignments(activity_id, giver_id, receiver_id);
CREATE INDEX idx_proofs_student ON mission_proofs(student_id, submitted_at DESC);
CREATE INDEX idx_guestbook_target ON guestbook_entries(activity_id, target_student_id, created_at DESC);
CREATE INDEX idx_sessions_expiry ON sessions(token_hash, expires_at);
