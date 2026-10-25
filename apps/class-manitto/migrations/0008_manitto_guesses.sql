ALTER TABLE activities ADD COLUMN guessing_open INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activities ADD COLUMN guessing_closed_at TEXT;

CREATE TABLE manitto_guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  guessed_giver_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(activity_id, student_id),
  CHECK(student_id <> guessed_giver_id)
);

CREATE INDEX idx_manitto_guesses_activity
  ON manitto_guesses(activity_id, student_id, guessed_giver_id);
