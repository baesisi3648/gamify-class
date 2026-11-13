-- 애니멀 트랩 D1: 판 사이에 공유되는 것만 (DESIGN §2). 판 하나의 상태는 Durable Object 에 있다.

-- 문제은행. 애니멀 더비와 같은 모양(세트·난이도·4지선다)이라 JSON 을 그대로 주고받을 수 있다.
-- 난이도 문자열: 쉬움 | 보통 | 어려움 (DESIGN D10)
CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY,
  set_name    TEXT    NOT NULL,
  level       TEXT    NOT NULL CHECK (level IN ('쉬움', '보통', '어려움')),
  text        TEXT    NOT NULL,
  choice1     TEXT    NOT NULL DEFAULT '',
  choice2     TEXT    NOT NULL DEFAULT '',
  choice3     TEXT    NOT NULL DEFAULT '',
  choice4     TEXT    NOT NULL DEFAULT '',
  answer      INTEGER NOT NULL CHECK (answer BETWEEN 1 AND 4),
  explanation TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS questions_set ON questions (set_name, level);

-- 판 목록: 이어하기·보존 기간 정리용. 시각은 ms 정수.
CREATE TABLE IF NOT EXISTS games (
  code        TEXT    PRIMARY KEY,
  title       TEXT    NOT NULL,
  set_name    TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS games_created ON games (created_at DESC);
