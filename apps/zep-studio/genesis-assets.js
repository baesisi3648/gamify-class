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
    id: 'GEN-OPEN-002',
    slug: 'dark-light-passage',
    category: 'opening',
    categoryLabel: '오프닝 배경',
    title: '암흑에서 빛으로',
    subtitle: '검정 통로를 지나 오른쪽 끝의 빛으로 향하는 미니멀 배경',
    thumbnail: 'assets/genesis/thumbs/genesis-dark-light-passage.jpg',
    background: 'assets/genesis/genesis-dark-light-passage.png',
    editorUrl: 'index.html?genesis=dark-light-passage',
    size: '4096 × 512',
    layers: '아랫배경 1장',
    tags: ['2D 측면', '미니멀', '검정 통로', '빛의 출구'],
    description: '화면 대부분을 검정으로 비우고 희미한 바닥선만 남긴 긴 통로입니다. 오른쪽 끝으로 갈수록 청백색 빛이 자연스럽게 강해져, 플레이어가 어둠에서 빛으로 걸어가는 오프닝에 적합합니다.',
    prompt: '거의 순수한 검정으로 이루어진 매우 긴 2D 측면 통로. 희미한 바닥선만 왼쪽에서 오른쪽으로 이어지고, 오른쪽 마지막 10~15%에서만 청백색 출구 빛이 강해진다. 구조물·기계·문·패널·배관·소품·텍스트·인물·UI 없음.'
  },
  {
    id: 'GEN-MAP-007', slug: 'moon-surface-earth', category: 'map', categoryLabel: '맵 세트',
    title: '달 표면·지구 전망', subtitle: '달의 큰 반원과 지구가 보이는 넓은 ZEP 야외 맵',
    thumbnail: 'assets/genesis/thumbs/genesis-moon-surface-earth.jpg', background: 'assets/genesis/genesis-moon-surface-earth.png',
    editorUrl: 'index.html?genesis=moon-surface-earth', size: '1672 × 941', layers: '아랫배경 1장', tags: ['달 표면', '지구', '에어록', '야외 탐사'],
    description: '보내주신 ZEP 달 맵처럼 화면 아래쪽에는 캐릭터가 돌아다닐 수 있는 거대한 반원형 달 표면을, 왼쪽 우주에는 푸르게 빛나는 지구를 배치했습니다. 회갈색의 입체적인 달 지형과 선명한 분화구, 은은한 청록색 우주광을 사용한 ZEP형 야외 게임 배경입니다.',
    prompt: '가로 16:9 ZEP용 2D 야외 게임 맵. 화면 아래쪽과 중앙에는 위에서 비스듬히 내려다본 거대한 반원형 달 표면이 넓게 펼쳐지고, 왼쪽 상단 우주에는 푸르게 빛나는 지구가 보인다. 실제 ZEP 달 맵처럼 회갈색의 입체적인 달 지형, 선명하지만 일러스트풍인 분화구와 암석, 부드러운 명암, 은은한 청록색 우주광, 넓은 캐릭터 이동 공간. 1인칭 시점·복도·출구 프레임·인물·우주인·우주선·차량·오브젝트·UI·문자·로고 없음.'
  },
  {
    id: 'GEN-OBJ-001', slug: 'space-shuttle', category: 'object', categoryLabel: '오브젝트',
    title: '탐사용 우주왕복선', subtitle: '달 표면 배치용 회색 소형 왕복선',
    thumbnail: 'assets/genesis/objects/space-shuttle.png', background: 'assets/genesis/objects/space-shuttle.png',
    editorUrl: 'index.html?workspace=object&object=space-shuttle', size: '768 × 512', layers: '투명 PNG 1장', tags: ['우주왕복선', '탈출', '탐사', '대형 오브젝트'],
    description: '달 표면과 격납고에 배치할 수 있는 3/4 시점의 소형 우주왕복선입니다. 로고 없이 제작되어 수업 이야기와 미션에 맞게 자유롭게 사용할 수 있습니다.',
    prompt: 'ZEP형 2D 소셜 메타버스 맵용 우주왕복선. 회색 패널, 검은 조종석, 굵은 외곽선, 3/4 탑다운 시점, 투명 배경.'
  },
  {
    id: 'GEN-OBJ-002', slug: 'lunar-lander', category: 'object', categoryLabel: '오브젝트',
    title: '달 착륙선', subtitle: '주황색 지지대가 있는 소형 탐사선',
    thumbnail: 'assets/genesis/objects/lunar-lander.png', background: 'assets/genesis/objects/lunar-lander.png',
    editorUrl: 'index.html?workspace=object&object=lunar-lander', size: '768 × 512', layers: '투명 PNG 1장', tags: ['달 착륙선', '탐사', '기지', '대형 오브젝트'],
    description: '짧은 네 개의 착륙 다리와 주황색 구조물을 가진 소형 달 착륙선입니다. 우주왕복선보다 작은 크기로 배치하면 자연스럽습니다.',
    prompt: 'ZEP형 2D 소셜 메타버스 맵용 달 착륙선. 흰색 선실, 주황색 착륙 다리, 굵은 외곽선, 3/4 탑다운 시점, 투명 배경.'
  },
  {
    id: 'GEN-OBJ-003', slug: 'astronaut-explorer', category: 'object', categoryLabel: '오브젝트',
    title: '우주 탐사대원', subtitle: '검은 바이저의 기본 우주복 캐릭터',
    thumbnail: 'assets/genesis/objects/astronaut-explorer.png', background: 'assets/genesis/objects/astronaut-explorer.png',
    editorUrl: 'index.html?workspace=object&object=astronaut-explorer', size: '768 × 685', layers: '투명 PNG 1장', tags: ['우주복', '우주인', '탐사대원', '캐릭터'],
    description: '커다란 검은 바이저와 짧은 체형을 사용한 기본 우주 탐사대원입니다. 달 표면의 NPC 또는 미션 안내 캐릭터로 활용할 수 있습니다.',
    prompt: 'ZEP형 치비 우주 탐사대원. 흰색 우주복, 검은 바이저, 짧은 체형, 3/4 시점, 투명 배경.'
  },
  {
    id: 'GEN-OBJ-004', slug: 'astronaut-scientist', category: 'object', categoryLabel: '오브젝트',
    title: '우주 현장 연구원', subtitle: '휴대용 탐지기를 든 우주복 연구원',
    thumbnail: 'assets/genesis/objects/astronaut-scientist.png', background: 'assets/genesis/objects/astronaut-scientist.png',
    editorUrl: 'index.html?workspace=object&object=astronaut-scientist', size: '713 × 768', layers: '투명 PNG 1장', tags: ['우주복', '여성 연구원', '탐지기', '캐릭터'],
    description: '주황색 안전 표시가 있는 우주복과 휴대용 탐지기를 든 현장 연구원입니다. 시료 조사나 구조 신호 탐색 장면에 어울립니다.',
    prompt: 'ZEP형 치비 우주 현장 연구원. 주황색 포인트의 흰 우주복, 휴대용 탐지기, 걷는 자세, 투명 배경.'
  },
  {
    id: 'GEN-OBJ-005', slug: 'helper-robot', category: 'object', categoryLabel: '오브젝트',
    title: '달 탐사 도우미 로봇', subtitle: '푸른 눈을 가진 친근한 안내 로봇',
    thumbnail: 'assets/genesis/objects/helper-robot.png', background: 'assets/genesis/objects/helper-robot.png',
    editorUrl: 'index.html?workspace=object&object=helper-robot', size: '768 × 710', layers: '투명 PNG 1장', tags: ['로봇', '안내', '도우미', '캐릭터'],
    description: '청록색 눈과 작은 안테나를 가진 친근한 도우미 로봇입니다. 튜토리얼 안내, 힌트 제공, 기지 관리 NPC로 사용할 수 있습니다.',
    prompt: 'ZEP형 치비 도우미 로봇. 흰색과 청회색 장갑, 푸른 화면 눈, 작은 안테나, 투명 배경.'
  },
  {
    id: 'GEN-OBJ-006', slug: 'security-robot', category: 'object', categoryLabel: '오브젝트',
    title: '우주기지 경비 로봇', subtitle: '주황색 바이저의 경계형 로봇',
    thumbnail: 'assets/genesis/objects/security-robot.png', background: 'assets/genesis/objects/security-robot.png',
    editorUrl: 'index.html?workspace=object&object=security-robot', size: '743 × 768', layers: '투명 PNG 1장', tags: ['로봇', '경비', '미션', '캐릭터'],
    description: '주황색 바이저와 방패형 스캐너를 가진 우주기지 경비 로봇입니다. 경계 구역이나 잠금 장치 미션의 NPC로 활용할 수 있습니다.',
    prompt: 'ZEP형 치비 경비 로봇. 흑연색 장갑, 주황색 바이저와 표시등, 방패형 스캐너, 투명 배경.'
  },
  {
    id: 'GEN-OBJ-007', slug: 'station-researcher', category: 'object', categoryLabel: '오브젝트',
    title: '우주기지 분석 연구원', subtitle: '태블릿을 든 안경 쓴 연구원',
    thumbnail: 'assets/genesis/objects/station-researcher.png', background: 'assets/genesis/objects/station-researcher.png',
    editorUrl: 'index.html?workspace=object&object=station-researcher', size: '696 × 768', layers: '투명 PNG 1장', tags: ['연구원', '태블릿', '안경', '캐릭터'],
    description: '태블릿으로 탐사 자료를 분석하는 우주기지 연구원입니다. 연구실·관제실·브리핑 장면의 NPC로 사용할 수 있습니다.',
    prompt: 'ZEP형 치비 남성 연구원. 흰 실험복, 남색 우주기지 제복, 안경과 태블릿, 투명 배경.'
  },
  {
    id: 'GEN-OBJ-008', slug: 'astrobiology-researcher', category: 'object', categoryLabel: '오브젝트',
    title: '우주생물학 연구원', subtitle: '밀폐 시료를 관찰하는 생명과학 연구원',
    thumbnail: 'assets/genesis/objects/astrobiology-researcher.png', background: 'assets/genesis/objects/astrobiology-researcher.png',
    editorUrl: 'index.html?workspace=object&object=astrobiology-researcher', size: '696 × 768', layers: '투명 PNG 1장', tags: ['연구원', '생명과학', '시료', '캐릭터'],
    description: '밀폐된 우주 시료와 데이터 패드를 든 우주생물학 연구원입니다. 외계 생명체 조사나 시료 분석 퍼즐에 어울립니다.',
    prompt: 'ZEP형 치비 여성 우주생물학 연구원. 흰 실험복, 주황색 우주기지 제복, 시료병과 데이터 패드, 투명 배경.'
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
