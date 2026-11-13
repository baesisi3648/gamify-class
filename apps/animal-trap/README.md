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
npx wrangler dev --var ADMIN_PASSWORD:<로컬용> --var SMOKE_ENABLED:1
BASE=http://localhost:8787 ADMIN_PASSWORD=<로컬용> npm run smoke
```

## 처음 배포 (0단계)

```sh
npx wrangler login                          # baesisi3648
npx wrangler whoami
npx wrangler d1 create animal-trap          # 출력된 database_id 를 wrangler.jsonc 에 넣고 커밋
npx wrangler d1 migrations apply animal-trap --remote
npx wrangler secret put ADMIN_PASSWORD      # 관리자 비밀번호 (판 생성·문제은행·점검)
npx wrangler secret put SMOKE_ENABLED       # 값: 1  (점검하는 동안만)
npm run deploy
BASE=https://animal-trap.<서브도메인>.workers.dev ADMIN_PASSWORD=... npm run smoke
npx wrangler secret delete SMOKE_ENABLED    # 점검이 끝나면 반드시 끈다
```

## 점검 통로를 지우는 시점

`/api/_smoke`·`/ws/_smoke`와 `TrapRoom`의 점검 메서드·alarm은 **0단계 원격 확인용**이다.
**2단계(상태 머신) 코드를 붙이기 전에 삭제**한다 — 게임과 점검이 alarm 하나를 같이 쓰면 안 된다.
