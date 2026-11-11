/* Shared browser / Apps Script seed. Never contains students or credentials. */
globalThis.LAB_SEED = {
  id: 'enzyme-structure', title: '효소의 구조와 기능 탐구', subject: '세포와 물질대사',
  category: '세포와 물질대사', year: 2026, startAt: '', deadline: '', status: 'open',
  description: '관심 있는 효소를 선정하고 생물학적 기능과 단백질 구조, 특성 및 활용 가능성을 탐구합니다.',
  guide: '자료에서 근거를 찾고, 자신의 말로 설명해 보세요. 확인되지 않은 최적 온도나 pH는 추측하지 말고 ‘자료 미확인’으로 기록합니다. RISS, DBpia, KOCW, RCSB PDB 등을 활용하고 출처를 남겨 주세요.',
  fields: [
    { id: 'topic', title: '탐구 주제', guide: '어떤 효소를 어떤 관점에서 탐구할지 한 문장으로 작성해 주세요. 예: 카탈레이스의 구조와 과산화수소 분해 기능의 관계', required: true, type: 'text' },
    { id: 'selection', title: '효소 선정', guide: '효소의 이름과 기본 정보를 소개해 주세요.', required: true, type: 'text' },
    { id: 'motivation', title: '효소 선정 이유', guide: '선택한 동기, 관심을 갖게 된 계기, 탐구 전 궁금했던 점은 무엇인가요?', required: true, type: 'text' },
    { id: 'mechanism', title: '생물학적 기능과 기전', guide: '기질 → 생성물, 촉매하는 화학 반응, 생명체 내 역할을 설명해 주세요.', required: true, type: 'text' },
    { id: 'structure', title: '효소 단백질의 구조', guide: '입체 구조와 활성 부위의 특징, 구조와 기능의 관계를 설명해 주세요.', required: true, type: 'text' },
    { id: 'properties', title: '효소의 특성', guide: '최적 온도·pH, 활성에 영향을 미치는 요인, 이 효소만의 특징을 조사하세요. 확인할 수 없는 수치는 ‘자료 미확인’으로 기록해도 됩니다.', required: true, type: 'text' },
    { id: 'applications', title: '활용 사례 및 가능성', guide: '실생활·의학·산업의 활용 사례와 과학적 원리, 새로운 활용 아이디어를 적어 주세요.', required: true, type: 'text' },
    { id: 'questions', title: '추가로 알아보고 싶은 점', guide: '새롭게 생긴 의문, 후속 탐구 주제, 추가 실험 또는 조사 방향을 제안해 주세요.', required: true, type: 'text' },
    { id: 'reflection', title: '탐구 소감', guide: '새롭게 알게 된 사실, 흥미로운 내용, 느낀 점, 탐구 전후 생각의 변화를 기록해 주세요.', required: true, type: 'text' },
    { id: 'references', title: '참고 자료와 출처', guide: '자료 제목, 저자 또는 기관, URL 또는 서지 정보를 각각 기록해 주세요.', required: true, type: 'references' }
  ]
};
