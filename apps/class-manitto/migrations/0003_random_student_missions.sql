ALTER TABLE missions ADD COLUMN category TEXT NOT NULL DEFAULT 'general';

CREATE TABLE student_missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('snack','help','memory','general')),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(activity_id, student_id, category),
  UNIQUE(activity_id, student_id, mission_id)
);

CREATE INDEX idx_student_missions_student
  ON student_missions(activity_id, student_id, assigned_at);
