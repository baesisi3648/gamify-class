ALTER TABLE guestbook_entries ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK(visibility IN ('public','private'));

CREATE INDEX idx_guestbook_public_space
  ON guestbook_entries(activity_id, target_student_id, visibility, hidden, created_at DESC);
