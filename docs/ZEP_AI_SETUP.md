# ZEP 맵 공방 — Workers AI 연결

`/apps/zep-studio/`의 수동 편집 기능은 별도 설정 없이 작동합니다. 저장소의 `wrangler.jsonc`가 Workers AI 바인딩 `AI`를 선언하므로 최신 Cloudflare Pages 빌드에서는 자동으로 연결됩니다.

아래의 대시보드 설정은 상태 API에서 `"ready": false`가 계속 표시될 때만 사용합니다.

## 필수 설정

1. Cloudflare 대시보드에서 **Workers & Pages**로 이동합니다.
2. Gamify Class Pages 프로젝트를 선택합니다.
3. **Settings → Bindings → Add binding → Workers AI**를 선택합니다.
4. Variable name을 정확히 `AI`로 입력합니다.
5. Production 환경에 저장하고 최신 배포를 **Retry deployment** 또는 재배포합니다.

연결 여부는 아래 주소에서 확인할 수 있습니다.

```text
https://gamifyclass.pages.dev/api/zep/generate
```

`"ready": true`이면 생성 기능을 사용할 수 있습니다.

## 선택 설정: 관리자 코드

공개 사용자가 무료 할당량을 소진하지 못하게 하려면 Pages 프로젝트의 **Variables and Secrets**에 다음 Secret을 추가합니다.

```text
ZEP_AI_ACCESS_CODE=교사가 정한 코드
```

코드를 추가한 뒤 재배포하면 AI 생성 창에서 관리자 코드를 입력한 사용자만 이미지를 생성할 수 있습니다. Secret을 설정하지 않으면 같은 사이트에서 들어온 요청을 허용합니다.

## 비용 보호

Cloudflare Workers Free 플랜에서는 무료 Neuron 할당량을 다 사용하면 생성 요청이 실패하며 자동으로 초과 요금이 청구되지 않습니다. 유료 플랜 계정에서는 Cloudflare AI 사용량 대시보드를 함께 확인합니다.
