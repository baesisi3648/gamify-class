CREATE TABLE IF NOT EXISTS assignment_exclusions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_a_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_b_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (student_a_id < student_b_id),
  UNIQUE (class_id, student_a_id, student_b_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_exclusions_class
  ON assignment_exclusions(class_id);
