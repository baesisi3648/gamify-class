# 학급 마니또

Gamify Class의 학급 경영용 마니또 활동 앱입니다. 정적 화면과 API를 하나의 Cloudflare Worker로 제공하고, 구조화된 활동 데이터는 D1, 미션 인증 사진은 R2에 저장합니다.

## 주요 기능

- 학생: 반 코드·번호·이름·개인 PIN 로그인
- 교사: 서버 비밀 변수 기반 관리자 로그인
- 카드 뽑기: 자기 자신, 중복 배정, 선택적 2인 맞교환 방지
- 학생 비밀 공간: 마니또 대상, 미션, 인증, 방명록, 익명 활동 확인
- 최종 추측: 정체 공개 전 자신을 챙겨 준 마니또 선택·수정
- 교사 관리: 학급·학생·활동·미션·인증·방명록·정체 공개
- 추측 결과: 제출 현황과 정오답 확인, 정답자 명단 복사
- 사진 등록: 카메라 강제 실행 없이 사진첩/파일 선택
- 개인정보 보호: PIN PBKDF2 해시 저장, 세션 HttpOnly 쿠키, 익명 작성자 교사 확인

## 최초 배포 준비

실제 학생 정보, PIN, 관리자 비밀번호는 Git에 넣지 않습니다.

```powershell
cd apps/class-manitto
npm install
npx wrangler d1 create class-manitto
npx wrangler r2 bucket create class-manitto-photos
```

`wrangler d1 create`가 출력한 ID를 `wrangler.jsonc`의 `database_id`에 입력한 후 다음을 실행합니다.

```powershell
npx wrangler d1 migrations apply class-manitto --remote
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npm test
npm run check
npm run deploy
```

`SESSION_SECRET`에는 충분히 긴 무작위 문자열을 사용합니다. 비밀값은 코드·문서·터미널 로그에 출력하지 않습니다.

## 명단 입력 형식

관리자 화면에서 한 줄에 한 학생을 입력합니다.

```text
1, 김가람, 1234
2, 이나무, 5678
3, 박하늘
```

PIN을 생략하면 안전한 4자리 PIN이 자동으로 만들어지고 등록 직후 한 번 표시됩니다. 이후에는 원래 PIN을 다시 조회할 수 없으며 명단을 재등록해 초기화할 수 있습니다.

## 운영 순서

1. 학급 생성
2. 학생 명단 등록
3. 활동 생성
4. `카드 뽑기 열기`
5. 전원이 뽑은 뒤 `활동 시작`
6. 미션 인증 검토와 방명록 관리
7. 마지막 날 `추측 열기` 후 학생들이 자신의 마니또 선택
8. `추측 마감` 후 제출 현황 확인
9. `정체 공개`(추측을 열어 둔 상태라면 자동 마감)
10. 정답자 명단을 복사해 상품 지급 후 활동 종료

## 로컬 확인

```powershell
npm install
npx wrangler d1 migrations apply class-manitto --local
Copy-Item .dev.vars.example .dev.vars
npm run dev
```

`.dev.vars`는 절대 커밋하지 않습니다.
