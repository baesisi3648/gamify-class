// PROJECT GENESIS · 리보솜 자동 생산 라인
// ZEP Normal App용 main.js

// ─────────────────────────────────────────────────────────────
// 교사가 수정할 값: 설비 전체의 왼쪽 위 기준 타일 좌표
// ─────────────────────────────────────────────────────────────
const BASE_X = 6;
const BASE_Y = 6;

// 한 구간을 이동하고 작업하는 시간(초)
const STEP_SECONDS = 3.5;

const FACTORY_KEY = 'ribosome-factory';
const CARGO_KEY = 'ribosome-amino-cargo';

const factorySprite = App.loadSpritesheet(
  'ribosome-factory-line.png',
  384,
  256,
  {
    work: [0, 1, 2, 3, 4, 5, 6, 7],
    idle: [0]
  },
  4
);

const railSprite = App.loadSpritesheet('ribosome-conveyor-straight.png');
const cargoSprite = App.loadSpritesheet('amino-acid-cargo-pod.png');

// 오른쪽 A 자리에서 왼쪽 E 자리와 배출구로 이동한 뒤 되돌아옵니다.
// 실제 맵에 맞게 BASE_X·BASE_Y만 바꾸면 전체 좌표가 함께 이동합니다.
const cargoRoute = [
  { x: BASE_X + 22, y: BASE_Y + 10, name: 'A 자리 · 아미노산 반입' },
  { x: BASE_X + 17, y: BASE_Y + 10, name: 'P 자리 · 펩타이드 결합' },
  { x: BASE_X + 12, y: BASE_Y + 10, name: 'E 자리 · 빈 tRNA 배출' },
  { x: BASE_X + 5, y: BASE_Y + 10, name: '배출 라인' }
];

let initialized = false;
let elapsed = 0;
let routeIndex = 0;
let routeDirection = 1;

function placeFactory() {
  // 움직이는 리보솜 조립 장치
  Map.putObjectWithKey(BASE_X + 7, BASE_Y, factorySprite, {
    key: FACTORY_KEY,
    overlap: true
  });
  Map.playObjectAnimationWithKey(FACTORY_KEY, 'work', -1);

  // 외부 직선 레일 3개를 연속 배치
  Map.putObjectWithKey(BASE_X, BASE_Y + 8, railSprite, {
    key: 'ribosome-rail-1',
    overlap: true
  });
  Map.putObjectWithKey(BASE_X + 8, BASE_Y + 8, railSprite, {
    key: 'ribosome-rail-2',
    overlap: true
  });
  Map.putObjectWithKey(BASE_X + 16, BASE_Y + 8, railSprite, {
    key: 'ribosome-rail-3',
    overlap: true
  });

  // 레일 위를 실제로 이동하는 아미노산 포드
  Map.putObjectWithKey(cargoRoute[0].x, cargoRoute[0].y, cargoSprite, {
    key: CARGO_KEY,
    overlap: true,
    movespeed: 45
  });
}

function moveToNextProcess() {
  routeIndex += routeDirection;

  if (routeIndex >= cargoRoute.length) {
    routeIndex = cargoRoute.length - 2;
    routeDirection = -1;
  } else if (routeIndex < 0) {
    routeIndex = 1;
    routeDirection = 1;
  }

  const target = cargoRoute[routeIndex];
  // false: 시각 효과용 레일을 따라 움직이므로 충돌 타일의 영향을 받지 않습니다.
  Map.moveObjectWithKey(CARGO_KEY, target.x, target.y, false);
}

App.onStart.Add(function () {
  if (initialized) return;
  initialized = true;
  placeFactory();
  App.showCenterLabel('리보솜 단백질 생산 라인 가동', 0xffffff, 0x173348, 0, 2400);
});

App.onUpdate.Add(function (dt) {
  if (!initialized) return;
  elapsed += dt;
  if (elapsed < STEP_SECONDS) return;
  elapsed = 0;
  moveToNextProcess();
});

