/**
 * types.ts — 규칙 엔진의 상태 모양 (DESIGN §4·§5). JSON 으로 그대로 저장할 수 있게 Set·Map 을 쓰지 않는다.
 */
import type { Cell } from './board.ts';

export type TrapType = 'normal' | 'return' | 'bind' | 'confuse';
export type Level = '쉬움' | '보통' | '어려움';

export interface Trap {
  id: number;
  owner: number;      // 팀 0..7
  cell: Cell;
  type: TrapType;
  active: boolean;
}

export interface ReconResult {
  topLeft: Cell;
  round: number;
  /** 영역 안에서 상대 덫이 있던 칸과 그 칸의 상대 덫 수(사용 시점 기준). 종류는 공개하지 않는다 (D18) */
  cells: { cell: Cell; count: number; trapIds: number[] }[];
}

export interface TeamState {
  zone: number;            // 출발 구역 id 0..7
  spawn: Cell;
  pos: Cell;
  score: number;
  visited: Cell[];         // 실제로 착지한 칸(+ 출발 칸). 오름차순
  opponentZones: number[]; // +10 을 받은 상대 출발 구역 id
  oasisRound: number | null;
  oasisRank: number | null;
  reconAvailable: boolean;
  recon: ReconResult | null;
  bindRounds: number[];    // 이동할 수 없는 라운드 번호들
  confuseRounds: number[]; // 센서가 숨겨지는 라운드 번호들
  asked: string[];         // 이 팀에 낸 문항 id (오래된 순)
}

/** 확정 상태 (DESIGN §4-3: committed) */
export interface Committed {
  round: number;           // 마지막으로 확정된 라운드 번호 (시작 전 0)
  teams: TeamState[];
  traps: Trap[];
  oasisArrivals: number;   // 지금까지 오아시스에 도착한 팀 수
  /** 서버 전용 확정 문항 기록(복습·감사용). 어떤 학생·TV 뷰에도 그대로 내보내지 않는다 */
  quizLog: QuizRecord[];
}

export interface QuizRecord {
  round: number;
  team: number;
  questionId: string;
  level: Level;
  n: number;
  correct: boolean;
  timeout: boolean;        // 미응답(시간 초과) = 오답
}

/** 진행 단계 — 센서가 어느 라운드·위치 기준인지 정한다 */
export type Phase = 'move' | 'landed' | 'summary';

export type LandingKind = 'stay' | 'oasis' | 'zone' | 'safe' | 'empty' | 'trap';

export interface Landing {
  team: number;
  from: Cell;
  to: Cell;
  moved: boolean;
  /** 착지 스냅샷의 활성 덫 id (모든 팀·모든 종류) */
  snapshot: number[];
  kind: LandingKind;
  /** 확정 전 보너스 후보: 안전 +1 / 상대 구역 +10 */
  bonus: number;
  zoneBonus: number | null; // +10 을 받는 상대 구역 id
  firstVisit: boolean;
  oasisNew: boolean;
  level: Level | null;
  questionId: string | null;
}

/** 진행 중 라운드 (DESIGN §4-3: pending). 버리면 그 라운드가 없던 일이 된다 */
export interface Pending {
  round: number;
  landings: Landing[];
}

export type RoundEvent =
  | { type: 'move'; team: number; from: Cell; to: Cell }
  | { type: 'stay'; team: number; reason: 'bound' | 'noMove' }
  | { type: 'safe'; team: number; cell: Cell; points: number }
  | { type: 'zone'; team: number; zone: number; points: number }
  | { type: 'quiz'; team: number; level: Level; n: number; correct: boolean; timeout: boolean; points: number }
  | { type: 'trapsRemoved'; cell: Cell; count: number }
  | { type: 'effect'; team: number; effect: 'return' | 'bind' | 'confuse' }
  | { type: 'oasis'; team: number; rank: number; points: number };
