const GENESIS_STORY_PANELS = [
  {
    id: 'GEN-STORY-01', step: 1, header: 'EARTH STATUS', subheader: 'RECORD 01 / 07', tone: 'blue', visual: 'earth',
    title: '2087년, 인류의 위기',
    body: ['서기 2087년.', '인류는 우주에 진출했지만,', '지구는 자원 고갈과 환경 위기,', '그리고 새로운 질병의 확산으로', '심각한 위기에 놓여 있다.'],
    highlight: ['인류는 생존을 위한 새로운 돌파구를 찾고 있었다.'],
    footer: 'LUNA EXPLORATION COMMAND'
  },
  {
    id: 'GEN-STORY-02', step: 2, header: 'LUNA-7 FILE', subheader: 'RECORD 02 / 07', tone: 'blue', visual: 'moonbase',
    title: '달 뒷면의 연구기지, 루나-7',
    body: ['20년 전,', '달 뒷면에는 인류의 생존 문제를 해결하기 위한', "비밀 연구기지 '루나-7'이 세워졌다.", '그러나 어느 날 모든 통신이 끊겼고,'],
    highlight: ['연구기지는 공식적으로 폐쇄되었다.'],
    footer: 'CLASSIFIED FACILITY DATA'
  },
  {
    id: 'GEN-STORY-03', step: 3, header: 'SIGNAL ANALYSIS', subheader: 'RECORD 03 / 07', tone: 'blue', visual: 'signal',
    title: '20년 만에 수신된 의문의 신호',
    body: ['며칠 전,', '폐쇄된 루나-7에서 정체불명의 구조 신호가 수신되었다.', '신호는 심하게 손상되어 있었지만,', '한 문장만은 분명하게 들렸다.'],
    highlight: ['"제네시스를 중단해야 합니다."'],
    footer: 'UNKNOWN TRANSMISSION DETECTED'
  },
  {
    id: 'GEN-STORY-04', step: 4, header: 'MISSION BRIEFING', subheader: 'RECORD 04 / 07', tone: 'blue', visual: 'astronaut',
    title: '탐사팀의 임무',
    body: ['당신은 루나-7의 이상 신호를 조사하기 위해', '파견된 우주비행사이다.', '이번 임무의 목표는 세 가지.'],
    highlight: ['신호의 발신자 확인,', '생존자 수색,', '그리고 연구기지 조사.'],
    footer: 'OPERATION LUNA RESCUE'
  },
  {
    id: 'GEN-STORY-05', step: 5, header: 'EMERGENCY TRANSMISSION', subheader: 'RECORD 05 / 07', tone: 'red', visual: 'warning',
    title: '마지막 통신 기록',
    body: ['"여기는... 루나-7..."', '"우리가 만든 기술이... 잘못 사용되고 있습니다..."', '"연구원들은... 더 이상 안전하지 않습니다..."', '"제발... 너무 늦기 전에..."'],
    highlight: ['[통신 두절]'],
    footer: 'SIGNAL LOST'
  },
  {
    id: 'GEN-STORY-06', step: 6, header: 'ORBITAL SCAN', subheader: 'RECORD 06 / 07', tone: 'mixed', visual: 'navigation',
    title: '달 궤도 진입',
    body: ['목적지 루나-7 인근에 도착했습니다.', '달 표면에서 미확인 물체와', '비정상적인 에너지 반응이 감지되었습니다.', '지구 관제센터와의 통신 상태가 불안정합니다.'],
    highlight: ['주의: 착륙 지점의 안전을 보장할 수 없습니다.'],
    footer: 'ANOMALY DETECTED'
  },
  {
    id: 'GEN-STORY-07', step: 7, header: 'LANDING SEQUENCE', subheader: 'RECORD 07 / 07', tone: 'bright', visual: 'landing',
    title: '착륙 준비 완료',
    body: ['탐사팀, 곧 달 표면에 착륙합니다.', '루나-7의 통신이 끊긴 원인을 조사하십시오.', '무슨 일이 벌어지고 있든,', '반드시 살아서 돌아오십시오.'],
    highlight: ['MISSION START'],
    footer: 'LUNAR LANDING INITIATED'
  }
];

if (typeof window !== 'undefined') window.GENESIS_STORY_PANELS = GENESIS_STORY_PANELS;
if (typeof module !== 'undefined') module.exports = GENESIS_STORY_PANELS;
