# 게임 소스

GAMIFY CLASS에서 소개하는 게임의 원본 소스입니다. `apps/` 아래 각 폴더는 별도 GitHub 저장소의
`main` 브랜치에서 가져왔으며, 부모 저장소에서 파일을 직접 추적할 수 있도록 중첩된
`.git` 디렉터리는 포함하지 않습니다.

| 폴더 | 원본 저장소 | 가져온 커밋 |
| --- | --- | --- |
| `bio-marble/` | `https://github.com/baesisi3648/bio-marble` | `c75936106094460499fd5e6090316ff5d91820b8` |
| `pjt-bio-betting/` | `https://github.com/baesisi3648/pjt-bio-betting` | `f0db250c35fe7e3d6305de1524abc13c80e4798c` |

`bio-marble/`은 정적 HTML/CSS/JavaScript 게임입니다. `pjt-bio-betting/web/`의 현재
애니멀 더비는 Cloudflare Workers, Durable Objects, D1을 사용하므로 별도 빌드와
Workers 배포가 필요합니다.

부모 저장소에 편입하면서 `bio-marble/`의 공개 고정 관리자 비밀번호는 제거하고,
브라우저에서 처음 사용할 때 로컬 비밀번호를 정하는 방식으로 보정했습니다.
