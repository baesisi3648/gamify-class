-- 생명과학 탐구 연구소 D1 스키마.
-- 각 행의 전체 기록은 data(JSON)에 그대로 두고, 조회·제약에 필요한 값만 열로 뽑아 둔다.
-- (domain.js 규칙은 저장소와 무관하게 그대로 쓰인다.)
CREATE TABLE IF NOT EXISTS Students (
  id TEXT PRIMARY KEY, grp TEXT NOT NULL,
  year INTEGER, grade INTEGER, classNo INTEGER, number INTEGER,
  data TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS students_roster ON Students(grp, year, grade, classNo, number);

CREATE TABLE IF NOT EXISTS Assessments (id TEXT PRIMARY KEY, grp TEXT NOT NULL, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS AssessmentFields (
  assessmentId TEXT NOT NULL, id TEXT NOT NULL, grp TEXT NOT NULL, data TEXT NOT NULL,
  PRIMARY KEY (assessmentId, id)
);

CREATE TABLE IF NOT EXISTS Reports (
  id TEXT PRIMARY KEY, grp TEXT NOT NULL, studentId TEXT, assessmentId TEXT, data TEXT NOT NULL
);
-- 학생 1명당 탐구 1개에 보고서 1개. 동시에 '보고서 열기'를 눌러도 중복 생성되지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS reports_owner ON Reports(studentId, assessmentId);

CREATE TABLE IF NOT EXISTS Reviews (id TEXT PRIMARY KEY, grp TEXT NOT NULL, reportId TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reviews_report ON Reviews(reportId);

CREATE TABLE IF NOT EXISTS Publications (id TEXT PRIMARY KEY, grp TEXT NOT NULL, reportId TEXT, data TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS publications_report ON Publications(reportId);

CREATE TABLE IF NOT EXISTS PublicationVersions (id TEXT PRIMARY KEY, grp TEXT NOT NULL, publicationId TEXT, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS Settings (id TEXT PRIMARY KEY, grp TEXT NOT NULL, data TEXT NOT NULL);

-- 변경 시각(changed)과 구글 시트에 마지막으로 복사한 시각(synced).
CREATE TABLE IF NOT EXISTS Meta (k TEXT PRIMARY KEY, v TEXT);
