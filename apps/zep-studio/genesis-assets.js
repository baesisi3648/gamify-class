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
    id: 'GEN-OBJ-009', slug: 'dormant-nuclear-loader-robot-grounded', category: 'object', categoryLabel: '오브젝트',
    title: '휴면 핵물질 적재 로봇', subtitle: '밀폐된 핵물질 용기를 발사체로 운반하는 휴면형 중장비 로봇',
    thumbnail: 'assets/genesis/objects/dormant-nuclear-loader-robot-grounded.png', background: 'assets/genesis/objects/dormant-nuclear-loader-robot-grounded.png',
    editorUrl: 'index.html?workspace=object&object=dormant-nuclear-loader-robot-grounded', size: '1024 × 683 · 0.72 MB', layers: '접지 그림자 포함 투명 PNG 1장', tags: ['로봇', '핵물질', '적재 장치', '발사체', '휴면 상태'],
    description: '달 기지에서 밀폐형 핵물질 용기를 발사체 적재 구역으로 운반하는 무인 중장비입니다. 두 적재팔과 고정 클램프가 접혀 있고 화면이 꺼진 채 작은 대기등만 켜져 있어 장기간 휴면 중인 상태를 표현했습니다. 투명 바닥에 은은한 접지 그림자를 넣어 ZEP 맵에서 떠 보이지 않습니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 핵물질 적재 로봇. 낮은 궤도형 차체, 접힌 적재팔, 밀폐 용기와 고정 클램프, 꺼진 화면, 희미한 주황색 대기등, 낡은 달 기지 장비.'
  },
  {
    id: 'GEN-OBJ-010', slug: 'dormant-nuclear-launch-platform', category: 'object', categoryLabel: '오브젝트',
    title: '휴면 핵 발사대', subtitle: '적재 로봇의 밀폐 용기를 장착하는 폐쇄형 달 기지 발사 장치',
    thumbnail: 'assets/genesis/objects/dormant-nuclear-launch-platform.png', background: 'assets/genesis/objects/dormant-nuclear-launch-platform.png',
    editorUrl: 'index.html?workspace=object&object=dormant-nuclear-launch-platform', size: '1024 × 683 · 0.92 MB', layers: '접지 그림자 포함 투명 PNG 1장', tags: ['핵 발사대', '달 기지', '적재구', '휴면 상태', '발사 장치'],
    description: '휴면 적재 로봇이 운반한 밀폐 용기를 앞쪽 원형 적재구에 넣는 가상의 달 기지 발사대입니다. 발사관과 고정 장치가 모두 잠겨 있고 화면이 꺼진 채 대기등만 남아 있어 비가동 상태로 배치할 수 있습니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 휴면 핵 발사대. 원형 측면 적재구, 기울어진 밀폐 발사관, 고정 클램프, 접힌 정비 구조물, 꺼진 화면, 희미한 주황색 대기등, 부드러운 접지 그림자.'
  },
  {
    id: 'GEN-NUC-001', slug: 'nucleus-command-core', category: 'object', categoryLabel: '핵 방',
    title: '핵 이중막 통제 코어', subtitle: '핵막과 중앙 관제 시스템을 결합한 핵 방의 중심 오브젝트',
    thumbnail: 'assets/genesis/objects/nucleus-command-core.png', background: 'assets/genesis/objects/nucleus-command-core.png',
    editorUrl: 'index.html?workspace=object&object=nucleus-command-core', size: '1024 × 683', layers: '접지 그림자 포함 투명 PNG 1장', tags: ['핵 방', '핵막', '이중막', '통제 센터', 'DNA'],
    description: '핵의 이중막을 두 겹의 원형 관제 링으로 표현하고, 핵공처럼 보이는 출입 모듈과 다수의 컴퓨터 콘솔을 배치했습니다. 중앙 DNA 홀로그램이 유전 정보 통제를 상징합니다. 공방에서는 방 중앙용 480px 크기로 불러옵니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 핵 통제 센터. 원형 이중 핵막, 핵공 출입구, 낡은 컴퓨터 콘솔, 중앙 DNA 홀로그램, 아이보리 금속과 청록 조명.'
  },
  {
    id: 'GEN-NUC-002', slug: 'dna-genomic-data-archive', category: 'object', categoryLabel: '핵 방',
    title: 'DNA 유전체 데이터 보관소', subtitle: '염색체 데이터를 세 개의 발광 캡슐에 저장한 기록 장치',
    thumbnail: 'assets/genesis/objects/dna-genomic-data-archive.png', background: 'assets/genesis/objects/dna-genomic-data-archive.png',
    editorUrl: 'index.html?workspace=object&object=dna-genomic-data-archive', size: '1024 × 683', layers: '접지 그림자 포함 투명 PNG 1장', tags: ['핵 방', 'DNA', '유전체', '염색체', '데이터 보관'],
    description: '서로 다른 염색체 데이터를 보관하는 세 개의 DNA 캡슐과 분석 콘솔입니다. 핵 방의 뒤쪽 벽이나 좌우 보조 구역에 1~2개 배치하면 유전 정보 저장소 역할이 분명해집니다. 공방 권장 크기는 230px입니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 DNA 데이터 보관소. 세 개의 유리 캡슐, 청록·보라색 이중나선, 분석 콘솔, 낡은 우주 관제실 재질.'
  },
  {
    id: 'GEN-NUC-003', slug: 'nucleolus-fabrication-core', category: 'object', categoryLabel: '핵 방',
    title: '인 조립·생산 코어', subtitle: '리보솜 구성 요소를 생산해 내보내는 핵 속 제조 장치',
    thumbnail: 'assets/genesis/objects/nucleolus-fabrication-core.png', background: 'assets/genesis/objects/nucleolus-fabrication-core.png',
    editorUrl: 'index.html?workspace=object&object=nucleolus-fabrication-core', size: '1024 × 683', layers: '접지 그림자 포함 투명 PNG 1장', tags: ['핵 방', '인', '리보솜', '생산 장치', 'rRNA'],
    description: '핵 속 인에서 rRNA와 리보솜 소단위체가 만들어지는 과정을 구형 생산 코어와 세 개의 배출 라인으로 표현했습니다. 중앙 코어 옆 생산 구역에 두면 좋으며 공방 권장 크기는 240px입니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 인 생산 장치. 보라색 구형 코어, 세 개의 리보솜 소단위체 배출 라인, 낡은 아이보리 우주 장비, 청록 조명.'
  },
  {
    id: 'GEN-NUC-004', slug: 'nuclear-pore-gateway', category: 'object', categoryLabel: '핵 방',
    title: '핵공 수송 게이트', subtitle: '핵막 안팎의 물질 이동을 통제하는 선택적 출입문',
    thumbnail: 'assets/genesis/objects/nuclear-pore-gateway.png', background: 'assets/genesis/objects/nuclear-pore-gateway.png',
    editorUrl: 'index.html?workspace=object&object=nuclear-pore-gateway', size: '1024 × 683', layers: '접지 그림자 포함 투명 PNG 1장', tags: ['핵 방', '핵공', '선택적 수송', '게이트', '출입문'],
    description: '핵공 복합체의 고리 구조를 여덟 개 잠금 모듈과 발광 수송 통로로 재해석했습니다. 출입구나 이중막 링의 끊어진 지점에 배치해 핵막의 선택적 투과를 보여 줍니다. 공방 권장 크기는 180px입니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 핵공 수송 게이트. 원형 이중 링, 여덟 개 단백질 잠금 모듈, 청록색 통로, 작은 검사 콘솔.'
  },
  {
    id: 'GEN-NUC-005', slug: 'chromatin-data-spool-rack', category: 'object', categoryLabel: '핵 방',
    title: '염색질 데이터 스풀 보관대', subtitle: 'DNA가 단백질 스풀에 감긴 구조를 데이터 릴로 표현한 장치',
    thumbnail: 'assets/genesis/objects/chromatin-data-spool-rack.png', background: 'assets/genesis/objects/chromatin-data-spool-rack.png',
    editorUrl: 'index.html?workspace=object&object=chromatin-data-spool-rack', size: '1024 × 683', layers: '접지 그림자 포함 투명 PNG 1장', tags: ['핵 방', '염색질', '히스톤', 'DNA 포장', '데이터 릴'],
    description: 'DNA가 히스톤 단백질에 감겨 염색질을 이루는 모습을 네 개의 발광 데이터 릴로 표현했습니다. 벽면 기록 구역에 반복 배치하면 핵 속에 방대한 유전 정보가 저장된 느낌을 줄 수 있습니다. 공방 권장 크기는 240px입니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 염색질 데이터 스풀 랙. 네 개의 보라·청록 발광 릴, 히스톤 클램프, 분석 콘솔, 낡은 우주 관제실 재질.'
  },
  {
    id: 'GEN-NUC-006', slug: 'nucleus-command-core-loop', category: 'object', categoryLabel: '움직이는 핵 방',
    title: '움직이는 핵 통제 코어', subtitle: 'DNA 홀로그램 입자와 중앙 관제 링이 천천히 순환하는 반복 GIF',
    thumbnail: 'assets/genesis/objects/nucleus-command-core-loop.gif', background: 'assets/genesis/objects/nucleus-command-core-loop.gif',
    editorUrl: 'index.html?workspace=object', size: '256 × 171 · 0.59 MB', layers: '투명 GIF · 6프레임 · 무한 반복', tags: ['핵 방', 'DNA', '통제 코어', '반복 GIF', '앱 불필요'],
    description: '기존 핵 이중막 통제 코어의 형태는 유지하면서 중앙 DNA 홀로그램 주변의 에너지 입자와 관제 링이 순환하도록 만들었습니다. ZEP의 나의 오브젝트에 GIF를 그대로 업로드하세요.',
    prompt: '기존 핵 이중막 통제 코어를 그대로 유지하고 중앙 DNA 홀로그램 입자와 청록색 관제 링만 천천히 순환시키는 투명 반복 애니메이션.'
  },
  {
    id: 'GEN-NUC-007', slug: 'dna-genomic-data-archive-loop', category: 'object', categoryLabel: '움직이는 핵 방',
    title: '움직이는 DNA 유전체 보관소', subtitle: '세 캡슐 안의 유전체 신호가 차례로 상승하는 반복 GIF',
    thumbnail: 'assets/genesis/objects/dna-genomic-data-archive-loop.gif', background: 'assets/genesis/objects/dna-genomic-data-archive-loop.gif',
    editorUrl: 'index.html?workspace=object', size: '256 × 171 · 0.59 MB', layers: '투명 GIF · 6프레임 · 무한 반복', tags: ['핵 방', 'DNA', '유전체 캡슐', '반복 GIF', '앱 불필요'],
    description: '기존 세 DNA 캡슐 안에서 유전체 신호가 서로 다른 순서로 위쪽을 향해 이동합니다. 유전 정보가 계속 읽히고 저장되는 장면을 나타냅니다.',
    prompt: '기존 DNA 유전체 보관소를 그대로 유지하고 세 투명 캡슐 안의 발광 유전체 신호만 순차적으로 상승시키는 투명 반복 애니메이션.'
  },
  {
    id: 'GEN-NUC-008', slug: 'nucleolus-fabrication-core-loop', category: 'object', categoryLabel: '움직이는 핵 방',
    title: '움직이는 인 생산 코어', subtitle: '리보솜 소단위체가 세 배출 라인으로 이동하는 반복 GIF',
    thumbnail: 'assets/genesis/objects/nucleolus-fabrication-core-loop.gif', background: 'assets/genesis/objects/nucleolus-fabrication-core-loop.gif',
    editorUrl: 'index.html?workspace=object', size: '256 × 171 · 0.59 MB', layers: '투명 GIF · 6프레임 · 무한 반복', tags: ['핵 방', '인', '리보솜 소단위체', '반복 GIF', '앱 불필요'],
    description: '중앙 인 생산 코어가 맥동하고 새로 만들어진 리보솜 소단위체가 세 방향의 배출 라인을 따라 이동합니다.',
    prompt: '기존 인 생산 코어를 그대로 유지하고 중앙 보라색 코어의 맥동과 세 배출 라인을 따라 이동하는 리보솜 소단위체만 추가한 투명 반복 애니메이션.'
  },
  {
    id: 'GEN-NUC-009', slug: 'nuclear-pore-gateway-loop', category: 'object', categoryLabel: '움직이는 핵 방',
    title: '움직이는 핵공 수송 게이트', subtitle: '수송 입자가 포털 주변을 순환하고 통로가 맥동하는 반복 GIF',
    thumbnail: 'assets/genesis/objects/nuclear-pore-gateway-loop.gif', background: 'assets/genesis/objects/nuclear-pore-gateway-loop.gif',
    editorUrl: 'index.html?workspace=object', size: '256 × 171 · 0.59 MB', layers: '투명 GIF · 6프레임 · 무한 반복', tags: ['핵 방', '핵공', '선택적 수송', '반복 GIF', '앱 불필요'],
    description: '기존 핵공 게이트의 원형 구조를 따라 수송 입자가 회전하고 청록색 통로가 천천히 맥동합니다. 핵 안팎의 선택적 물질 이동을 보여 줍니다.',
    prompt: '기존 핵공 수송 게이트를 그대로 유지하고 원형 통로를 따라 이동하는 입자와 청록색 포털의 맥동만 추가한 투명 반복 애니메이션.'
  },
  {
    id: 'GEN-NUC-010', slug: 'chromatin-data-spool-rack-loop', category: 'object', categoryLabel: '움직이는 핵 방',
    title: '움직이는 염색질 데이터 스풀', subtitle: '발광 데이터 띠가 네 개의 릴을 차례로 통과하는 반복 GIF',
    thumbnail: 'assets/genesis/objects/chromatin-data-spool-rack-loop.gif', background: 'assets/genesis/objects/chromatin-data-spool-rack-loop.gif',
    editorUrl: 'index.html?workspace=object', size: '256 × 171 · 0.59 MB', layers: '투명 GIF · 6프레임 · 무한 반복', tags: ['핵 방', '염색질', '데이터 스풀', '반복 GIF', '앱 불필요'],
    description: '기존 염색질 스풀 보관대의 네 릴을 따라 청록색 데이터 빛띠가 이동합니다. DNA가 감기고 풀리며 사용되는 느낌을 표현합니다.',
    prompt: '기존 염색질 데이터 스풀 보관대를 그대로 유지하고 네 릴의 표면을 따라 이동하는 청록색 데이터 빛띠만 추가한 투명 반복 애니메이션.'
  },
  {
    id: 'GEN-ER-001', slug: 'rough-er-protein-processing-system', category: 'object', categoryLabel: '소포체 방',
    title: '거친면 소포체 단백질 가공 시스템', subtitle: '단백질 유입·접힘·품질검사·소낭 배출을 이어 주는 막성 가공 설비',
    thumbnail: 'assets/genesis/objects/rough-er-protein-processing-system.png', background: 'assets/genesis/objects/rough-er-protein-processing-system.png',
    editorUrl: 'index.html?workspace=object&object=rough-er-protein-processing-system', size: '1024 × 683 · 1.47 MB', layers: 'ZEP 업로드용 투명 PNG 1장', tags: ['소포체 방', '거친면 소포체', '단백질 가공', '단백질 접힘', '품질검사'],
    description: '막 표면의 여러 도킹 노드는 리보솜을, 내부 발광 라인은 새 단백질이 소포체 안으로 들어와 접히고 품질검사를 받은 뒤 수송 소낭으로 나가는 과정을 나타냅니다. 방 중앙에 320~430px 크기로 배치하면 단백질 가공 공장의 핵심 설비가 됩니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 거친면 소포체 단백질 가공 공장. 굽은 막성 통로, 표면 리보솜 도킹 노드, 단백질 접힘 챔버, 품질검사 스캐너, 수송 소낭 배출구.'
  },
  {
    id: 'GEN-ER-002', slug: 'rough-er-protein-processing-system-loop', category: 'object', categoryLabel: '움직이는 소포체',
    title: '움직이는 거친면 소포체 가공 시스템', subtitle: '단백질 입자가 가공 라인을 따라 이동하는 무한 반복 GIF',
    thumbnail: 'assets/genesis/objects/rough-er-protein-processing-system-loop.gif', background: 'assets/genesis/objects/rough-er-protein-processing-system-loop.gif',
    editorUrl: 'index.html?workspace=object', size: '256 × 171 · 0.59 MB', layers: '투명 GIF · 6프레임 · 무한 반복', tags: ['소포체 방', '거친면 소포체', '단백질 이동', '반복 GIF', '앱 불필요'],
    description: '세 가공 통로를 따라 자홍색 단백질 입자가 이동하고 품질검사 링이 점멸합니다. ZEP의 나의 오브젝트에 GIF를 그대로 업로드하면 별도 앱 없이 반복 재생됩니다.',
    prompt: '거친면 소포체 가공 설비의 막성 통로를 따라 발광 단백질 입자가 천천히 흐르고 검사 장치가 점멸하는 투명 배경 반복 애니메이션.'
  },
  {
    id: 'GEN-ER-003', slug: 'smooth-er-calcium-reservoir', category: 'object', categoryLabel: '소포체 방',
    title: '매끈면 소포체 칼슘 이온 저장소', subtitle: '연결된 관형 막과 저장 탱크로 칼슘 이온을 보관·방출하는 설비',
    thumbnail: 'assets/genesis/objects/smooth-er-calcium-reservoir.png', background: 'assets/genesis/objects/smooth-er-calcium-reservoir.png',
    editorUrl: 'index.html?workspace=object&object=smooth-er-calcium-reservoir', size: '1024 × 683 · 1.47 MB', layers: 'ZEP 업로드용 투명 PNG 1장', tags: ['소포체 방', '매끈면 소포체', '칼슘 이온', '저장소', '방출 펌프'],
    description: '매끈면 소포체의 연결된 관형 구조를 여러 저장 탱크와 펌프 밸브로 재해석했습니다. 청백색 구체는 저장된 칼슘 이온을 나타내며 방 옆쪽 보조 구역에 260~360px 크기로 배치하기 좋습니다.',
    prompt: '투명 배경의 ZEP형 아이소메트릭 매끈면 소포체 칼슘 저장소. 연결된 관형 막, 투명 저장 탱크, 칼슘 이온 구체, 충전 펌프와 방출 밸브.'
  },
  {
    id: 'GEN-ER-004', slug: 'smooth-er-calcium-reservoir-loop', category: 'object', categoryLabel: '움직이는 소포체',
    title: '움직이는 칼슘 이온 저장소', subtitle: '저장 탱크 속 칼슘 이온과 방출 코어가 맥동하는 무한 반복 GIF',
    thumbnail: 'assets/genesis/objects/smooth-er-calcium-reservoir-loop.gif', background: 'assets/genesis/objects/smooth-er-calcium-reservoir-loop.gif',
    editorUrl: 'index.html?workspace=object', size: '256 × 171 · 0.59 MB', layers: '투명 GIF · 6프레임 · 무한 반복', tags: ['소포체 방', '매끈면 소포체', '칼슘 이온', '반복 GIF', '앱 불필요'],
    description: '여러 저장 탱크 안에서 칼슘 이온이 상승하고 중앙 방출 코어가 천천히 맥동합니다. ZEP의 나의 오브젝트에 GIF를 그대로 올려 저장·방출 장면을 만들 수 있습니다.',
    prompt: '매끈면 소포체 저장 탱크 속 청백색 칼슘 이온이 천천히 상승하고 중앙 방출 코어가 점멸하는 투명 배경 반복 애니메이션.'
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
    id: 'GEN-CELL-001', slug: 'ribosome-epa-assembly-station', category: 'object', categoryLabel: '세포 공장',
    title: '리보솜 E·P·A 조립 스테이션', subtitle: '단백질 합성의 세 자리를 공장 설비로 표현한 핵심 장치',
    thumbnail: 'assets/genesis/cell-factory/ribosome-epa-assembly-station.png', background: 'assets/genesis/cell-factory/ribosome-epa-assembly-station.png',
    editorUrl: 'index.html?workspace=object&object=ribosome-epa-assembly-station', size: '1024 × 683', layers: 'ZEP 업로드용 투명 PNG 1장', tags: ['세포 공장', '리보솜', 'E 자리', 'P 자리', 'A 자리', '단백질 합성'],
    description: '왼쪽부터 청록색 E 자리(빈 tRNA 배출), 주황색 P 자리(폴리펩타이드 사슬 유지), 자홍색 A 자리(새 아미노아실-tRNA 반입)를 하나의 생산 라인으로 구성했습니다.',
    prompt: '투명 배경의 ZEP용 아이소메트릭 리보솜 단백질 공장. E·P·A 세 작업 베이와 mRNA 이송 레일, tRNA 도킹 소켓을 갖춘 SF 연구 설비.'
  },
  {
    id: 'GEN-CELL-002', slug: 'trna-amino-acid-carrier', category: 'object', categoryLabel: '세포 공장',
    title: 'tRNA 아미노산 운반 로봇', subtitle: '아미노산을 A 자리로 가져오는 소형 자율 운반체',
    thumbnail: 'assets/genesis/cell-factory/trna-amino-acid-carrier.png', background: 'assets/genesis/cell-factory/trna-amino-acid-carrier.png',
    editorUrl: 'index.html?workspace=object&object=trna-amino-acid-carrier', size: '1024 × 1024', layers: 'ZEP 업로드용 투명 PNG 1장', tags: ['세포 공장', 'tRNA', '아미노산', '운반 로봇', '이동 오브젝트'],
    description: 'tRNA의 운반 기능을 로봇으로 의인화한 오브젝트입니다. 레일 위를 이동시켜 A 자리에 아미노산 화물을 공급하고, E 자리에서 빈 운반체가 빠져나오는 장면에 사용할 수 있습니다.',
    prompt: '투명 배경의 ZEP용 아이소메트릭 tRNA 운반 로봇. 클로버 형태 프레임, 상단 아미노산 구체, 하단 도킹 장치.'
  },
  {
    id: 'GEN-CELL-003', slug: 'ribosome-robot-arm', category: 'object', categoryLabel: '세포 공장',
    title: '리보솜 작업 로봇팔', subtitle: 'A·P 자리에서 결합과 전달 작업을 수행하는 정밀 장치',
    thumbnail: 'assets/genesis/cell-factory/ribosome-robot-arm.png', background: 'assets/genesis/cell-factory/ribosome-robot-arm.png',
    editorUrl: 'index.html?workspace=object&object=ribosome-robot-arm', size: '1024 × 853', layers: 'ZEP 업로드용 투명 PNG 1장', tags: ['세포 공장', '로봇팔', '펩타이드 결합', 'A 자리', 'P 자리'],
    description: '도착한 tRNA를 고정하고 아미노산을 이어 붙이는 과정을 정밀 로봇팔로 표현했습니다. 여러 개를 배치해 A·P·E 자리별 작업 흐름을 만들 수 있습니다.',
    prompt: '투명 배경의 ZEP용 아이소메트릭 3관절 정밀 로봇팔. 아미노산 화물과 tRNA 운반체를 다루는 리보솜 공장 장치.'
  },
  {
    id: 'GEN-CELL-007', slug: 'ribosome-robot-arm-slow-loop', category: 'object', categoryLabel: '움직이는 오브젝트',
    title: '천천히 움직이는 리보솜 기계팔', subtitle: '앱 없이 나의 오브젝트에 직접 놓는 반복 GIF',
    thumbnail: 'assets/genesis/cell-factory/ribosome-robot-arm-slow-loop.gif', background: 'assets/genesis/cell-factory/ribosome-robot-arm-slow-loop.gif',
    editorUrl: 'index.html?workspace=object', size: '96 × 160 · 0.35 MB', layers: '투명 GIF · 10프레임 · 무한 반복', tags: ['세포 공장', '기계팔', '반복 GIF', '앱 불필요', '느린 왕복'],
    description: '6개의 작업 자세를 앞뒤로 이어 약 4.5초마다 천천히 왕복하는 기계팔입니다. ZEP의 나의 오브젝트에 GIF를 그대로 올린 뒤 원하는 위치에 직접 배치하세요.',
    prompt: '아이보리색 SF 정밀 기계팔이 작업 위치를 향해 천천히 뻗었다가 원위치로 돌아오는 투명 배경 반복 애니메이션.'
  },
  {
    id: 'GEN-CELL-004', slug: 'ribosome-conveyor-straight', category: 'object', categoryLabel: '세포 공장',
    title: '리보솜 직선 이송 레일', subtitle: 'tRNA 운반체가 이동하는 모듈형 직선 컨베이어',
    thumbnail: 'assets/genesis/cell-factory/ribosome-conveyor-straight.png', background: 'assets/genesis/cell-factory/ribosome-conveyor-straight.png',
    editorUrl: 'index.html?workspace=object&object=ribosome-conveyor-straight', size: '1024 × 512', layers: 'ZEP 업로드용 투명 PNG 1장', tags: ['세포 공장', '레일', '컨베이어', '직선', 'mRNA'],
    description: '리보솜 방의 동선을 만드는 직선 레일입니다. 레일 이미지는 고정하고, tRNA 운반 로봇이나 화물 포드를 ZEP Script로 그 위에 이동시키는 방식으로 사용합니다.',
    prompt: '투명 배경의 ZEP용 아이소메트릭 직선 컨베이어 레일. 흑연색 레일, 청록 조명, 아이보리 패널, 화물 없음.'
  },
  {
    id: 'GEN-CELL-005', slug: 'ribosome-conveyor-curve', category: 'object', categoryLabel: '세포 공장',
    title: '리보솜 곡선 이송 레일', subtitle: '생산 동선을 꺾어 주는 90도 컨베이어 모듈',
    thumbnail: 'assets/genesis/cell-factory/ribosome-conveyor-curve.png', background: 'assets/genesis/cell-factory/ribosome-conveyor-curve.png',
    editorUrl: 'index.html?workspace=object&object=ribosome-conveyor-curve', size: '1024 × 683', layers: 'ZEP 업로드용 투명 PNG 1장', tags: ['세포 공장', '레일', '컨베이어', '곡선', '동선'],
    description: '직선 레일과 조합해 A 자리 반입선과 E 자리 배출선을 구분할 수 있는 90도 곡선 모듈입니다.',
    prompt: '투명 배경의 ZEP용 아이소메트릭 90도 곡선 컨베이어 레일. 직선 레일과 동일한 SF 연구실 재질과 조명.'
  },
  {
    id: 'GEN-CELL-006', slug: 'amino-acid-cargo-pod', category: 'object', categoryLabel: '세포 공장',
    title: '아미노산 화물 포드', subtitle: '레일 위에서 이동하는 분자 화물 캡슐',
    thumbnail: 'assets/genesis/cell-factory/amino-acid-cargo-pod.png', background: 'assets/genesis/cell-factory/amino-acid-cargo-pod.png',
    editorUrl: 'index.html?workspace=object&object=amino-acid-cargo-pod', size: '1024 × 683', layers: 'ZEP 업로드용 투명 PNG 1장', tags: ['세포 공장', '아미노산', '화물', '포드', '이동 오브젝트'],
    description: '아미노산 분자를 보호 캡슐에 넣은 이동 화물입니다. 레일 위에서 A 자리까지 움직이게 하거나 로봇팔이 집어 드는 목표물로 사용할 수 있습니다.',
    prompt: '투명 배경의 ZEP용 아이소메트릭 아미노산 화물 포드. 분자 구체를 고정한 소형 레일 운반 플랫폼.'
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
  },
  {
    id: 'GEN-MAP-008', slug: 'space-biological-containment-lab', category: 'map', categoryLabel: '맵 세트',
    title: '생체 격리 실험실', subtitle: '생체 실험 흔적과 중앙 배양 튜브가 있는 격리 연구 구역',
    thumbnail: 'assets/genesis/thumbs/space-biological-containment-lab.jpg', background: 'assets/space-backgrounds/space-biological-containment-lab.png', top: 'assets/space-backgrounds/space-biological-containment-lab-top.png',
    editorUrl: 'index.html?space=space-biological-containment-lab', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['아이소메트릭', '생체 실험', '격리 연구실', '배양 튜브'],
    description: '벽면의 균열·오염 흔적과 생체 표본 창이 있는 어두운 연구실입니다. 넓은 이동 바닥은 아랫배경에, 중앙 원통형 배양 튜브는 캐릭터를 자연스럽게 가리는 투명 윗배경에 분리했습니다.'
  },
  {
    id: 'GEN-MAP-009', slug: 'abandoned-space-corridor', category: 'map', categoryLabel: '맵 세트', theme: 'abandoned',
    title: '폐쇄 기지 복도', subtitle: '오염과 고장 난 비상등이 남은 장거리 이동 통로',
    thumbnail: 'assets/space-backgrounds/space-corridor.png', background: 'assets/space-backgrounds/space-corridor.png', top: 'assets/space-backgrounds/space-corridor-top.png', overlay: 'assets/space-backgrounds/abandoned-station-atmosphere.png', downloadName: 'abandoned-space-corridor.png',
    editorUrl: 'index.html?space=abandoned-space-corridor', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['폐쇄 기지', '아이소메트릭', '복도', '음산한 분위기'],
    description: '기존 우주기지 복도의 구조와 레이어 위치를 유지하면서 녹슨 벽, 균열, 늘어진 케이블과 불안정한 비상조명 분위기를 더한 버전입니다.'
  },
  {
    id: 'GEN-MAP-010', slug: 'abandoned-space-stair-room', category: 'map', categoryLabel: '맵 세트', theme: 'abandoned',
    title: '폐쇄 수직 이동실', subtitle: '멈춰 버린 계단과 경사로가 있는 이동 구역',
    thumbnail: 'assets/space-backgrounds/space-stair-room.png', background: 'assets/space-backgrounds/space-stair-room.png', top: 'assets/space-backgrounds/space-stair-room-top.png', overlay: 'assets/space-backgrounds/abandoned-station-atmosphere.png', downloadName: 'abandoned-space-stair-room.png',
    editorUrl: 'index.html?space=abandoned-space-stair-room', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['폐쇄 기지', '계단', '경사로', '수직 이동'],
    description: '기존 수직 이동실의 계단·경사로 구조를 보존하고 조명 고장과 오염 흔적을 더했습니다. 앞쪽 난간은 투명 윗배경으로 유지됩니다.'
  },
  {
    id: 'GEN-MAP-011', slug: 'abandoned-space-research-lab', category: 'map', categoryLabel: '맵 세트', theme: 'abandoned',
    title: '폐쇄 우주 연구실', subtitle: '분석 장치와 관측창이 방치된 연구 구역',
    thumbnail: 'assets/space-backgrounds/space-research-lab.png', background: 'assets/space-backgrounds/space-research-lab.png', top: 'assets/space-backgrounds/space-research-lab-top.png', overlay: 'assets/space-backgrounds/abandoned-station-atmosphere.png', downloadName: 'abandoned-space-research-lab.png',
    editorUrl: 'index.html?space=abandoned-space-research-lab', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['폐쇄 기지', '연구실', '관측', '오염'],
    description: '작동을 멈춘 분석 화면과 오염된 바닥 가장자리가 남은 폐쇄 연구실입니다. 기존 이동 공간과 레이어 구조는 그대로 유지됩니다.'
  },
  {
    id: 'GEN-MAP-012', slug: 'abandoned-space-experiment-lab', category: 'map', categoryLabel: '맵 세트', theme: 'abandoned',
    title: '폐쇄 생명·화학 실험실', subtitle: '배양 시설이 방치된 오염 실험 구역',
    thumbnail: 'assets/space-backgrounds/space-experiment-lab.png', background: 'assets/space-backgrounds/space-experiment-lab.png', top: 'assets/space-backgrounds/space-experiment-lab-top.png', overlay: 'assets/space-backgrounds/abandoned-station-atmosphere.png', downloadName: 'abandoned-space-experiment-lab.png',
    editorUrl: 'index.html?space=abandoned-space-experiment-lab', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['폐쇄 기지', '생명과학', '화학', '배양 시설'],
    description: '기존 생명·화학 실험실에 부식과 누수, 고장 난 배양 시설 분위기를 더했습니다. 앞쪽 실험 방호벽은 투명 윗배경으로 분리됩니다.'
  },
  {
    id: 'GEN-MAP-013', slug: 'abandoned-space-command-center', category: 'map', categoryLabel: '맵 세트', theme: 'abandoned',
    title: '폐쇄 우주 관제실', subtitle: '통신이 끊기고 경보등만 남은 지휘 구역',
    thumbnail: 'assets/space-backgrounds/space-command-center.png', background: 'assets/space-backgrounds/space-command-center.png', top: 'assets/space-backgrounds/space-command-center-top.png', overlay: 'assets/space-backgrounds/abandoned-station-atmosphere.png', downloadName: 'abandoned-space-command-center.png',
    editorUrl: 'index.html?space=abandoned-space-command-center', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['폐쇄 기지', '관제실', '통신 두절', '비상조명'],
    description: '관측창과 지휘 콘솔이 어둠 속에 방치된 관제실입니다. 기존 관제실의 바닥과 앞쪽 방호벽 레이어를 그대로 활용합니다.'
  },
  {
    id: 'GEN-MAP-014', slug: 'abandoned-space-airlock-hangar', category: 'map', categoryLabel: '맵 세트', theme: 'abandoned',
    title: '폐쇄 에어록·격납고', subtitle: '출입문이 잠긴 오염 수송 구역',
    thumbnail: 'assets/space-backgrounds/space-airlock-hangar.png', background: 'assets/space-backgrounds/space-airlock-hangar.png', top: 'assets/space-backgrounds/space-airlock-hangar-top.png', overlay: 'assets/space-backgrounds/abandoned-station-atmosphere.png', downloadName: 'abandoned-space-airlock-hangar.png',
    editorUrl: 'index.html?space=abandoned-space-airlock-hangar', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['폐쇄 기지', '에어록', '격납고', '탈출'],
    description: '대형 출입문과 수송 바닥이 잠긴 채 방치된 에어록·격납고입니다. 앞쪽 안전벽은 캐릭터 가림용 윗배경으로 유지됩니다.'
  },
  {
    id: 'GEN-MAP-015', slug: 'weathered-space-corridor', category: 'map', categoryLabel: '맵 세트', theme: 'weathered',
    title: '노후 기지 복도', subtitle: '밝은 조명 아래 균열과 녹이 남은 이동 통로',
    thumbnail: 'assets/space-backgrounds/space-corridor.png', background: 'assets/space-backgrounds/space-corridor.png', top: 'assets/space-backgrounds/space-corridor-top.png', overlay: 'assets/space-backgrounds/weathered-station-atmosphere.png', downloadName: 'weathered-space-corridor.png',
    editorUrl: 'index.html?space=weathered-space-corridor', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['노후 기지', '아이소메트릭', '복도', '밝은 폐허'],
    description: '기존 복도의 밝기와 구조를 유지하면서 가장자리에 가는 균열, 녹, 누수와 오래된 케이블을 더한 버전입니다.'
  },
  {
    id: 'GEN-MAP-016', slug: 'weathered-space-stair-room', category: 'map', categoryLabel: '맵 세트', theme: 'weathered',
    title: '노후 수직 이동실', subtitle: '빛이 남아 있는 오래된 계단·경사로 구역',
    thumbnail: 'assets/space-backgrounds/space-stair-room.png', background: 'assets/space-backgrounds/space-stair-room.png', top: 'assets/space-backgrounds/space-stair-room-top.png', overlay: 'assets/space-backgrounds/weathered-station-atmosphere.png', downloadName: 'weathered-space-stair-room.png',
    editorUrl: 'index.html?space=weathered-space-stair-room', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['노후 기지', '계단', '경사로', '밝은 폐허'],
    description: '수직 이동실의 계단과 경사로는 선명하게 보이고, 외곽에만 부식과 생물성 잔류 흔적이 남도록 구성했습니다.'
  },
  {
    id: 'GEN-MAP-017', slug: 'weathered-space-research-lab', category: 'map', categoryLabel: '맵 세트', theme: 'weathered',
    title: '노후 우주 연구실', subtitle: '오래된 분석 장치가 남은 밝은 연구 구역',
    thumbnail: 'assets/space-backgrounds/space-research-lab.png', background: 'assets/space-backgrounds/space-research-lab.png', top: 'assets/space-backgrounds/space-research-lab-top.png', overlay: 'assets/space-backgrounds/weathered-station-atmosphere.png', downloadName: 'weathered-space-research-lab.png',
    editorUrl: 'index.html?space=weathered-space-research-lab', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['노후 기지', '연구실', '관측', '낡은 시설'],
    description: '분석 화면과 관측창을 알아볼 수 있는 밝기를 유지하며 벽과 바닥 가장자리에 오랜 방치 흔적을 더했습니다.'
  },
  {
    id: 'GEN-MAP-018', slug: 'weathered-space-experiment-lab', category: 'map', categoryLabel: '맵 세트', theme: 'weathered',
    title: '노후 생명·화학 실험실', subtitle: '낡은 배양 시설이 남은 밝은 실험 구역',
    thumbnail: 'assets/space-backgrounds/space-experiment-lab.png', background: 'assets/space-backgrounds/space-experiment-lab.png', top: 'assets/space-backgrounds/space-experiment-lab-top.png', overlay: 'assets/space-backgrounds/weathered-station-atmosphere.png', downloadName: 'weathered-space-experiment-lab.png',
    editorUrl: 'index.html?space=weathered-space-experiment-lab', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['노후 기지', '생명과학', '화학', '배양 시설'],
    description: '생체 격리 실험실과 비슷한 밝기와 올리브빛 노후 질감으로 바꾼 생명·화학 실험실입니다.'
  },
  {
    id: 'GEN-MAP-019', slug: 'weathered-space-command-center', category: 'map', categoryLabel: '맵 세트', theme: 'weathered',
    title: '노후 우주 관제실', subtitle: '조명과 관측창이 남은 오래된 지휘 구역',
    thumbnail: 'assets/space-backgrounds/space-command-center.png', background: 'assets/space-backgrounds/space-command-center.png', top: 'assets/space-backgrounds/space-command-center-top.png', overlay: 'assets/space-backgrounds/weathered-station-atmosphere.png', downloadName: 'weathered-space-command-center.png',
    editorUrl: 'index.html?space=weathered-space-command-center', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['노후 기지', '관제실', '지휘', '낡은 시설'],
    description: '관측창과 콘솔은 밝게 유지하고 조명 주변과 바닥 가장자리에만 균열·녹·누수 흔적을 더했습니다.'
  },
  {
    id: 'GEN-MAP-020', slug: 'weathered-space-airlock-hangar', category: 'map', categoryLabel: '맵 세트', theme: 'weathered',
    title: '노후 에어록·격납고', subtitle: '오래된 출입문과 수송 바닥이 남은 구역',
    thumbnail: 'assets/space-backgrounds/space-airlock-hangar.png', background: 'assets/space-backgrounds/space-airlock-hangar.png', top: 'assets/space-backgrounds/space-airlock-hangar-top.png', overlay: 'assets/space-backgrounds/weathered-station-atmosphere.png', downloadName: 'weathered-space-airlock-hangar.png',
    editorUrl: 'index.html?space=weathered-space-airlock-hangar', size: '960 × 640 편집', layers: '아랫배경 + 윗배경', tags: ['노후 기지', '에어록', '격납고', '밝은 폐허'],
    description: '대형 에어록과 격납 바닥이 충분히 보이는 밝기를 유지하면서 오래 사용된 금속 표면과 균열을 표현했습니다.'
  }
];
