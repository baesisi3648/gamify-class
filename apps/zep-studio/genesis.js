(() => {
  'use strict';
  const assets = window.GENESIS_ASSETS || [];
  const rooms = (window.GENESIS_ROOMS || []).slice().sort((a, b) => a.order - b.order);
  const storyPanels = (window.GENESIS_STORY_PANELS || []).slice().sort((a, b) => a.step - b.step);
  const assetById = new Map(assets.map(asset => [asset.id, asset]));
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const statusLabels = { planned: '구상', making: '제작 중', ready: '완료' };
  const statusKey = 'zep-genesis-status-v1';
  const memoKey = 'zep-genesis-project-memo-v1';
  const roomNoteKey = 'zep-genesis-room-notes-v1';
  let filter = 'all';
  let query = '';
  let selectedAsset = null;
  let toastTimer;

  function escapeText(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function readJson(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
  function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function toast(message) { const el = $('#genesisToast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400); }
  function assetFiles(asset) { return [asset?.background, asset?.top].filter(Boolean); }
  function filename(src) { return src.split('/').pop(); }
  function downloadFile(src, name) { const link = document.createElement('a'); link.href = src; link.download = name || filename(src); document.body.appendChild(link); link.click(); link.remove(); }
  function imageFromURL(url) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; }); }
  function makeCanvas(width, height) { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; }
  function paintAbandonedLayer(context, image, width, height, overlay, isTop = false) { context.clearRect(0, 0, width, height); context.save(); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.filter = 'brightness(.52) contrast(1.24) saturate(.56) sepia(.2) hue-rotate(52deg)'; context.drawImage(image, 0, 0, width, height); context.restore(); if (overlay && !isTop) { context.save(); context.globalAlpha = .82; context.drawImage(overlay, 0, 0, width, height); context.restore(); const shade = context.createRadialGradient(width * .5, height * .48, width * .12, width * .5, height * .48, width * .72); shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(.66, 'rgba(3,9,7,.08)'); shade.addColorStop(1, 'rgba(0,3,3,.5)'); context.fillStyle = shade; context.fillRect(0, 0, width, height); } }
  function downloadCanvas(canvas, name) { canvas.toBlob(blob => { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; document.body.appendChild(link); link.click(); setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000); }, 'image/png'); }
  async function downloadAsset(asset) { if (!asset) return; if (asset.theme !== 'abandoned') { assetFiles(asset).forEach((src, index) => setTimeout(() => downloadFile(src), index * 260)); toast(asset.top ? '아랫배경과 윗배경 다운로드를 시작했습니다.' : `${asset.size} PNG 다운로드를 시작했습니다.`); return; } try { const [background, topImage, overlay] = await Promise.all([imageFromURL(asset.background), imageFromURL(asset.top), imageFromURL(asset.overlay)]), width = background.naturalWidth || 1536, height = background.naturalHeight || 1024, floor = makeCanvas(width, height), top = makeCanvas(width, height), name = asset.downloadName || `${asset.slug}.png`; paintAbandonedLayer(floor.getContext('2d'), background, width, height, overlay); paintAbandonedLayer(top.getContext('2d'), topImage, width, height, null, true); downloadCanvas(floor, name); setTimeout(() => downloadCanvas(top, name.replace(/\.png$/i, '-top.png')), 260); toast('폐쇄 기지 아랫배경과 윗배경 다운로드를 시작했습니다.'); } catch { toast('폐쇄 기지 PNG를 만들지 못했습니다.'); } }
  function downloadBlob(name, type, content) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type })); link.download = name; document.body.appendChild(link); link.click(); setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000); }
  async function copyText(text, message = '복사했습니다.') { try { await navigator.clipboard.writeText(text); toast(message); } catch { toast('텍스트를 선택해 직접 복사해 주세요.'); } }

  function setView(view, updateHash = true) {
    const valid = ['home', 'rooms', 'story', 'assets', 'downloads'].includes(view) ? view : 'home';
    $$('.project-tabs [data-view]').forEach(button => { const active = button.dataset.view === valid; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    $$('[data-view-panel]').forEach(panel => { const active = panel.dataset.viewPanel === valid; panel.hidden = !active; panel.classList.toggle('active', active); });
    if (updateHash) history.replaceState(null, '', valid === 'home' ? location.pathname : `#${valid}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderFlow() {
    $('#flowTrack').innerHTML = rooms.map((room, index) => `<button type="button" data-room-jump="${room.id}"><span>${String(index + 1).padStart(2, '0')}</span><b>${escapeText(room.title)}</b><small>${escapeText(room.phase)}</small></button>`).join('<i aria-hidden="true">→</i>');
  }

  function roomTemplate(room) {
    const asset = assetById.get(room.backgroundId);
    const notes = readJson(roomNoteKey);
    return `<article class="room-card" id="${room.id}" data-room-id="${room.id}">
      <button class="room-summary" type="button" data-room-action="toggle" aria-expanded="${room.order === 0}">
        <span class="room-number">${String(room.order + 1).padStart(2, '0')}</span>
        <img src="${asset?.thumbnail || ''}" alt="" loading="lazy" />
        <span class="room-title"><small>${escapeText(room.phase)} · ${room.id}</small><b>${escapeText(room.title)}</b><em>${escapeText(room.purpose)}</em></span>
        <span class="room-asset"><small>사용 배경</small><b>${escapeText(asset?.title || '미정')}</b></span><span class="room-chevron">⌄</span>
      </button>
      <div class="room-detail" ${room.order === 0 ? '' : 'hidden'}>
        <div class="room-preview"><img src="${asset?.background || ''}" alt="${escapeText(room.title)} 배경 미리보기" loading="lazy" /><div><a href="${asset?.editorUrl || '#'}">공방에서 열기</a><button type="button" data-room-action="download">관련 PNG 받기</button></div></div>
        <div class="room-specs">
          <section><span>STORY</span><p>${escapeText(room.story)}</p><button type="button" data-room-action="copy-story">스토리 복사</button></section>
          <section><span>MISSION</span><p>${escapeText(room.mission)}</p></section>
          <section><span>PUZZLE</span><p>${escapeText(room.puzzle)}</p></section>
          <section><span>OBJECTS</span><div class="object-tags">${room.objects.map(item => `<i>${escapeText(item)}</i>`).join('')}</div></section>
          <section class="teacher-check"><span>TEACHER SETUP</span><ul>${room.teacher.map(item => `<li>${escapeText(item)}</li>`).join('')}</ul></section>
          <section class="room-note"><label for="note-${room.id}">이 방에 대한 내 메모</label><textarea id="note-${room.id}" data-room-note="${room.id}" rows="3" placeholder="수업에 맞게 바꿀 내용을 적어 두세요.">${escapeText(notes[room.id] || '')}</textarea><small>이 기기에 자동 저장</small></section>
        </div>
      </div>
    </article>`;
  }

  function renderRooms() { $('#roomGrid').innerHTML = rooms.map(roomTemplate).join(''); }

  function storyPanelPath(panel) { return `assets/genesis/story-panels/panel_${String(panel.step).padStart(2, '0')}.png`; }
  function storyPanelText(panel) { return `${panel.header}\n${panel.subheader}\n${panel.title}\n${panel.body.join('\n')}\n${panel.highlight.join('\n')}\n${panel.footer}`; }
  function storyText(room) { return `${room.order + 1}. ${room.title} (${room.phase})\n${room.story}\n미션: ${room.mission}`; }
  function fullStoryText() { return `프로젝트 제네시스 오프닝 패널\n\n${storyPanels.map(storyPanelText).join('\n\n')}\n\n프로젝트 제네시스 방별 스토리\n\n${rooms.map(storyText).join('\n\n')}`; }
  function renderStoryPanels() {
    $('#storyPanelGrid').innerHTML = storyPanels.map(panel => `<article data-panel-id="${panel.id}"><button class="story-panel-preview" type="button" data-panel-action="download"><img src="${storyPanelPath(panel)}" alt="${escapeText(panel.title)} 스토리 패널" loading="lazy" /></button><div><span>${escapeText(panel.subheader)} · ${escapeText(panel.header)}</span><h3>${escapeText(panel.title)}</h3><p>${escapeText(panel.highlight.join(' '))}</p><div><button type="button" data-panel-action="copy">문구 복사</button><button type="button" data-panel-action="download">ZEP용 PNG 받기</button></div></div></article>`).join('');
  }
  function downloadAllStoryPanels() { storyPanels.forEach((panel, index) => setTimeout(() => downloadFile(storyPanelPath(panel)), index * 320)); toast('ZEP용 1024×576 스토리 패널 PNG 7장의 다운로드를 시작했습니다.'); }
  function renderStory() {
    $('#storyTimeline').innerHTML = rooms.map(room => { const asset = assetById.get(room.backgroundId); return `<article data-story-id="${room.id}"><div class="story-index"><span>${String(room.order + 1).padStart(2, '0')}</span><i></i></div><div class="story-card"><img src="${asset?.thumbnail || ''}" alt="" loading="lazy" /><div><small>${escapeText(room.phase)}</small><h2>${escapeText(room.title)}</h2><p>${escapeText(room.story)}</p><b>미션</b><p>${escapeText(room.mission)}</p><button type="button" data-story-copy="${room.id}">이 장면 복사</button></div></div></article>`; }).join('');
  }

  function cardTemplate(asset, statuses) {
    const status = statuses[asset.id] || 'ready';
    const searchText = [asset.id, asset.title, asset.subtitle, ...(asset.tags || [])].join(' ').toLowerCase();
    const classes = ['asset-card', asset.category === 'opening' ? 'featured' : '', asset.category === 'object' ? 'object-asset' : '', asset.theme === 'abandoned' ? 'abandoned-asset' : ''].filter(Boolean).join(' ');
    return `<article class="${classes}" data-id="${asset.id}" data-category="${asset.category}" data-search="${escapeText(searchText)}"><button class="asset-preview" type="button" data-action="preview"><img src="${asset.thumbnail}" alt="${escapeText(asset.title)} 미리보기" loading="lazy" /><span class="asset-badges"><span>${escapeText(asset.categoryLabel)}</span><span>${escapeText(asset.size)}</span></span></button><div class="asset-body"><div class="asset-head"><div><span class="asset-code">${asset.id}</span><h3>${escapeText(asset.title)}</h3><p>${escapeText(asset.subtitle)}</p></div><select class="status-select" data-action="status">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="asset-tags">${(asset.tags || []).map(tag => `<span>${escapeText(tag)}</span>`).join('')}</div><div class="asset-meta"><span>${escapeText(asset.layers)}</span><span>${escapeText(asset.size)}</span></div><div class="asset-actions"><a href="${asset.editorUrl}">${asset.category === 'object' ? '오브젝트 공방' : '공방에서 열기'}</a><button type="button" data-action="preview">상세</button><button type="button" data-action="download">PNG${asset.top ? ' 2장' : ''}</button></div></div></article>`;
  }
  function renderAssets() {
    const statuses = readJson(statusKey);
    const shown = assets.filter(asset => (filter === 'all' || asset.category === filter) && (!query || [asset.id, asset.title, asset.subtitle, ...(asset.tags || [])].join(' ').toLowerCase().includes(query)));
    $('#assetGrid').innerHTML = shown.map(asset => cardTemplate(asset, statuses)).join(''); $('#emptyState').hidden = shown.length > 0;
  }
  function openDialog(asset) {
    selectedAsset = asset; $('#assetDialog').classList.toggle('object-dialog', asset.category === 'object'); $('#assetDialog').classList.toggle('abandoned-dialog', asset.theme === 'abandoned'); $('#dialogImage').src = asset.background; $('#dialogImage').alt = `${asset.title} 원본 미리보기`; $('#dialogCode').textContent = asset.id; $('#dialogTitle').textContent = asset.title; $('#dialogDescription').textContent = asset.description;
    $('#dialogMeta').innerHTML = [asset.categoryLabel, asset.size, asset.layers, ...(asset.tags || [])].map(value => `<span>${escapeText(value)}</span>`).join(''); $('#promptDetails').hidden = !asset.prompt; $('#dialogPrompt').textContent = asset.prompt || '';
    $('#dialogActions').innerHTML = `<a href="${asset.editorUrl}">${asset.category === 'object' ? '오브젝트 공방으로 가져오기' : 'ZEP 공방에서 열기'}</a>${asset.theme === 'abandoned' ? '<button type="button" data-dialog-download>PNG 2장 저장</button>' : `<a href="${asset.background}" download>원본 PNG 저장</a>`}`; $('#assetDialog').showModal();
  }

  function renderDownloads() {
    $('#roomDownloads').innerHTML = rooms.map(room => { const asset = assetById.get(room.backgroundId); return `<article data-download-room="${room.id}"><img src="${asset?.thumbnail || ''}" alt="" loading="lazy" /><div><small>${room.id} · ${escapeText(room.phase)}</small><h3>${escapeText(room.title)}</h3><p>${escapeText(asset?.title || '')}</p><div><button type="button" data-download-action="room" data-room-id="${room.id}">관련 PNG 받기</button><a href="${asset?.editorUrl || '#'}">공방에서 열기</a></div></div></article>`; }).join('');
  }

  function teacherGuide() {
    return `프로젝트 제네시스 교사용 ZEP 제작 가이드\n=====================================\n\n${rooms.map(room => { const asset = assetById.get(room.backgroundId); return `[${room.order + 1}] ${room.title} / ${room.phase}\n목적: ${room.purpose}\n배경: ${asset?.title || '미정'} (${asset?.size || ''})\n스토리: ${room.story}\n미션: ${room.mission}\n퍼즐: ${room.puzzle}\n오브젝트: ${room.objects.join(', ')}\n교사 설정:\n- ${room.teacher.join('\n- ')}\n`; }).join('\n')}`;
  }
  function downloadAllAssets() { const files = [...new Set(assets.flatMap(assetFiles))]; files.forEach((src, index) => setTimeout(() => downloadFile(src), index * 320)); toast(`PNG ${files.length}개 다운로드를 시작했습니다.`); }

  $('.project-tabs').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) setView(button.dataset.view); });
  document.addEventListener('click', event => { const go = event.target.closest('[data-go-view]'); if (go) setView(go.dataset.goView); const jump = event.target.closest('[data-room-jump]'); if (jump) { setView('rooms'); setTimeout(() => document.getElementById(jump.dataset.roomJump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120); } });
  $('#roomGrid').addEventListener('click', event => { const card = event.target.closest('.room-card'); const action = event.target.closest('[data-room-action]')?.dataset.roomAction; if (!card || !action) return; const room = rooms.find(item => item.id === card.dataset.roomId), asset = assetById.get(room?.backgroundId); if (action === 'toggle') { const detail = card.querySelector('.room-detail'), expanded = detail.hidden; detail.hidden = !expanded; card.querySelector('.room-summary').setAttribute('aria-expanded', String(expanded)); } if (action === 'download') downloadAsset(asset); if (action === 'copy-story') copyText(storyText(room), '방 스토리를 복사했습니다.'); });
  $('#roomGrid').addEventListener('input', event => { if (!event.target.matches('[data-room-note]')) return; const notes = readJson(roomNoteKey); notes[event.target.dataset.roomNote] = event.target.value; saveJson(roomNoteKey, notes); });
  $('#expandRooms').addEventListener('click', () => { const details = $$('.room-detail'), open = details.some(detail => detail.hidden); details.forEach(detail => detail.hidden = !open); $$('.room-summary').forEach(button => button.setAttribute('aria-expanded', String(open))); $('#expandRooms').textContent = open ? '모두 접기' : '모두 펼치기'; });
  $('#storyTimeline').addEventListener('click', event => { const button = event.target.closest('[data-story-copy]'); if (!button) return; const room = rooms.find(item => item.id === button.dataset.storyCopy); copyText(storyText(room), '장면 스토리를 복사했습니다.'); });
  $('#storyPanelGrid').addEventListener('click', event => { const card = event.target.closest('[data-panel-id]'), action = event.target.closest('[data-panel-action]')?.dataset.panelAction; if (!card || !action) return; const panel = storyPanels.find(item => item.id === card.dataset.panelId); if (action === 'copy') copyText(storyPanelText(panel), '패널 문구를 복사했습니다.'); if (action === 'download') downloadFile(storyPanelPath(panel)); });
  $('#copyAllStory').addEventListener('click', () => copyText(fullStoryText(), '전체 스토리를 복사했습니다.')); $('#downloadStory').addEventListener('click', () => downloadBlob('project-genesis-storyboard.txt', 'text/plain;charset=utf-8', fullStoryText()));
  $('#downloadAllStoryPanels').addEventListener('click', downloadAllStoryPanels); $('#downloadStoryPanelSet').addEventListener('click', downloadAllStoryPanels);
  $('#assetGrid').addEventListener('click', event => { const card = event.target.closest('.asset-card'), action = event.target.closest('[data-action]')?.dataset.action; if (!card || !action || action === 'status') return; const asset = assetById.get(card.dataset.id); if (action === 'preview') openDialog(asset); if (action === 'download') downloadAsset(asset); });
  $('#assetGrid').addEventListener('change', event => { if (event.target.dataset.action !== 'status') return; const card = event.target.closest('.asset-card'), statuses = readJson(statusKey); statuses[card.dataset.id] = event.target.value; saveJson(statusKey, statuses); toast(`${card.querySelector('h3').textContent}: ${statusLabels[event.target.value]}`); });
  $('#dialogActions').addEventListener('click', event => { if (event.target.closest('[data-dialog-download]')) downloadAsset(selectedAsset); });
  $('#filterTabs').addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (!button) return; filter = button.dataset.filter; $$('#filterTabs button').forEach(item => item.classList.toggle('active', item === button)); renderAssets(); });
  $('#assetSearch').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); renderAssets(); });
  $('#roomDownloads').addEventListener('click', event => { const button = event.target.closest('[data-download-action="room"]'); if (!button) return; const room = rooms.find(item => item.id === button.dataset.roomId); downloadAsset(assetById.get(room?.backgroundId)); });
  $('#downloadGuide').addEventListener('click', () => downloadBlob('project-genesis-teacher-guide.txt', 'text/plain;charset=utf-8', teacherGuide()));
  $('#downloadManifest').addEventListener('click', () => downloadBlob('project-genesis-manifest.json', 'application/json;charset=utf-8', JSON.stringify({ project: 'Project Genesis', version: 2, rooms, assets, storyPanels }, null, 2)));
  $('#downloadAllAssets').addEventListener('click', downloadAllAssets);
  $('#dialogClose').addEventListener('click', () => $('#assetDialog').close()); $('#assetDialog').addEventListener('click', event => { if (event.target === $('#assetDialog')) $('#assetDialog').close(); }); $('#copyPrompt').addEventListener('click', () => selectedAsset?.prompt && copyText(selectedAsset.prompt, '프롬프트를 복사했습니다.'));

  const memo = $('#projectMemo'); memo.value = localStorage.getItem(memoKey) || ''; let memoTimer; memo.addEventListener('input', () => { $('#memoState').textContent = '저장 중…'; clearTimeout(memoTimer); memoTimer = setTimeout(() => { localStorage.setItem(memoKey, memo.value); $('#memoState').textContent = '이 기기에 저장했습니다.'; }, 350); });
  $('#roomCount').textContent = rooms.length; $('#roomTabCount').textContent = rooms.length; $('#assetCount').textContent = assets.length; $('#assetTabCount').textContent = assets.length; $('#downloadCount').textContent = new Set([...assets.flatMap(assetFiles), ...storyPanels.map(storyPanelPath)]).size;
  renderFlow(); renderRooms(); renderStoryPanels(); renderStory(); renderAssets(); renderDownloads(); setView(location.hash.slice(1) || 'home', false);
})();
