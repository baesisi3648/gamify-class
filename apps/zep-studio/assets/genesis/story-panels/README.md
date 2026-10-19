# Project Genesis 오프닝 스토리 패널

- 출력 크기: 1024 × 576 PNG
- ZEP `나의 오브젝트` 업로드 제한(가로·세로 각 1024px 이내)에 맞춘 크기
- 바깥 배경: 투명
- 한글 폰트: `/fonts/PretendardVariable.woff2`
- 문구 데이터: `apps/zep-studio/genesis-story-panels.js`
- 렌더러: `apps/zep-studio/story-panel-renderer.html`

문구를 수정한 뒤 저장소 루트에서 아래 명령을 실행하면 7개 PNG가 모두 다시 생성됩니다.

```powershell
node apps/zep-studio/render-story-panels.mjs
```

Windows에서 브라우저 실행이 제한된 경우에는 같은 데이터 파일을 읽는 Canvas 렌더러를 사용할 수 있습니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/zep-studio/render-story-panels.ps1
```

파일 이름은 `panel_01.png`부터 `panel_07.png`까지 유지됩니다.
