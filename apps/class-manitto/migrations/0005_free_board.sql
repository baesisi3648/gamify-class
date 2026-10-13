CREATE TABLE board_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  author_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  display_mode TEXT NOT NULL DEFAULT 'anonymous' CHECK(display_mode IN ('anonymous','public')),
  message TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_board_posts_activity
  ON board_posts(activity_id, hidden, created_at DESC);
