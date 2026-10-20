// PROJECT GENESIS - 노후 생명·화학 실험실 전용 리보솜 생산라인
// 960×640(32px 타일, 30×20칸) ZEP Normal App

const STEP_SECONDS = 2.4;
const FACTORY_KEY = 'weathered-biolab-ribosome-factory';
const CARGO_KEY = 'weathered-biolab-amino-cargo';
const ARM_LEFT_KEY = 'weathered-biolab-robot-arm-left';
const ARM_RIGHT_KEY = 'weathered-biolab-robot-arm-right';

const factorySprite = App.loadSpritesheet(
  'ribosome-factory-line.png',
  320,
  224,
  { work: [0, 1, 2, 3, 4, 5, 6, 7], idle: [0] },
  4
);

const railSprite = App.loadSpritesheet('ribosome-conveyor-straight.png');
const cargoSprite = App.loadSpritesheet('amino-acid-cargo-pod.png');
const robotArmSprite = App.loadSpritesheet(
  'ribosome-robot-arm-animated.png',
  80,
  160,
  { work: [0, 1, 2, 3, 4, 5] },
  5
);

// 본체는 오른쪽 작업 구역에 두고 남서쪽을 향하도록 좌우 반전했습니다.
// 대각선 레일의 끝점이 맞닿도록 남서쪽에서 북동쪽으로 이어 붙입니다.
const railPositions = [
  { x: 10, y: 14, key: 'weathered-biolab-rail-1' },
  { x: 15, y: 12, key: 'weathered-biolab-rail-2' },
  { x: 20, y: 10, key: 'weathered-biolab-rail-3' }
];

const cargoRoute = [
  { x: 20, y: 10, label: 'A 자리 · 아미노산 반입' },
  { x: 15, y: 12, label: 'P 자리 · 펩타이드 결합' },
  { x: 10, y: 14, label: '완성 단백질 배출' }
];

let initialized = false;
let elapsed = 0;
let routeIndex = 0;
let routeDirection = 1;

function placeRibosomeRoom() {
  Map.putObjectWithKey(20, 8, factorySprite, {
    key: FACTORY_KEY,
    overlap: true
  });
  Map.playObjectAnimationWithKey(FACTORY_KEY, 'work', -1);

  Map.putObjectWithKey(17, 9, robotArmSprite, {
    key: ARM_LEFT_KEY,
    overlap: true
  });
  Map.putObjectWithKey(23, 9, robotArmSprite, {
    key: ARM_RIGHT_KEY,
    overlap: true
  });
  Map.playObjectAnimationWithKey(ARM_LEFT_KEY, 'work', -1);
  Map.playObjectAnimationWithKey(ARM_RIGHT_KEY, 'work', -1);

  railPositions.forEach(function (position) {
    Map.putObjectWithKey(position.x, position.y, railSprite, {
      key: position.key,
      overlap: true
    });
  });

  Map.putObjectWithKey(cargoRoute[0].x, cargoRoute[0].y, cargoSprite, {
    key: CARGO_KEY,
    overlap: true,
    movespeed: 52
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
    '리보솜 단백질 생산라인이 가동되었습니다.',
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
