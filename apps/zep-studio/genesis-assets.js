window.GENESIS_ASSETS = [
  {
    id: 'GEN-OPEN-001',
    slug: 'opening-corridor',
    category: 'opening',
    categoryLabel: '오프닝 배경',
    title: '빛을 향한 복도 · ZEP 스케일',
    subtitle: '자연스러운 비율의 네 구역을 이어 만든 ZEP용 2D 측면 복도',
    thumbnail: 'assets/genesis/thumbs/genesis-opening-corridor-zep-scale.jpg',
    background: 'assets/genesis/genesis-opening-corridor-zep-scale.png',
    archiveBackground: 'assets/genesis/genesis-opening-corridor.png',
    editorUrl: 'index.html?genesis=opening-corridor',
    size: '4096 × 512',
    layers: '아랫배경 1장',
    tags: ['2D 측면', 'ZEP 스케일', '스토리 워크', '에어록'],
    description: '정비·배관, 통신·전력, 연구·관측, 에어록 접근 구역을 각각 자연스러운 건축 비율로 제작해 이어 붙인 오프닝 배경입니다. 문은 ZEP 캐릭터 2~3명 정도 높이이며, 왼쪽에서 오른쪽으로 갈수록 밝아집니다. 기존 4096 × 1024 원본도 보관되어 있습니다.',
    prompt: '우주선 내부의 길고 어두운 2D 측면 복도. 정비·배관 구역, 통신·전력 구역, 연구·관측 구역, 밝은 에어록 접근 구역을 실제 새로운 공간으로 길게 이어 붙인다. 작은 ZEP 캐릭터 기준으로 문과 벽 높이는 캐릭터 2~3명 정도이며 건축물의 가로세로 비율을 찌그러뜨리지 않는다. 위아래에는 검정 여백이 있고 좌측에서 우측으로 갈수록 밝아진다. 텍스트·인물·UI 없음.'
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
