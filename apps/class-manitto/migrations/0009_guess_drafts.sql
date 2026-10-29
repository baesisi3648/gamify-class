ALTER TABLE manitto_guesses ADD COLUMN status TEXT NOT NULL DEFAULT 'submitted'
  CHECK(status IN ('draft','submitted'));

ALTER TABLE manitto_guesses ADD COLUMN final_submitted_at TEXT;

UPDATE manitto_guesses
SET final_submitted_at = COALESCE(final_submitted_at, submitted_at)
WHERE status = 'submitted';

-- 기존 활동 중 아직 추측 시간을 한 번도 열지 않은 경우 즉시 작성 가능하게 한다.
UPDATE activities
SET guessing_open = 1
WHERE status = 'active' AND guessing_open = 0 AND guessing_closed_at IS NULL;
