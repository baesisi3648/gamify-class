window.GENESIS_ASSETS = [
  {
    id: 'GEN-OPEN-001',
    slug: 'opening-corridor',
    category: 'opening',
    categoryLabel: '오프닝 배경',
    title: '빛을 향한 복도',
    subtitle: '왼쪽의 어둠에서 오른쪽 에어록의 빛으로 이동하는 2D 측면 복도',
    thumbnail: 'assets/genesis/thumbs/genesis-opening-corridor.jpg',
    background: 'assets/genesis/genesis-opening-corridor.png',
    editorUrl: 'index.html?genesis=opening-corridor',
    size: '4096 × 1024',
    layers: '아랫배경 1장',
    tags: ['2D 측면', '스토리 워크', '4:1', '에어록'],
    description: '플레이어가 왼쪽에서 오른쪽으로 걸으며 스토리를 읽는 오프닝 구간입니다. 벽면의 넓은 패널은 이후 문구 이미지 오브젝트를 배치할 수 있도록 비워 두었습니다.',
    prompt: '우주선 내부의 긴 2D 측면 복도. 플레이어가 왼쪽에서 오른쪽으로 걷는다. 좌측은 어둡고 긴장감 있게, 우측으로 갈수록 청백색 조명이 밝아지며 마지막은 강한 빛이 새어 나오는 열린 에어록. 천장·벽·바닥이 명확하고, 스토리 오브젝트를 놓을 수 있는 빈 벽면을 남긴다. 4:1 파노라마, 텍스트·인물·UI 없음.'
  },
  {
    id: 'GEN-MAP-001', slug: 'space-corridor', category: 'map', categoryLabel: '맵 세트',
    title: '우주기지 복도', subtitle: '긴 이동 통로와 분리된 앞쪽 방호벽',
    thumbnail: 'assets/genesis/thumbs/space-corridor.jpg', background: 'assets/space-backgrounds/space-corridor.png', top: 'assets/space-backgrounds/space-corridor-top.png',
    editorUrl: 'index.html?space=space-corridor', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['아이소메트릭', '복도', '2 레이어'],
    description: '우주기지의 기본 연결 통로입니다. 앞쪽 방호벽은 투명 윗배경으로 분리되어 캐릭터가 뒤를 지날 때 자연스럽게 가려집니다.'
  },
  {
    id: 'GEN-MAP-002', slug: 'space-stair-room', category: 'map', categoryLabel: '맵 세트',
    title: '계단·수직 이동실', subtitle: '계단과 경사로가 있는 다층 이동 구간',
    thumbnail: 'assets/genesis/thumbs/space-stair-room.jpg', background: 'assets/space-backgrounds/space-stair-room.png', top: 'assets/space-backgrounds/space-stair-room-top.png',
    editorUrl: 'index.html?space=space-stair-room', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['아이소메트릭', '계단', '경사로'],
    description: '층간 이동이나 암호 장치가 있는 전환 공간에 적합합니다. 전면 방호벽과 계단 난간 일부가 윗배경으로 분리되어 있습니다.'
  },
  {
    id: 'GEN-MAP-003', slug: 'space-research-lab', category: 'map', categoryLabel: '맵 세트',
    title: '우주 연구실', subtitle: '분석 패널과 관측창이 있는 연구 공간',
    thumbnail: 'assets/genesis/thumbs/space-research-lab.jpg', background: 'assets/space-backgrounds/space-research-lab.png', top: 'assets/space-backgrounds/space-research-lab-top.png',
    editorUrl: 'index.html?space=space-research-lab', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['아이소메트릭', '연구실', '관측'],
    description: '단서 분석, 연구 일지, 행성 관측 퍼즐을 배치하기 좋은 공간입니다. 앞쪽 유리 안전벽이 별도 윗배경입니다.'
  },
  {
    id: 'GEN-MAP-004', slug: 'space-experiment-lab', category: 'map', categoryLabel: '맵 세트',
    title: '생명·화학 실험실', subtitle: '밀폐 샘플과 배양 장치가 있는 실험 구역',
    thumbnail: 'assets/genesis/thumbs/space-experiment-lab.jpg', background: 'assets/space-backgrounds/space-experiment-lab.png', top: 'assets/space-backgrounds/space-experiment-lab-top.png',
    editorUrl: 'index.html?space=space-experiment-lab', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['아이소메트릭', '실험실', '생명과학'],
    description: '시료 동정이나 실험 순서 퍼즐에 적합합니다. 전면의 배양 유리벽과 방호벽을 윗배경으로 분리했습니다.'
  },
  {
    id: 'GEN-MAP-005', slug: 'space-command-center', category: 'map', categoryLabel: '맵 세트',
    title: '우주 관제실', subtitle: '행성 관측창과 작전 브리핑 공간',
    thumbnail: 'assets/genesis/thumbs/space-command-center.jpg', background: 'assets/space-backgrounds/space-command-center.png', top: 'assets/space-backgrounds/space-command-center-top.png',
    editorUrl: 'index.html?space=space-command-center', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['아이소메트릭', '관제실', '지휘'],
    description: '최종 암호 해독이나 미션 브리핑 공간으로 사용할 수 있습니다. 청색 안전 난간은 투명 윗배경입니다.'
  },
  {
    id: 'GEN-MAP-006', slug: 'space-airlock-hangar', category: 'map', categoryLabel: '맵 세트',
    title: '에어록·격납고', subtitle: '출발과 탈출 장면을 위한 넓은 격납 구역',
    thumbnail: 'assets/genesis/thumbs/space-airlock-hangar.jpg', background: 'assets/space-backgrounds/space-airlock-hangar.png', top: 'assets/space-backgrounds/space-airlock-hangar-top.png',
    editorUrl: 'index.html?space=space-airlock-hangar', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['아이소메트릭', '에어록', '탈출'],
    description: '게임의 출발점이나 마지막 탈출 장면에 적합합니다. 전면의 강화 방호벽이 윗배경으로 분리되어 있습니다.'
  }
];
