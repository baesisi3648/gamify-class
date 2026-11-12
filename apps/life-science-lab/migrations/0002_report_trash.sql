-- Teacher report trash. Keep the complete report and linked history outside the active
-- tables so a student can begin a fresh report while the original remains restorable.
CREATE TABLE IF NOT EXISTS ReportTrash (
  id TEXT PRIMARY KEY,
  grp TEXT NOT NULL,
  studentId TEXT NOT NULL,
  assessmentId TEXT NOT NULL,
  deletedAt TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS report_trash_group_date ON ReportTrash(grp, deletedAt DESC);
