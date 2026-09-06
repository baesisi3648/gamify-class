# GAMIFY CLASS

교사가 직접 만든 수업 게임과 교실 도구를 모아 두는 페이지.

저장소는 `baesisi3648/gamify-class`. 빌드 도구도 프레임워크도 없습니다.
HTML 세 장과 CSS 한 장이 전부입니다.

```
index.html        /      — 검정 배경 브랜드 소개 랜딩
apps/index.html   /apps  — 흰 배경 앱 라이브러리 (사이드바 + 카드)
404.html                 — 없는 주소일 때 (Pages가 자동으로 씁니다)
assets/base.css          — 두 페이지가 같이 쓰는 색·폰트·버튼
assets/og.jpg            — 카톡·SNS 공유 대표 이미지 (1200×630)
assets/{게임}.jpg         — 게임 카드 썸네일 (960×540, 16:9)
fonts/                   — Pretendard Variable (자체 호스팅)
```

## 보기

경로가 `/assets/...`처럼 루트 기준이라 파일을 더블클릭하면 안 열립니다.
저장소 폴더에서 서버를 하나 띄우세요.

```sh
python3 -m http.server 8788
# http://localhost:8788/ 와 http://localhost:8788/apps/
```

## 화면 구조

**`/` 랜딩** — 5개 섹션. 히어로(GAMIFY CLASS + START PLAYING) → 철학(PLAY·LEARN·TOGETHER)
→ 무엇이 있는지 → 왜 쓰는지 4가지 → 마지막 CTA. 두 CTA 모두 `/apps`로 갑니다.

**`/apps` 앱 라이브러리** — 왼쪽 카테고리 사이드바(전체 / 학급 경영 / 수업 / 기타),
오른쪽 썸네일 카드 그리드. 카테고리는 `#classroom` 같은 해시로 바뀌어서 주소를 그대로 공유할 수 있습니다.
900px 아래에서는 사이드바가 상단 가로 칩 줄로 바뀝니다.

## 앱 추가하기

`apps/index.html` 아래쪽 `<script>`의 **`APPS` 배열에 항목 하나만 추가**하면 카드가 자동으로 생깁니다.
HTML은 건드리지 않습니다.

```js
{
  id: "seat-shuffle",
  title: "자리 배치",
  description: "한 줄 설명. 두 문장을 넘기지 마세요.",
  category: "class",             // class | classroom | etc
  tags: ["RANDOM", "SEATING"],
  url: "https://...",
  thumbnail: "/assets/seat-shuffle.jpg",
  thumbAlt: "스크린리더가 읽을 화면 설명",
  status: "available",           // available | building
  external: true,                // 새 탭으로 열기
  links: [                       // 선택 — 카드 안 보조 링크
    { label: "학생 화면 (폰)", url: "https://..." }
  ]
}
```

카드 몸통을 누르면 `url`로 갑니다. `links`를 넣으면 카드 안에 작은 링크가 따로 붙습니다
(애니멀 더비가 이 방식입니다 — 카드는 교사 화면, 안에 학생 화면과 가이드).

**카테고리를 늘리려면** 바로 아래 `CATEGORIES` 배열에 `{ id, en, ko, desc }`를 추가하면
사이드바 메뉴와 개수 표시가 따라옵니다.

## 썸네일 만들기

실제 게임 화면을 캡처해서 **960×540 (16:9)** JPEG로 넣습니다.

```sh
sips -c <높이> <너비> raw.png --out crop.png   # 16:9로 가운데 자르기
sips -z 540 960 crop.png --out small.png
sips -s format jpeg -s formatOptions 76 small.png --out assets/이름.jpg
```

화면이 16:9보다 가로로 길면 위아래를 그 앱 배경색으로 채웁니다.

```sh
sips -p 540 960 --padColor 0F1720 small.png --out padded.png
```

## 디자인

색과 폰트는 **`assets/base.css`의 `:root` 한 곳**에만 있습니다. 여기만 고치면 두 페이지에 같이 반영됩니다.

| 역할 | 값 |
| --- | --- |
| 포인트 (라임) | `#a3e635` — 검정 위에서는 형광, 흰색 위에서는 형광펜 |
| 어두운 면 배경 | `#0a0a0b` · 패널 `#101012` |
| 밝은 면 배경 | `#ffffff` · 패널 `#fbfbfa` |
| 본문 | Pretendard Variable (`fonts/`, SIL OFL) |
| 작은 라벨 | 시스템 mono — **영문 전용** |

작은 대문자 라벨(`.eyebrow`)은 자간이 넓어서 한글을 넣으면 글자가 떠 보입니다.
그 자리에는 영문만 쓰고, 한글은 본문 폰트로 갑니다.

## 공유 이미지 (og:image)

카톡·슬랙 등에 링크를 붙였을 때 뜨는 대표 이미지는 `assets/og.jpg` (1200×630)입니다.
`index.html`과 `apps/index.html`의 `og:image` 태그가 이 파일을 가리킵니다.

바꾼 뒤에는 **카카오가 옛 이미지를 캐시하고 있어서 바로 안 바뀝니다.**
https://developers.kakao.com/tool/debugger — "카카오톡 URL 메타정보 관리"에서
주소를 넣고 초기화하세요. **카카오계정 로그인이 필요합니다.**

## 게임 링크

| 게임 | 주소 |
| --- | --- |
| Bio Marble | `bio-marble.pages.dev` |
| Bio Marble — 가이드 | `bio-marble.pages.dev/guide` |
| 애니멀 더비 — 교사 (TV) | `wilde-derby.baesisi3648.workers.dev/teacher` |
| 애니멀 더비 — 학생 (폰) | `wilde-derby.baesisi3648.workers.dev/` |
| 애니멀 더비 — 가이드 | `wilde-derby.baesisi3648.workers.dev/guide` |

애니멀 더비(예전 이름 와일드 더비)는 2026-09-05부터 Cloudflare Workers에서 돕니다. 주소가 고정이라 재배포해도 바뀌지 않습니다.
예전 Apps Script 판은 이 페이지에서 더 링크하지 않습니다.

## 배포

**Cloudflare Pages** — 프로젝트 `gamifyclass` → **gamifyclass.pages.dev**.
`main`에 푸시하면 자동 재배포됩니다.

서브도메인은 프로젝트 이름에서 나옵니다. 바꾸려면 Settings → General → Rename.
(옛 `bae-lab` 프로젝트는 2026-09-06에 삭제했습니다. bae-lab.pages.dev는 더 이상 열리지 않습니다.)

새로 만들 때 설정은 아래와 같습니다.

| 항목 | 값 |
| --- | --- |
| Framework preset | `None` |
| Build command | 비움 |
| Build output directory | `/` |

빌드가 없어서 `main`에 푸시하면 몇 초 만에 재배포됩니다.
`/apps`는 Pages가 `apps/index.html`을 알아서 찾아 주므로 `_redirects`나 라우팅 설정이 필요 없습니다.
새로고침해도 404가 나지 않습니다.
