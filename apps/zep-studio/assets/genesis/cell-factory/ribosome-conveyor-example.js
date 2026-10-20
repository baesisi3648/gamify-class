// ZEP Script 리보솜 생산 라인 이동 예제
// 1) amino-acid-cargo-pod.png를 ZEP Script 프로젝트의 assets 폴더에 넣습니다.
// 2) 아래 좌표를 실제 맵의 레일 시작점과 A 자리 좌표로 바꿉니다.
// 3) Q 키를 누르면 A 자리로, W 키를 누르면 시작점으로 이동합니다.

const START_X = 8;
const START_Y = 12;
const A_SITE_X = 18;
const A_SITE_Y = 12;
const CARGO_KEY = 'ribosome-amino-cargo';

const aminoCargo = App.loadSpritesheet('amino-acid-cargo-pod.png');

App.onStart.Add(function () {
  Map.putObjectWithKey(START_X, START_Y, aminoCargo, {
    key: CARGO_KEY,
    overlap: true,
    movespeed: 45
  });
});

// Q: 레일을 따라 A 자리로 이동
App.addOnKeyDown(81, function () {
  Map.moveObjectWithKey(CARGO_KEY, A_SITE_X, A_SITE_Y, true);
});

// W: 다음 시연을 위해 시작점으로 복귀
App.addOnKeyDown(87, function () {
  Map.moveObjectWithKey(CARGO_KEY, START_X, START_Y, true);
});

