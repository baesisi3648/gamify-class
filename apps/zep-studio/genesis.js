(() => {
  'use strict';
  const assets = window.GENESIS_ASSETS || [];
  const $ = selector => document.querySelector(selector);
  const statusLabels = { planned: '구상', making: '제작 중', ready: '완료' };
  const statusKey = 'zep-genesis-status-v1';
  const memoKey = 'zep-genesis-project-memo-v1';
  let filter = 'all';
  let query = '';
  let selectedAsset = null;
  let toastTimer;

  function readStatuses() { try { return JSON.parse(localStorage.getItem(statusKey) || '{}'); } catch { return {}; } }
  function saveStatuses(value) { localStorage.setItem(statusKey, JSON.stringify(value)); }
  function escapeText(value) { return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
  function toast(message) { const el = $('#genesisToast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200); }
  function downloadFile(src, name) { const link = document.createElement('a'); link.href = src; link.download = name || src.split('/').pop(); document.body.appendChild(link); link.click(); link.remove(); }
  function downloadAsset(asset) { downloadFile(asset.background); if (asset.top) setTimeout(() => downloadFile(asset.top), 260); toast(asset.top ? '아랫배경과 윗배경 PNG 저장을 시작했습니다.' : '4096×1024 PNG 저장을 시작했습니다.'); }

  function cardTemplate(asset, statuses) {
    const status = statuses[asset.id] || (asset.category === 'opening' ? 'ready' : 'ready');
    const searchText = [asset.id, asset.title, asset.subtitle, ...(asset.tags || [])].join(' ').toLowerCase();
    return `<article class="asset-card ${asset.category === 'opening' ? 'featured' : ''}" data-id="${asset.id}" data-category="${asset.category}" data-search="${escapeText(searchText)}">
      <button class="asset-preview" type="button" data-action="preview" aria-label="${escapeText(asset.title)} 상세 보기">
        <img src="${asset.thumbnail}" alt="${escapeText(asset.title)} 미리보기" loading="lazy" />
        <span class="asset-badges"><span>${escapeText(asset.categoryLabel)}</span><span>${escapeText(asset.size)}</span></span>
      </button>
      <div class="asset-body">
        <div class="asset-head"><div><span class="asset-code">${asset.id}</span><h3>${escapeText(asset.title)}</h3><p>${escapeText(asset.subtitle)}</p></div>
          <select class="status-select" data-action="status" aria-label="${escapeText(asset.title)} 제작 상태">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === status ? 'selected' : ''}>${label}</option>`).join('')}</select>
        </div>
        <div class="asset-tags">${(asset.tags || []).map(tag => `<span>${escapeText(tag)}</span>`).join('')}</div>
        <div class="asset-meta"><span>${escapeText(asset.layers)}</span><span>${escapeText(asset.size)}</span></div>
        <div class="asset-actions"><a href="${asset.editorUrl}">공방에서 열기</a><button type="button" data-action="preview">상세</button><button type="button" data-action="download">PNG${asset.top ? ' 2장' : ''}</button></div>
      </div>
    </article>`;
  }

  function renderAssets() {
    const statuses = readStatuses();
    const shown = assets.filter(asset => (filter === 'all' || asset.category === filter) && (!query || [asset.id, asset.title, asset.subtitle, ...(asset.tags || [])].join(' ').toLowerCase().includes(query)));
    $('#assetGrid').innerHTML = shown.map(asset => cardTemplate(asset, statuses)).join('');
    $('#emptyState').hidden = shown.length > 0;
  }

  function openDialog(asset) {
    selectedAsset = asset;
    $('#dialogImage').src = asset.background;
    $('#dialogImage').alt = `${asset.title} 원본 미리보기`;
    $('#dialogCode').textContent = asset.id;
    $('#dialogTitle').textContent = asset.title;
    $('#dialogDescription').textContent = asset.description;
    $('#dialogMeta').innerHTML = [`${asset.categoryLabel}`, asset.size, asset.layers, ...(asset.tags || [])].map(value => `<span>${escapeText(value)}</span>`).join('');
    $('#promptDetails').hidden = !asset.prompt;
    $('#dialogPrompt').textContent = asset.prompt || '';
    $('#dialogActions').innerHTML = `<a href="${asset.editorUrl}">ZEP 공방에서 열기</a><a href="${asset.background}" download>원본 PNG 저장</a>`;
    $('#assetDialog').showModal();
  }

  $('#assetGrid').addEventListener('click', event => {
    const card = event.target.closest('.asset-card');
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!card || !action || action === 'status') return;
    const asset = assets.find(item => item.id === card.dataset.id);
    if (!asset) return;
    if (action === 'preview') openDialog(asset);
    if (action === 'download') downloadAsset(asset);
  });
  $('#assetGrid').addEventListener('change', event => {
    if (event.target.dataset.action !== 'status') return;
    const card = event.target.closest('.asset-card');
    const statuses = readStatuses();
    statuses[card.dataset.id] = event.target.value;
    saveStatuses(statuses);
    toast(`${card.querySelector('h3').textContent}: ${statusLabels[event.target.value]}`);
  });
  $('#filterTabs').addEventListener('click', event => {
    const button = event.target.closest('[data-filter]'); if (!button) return;
    filter = button.dataset.filter;
    document.querySelectorAll('#filterTabs button').forEach(item => item.classList.toggle('active', item === button));
    renderAssets();
  });
  $('#assetSearch').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); renderAssets(); });
  $('#dialogClose').addEventListener('click', () => $('#assetDialog').close());
  $('#assetDialog').addEventListener('click', event => { if (event.target === $('#assetDialog')) $('#assetDialog').close(); });
  $('#copyPrompt').addEventListener('click', async () => { if (!selectedAsset?.prompt) return; try { await navigator.clipboard.writeText(selectedAsset.prompt); toast('프롬프트를 복사했습니다.'); } catch { toast('프롬프트를 선택해 직접 복사해 주세요.'); } });

  const memo = $('#projectMemo');
  memo.value = localStorage.getItem(memoKey) || '';
  let memoTimer;
  memo.addEventListener('input', () => { $('#memoState').textContent = '저장 중…'; $('#memoState').classList.remove('saved'); clearTimeout(memoTimer); memoTimer = setTimeout(() => { localStorage.setItem(memoKey, memo.value); $('#memoState').textContent = '이 기기에 저장했습니다.'; $('#memoState').classList.add('saved'); }, 350); });
  $('#assetCount').textContent = assets.length;
  $('#mapCount').textContent = assets.filter(asset => asset.category === 'map').length;
  $('#openingCount').textContent = assets.filter(asset => asset.category === 'opening').length;
  renderAssets();
})();
