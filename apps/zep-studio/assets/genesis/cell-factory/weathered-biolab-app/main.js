// PROJECT GENESIS - 노후 생명·화학 실험실 전용 리보솜 방
// 960×640(32px 타일, 30×20칸) 맵에 맞춘 ZEP Normal App입니다.

const STEP_SECONDS = 3.2;
const FACTORY_KEY = 'weathered-biolab-ribosome-factory';
const CARGO_KEY = 'weathered-biolab-amino-cargo';

const factorySprite = App.loadSpritesheet(
  'ribosome-factory-line.png',
  320,
  224,
  {
    work: [0, 1, 2, 3, 4, 5, 6, 7],
    idle: [0]
  },
  4
);

const railSprite = App.loadSpritesheet('ribosome-conveyor-straight.png');
const cargoSprite = App.loadSpritesheet('amino-acid-cargo-pod.png');

// 노후 생명·화학 실험실의 열린 중앙 바닥에 맞춘 고정 좌표입니다.
// 설비: (10, 8), 레일과 운반 포드: y=14
const railPositions = [
  { x: 5, y: 14, key: 'weathered-biolab-rail-1' },
  { x: 11, y: 14, key: 'weathered-biolab-rail-2' },
  { x: 17, y: 14, key: 'weathered-biolab-rail-3' }
];

// A → P → E → 배출 순으로 이동한 뒤 다시 반대 방향으로 순환합니다.
const cargoRoute = [
  { x: 19, y: 14, label: 'A 자리 · 아미노산 반입' },
  { x: 15, y: 14, label: 'P 자리 · 펩타이드 결합' },
  { x: 11, y: 14, label: 'E 자리 · 빈 tRNA 배출' },
  { x: 7, y: 14, label: '완성 단백질 배출' }
];

let initialized = false;
let elapsed = 0;
let routeIndex = 0;
let routeDirection = 1;

function placeRibosomeRoom() {
  Map.putObjectWithKey(10, 8, factorySprite, {
    key: FACTORY_KEY,
    overlap: true
  });
  Map.playObjectAnimationWithKey(FACTORY_KEY, 'work', -1);

  railPositions.forEach(function (position) {
    Map.putObjectWithKey(position.x, position.y, railSprite, {
      key: position.key,
      overlap: true
    });
  });

  Map.putObjectWithKey(cargoRoute[0].x, cargoRoute[0].y, cargoSprite, {
    key: CARGO_KEY,
    overlap: true,
    movespeed: 42
  });
}

function moveCargo() {
  routeIndex += routeDirection;

  if (routeIndex >= cargoRoute.length) {
    routeIndex = cargoRoute.length - 2;
    routeDirection = -1;
  } else if (routeIndex < 0) {
    routeIndex = 1;
    routeDirection = 1;
  }

  const target = cargoRoute[routeIndex];
  Map.moveObjectWithKey(CARGO_KEY, target.x, target.y, false);
}

App.onStart.Add(function () {
  if (initialized) return;
  initialized = true;
  placeRibosomeRoom();
  App.showCenterLabel(
    '리보솜 단백질 생산 라인이 가동되었습니다.',
    0xffffff,
    0x173348,
    0,
    2400
  );
});

App.onUpdate.Add(function (dt) {
  if (!initialized) return;
  elapsed += dt;
  if (elapsed < STEP_SECONDS) return;
  elapsed = 0;
  moveCargo();
});
