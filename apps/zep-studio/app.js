(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const canvas = $('#editorCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const preview = $('#previewCanvas');
  const pctx = preview.getContext('2d');
  const layerMeta = {
    floor: { name: '바닥', sub: '캐릭터 아래', icon: 'F' },
    object: { name: '오브젝트', sub: '가구·장식', icon: 'O' },
    top: { name: '윗배경', sub: '캐릭터를 가림', icon: 'T' },
    collision: { name: '충돌 영역', sub: '통과 금지', icon: '!' }
  };
  const state = {
    workspace: 'map', activeLayer: 'floor', tool: 'brush', color: '#5c8f4f', size: 8,
    tolerance: 24, zoom: 1, grid: true, tileSize: 32, drawing: false, start: null,
    beforeStroke: null, selection: null, selectionSource: 'floor', stamp: null,
    mapWidth: 640, mapHeight: 480, objectWidth: 96, objectHeight: 96,
    layers: {}, objectCanvas: document.createElement('canvas'), history: [], redoHistory: [],
    library: [], hasContent: false, saveTimer: null, aiKind: 'map', aiResult: null, aiLayers: null, splitMode: false
  };
  const palette = ['#1b1d2e','#ffffff','#5c8f4f','#8fcf68','#426a8a','#65b7c9','#8c654a','#d6b06f','#f1d36b','#db6a6a','#8b7cff','#493f67'];

  function makeLayer(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function setupLayers(w, h, preserve = false) {
    const old = state.layers;
    state.layers = {};
    Object.keys(layerMeta).forEach(key => {
      const c = makeLayer(w, h);
      if (preserve && old[key]) c.getContext('2d').drawImage(old[key], 0, 0);
      state.layers[key] = c;
    });
    state.mapWidth = w; state.mapHeight = h;
    $('#mapWidth').value = w; $('#mapHeight').value = h; $('#mapSizeLabel').textContent = `${w} × ${h}`;
    render();
  }
  function setupObject(w, h, preserve = false) {
    const old = state.objectCanvas;
    state.objectCanvas = makeLayer(w, h);
    if (preserve && old.width) state.objectCanvas.getContext('2d').drawImage(old, 0, 0);
    state.objectWidth = w; state.objectHeight = h;
    $('#objectWidth').value = w; $('#objectHeight').value = h; $('#objectSizeLabel').textContent = `${w} × ${h}`;
    render();
  }
  function currentCanvas() { return state.workspace === 'object' ? state.objectCanvas : state.layers[state.activeLayer]; }
  function currentContext() { return currentCanvas().getContext('2d', { willReadFrequently: true }); }
  function resizeDisplay() {
    const source = state.workspace === 'object' ? state.objectCanvas : state.layers.floor;
    canvas.width = source.width; canvas.height = source.height;
    const maxDisplay = state.workspace === 'object' ? 520 : 900;
    const baseScale = Math.min(1, maxDisplay / Math.max(source.width, source.height));
    const cssW = Math.max(64, source.width * baseScale * state.zoom);
    const cssH = Math.max(64, source.height * baseScale * state.zoom);
    canvas.style.width = `${cssW}px`; canvas.style.height = `${cssH}px`;
    $('#stageWrap').style.width = `${cssW}px`; $('#stageWrap').style.height = `${cssH}px`;
  }
  function render() {
    resizeDisplay();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (state.workspace === 'object') {
      ctx.drawImage(state.objectCanvas, 0, 0);
    } else {
      ['floor','object','top'].forEach(key => {
        const row = $(`.layer[data-layer="${key}"]`);
        if (!row || row.dataset.visible !== 'false') ctx.drawImage(state.layers[key], 0, 0);
      });
      const collisionRow = $('.layer[data-layer="collision"]');
      if (!collisionRow || collisionRow.dataset.visible !== 'false') {
        ctx.save(); ctx.globalAlpha = .52; ctx.drawImage(state.layers.collision, 0, 0); ctx.restore();
      }
      if (state.selection) drawSelectionOverlay();
      if (state.grid) drawGrid(ctx, canvas.width, canvas.height);
      renderPreview();
    }
    $('#zoomValue').textContent = `${Math.round(state.zoom * 100)}%`;
    $('#emptyCallout').classList.toggle('show', state.workspace === 'map' && !state.hasContent);
  }
  function drawGrid(target, w, h) {
    const step = state.tileSize;
    target.save(); target.strokeStyle = 'rgba(22,24,42,.22)'; target.lineWidth = 1;
    target.beginPath();
    for (let x = step; x < w; x += step) { target.moveTo(x + .5, 0); target.lineTo(x + .5, h); }
    for (let y = step; y < h; y += step) { target.moveTo(0, y + .5); target.lineTo(w, y + .5); }
    target.stroke(); target.restore();
  }
  function drawSelectionOverlay() {
    const image = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < state.selection.length; i++) if (state.selection[i]) {
      const p = i * 4; image.data[p] = 74; image.data[p+1] = 180; image.data[p+2] = 255; image.data[p+3] = 115;
    }
    ctx.putImageData(image, 0, 0);
  }
  function renderPreview() {
    const ratio = state.mapWidth / state.mapHeight;
    preview.width = ratio >= 1 ? 240 : Math.round(180 * ratio);
    preview.height = ratio >= 1 ? Math.round(240 / ratio) : 180;
    pctx.clearRect(0,0,preview.width,preview.height);
    ['floor','object','top'].forEach(k => pctx.drawImage(state.layers[k],0,0,preview.width,preview.height));
  }
  function buildLayers() {
    $('#layerList').innerHTML = Object.entries(layerMeta).map(([key,m]) => `
      <div class="layer ${key === state.activeLayer ? 'active' : ''}" data-layer="${key}" data-visible="true">
        <span class="layer-swatch">${m.icon}</span><span><b>${m.name}</b><small>${m.sub}</small></span>
        <button class="visibility" type="button" title="보이기/숨기기">●</button>
      </div>`).join('');
  }
  function setWorkspace(name) {
    state.workspace = name; state.selection = null; state.stamp = null;
    $$('.workspace-tab').forEach(b => { const on = b.dataset.workspace === name; b.classList.toggle('active',on); b.setAttribute('aria-selected',on); });
    $$('.map-only').forEach(el => el.classList.toggle('hidden', name !== 'map'));
    $$('.object-only').forEach(el => el.classList.toggle('hidden', name !== 'object'));
    $('#activeLayerStatus').textContent = name === 'map' ? `${layerMeta[state.activeLayer].name} 레이어` : '오브젝트 캔버스';
    render();
  }
  function setTool(tool) {
    state.tool = tool; state.stamp = tool === 'stamp' ? state.stamp : null;
    $$('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    const names={brush:'펜 B',eraser:'지우개 E',line:'선 L',rect:'사각형 R',ellipse:'원 O',fill:'채우기 F',picker:'색 추출 I',wand:'영역 선택 W',stamp:'오브젝트 배치'};
    $('#shortcutHint').textContent = names[tool] || tool;
    canvas.style.cursor = tool === 'picker' ? 'copy' : tool === 'stamp' ? 'cell' : 'crosshair';
  }
  function pointFromEvent(e) {
    const r = canvas.getBoundingClientRect();
    return { x: Math.max(0,Math.min(canvas.width-1,Math.floor((e.clientX-r.left)*canvas.width/r.width))), y: Math.max(0,Math.min(canvas.height-1,Math.floor((e.clientY-r.top)*canvas.height/r.height))) };
  }
  function rgba(hex, alpha=255) { const n=parseInt(hex.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255,alpha]; }
  function colorDistance(a,b){return Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]),Math.abs(a[3]-b[3]));}
  function beginDraw(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault(); canvas.setPointerCapture?.(e.pointerId);
    const p=pointFromEvent(e); state.start=p; state.drawing=true;
    const c=currentCanvas(), cctx=currentContext();
    if (state.tool === 'picker') { pickColor(p); state.drawing=false; return; }
    if (state.tool === 'fill') { pushHistory(); floodFill(cctx,p.x,p.y,rgba(state.color)); changed(); state.drawing=false; return; }
    if (state.tool === 'wand' && state.workspace === 'map') { makeSelection(p); state.drawing=false; return; }
    if (state.tool === 'stamp' && state.stamp && state.workspace === 'map') { pushHistory(); cctx.drawImage(state.stamp,p.x-state.stamp.width/2,p.y-state.stamp.height/2); changed(); state.drawing=false; toast('오브젝트를 배치했습니다. 계속 눌러 더 배치할 수 있어요.'); return; }
    pushHistory();
    state.beforeStroke=cctx.getImageData(0,0,c.width,c.height);
    if (state.tool === 'brush' || state.tool === 'eraser') drawBrush(p,p);
  }
  function moveDraw(e) {
    const p=pointFromEvent(e); $('#cursorPosition').textContent=`X ${p.x} · Y ${p.y}`;
    if (!state.drawing) return;
    if (state.tool === 'brush' || state.tool === 'eraser') { drawBrush(state.start,p); state.start=p; render(); }
    else if (['line','rect','ellipse'].includes(state.tool)) { drawShapePreview(p); }
  }
  function endDraw(e) {
    if (!state.drawing) return; state.drawing=false;
    if (['line','rect','ellipse'].includes(state.tool)) drawShapePreview(pointFromEvent(e));
    changed();
  }
  function drawBrush(a,b) {
    const c=currentContext(); c.save(); c.lineCap='round'; c.lineJoin='round'; c.lineWidth=state.size;
    if (state.tool==='eraser'){c.globalCompositeOperation='destination-out';c.strokeStyle='#000';} else {c.globalCompositeOperation='source-over';c.strokeStyle=state.activeLayer==='collision'&&state.workspace==='map'?'#ff355d':state.color;}
    c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();
  }
  function drawShapePreview(p) {
    const c=currentContext(); c.putImageData(state.beforeStroke,0,0); c.save(); c.strokeStyle=state.activeLayer==='collision'&&state.workspace==='map'?'#ff355d':state.color;c.lineWidth=state.size;c.lineCap='round';
    c.beginPath();
    if(state.tool==='line'){c.moveTo(state.start.x,state.start.y);c.lineTo(p.x,p.y);} 
    if(state.tool==='rect')c.rect(state.start.x,state.start.y,p.x-state.start.x,p.y-state.start.y);
    if(state.tool==='ellipse'){const cx=(state.start.x+p.x)/2,cy=(state.start.y+p.y)/2;c.ellipse(cx,cy,Math.abs(p.x-state.start.x)/2,Math.abs(p.y-state.start.y)/2,0,0,Math.PI*2);}
    c.stroke();c.restore();render();
  }
  function floodFill(c,x,y,newColor) {
    const img=c.getImageData(0,0,c.canvas.width,c.canvas.height),d=img.data,w=c.canvas.width,h=c.canvas.height,idx=(y*w+x)*4,target=[d[idx],d[idx+1],d[idx+2],d[idx+3]];
    if(colorDistance(target,newColor)===0)return;const seen=new Uint8Array(w*h),stack=[x,y],tol=Math.min(state.tolerance,50);
    while(stack.length){const cy=stack.pop(),cx=stack.pop(),i=cy*w+cx;if(cx<0||cy<0||cx>=w||cy>=h||seen[i])continue;seen[i]=1;const p=i*4;if(colorDistance([d[p],d[p+1],d[p+2],d[p+3]],target)>tol)continue;d[p]=newColor[0];d[p+1]=newColor[1];d[p+2]=newColor[2];d[p+3]=newColor[3];stack.push(cx+1,cy,cx-1,cy,cx,cy+1,cx,cy-1);}
    c.putImageData(img,0,0);
  }
  function pickColor(p) {
    const d=currentContext().getImageData(p.x,p.y,1,1).data;if(!d[3])return toast('투명한 곳입니다. 색이 있는 부분을 눌러 주세요.');
    setColor('#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join(''));setTool('brush');
  }
  function makeSelection(p) {
    const source=state.layers[state.activeLayer],c=source.getContext('2d',{willReadFrequently:true}),img=c.getImageData(0,0,source.width,source.height),d=img.data,w=source.width,h=source.height,idx=(p.y*w+p.x)*4,target=[d[idx],d[idx+1],d[idx+2],d[idx+3]],mask=new Uint8Array(w*h),stack=[p.x,p.y];
    if(target[3]===0)return toast('투명한 영역은 선택할 수 없습니다.');let count=0;
    while(stack.length){const y=stack.pop(),x=stack.pop(),i=y*w+x;if(x<0||y<0||x>=w||y>=h||mask[i])continue;const q=i*4;if(colorDistance([d[q],d[q+1],d[q+2],d[q+3]],target)>state.tolerance)continue;mask[i]=1;count++;stack.push(x+1,y,x-1,y,x,y+1,x,y-1);}
    if(state.selection&&state.selectionSource===state.activeLayer&&$('#addSelection').checked){for(let i=0;i<mask.length;i++)if(mask[i])state.selection[i]=1;count=state.selection.reduce((sum,value)=>sum+value,0);}else{state.selection=mask;state.selectionSource=state.activeLayer;}
    $('#selectionPanel').classList.remove('hidden');$('#selectionCount').textContent=`${count.toLocaleString()} px`;if(state.splitMode)$('#splitModeStatus').textContent='영역 선택됨';render();
  }
  function growSelection(){
    if(!state.selection)return toast('먼저 맵에서 분리할 영역을 클릭해 주세요.');
    const w=state.mapWidth,h=state.mapHeight,next=new Uint8Array(state.selection),source=state.selection;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!source[i])continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<w&&ny<h)next[ny*w+nx]=1;}}
    state.selection=next;
    $('#selectionCount').textContent=`${next.reduce((sum,value)=>sum+value,0).toLocaleString()} px`;
    render();
  }
  function startLayerSplit(){
    if(!hasPixels(state.layers.floor))return toast('먼저 AI 맵을 바닥 레이어로 가져와 주세요.');
    setWorkspace('map');state.splitMode=true;state.activeLayer='floor';syncActiveLayer();setTool('wand');
    $('#splitGuidePanel').classList.add('active');$('#splitModeStatus').textContent='선택 중';$('#startSplitButton').classList.add('hidden');$('#finishSplitButton').classList.remove('hidden');
    toast('맵에서 오브젝트나 윗배경으로 옮길 부분을 클릭하세요.');
  }
  function finishLayerSplit(){
    state.splitMode=false;clearSelection();setTool('brush');
    $('#splitGuidePanel').classList.remove('active');$('#splitModeStatus').textContent='대기';$('#startSplitButton').classList.remove('hidden');$('#finishSplitButton').classList.add('hidden');
    toast('레이어 분리를 마쳤습니다.');
  }
  function transferSelection(targetKey) {
    if(!state.selection)return;pushHistory();const source=state.layers[state.selectionSource],target=state.layers[targetKey],w=source.width,h=source.height,mask=makeLayer(w,h),mctx=mask.getContext('2d'),mi=mctx.createImageData(w,h);
    for(let i=0;i<state.selection.length;i++)if(state.selection[i])mi.data[i*4+3]=255;mctx.putImageData(mi,0,0);
    const temp=makeLayer(w,h),tctx=temp.getContext('2d');tctx.drawImage(source,0,0);tctx.globalCompositeOperation='destination-in';tctx.drawImage(mask,0,0);target.getContext('2d').drawImage(temp,0,0);
    if($('#cutSource').checked){const sctx=source.getContext('2d');sctx.save();sctx.globalCompositeOperation='destination-out';sctx.drawImage(mask,0,0);sctx.restore();}
    clearSelection();state.activeLayer=state.splitMode?'floor':targetKey;syncActiveLayer();if(state.splitMode)$('#splitModeStatus').textContent='다음 영역 선택';changed();toast(`${layerMeta[targetKey].name} 레이어로 옮겼습니다.${state.splitMode?' 다음 영역을 클릭하세요.':''}`);
  }
  function clearSelection(){state.selection=null;$('#selectionPanel').classList.add('hidden');render();}
  function setColor(hex){state.color=hex.toLowerCase();$('#colorInput').value=state.color;$('#colorText').value=state.color.toUpperCase();$('#colorSwatch').style.background=state.color;}
  function syncActiveLayer(){ $$('.layer').forEach(el=>el.classList.toggle('active',el.dataset.layer===state.activeLayer));$('#activeLayerStatus').textContent=`${layerMeta[state.activeLayer].name} 레이어`; }

  function snapshot() {
    return { workspace:state.workspace,activeLayer:state.activeLayer,layers:Object.fromEntries(Object.entries(state.layers).map(([k,c])=>[k,c.toDataURL()])),object:state.objectCanvas.toDataURL() };
  }
  function pushHistory() { state.history.push(snapshot());if(state.history.length>20)state.history.shift();state.redoHistory=[]; }
  async function restoreSnapshot(s) { for(const[k,url]of Object.entries(s.layers))await drawDataURL(state.layers[k],url,true);await drawDataURL(state.objectCanvas,s.object,true);state.activeLayer=s.activeLayer||'floor';state.hasContent=Object.values(state.layers).some(hasPixels);syncActiveLayer();render(); }
  async function undo(){if(!state.history.length)return toast('되돌릴 내용이 없습니다.');state.redoHistory.push(snapshot());await restoreSnapshot(state.history.pop());scheduleSave();}
  async function redo(){if(!state.redoHistory.length)return toast('다시 실행할 내용이 없습니다.');state.history.push(snapshot());await restoreSnapshot(state.redoHistory.pop());scheduleSave();}
  function changed(){if(state.workspace==='map')state.hasContent=true;render();scheduleSave();}
  function trashMap(){
    if(!confirm('나의 ZEP 맵을 완전히 비우고 새로 시작할까요?\n바닥·오브젝트·윗배경·충돌 레이어가 모두 삭제됩니다.'))return;
    pushHistory();
    Object.values(state.layers).forEach(layer=>layer.getContext('2d').clearRect(0,0,layer.width,layer.height));
    state.hasContent=false;
    state.selection=null;
    state.stamp=null;
    state.activeLayer='floor';
    syncActiveLayer();
    render();
    scheduleSave();
    toast('맵을 비웠습니다. 실행 취소로 복구할 수 있어요.');
  }

  function loadImageFile(file,target,fit=true){if(!file)return;const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{pushHistory();const c=target.getContext('2d');if(fit){c.clearRect(0,0,target.width,target.height);const scale=Math.min(target.width/img.width,target.height/img.height),w=img.width*scale,h=img.height*scale;c.drawImage(img,(target.width-w)/2,(target.height-h)/2,w,h);}else c.drawImage(img,0,0);changed();toast('이미지를 불러왔습니다.');};img.src=reader.result;};reader.readAsDataURL(file);}
  function drawDataURL(target,url,clear=false){return new Promise(resolve=>{const img=new Image();img.onload=()=>{const c=target.getContext('2d');if(clear)c.clearRect(0,0,target.width,target.height);c.drawImage(img,0,0);resolve();};img.onerror=resolve;img.src=url;});}
  function imageFromURL(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}
  function safeName(s){return (s||'zep-map').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_').slice(0,60)||'zep-map';}
  function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
  function downloadCanvas(c,name){c.toBlob(blob=>downloadBlob(blob,name),'image/png');}
  function exportLayer(key){const base=safeName($('#projectName').value);if(key==='collision-json')return exportCollisionJSON();const names={floor:'floor',object:'objects',top:'top',collision:'collision'};downloadCanvas(state.layers[key],`${base}-${names[key]}.png`);toast('PNG 저장을 시작했습니다.');}
  function exportCollisionJSON(){const c=state.layers.collision,ic=c.getContext('2d').getImageData(0,0,c.width,c.height).data,t=state.tileSize,cells=[];for(let ty=0;ty<Math.ceil(c.height/t);ty++)for(let tx=0;tx<Math.ceil(c.width/t);tx++){let hit=false;for(let y=ty*t;y<Math.min((ty+1)*t,c.height)&&!hit;y+=Math.max(1,Math.floor(t/4)))for(let x=tx*t;x<Math.min((tx+1)*t,c.width);x+=Math.max(1,Math.floor(t/4)))if(ic[(y*c.width+x)*4+3]>0){hit=true;break;}if(hit)cells.push({x:tx,y:ty});}const data={format:'gamify-zep-collision-v1',tileSize:t,mapWidth:c.width,mapHeight:c.height,cells};downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`${safeName($('#projectName').value)}-collision.json`);}
  function projectData(){return{format:'gamify-zep-studio-v1',name:$('#projectName').value,map:{width:state.mapWidth,height:state.mapHeight,tileSize:state.tileSize,layers:Object.fromEntries(Object.entries(state.layers).map(([k,c])=>[k,c.toDataURL('image/png')]))},object:{width:state.objectWidth,height:state.objectHeight,image:state.objectCanvas.toDataURL('image/png')},savedAt:new Date().toISOString()};}
  function exportProject(){downloadBlob(new Blob([JSON.stringify(projectData())],{type:'application/json'}),`${safeName($('#projectName').value)}.zepmap`);toast('프로젝트 파일을 저장했습니다.');}
  async function importProject(file){try{const d=JSON.parse(await file.text());if(d.format!=='gamify-zep-studio-v1')throw new Error();setupLayers(d.map.width,d.map.height);setupObject(d.object.width,d.object.height);for(const[k,url]of Object.entries(d.map.layers))await drawDataURL(state.layers[k],url,true);await drawDataURL(state.objectCanvas,d.object.image,true);state.tileSize=d.map.tileSize||32;$('#tileSize').value=state.tileSize;$('#projectName').value=d.name||'불러온 ZEP 맵';state.hasContent=true;render();scheduleSave();toast('프로젝트를 불러왔습니다.');}catch{toast('이 프로젝트 파일을 읽을 수 없습니다.');}}

  function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('gamify-zep-studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=reject;});}
  async function saveLocal(){try{const db=await openDB(),tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(projectData(),'autosave');await new Promise(r=>tx.oncomplete=r);$('#saveState').classList.remove('saving');$('#saveState').lastChild.textContent=' 기기에 자동 저장됨';}catch{ /* private mode may reject IndexedDB */ }}
  function scheduleSave(){clearTimeout(state.saveTimer);$('#saveState').classList.add('saving');$('#saveState').lastChild.textContent=' 저장 중…';state.saveTimer=setTimeout(saveLocal,700);}
  async function loadAutosave(){try{const db=await openDB(),tx=db.transaction('projects','readonly'),req=tx.objectStore('projects').get('autosave'),d=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=rej;});if(!d)return;setupLayers(d.map.width,d.map.height);setupObject(d.object.width,d.object.height);for(const[k,url]of Object.entries(d.map.layers))await drawDataURL(state.layers[k],url,true);await drawDataURL(state.objectCanvas,d.object.image,true);state.tileSize=d.map.tileSize||32;$('#tileSize').value=state.tileSize;$('#projectName').value=d.name;state.hasContent=true;render();toast('이 기기의 마지막 작업을 복원했습니다.');}catch{} }
  async function clearAutosave(){if(!confirm('이 기기에 저장된 자동 저장본을 지울까요? 현재 화면은 그대로 유지됩니다.'))return;const db=await openDB(),tx=db.transaction('projects','readwrite');tx.objectStore('projects').delete('autosave');toast('자동 저장본을 삭제했습니다.');}
  function saveObjectLibrary(){const data=state.objectCanvas.toDataURL('image/png');if(data.length>900000)return toast('보관함에는 작은 오브젝트만 저장할 수 있습니다. PNG로 내려받아 보관해 주세요.');state.library.unshift({id:Date.now(),name:$('#objectName').value||'오브젝트',image:data,w:state.objectWidth,h:state.objectHeight});state.library=state.library.slice(0,12);localStorage.setItem('zep-object-library',JSON.stringify(state.library));renderLibrary();toast('내 오브젝트 보관함에 저장했습니다.');}
  function renderLibrary(){if(!state.library.length){$('#objectLibrary').innerHTML='<p class="hint">저장한 오브젝트가 여기에 나타납니다.</p>';return;}$('#objectLibrary').innerHTML=state.library.map(o=>`<div class="library-item" data-id="${o.id}" title="${o.name.replace(/"/g,'&quot;')}"><img src="${o.image}" alt="${o.name.replace(/"/g,'&quot;')}"/><button type="button" aria-label="삭제">×</button></div>`).join('');}
  async function loadLibraryObject(id){const o=state.library.find(x=>x.id===id);if(!o)return;setupObject(o.w,o.h);await drawDataURL(state.objectCanvas,o.image,true);$('#objectName').value=o.name;render();}
  function placeObject(){if(!hasPixels(state.objectCanvas))return toast('먼저 오브젝트를 그리거나 불러와 주세요.');const img=new Image();img.onload=()=>{state.stamp=img;setWorkspace('map');state.activeLayer='object';syncActiveLayer();setTool('stamp');toast('맵에서 놓을 위치를 눌러 주세요.');};img.src=state.objectCanvas.toDataURL('image/png');}
  function hasPixels(c){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i])return true;return false;}
  function setAIKind(kind){
    state.aiKind=kind;
    $$('[data-ai-kind]').forEach(b=>b.classList.toggle('active',b.dataset.aiKind===kind));
    const object=kind==='object';
    $('#aiScene').closest('label').classList.toggle('hidden',object);
    $('#aiGenerateButton').innerHTML=object?'<span>✦</span> 오브젝트 생성':'<span>✦</span> 분리 맵 생성';
    $('#aiPrompt').placeholder=object?'예: 벚꽃이 핀 큰 나무, 아래에 작은 화단이 있는 오브젝트':'예: 중앙에 3층 학교 건물, 오른쪽에는 생태 연못, 왼쪽에는 숲길이 있고 길이 모두 연결된 학교 맵';
    $('#promptExamples').innerHTML=(object?['벚꽃이 핀 큰 나무','과학실 실험대와 현미경','생태 연못 안내판']:['운동장과 생태 연못이 있는 학교','숲속 탐사 기지가 있는 생태공원','과학실과 온실이 연결된 연구소']).map(v=>`<button type="button">${v}</button>`).join('');
    const direction=$('#aiDirection');
    const previous=direction.value;
    $('#aiDirectionLabel').firstChild.textContent=object?'오브젝트 방향 ':'맵 방향 ';
    direction.innerHTML=(object?[
      ['auto','자동 선택'],['front','정면'],['front-left','왼쪽 앞면'],['front-right','오른쪽 앞면'],['left','왼쪽 측면'],['right','오른쪽 측면'],['back','뒷면']
    ]:[
      ['auto','자동 구성'],['south','정문이 아래쪽'],['southwest','정문이 왼쪽 아래'],['southeast','정문이 오른쪽 아래']
    ]).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
    if([...direction.options].some(option=>option.value===previous))direction.value=previous;
  }
  async function checkAIStatus(){const box=$('#aiStatus');box.className='ai-status';box.innerHTML='<i></i><span>AI 서버 연결을 확인하고 있습니다.</span>';try{const res=await fetch('/api/zep/generate',{headers:{Accept:'application/json'}}),data=await res.json();if(data.ready){box.classList.add('ready');box.innerHTML=`<i></i><span>AI 생성 준비 완료${data.protected?' · 관리자 코드 필요':''}</span>`;}else{box.classList.add('error');box.innerHTML='<i></i><span>Cloudflare Workers AI 바인딩 연결이 필요합니다.</span>';}}catch{box.classList.add('error');box.innerHTML='<i></i><span>AI 서버 상태를 확인하지 못했습니다.</span>';}}
  function todayAICount(){try{const key=`zep-ai-${new Date().toISOString().slice(0,10)}`;return{key,count:+localStorage.getItem(key)||0};}catch{return{key:'',count:0};}}
  function planNumber(value,min,max,fallback){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;}
  function planColor(value,fallback){return /^#[0-9a-f]{6}$/i.test(String(value||''))?value:fallback;}
  let atlasPromise;
  function loadCampusAtlas(){
    if(!atlasPromise)atlasPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('ZEP 전용 타일셋을 불러오지 못했습니다.'));image.src='assets/zep-campus-atlas-v2.png';});
    return atlasPromise;
  }
  function atlasCell(atlas,column,row){const cell=makeLayer(Math.floor(atlas.naturalWidth/4),Math.floor(atlas.naturalHeight/4)),context=cell.getContext('2d'),sw=atlas.naturalWidth/4,sh=atlas.naturalHeight/4;context.drawImage(atlas,column*sw,row*sh,sw,sh,0,0,cell.width,cell.height);return cell;}
  let labAtlasPromise;
  function loadLabAtlas(){
    if(!labAtlasPromise)labAtlasPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('연구실 전용 타일셋을 불러오지 못했습니다.'));image.src='assets/zep-lab-atlas-v2.png';});
    return labAtlasPromise;
  }
  function finishLayerCanvases(canvases){const composite=makeLayer(canvases.floor.width,canvases.floor.height),context=composite.getContext('2d');context.drawImage(canvases.floor,0,0);context.drawImage(canvases.object,0,0);context.drawImage(canvases.top,0,0);const urls={composite:composite.toDataURL('image/png')};Object.entries(canvases).forEach(([key,value])=>urls[key]=value.toDataURL('image/png'));return urls;}
  async function createIndoorLayeredMap(plan){
    const atlas=await loadLabAtlas(),sprites=Array.from({length:4},(_,row)=>Array.from({length:4},(_,column)=>atlasCell(atlas,column,row))),width=640,height=480,canvases={floor:makeLayer(width,height),object:makeLayer(width,height),top:makeLayer(width,height),collision:makeLayer(width,height)};
    const floor=canvases.floor.getContext('2d'),objects=canvases.object.getContext('2d'),top=canvases.top.getContext('2d'),collision=canvases.collision.getContext('2d');[floor,objects,top,collision].forEach(context=>{context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';});
    floor.fillStyle='#d8dcdd';floor.fillRect(0,0,width,height);floor.strokeStyle='rgba(71,91,101,.16)';floor.lineWidth=1;for(let y=-160;y<height+160;y+=32){floor.beginPath();floor.moveTo(0,y);floor.lineTo(width,y+width/2);floor.stroke();floor.beginPath();floor.moveTo(0,y);floor.lineTo(width,y-width/2);floor.stroke();}
    top.fillStyle='#25323b';top.fillRect(0,0,width,18);top.fillRect(0,height-15,width,15);top.fillRect(0,0,15,height);top.fillRect(width-15,0,15,height);for(let x=18;x<width-18;x+=154)top.drawImage(sprites[0][2],x,-12,150,105);
    const defaultSets={laboratory:[['lab-bench',18,30,9],['sink-bench',48,30,9],['growth-chamber',76,27,8],['specimen-cabinet',88,52,8],['student-table',25,68,9],['student-table',55,68,9],['dna-machine',78,72,8],['safety-station',92,78,7]],classroom:[['teacher-desk',50,22,9],['student-table',22,48,8],['student-table',48,48,8],['student-table',74,48,8],['student-table',22,72,8],['student-table',48,72,8],['student-table',74,72,8],['bookshelf',88,27,8]],library:[['bookshelf',14,25,8],['bookshelf',14,52,8],['bookshelf',86,25,8],['bookshelf',86,52,8],['student-table',36,48,8],['student-table',64,48,8],['student-table',36,72,8],['student-table',64,72,8]]};const defaults=defaultSets[plan.spaceType]||defaultSets.laboratory;
    const items=(plan.objects?.length?plan.objects:defaults.map(([type,x,y,size])=>({type,x,y,size}))).slice(0,16),mapping={'lab-bench':[0,1],'sink-bench':[1,1],'growth-chamber':[2,1],'specimen-cabinet':[3,1],'dna-machine':[0,2],incubator:[1,2],'chemical-cabinet':[2,2],bookshelf:[3,2],'teacher-desk':[0,3],'student-table':[1,3],plant:[2,3],'safety-station':[3,3]};
    items.forEach(item=>{const cell=mapping[String(item.type||'student-table')]||mapping['student-table'],sprite=sprites[cell[1]][cell[0]],x=planNumber(item.x,7,93,50)*width/100,y=planNumber(item.y,15,90,55)*height/100,base=planNumber(item.size,4,14,8),w=Math.max(52,base*9),h=w;objects.drawImage(sprite,x-w/2,y-h*.58,w,h);collision.fillStyle='rgba(255,53,93,.7)';collision.fillRect(x-w*.32,y+h*.1,w*.64,h*.16);});
    return finishLayerCanvases(canvases);
  }
  async function createLayeredMap(plan){
    if(String(plan.environment||'').toLowerCase()==='indoor')return createIndoorLayeredMap(plan);
    const atlas=await loadCampusAtlas(),sprites=Array.from({length:4},(_,row)=>Array.from({length:4},(_,column)=>atlasCell(atlas,column,row)));
    const width=640,height=480,canvases={floor:makeLayer(width,height),object:makeLayer(width,height),top:makeLayer(width,height),collision:makeLayer(width,height)},p=plan.palette||{};
    const colors={ground:planColor(p.ground,'#79ad58'),path:planColor(p.path,'#d7bd7b'),water:planColor(p.water,'#58a9c7'),roof:planColor(p.roof,'#b9564d'),wall:planColor(p.wall,'#e5c78f'),tree:planColor(p.tree,'#397a46'),accent:planColor(p.accent,'#f1d36b')};
    const floor=canvases.floor.getContext('2d'),objects=canvases.object.getContext('2d'),top=canvases.top.getContext('2d'),collision=canvases.collision.getContext('2d');
    [floor,objects,top,collision].forEach(context=>{context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';});
    floor.fillStyle=colors.ground;floor.fillRect(0,0,width,height);for(let y=0;y<height;y+=156)for(let x=0;x<width;x+=156)floor.drawImage(sprites[3][0],x,y,158,158);
    const px=v=>planNumber(v,0,100,50)*width/100,py=v=>planNumber(v,0,100,50)*height/100;
    (plan.waters||[]).slice(0,3).forEach(item=>{const x=px(item.x),y=py(item.y),w=px(planNumber(item.w,3,35,16)),h=py(planNumber(item.h,3,35,12));floor.drawImage(sprites[3][2],x,y,w,h);collision.fillStyle='rgba(255,53,93,.72)';collision.beginPath();collision.ellipse(x+w/2,y+h/2,w*.38,h*.38,0,0,Math.PI*2);collision.fill();});
    floor.lineCap='round';(plan.paths||[]).slice(0,8).forEach(path=>{const lineWidth=Math.max(18,px(planNumber(path.width,2,15,6)));floor.strokeStyle=colors.path;floor.lineWidth=lineWidth;floor.beginPath();floor.moveTo(px(path.x1),py(path.y1));floor.lineTo(px(path.x2),py(path.y2));floor.stroke();const pattern=floor.createPattern(sprites[3][1],'repeat');if(pattern){floor.strokeStyle=pattern;floor.lineWidth=Math.max(10,lineWidth-7);floor.stroke();}});
    (plan.trees||[]).slice(0,18).forEach((tree,index)=>{const x=px(tree.x),y=py(tree.y),s=Math.max(48,px(planNumber(tree.size,2,12,5))*2.5),sprite=sprites[1][index%3];objects.drawImage(sprite,x-s/2,y-s*.68,s,s);collision.fillStyle='rgba(255,53,93,.72)';collision.beginPath();collision.ellipse(x,y+s*.18,s*.16,s*.1,0,0,Math.PI*2);collision.fill();});
    const objectCells={bench:[0,2],sign:[1,2],lamp:[2,2],rock:[3,2],bush:[3,1],flower:[3,3]};(plan.objects||[]).slice(0,14).forEach(item=>{const x=px(item.x),y=py(item.y),s=Math.max(34,px(planNumber(item.size,1,8,3))*2.2),cell=objectCells[String(item.type||'bush')]||objectCells.bush,sprite=sprites[cell[1]][cell[0]];objects.drawImage(sprite,x-s/2,y-s*.55,s,s);collision.fillStyle='rgba(255,53,93,.68)';collision.beginPath();collision.ellipse(x,y+s*.18,s*.2,s*.1,0,0,Math.PI*2);collision.fill();});
    (plan.buildings||[]).slice(0,6).forEach((building,index)=>{const x=px(building.x),y=py(building.y),w=px(planNumber(building.w,8,42,22)),h=py(planNumber(building.h,8,35,18))*1.5,style=String(building.style||'').toLowerCase();let column=index%4;if(/lab|science|연구|과학/.test(style))column=1;else if(/green|온실/.test(style))column=2;else if(/gym|체육/.test(style))column=3;else if(/school|학교/.test(style))column=0;top.drawImage(sprites[0][column],x,y,w,h);collision.fillStyle='rgba(255,53,93,.72)';collision.fillRect(x+w*.08,y+h*.72,w*.84,h*.2);});
    return finishLayerCanvases(canvases);
  }
  function showAILayer(key){if(!state.aiLayers)return;$('#aiResultImage').src=state.aiLayers[key]||state.aiLayers.composite;$$('[data-ai-layer]').forEach(button=>button.classList.toggle('active',button.dataset.aiLayer===key));}
  async function generateAI(){const prompt=$('#aiPrompt').value.trim();if(prompt.length<3)return toast('만들고 싶은 장면을 조금 더 자세히 적어 주세요.');const usage=todayAICount();if(usage.count>=20)return toast('이 브라우저의 오늘 생성 횟수 20회를 모두 사용했습니다.');const button=$('#aiGenerateButton'),loading=$('#aiLoading'),placeholder=$('#aiPlaceholder'),image=$('#aiResultImage');button.disabled=true;loading.hidden=false;placeholder.hidden=true;image.hidden=true;state.aiResult=null;state.aiLayers=null;$('#aiLayerTabs').hidden=true;$('#aiLayerDownloads').hidden=true;toggleAIResult(false);try{const res=await fetch('/api/zep/generate',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({kind:state.aiKind,prompt,scene:$('#aiScene').value,season:$('#aiSeason').value,view:$('#aiView').value,direction:$('#aiDirection').value,accessCode:$('#aiAccessCode').value})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.message||'결과를 만들지 못했습니다.');if(data.type==='layered-map'&&data.plan){state.aiLayers=await createLayeredMap(data.plan);state.aiResult=state.aiLayers.composite;$('#aiLayerTabs').hidden=false;$('#aiLayerDownloads').hidden=false;showAILayer('composite');}else if(data.image){state.aiResult=data.image;image.src=data.image;}else throw new Error('생성 결과가 비어 있습니다.');image.hidden=false;if(usage.key)localStorage.setItem(usage.key,String(usage.count+1));toggleAIResult(true);toast(state.aiLayers?'분리된 AI 맵이 완성되었습니다.':'AI 이미지가 완성되었습니다.');}catch(error){placeholder.hidden=false;placeholder.innerHTML=`<span>!</span><b>생성하지 못했습니다</b><small>${String(error.message||error)}</small>`;toast(String(error.message||error));}finally{loading.hidden=true;button.disabled=false;}}
  function toggleAIResult(enabled){$('#applyAIMapButton').disabled=!enabled||!state.aiLayers;$('#applyAIObjectButton').disabled=!enabled||Boolean(state.aiLayers);$('#downloadAIButton').disabled=!enabled;$('#deleteAIResultButton').disabled=!enabled;}
  function deleteAIResult(){
    if(!state.aiResult)return;
    state.aiResult=null;state.aiLayers=null;
    const image=$('#aiResultImage'),placeholder=$('#aiPlaceholder');
    image.removeAttribute('src');
    image.hidden=true;
    placeholder.innerHTML='<span>✦</span><b>생성된 결과가 여기에 나타납니다</b><small>맵은 바닥·오브젝트·윗배경으로 나뉘어 생성됩니다.</small>';
    placeholder.hidden=false;
    $('#aiLayerTabs').hidden=true;$('#aiLayerDownloads').hidden=true;
    toggleAIResult(false);
    toast('생성 결과를 삭제했습니다.');
  }
  async function applyAIMap(){if(!state.aiLayers)return;setWorkspace('map');pushHistory();for(const key of ['floor','object','top','collision'])await drawDataURL(state.layers[key],state.aiLayers[key],true);state.activeLayer='floor';state.hasContent=true;syncActiveLayer();changed();$('#aiDialog').close();toast('바닥·오브젝트·윗배경·충돌 레이어를 각각 가져왔습니다.');}
  async function applyAIObject(){if(!state.aiResult)return;const img=await imageFromURL(state.aiResult),temp=makeLayer(512,512),tc=temp.getContext('2d');tc.drawImage(img,0,0,512,512);removeConnectedBackground(temp);const cropped=cropTransparent(temp,12);setupObject(cropped.width,cropped.height);state.objectCanvas.getContext('2d').drawImage(cropped,0,0);$('#objectName').value=$('#aiPrompt').value.trim().slice(0,40)||'AI 오브젝트';setWorkspace('object');changed();$('#aiDialog').close();toast('배경을 제거해 오브젝트 공방으로 가져왔습니다.');}
  function removeConnectedBackground(c){const x=c.getContext('2d',{willReadFrequently:true}),img=x.getImageData(0,0,c.width,c.height),d=img.data,w=c.width,h=c.height,corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]].map(([cx,cy])=>{const p=(cy*w+cx)*4;return[d[p],d[p+1],d[p+2]];}),seen=new Uint8Array(w*h),queue=[];for(let px=0;px<w;px++){queue.push(px,0,px,h-1);}for(let py=1;py<h-1;py++){queue.push(0,py,w-1,py);}let head=0;while(head<queue.length){const px=queue[head++],py=queue[head++],i=py*w+px;if(px<0||py<0||px>=w||py>=h||seen[i])continue;seen[i]=1;const p=i*4,rgb=[d[p],d[p+1],d[p+2],d[p+3]],distance=Math.min(...corners.map(v=>Math.max(Math.abs(rgb[0]-v[0]),Math.abs(rgb[1]-v[1]),Math.abs(rgb[2]-v[2]))));if(distance>82)continue;d[p+3]=0;queue.push(px+1,py,px-1,py,px,py+1,px,py-1);}x.putImageData(img,0,0);}
  function cropTransparent(source,padding=8){const x=source.getContext('2d',{willReadFrequently:true}),d=x.getImageData(0,0,source.width,source.height).data;let minX=source.width,minY=source.height,maxX=-1,maxY=-1;for(let y=0;y<source.height;y++)for(let px=0;px<source.width;px++)if(d[(y*source.width+px)*4+3]>12){minX=Math.min(minX,px);minY=Math.min(minY,y);maxX=Math.max(maxX,px);maxY=Math.max(maxY,y);}if(maxX<0)return makeLayer(96,96);minX=Math.max(0,minX-padding);minY=Math.max(0,minY-padding);maxX=Math.min(source.width-1,maxX+padding);maxY=Math.min(source.height-1,maxY+padding);const rawW=maxX-minX+1,rawH=maxY-minY+1,scale=Math.min(1,256/Math.max(rawW,rawH)),w=Math.max(8,Math.ceil(rawW*scale/8)*8),h=Math.max(8,Math.ceil(rawH*scale/8)*8),out=makeLayer(w,h);out.getContext('2d').drawImage(source,minX,minY,rawW,rawH,0,0,w,h);return out;}
  function downloadAI(){if(!state.aiResult)return;fetch(state.aiResult).then(r=>r.blob()).then(blob=>downloadBlob(blob,`${safeName($('#aiPrompt').value||'zep-ai-image')}.${state.aiLayers?'png':'jpg'}`));}
  function downloadAILayer(key){if(!state.aiLayers?.[key])return;fetch(state.aiLayers[key]).then(r=>r.blob()).then(blob=>downloadBlob(blob,`${safeName($('#aiPrompt').value||'zep-ai-map')}-${key}.png`));}
  let toastTimer;function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}

  function bind() {
    $$('.workspace-tab').forEach(b=>b.addEventListener('click',()=>setWorkspace(b.dataset.workspace)));
    $('#layerList').addEventListener('click',e=>{const row=e.target.closest('.layer');if(!row)return;if(e.target.closest('.visibility')){row.dataset.visible=row.dataset.visible==='false'?'true':'false';e.target.classList.toggle('off',row.dataset.visible==='false');render();return;}state.activeLayer=row.dataset.layer;clearSelection();syncActiveLayer();});
    $('#toolGrid').addEventListener('click',e=>{const b=e.target.closest('.tool');if(b)setTool(b.dataset.tool);});
    canvas.addEventListener('pointerdown',beginDraw);canvas.addEventListener('pointermove',moveDraw);canvas.addEventListener('pointerup',endDraw);canvas.addEventListener('pointercancel',endDraw);
    $('#brushSize').addEventListener('input',e=>{state.size=+e.target.value;$('#brushSizeValue').textContent=`${state.size} px`;});
    $('#tolerance').addEventListener('input',e=>{state.tolerance=+e.target.value;$('#toleranceValue').textContent=state.tolerance;});
    $('#colorInput').addEventListener('input',e=>setColor(e.target.value));$('#colorText').addEventListener('change',e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value))setColor(e.target.value);else e.target.value=state.color.toUpperCase();});
    $('#palette').addEventListener('click',e=>{if(e.target.dataset.color)setColor(e.target.dataset.color);});
    $('#resizeMapButton').addEventListener('click',()=>{const w=Math.max(64,Math.min(4096,+$('#mapWidth').value||640)),h=Math.max(64,Math.min(4096,+$('#mapHeight').value||480));if(confirm('기존 그림을 유지하면서 캔버스 크기를 바꿀까요?')){pushHistory();setupLayers(w,h,true);changed();}});
    $('#newMapButton').addEventListener('click',trashMap);$('#trashMapButton').addEventListener('click',trashMap);
    $('#resizeObjectButton').addEventListener('click',()=>{const w=Math.max(8,Math.min(1024,+$('#objectWidth').value||96)),h=Math.max(8,Math.min(1024,+$('#objectHeight').value||96));setupObject(w,h,true);changed();});
    $('#clearObjectButton').addEventListener('click',()=>{if(confirm('오브젝트 캔버스를 비울까요?')){pushHistory();currentContext().clearRect(0,0,state.objectWidth,state.objectHeight);changed();}});
    $('#mapImageInput').addEventListener('change',e=>{loadImageFile(e.target.files[0],state.layers[state.activeLayer]);e.target.value='';});
    $('#objectImageInput').addEventListener('change',e=>{loadImageFile(e.target.files[0],state.objectCanvas);e.target.value='';});
    $('#quickUploadButton').addEventListener('click',()=>$('#mapImageInput').click());
    $$('[data-selection-target]').forEach(b=>b.addEventListener('click',()=>transferSelection(b.dataset.selectionTarget)));$('#clearSelectionButton').addEventListener('click',clearSelection);$('#growSelectionButton').addEventListener('click',growSelection);$('#startSplitButton').addEventListener('click',startLayerSplit);$('#finishSplitButton').addEventListener('click',finishLayerSplit);
    $('#gridToggle').addEventListener('change',e=>{state.grid=e.target.checked;render();});$('#tileSize').addEventListener('change',e=>{state.tileSize=+e.target.value;render();scheduleSave();});
    $('#zoomInButton').addEventListener('click',()=>{state.zoom=Math.min(4,state.zoom+.25);render();});$('#zoomOutButton').addEventListener('click',()=>{state.zoom=Math.max(.25,state.zoom-.25);render();});$('#fitButton').addEventListener('click',()=>{state.zoom=1;render();});
    $('#undoButton').addEventListener('click',undo);$('#redoButton').addEventListener('click',redo);
    $$('.export-item').forEach(b=>b.addEventListener('click',()=>exportLayer(b.dataset.export)));$('#exportAllButton').addEventListener('click',()=>{['floor','object','top','collision'].forEach((k,i)=>setTimeout(()=>exportLayer(k),i*280));setTimeout(exportCollisionJSON,1200);});
    $('#exportProjectButton').addEventListener('click',exportProject);$('#importProjectButton').addEventListener('click',()=>$('#projectInput').click());$('#projectInput').addEventListener('change',e=>{if(e.target.files[0])importProject(e.target.files[0]);e.target.value='';});$('#clearAutosaveButton').addEventListener('click',clearAutosave);
    $('#placeObjectButton').addEventListener('click',placeObject);$('#downloadObjectButton').addEventListener('click',()=>downloadCanvas(state.objectCanvas,`${safeName($('#objectName').value)}.png`));$('#saveObjectLibraryButton').addEventListener('click',saveObjectLibrary);
    $('#objectLibrary').addEventListener('click',e=>{const item=e.target.closest('.library-item');if(!item)return;const id=+item.dataset.id;if(e.target.closest('button')){state.library=state.library.filter(o=>o.id!==id);localStorage.setItem('zep-object-library',JSON.stringify(state.library));renderLibrary();}else loadLibraryObject(id);});
    $('#helpButton').addEventListener('click',()=>$('#helpDialog').showModal());$('#aiButton').addEventListener('click',()=>{$('#aiDialog').showModal();checkAIStatus();});$('#aiCloseButton').addEventListener('click',()=>$('#aiDialog').close());$$('[data-ai-kind]').forEach(b=>b.addEventListener('click',()=>setAIKind(b.dataset.aiKind)));$('#promptExamples').addEventListener('click',e=>{if(e.target.closest('button'))$('#aiPrompt').value=e.target.textContent;});$('#aiView').addEventListener('change',e=>localStorage.setItem('zep-ai-view',e.target.value));$('#aiLayerTabs').addEventListener('click',e=>{const button=e.target.closest('[data-ai-layer]');if(button)showAILayer(button.dataset.aiLayer);});$('#aiLayerDownloads').addEventListener('click',e=>{const button=e.target.closest('[data-download-ai-layer]');if(button)downloadAILayer(button.dataset.downloadAiLayer);});$('#aiGenerateButton').addEventListener('click',generateAI);$('#applyAIMapButton').addEventListener('click',applyAIMap);$('#applyAIObjectButton').addEventListener('click',applyAIObject);$('#downloadAIButton').addEventListener('click',downloadAI);$('#deleteAIResultButton').addEventListener('click',deleteAIResult);$('#projectName').addEventListener('input',scheduleSave);
    window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}const keys={b:'brush',e:'eraser',l:'line',r:'rect',o:'ellipse',f:'fill',i:'picker',w:'wand'};if(keys[e.key.toLowerCase()])setTool(keys[e.key.toLowerCase()]);if(e.key==='['){state.size=Math.max(1,state.size-1);$('#brushSize').value=state.size;$('#brushSizeValue').textContent=`${state.size} px`;}if(e.key===']'){state.size=Math.min(96,state.size+1);$('#brushSize').value=state.size;$('#brushSizeValue').textContent=`${state.size} px`;}});
  }
  async function init(){setupLayers(640,480);setupObject(96,96);buildLayers();$('#palette').innerHTML=palette.map(c=>`<button type="button" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');setColor(state.color);try{state.library=JSON.parse(localStorage.getItem('zep-object-library')||'[]');}catch{state.library=[];}const savedView=localStorage.getItem('zep-ai-view');if([...$('#aiView').options].some(option=>option.value===savedView))$('#aiView').value=savedView;renderLibrary();bind();syncActiveLayer();setAIKind(state.aiKind);if(new URLSearchParams(location.search).get('ai')==='1'){$('#aiDialog').showModal();checkAIStatus();}await loadAutosave();render();}
  init();
})();
