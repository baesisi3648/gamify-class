# 애니멀 트랩: 오아시스 쟁탈전

8팀 실시간 수업 게임. 설계는 [DESIGN.md](DESIGN.md), 원본 기획서는 [docs/plan-v2.md](docs/plan-v2.md).

Cloudflare Worker `animal-trap` + Durable Object(판 하나 = 인스턴스 하나) + D1(문제은행·판 목록).
계정 **baesisi3648** (애니멀 더비와 같은 계정, 별도 Worker — 아무것도 공유하지 않는다).

## 개발

```sh
npm ci
npm test                 # 타입 검사 3벌 + 단위 테스트 (Node 24 이상)
npm run build            # 화면 → dist/client
npx wrangler d1 migrations apply animal-trap --local
npx wrangler dev --var ADMIN_PASSWORD:<로컬용>
```

## 로컬 통합 점검 (교사 1·TV 1·팀 8 한 판)

```sh
npx wrangler d1 migrations apply animal-trap --local
npx wrangler d1 execute animal-trap --local --file scripts/e2e-seed.sql   # 'E2E' 문제 세트
npm run build && npx wrangler dev --var ADMIN_PASSWORD:<로컬용>
BASE=http://localhost:8787 ADMIN_PASSWORD=<로컬용> node scripts/e2e.ts
```

## 배포

```sh
npx wrangler login                      # baesisi3648
npm run deploy                          # 테스트 → 빌드 → 배포
```
D1 `animal-trap`(APAC)과 `ADMIN_PASSWORD` secret 은 2026-11-13 등록 완료.
새 migration 이 생기면 `npx wrangler d1 migrations apply animal-trap --remote`.

## 기록

- 2026-11-13 0단계: 실제 계정에서 DO SQLite·alarm·WebSocket hibernation·D1 점검 통과
  (`/api/_smoke` 점검 통로). 2단계 시작 때 점검 코드·`SMOKE_ENABLED` 를 모두 지웠다.
