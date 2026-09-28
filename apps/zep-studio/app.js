(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const ROOM_GRID_SIZE = 12;
  const canvas = $('#editorCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const preview = $('#previewCanvas');
  const pctx = preview.getContext('2d');
  const layerMeta = {
    floor: { name: '바닥', sub: '바닥·캐릭터 뒤쪽 벽', icon: 'F' },
    object: { name: '오브젝트', sub: '가구·장식', icon: 'O' },
    top: { name: '윗배경', sub: '중간 벽·가림 구조', icon: 'T' },
    collision: { name: '충돌 영역', sub: '통과 금지', icon: '!' }
  };
  const state = {
    workspace: 'map', activeLayer: 'floor', tool: 'brush', color: '#5c8f4f', size: 8,
    tolerance: 24, zoom: 1, grid: true, tileSize: 32, drawing: false, start: null,
    beforeStroke: null, selection: null, selectionSource: 'floor', stamp: null,
    mapWidth: 640, mapHeight: 480, objectWidth: 96, objectHeight: 96,
    layers: {}, objectCanvas: document.createElement('canvas'), history: [], redoHistory: [],
    library: [], hasContent: false, saveTimer: null, aiKind: 'map', aiResult: null, aiResultKind: null, aiLayers: null, splitMode: false, soloLayer: null,
    roomPlan: [], roomPlanMode: 'draw', roomPlanStart: null, roomPlanPreview: null
  };
  const palette = ['#1b1d2e','#ffffff','#5c8f4f','#8fcf68','#426a8a','#65b7c9','#8c654a','#d6b06f','#f1d36b','#db6a6a','#8b7cff','#493f67'];
  const materialImages = { floor: null, wall: null, window: null, door: null, zepBlueWall: null, zepWhiteWall: null };

  function loadMaterialImage(src){return new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=src;});}
  function createZepWallpaperTexture(kind){const texture=document.createElement('canvas');texture.width=480;texture.height=240;const x=texture.getContext('2d');x.fillStyle=kind==='blue'?'#e8eef2':'#f8f7f2';x.fillRect(0,0,texture.width,texture.height);if(kind==='blue'){x.strokeStyle='rgba(102,126,148,.46)';x.lineWidth=1.15;for(let offset=-240;offset<720;offset+=72){x.beginPath();x.moveTo(offset,0);x.lineTo(offset+240,240);x.stroke();x.beginPath();x.moveTo(offset,0);x.lineTo(offset-240,240);x.stroke();}x.fillStyle='rgba(83,111,138,.65)';for(let y=0;y<=240;y+=72)for(let col=-1;col<=8;col++){const px=col*72+(y/72%2?36:0);x.beginPath();x.arc(px,y,1.6,0,Math.PI*2);x.fill();}}else{x.fillStyle='rgba(117,139,156,.58)';for(let y=30;y<240;y+=60)for(let col=0;col<8;col++){const px=26+col*72+(y/60%2?34:0);x.save();x.translate(px,y);x.lineWidth=1.7;x.strokeStyle='rgba(117,139,156,.62)';x.beginPath();x.arc(0,0,5,Math.PI*1.12,Math.PI*1.88);x.stroke();x.beginPath();x.arc(-4,1,2.5,Math.PI*1.05,Math.PI*1.75);x.stroke();x.beginPath();x.arc(4,1,2.5,Math.PI*1.25,Math.PI*1.95);x.stroke();x.restore();}}return texture;}
  async function loadMaterialAssets(){[materialImages.floor,materialImages.wall,materialImages.window,materialImages.door]=await Promise.all([loadMaterialImage('assets/materials/lab-floor-hq.png'),loadMaterialImage('assets/materials/lab-wall-hq.png'),loadMaterialImage('assets/materials/lab-window-hq.png'),loadMaterialImage('assets/materials/lab-door-hq.png')]);materialImages.zepBlueWall=createZepWallpaperTexture('blue');materialImages.zepWhiteWall=createZepWallpaperTexture('white');}

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
  const roomPresets={
    laboratory:{wall:'#eaf2f6',trim:'#596675',floor:'#bfc6c9',grid:'#e9eef0',pattern:'large',wallMaterial:'zep-blue-wallpaper',floorMaterial:'zep-gray-tile',windows:'2',door:'right'},
    classroom:{wall:'#f7f4ec',trim:'#6f765f',floor:'#d8c79c',grid:'#a69062',pattern:'medium',wallMaterial:'zep-white-wallpaper',floorMaterial:'light-tile',windows:'4',door:'right'},
    library:{wall:'#eee2cc',trim:'#745841',floor:'#bd966f',grid:'#80654e',pattern:'large',wallMaterial:'wood',floorMaterial:'wood',windows:'2',door:'left'}
  };
  function applyRoomPreset(name){const preset=roomPresets[name];if(!preset)return;$('#roomWallColor').value=preset.wall;$('#roomTrimColor').value=preset.trim;$('#roomFloorColor').value=preset.floor;$('#roomGridColor').value=preset.grid;$('#roomTilePattern').value=preset.pattern;$('#roomWallMaterial').value=preset.wallMaterial;$('#roomFloorMaterial').value=preset.floorMaterial;$('#roomWindowCount').value=preset.windows;$('#roomDoorSide').value=preset.door;}
  function pointBetween(a,b,t){return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
  function drawPolygon(context,points,fill,stroke,lineWidth=2){context.beginPath();context.moveTo(points[0].x,points[0].y);points.slice(1).forEach(point=>context.lineTo(point.x,point.y));context.closePath();if(fill){context.fillStyle=fill;context.fill();}if(stroke){context.strokeStyle=stroke;context.lineWidth=lineWidth;context.stroke();}}
  function shadeColor(hex,amount){const value=parseInt(hex.slice(1),16),channel=shift=>Math.max(0,Math.min(255,((value>>shift)&255)+amount));return`#${[channel(16),channel(8),channel(0)].map(v=>v.toString(16).padStart(2,'0')).join('')}`;}
  function wallPoint(wall,u,v){return pointBetween(pointBetween(wall.bottomStart,wall.bottomEnd,u),pointBetween(wall.topStart,wall.topEnd,u),v);}
  function wallPanelPoints(wall,u1,u2,v1,v2){return[wallPoint(wall,u1,v1),wallPoint(wall,u2,v1),wallPoint(wall,u2,v2),wallPoint(wall,u1,v2)];}
  function offsetPoints(points,offset){return points.map(point=>({x:point.x+offset.x,y:point.y+offset.y}));}
  function wallProjection(wall,depth=7){const risesRight=wall.bottomEnd.y<wall.bottomStart.y;return{x:risesRight?depth:-depth,y:Math.round(depth*.72)};}
  function drawExtrudedPanel(context,points,offset,front,stroke){const face=offsetPoints(points,offset),top=[points[3],points[2],face[2],face[3]],side=[points[1],points[2],face[2],face[1]],bottom=[points[0],points[1],face[1],face[0]],other=[points[0],points[3],face[3],face[0]];drawPolygon(context,top,'#93a2aa','#26323b',2);drawPolygon(context,other,'#64747e','#26323b',2);drawPolygon(context,side,'#36444e','#26323b',2);drawPolygon(context,bottom,'#2a3740','#26323b',2);drawPolygon(context,face,front,stroke,3);return face;}
  function drawWallPanel(context,wall,u1,u2,v1,v2,fill,stroke){drawPolygon(context,wallPanelPoints(wall,u1,u2,v1,v2),fill,stroke,3);}
  function drawWallSprite(context,wall,u1,u2,v1,v2,image){drawParallelogramTexture(context,image,wallPoint(wall,u1,v2),wallPoint(wall,u2,v2),wallPoint(wall,u1,v1));}
  function drawWindow(context,wall,center,width,trim,material){
    const u1=center-width/2,u2=center+width/2;
    if(material==='lab-panel'&&materialImages.window){context.save();context.shadowColor='rgba(10,25,34,.34)';context.shadowBlur=7;context.shadowOffsetY=4;drawWallPanel(context,wall,u1-.012,u2+.012,.19,.77,'rgba(42,75,90,.2)',null);context.restore();drawWallSprite(context,wall,u1-.02,u2+.02,.17,.79,materialImages.window);return;}
    const projection=wallProjection(wall,9),project=point=>({x:point.x+projection.x,y:point.y+projection.y}),panel=(a,b,c,d,fill,stroke,lineWidth=3)=>drawPolygon(context,offsetPoints(wallPanelPoints(wall,a,b,c,d),projection),fill,stroke,lineWidth);
    context.save();context.shadowColor='rgba(8,15,20,.58)';context.shadowBlur=10;context.shadowOffsetX=projection.x*.8;context.shadowOffsetY=projection.y+4;drawPolygon(context,wallPanelPoints(wall,u1-.024,u2+.024,.18,.78),'#182129',null);context.restore();
    drawExtrudedPanel(context,wallPanelPoints(wall,u1-.024,u2+.024,.18,.78),projection,'#465661','#202a31');
    panel(u1-.015,u2+.015,.205,.755,'#72818a','#dce5e8');
    panel(u1,u2,.235,.72,'#d8e0e2','#f5fafb');
    panel(u1+.018,u2-.018,.27,.685,'#31434e','#273640');
    const glassTop=wallPoint(wall,u1,.66),glassBottom=wallPoint(wall,u1,.29),glass=context.createLinearGradient(0,glassTop.y,0,glassBottom.y);glass.addColorStop(0,'#9bd9e5');glass.addColorStop(.48,'#75bdd0');glass.addColorStop(1,'#b9e5eb');
    panel(u1+.03,u2-.03,.29,.665,glass,'#d9f3f5');panel(u1+.006,u1+.026,.245,.71,'rgba(255,255,255,.68)',null);panel(u2-.026,u2-.006,.245,.71,'rgba(45,60,68,.23)',null);
    const mid=(u1+u2)/2,mullionA=project(wallPoint(wall,mid,.285)),mullionB=project(wallPoint(wall,mid,.67)),shineA=project(wallPoint(wall,u1+.052,.61)),shineB=project(wallPoint(wall,u2-.05,.43)),sillA=project(wallPoint(wall,u1-.032,.19)),sillB=project(wallPoint(wall,u2+.032,.19)),sillHiA=project(wallPoint(wall,u1-.025,.215)),sillHiB=project(wallPoint(wall,u2+.025,.215));
    context.strokeStyle='#40515c';context.lineWidth=4;context.beginPath();context.moveTo(mullionA.x,mullionA.y);context.lineTo(mullionB.x,mullionB.y);context.stroke();context.strokeStyle='rgba(255,255,255,.68)';context.lineWidth=3;context.beginPath();context.moveTo(shineA.x,shineA.y);context.lineTo(shineB.x,shineB.y);context.stroke();context.strokeStyle='#2e3b44';context.lineWidth=12;context.lineCap='round';context.beginPath();context.moveTo(sillA.x,sillA.y);context.lineTo(sillB.x,sillB.y);context.stroke();context.strokeStyle='#afbdc2';context.lineWidth=5;context.beginPath();context.moveTo(sillHiA.x,sillHiA.y);context.lineTo(sillHiB.x,sillHiB.y);context.stroke();
  }
  function drawDoor(context,wall,center,trim,material){
    const isZep=material&&material.startsWith('zep-'),width=isZep?0.16:0.19,u1=center-width/2,u2=center+width/2;
    if(material==='lab-panel'&&materialImages.door){context.save();context.shadowColor='rgba(10,20,28,.34)';context.shadowBlur=8;context.shadowOffsetY=4;drawWallPanel(context,wall,u1-.012,u2+.012,0,.83,'rgba(36,61,73,.2)',null);context.restore();drawWallSprite(context,wall,u1-.028,u2+.028,-.015,.84,materialImages.door);return;}
    const projection=wallProjection(wall,10),project=point=>({x:point.x+projection.x,y:point.y+projection.y}),panel=(a,b,c,d,fill,stroke,lineWidth=3)=>drawPolygon(context,offsetPoints(wallPanelPoints(wall,a,b,c,d),projection),fill,stroke,lineWidth);
    context.save();context.shadowColor='rgba(7,13,18,.6)';context.shadowBlur=11;context.shadowOffsetX=projection.x*.85;context.shadowOffsetY=projection.y+4;drawPolygon(context,wallPanelPoints(wall,u1-.028,u2+.028,-.012,.84),'#172027',null);context.restore();
    drawExtrudedPanel(context,wallPanelPoints(wall,u1-.028,u2+.028,-.012,.84),projection,'#46545e','#202930');
    panel(u1-.018,u2+.018,0,.815,'#71808a','#d5dfe2');panel(u1,u2,.018,.775,'#96a5ad','#e8eff1');panel(u1+.018,u2-.018,.04,.75,'#82939d',null);
    panel(u1+.028,u1+.047,.055,.74,'rgba(255,255,255,.34)',null);panel(u2-.047,u2-.028,.055,.74,'rgba(32,47,57,.25)',null);
    panel(u1+.043,u2-.043,.5,.685,'#31424c','#24313a');panel(u1+.052,u2-.052,.525,.665,'#9bd7e2','#dff7f8');
    const thresholdA=project(wallPoint(wall,u1-.023,.018)),thresholdB=project(wallPoint(wall,u2+.023,.018));context.strokeStyle='#26323b';context.lineWidth=10;context.lineCap='round';context.beginPath();context.moveTo(thresholdA.x,thresholdA.y);context.lineTo(thresholdB.x,thresholdB.y);context.stroke();context.strokeStyle='#b4c1c6';context.lineWidth=4;context.beginPath();context.moveTo(thresholdA.x,thresholdA.y-2);context.lineTo(thresholdB.x,thresholdB.y-2);context.stroke();
    const knobShadow=project(wallPoint(wall,u2-.032,.29)),knob=project(wallPoint(wall,u2-.04,.315));context.fillStyle='rgba(20,25,28,.34)';context.beginPath();context.arc(knobShadow.x+3,knobShadow.y+3,5,0,Math.PI*2);context.fill();context.fillStyle='#f2cf67';context.strokeStyle='#735822';context.lineWidth=2;context.beginPath();context.arc(knob.x,knob.y,4.5,0,Math.PI*2);context.fill();context.stroke();context.fillStyle='rgba(255,255,255,.7)';context.beginPath();context.arc(knob.x-1.4,knob.y-1.5,1.2,0,Math.PI*2);context.fill();
  }
  function clipPolygon(context,points,callback){context.save();context.beginPath();context.moveTo(points[0].x,points[0].y);points.slice(1).forEach(point=>context.lineTo(point.x,point.y));context.closePath();context.clip();callback();context.restore();}
  function drawParallelogramTexture(context,image,topLeft,topRight,bottomLeft,options={}){if(!image)return;const imageWidth=image.naturalWidth||image.width,imageHeight=image.naturalHeight||image.height,displayWidth=Math.hypot(topRight.x-topLeft.x,topRight.y-topLeft.y),sourceWidth=imageWidth*Math.min(1,options.referenceWidth?displayWidth/options.referenceWidth:1),sourceHeight=imageHeight*(options.sourceHeightRatio||1);context.save();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.setTransform((topRight.x-topLeft.x)/sourceWidth,(topRight.y-topLeft.y)/sourceWidth,(bottomLeft.x-topLeft.x)/sourceHeight,(bottomLeft.y-topLeft.y)/sourceHeight,topLeft.x,topLeft.y);context.drawImage(image,0,0,sourceWidth,sourceHeight,0,0,sourceWidth,sourceHeight);context.restore();}
  function quadPoint(quad,u,v){return pointBetween(pointBetween(quad[0],quad[1],u),pointBetween(quad[3],quad[2],u),v);}
  function drawIsoFloorCells(context,quad,steps,base,material){
    const strength=material==='epoxy'?.055:.11;
    for(let row=0;row<steps;row++)for(let col=0;col<steps;col++){
      const u1=col/steps,u2=(col+1)/steps,v1=row/steps,v2=(row+1)/steps,cell=[quadPoint(quad,u1,v1),quadPoint(quad,u2,v1),quadPoint(quad,u2,v2),quadPoint(quad,u1,v2)],light=(row+col)%2===0;
      context.save();context.globalAlpha=strength;drawPolygon(context,cell,light?shadeColor(base,22):shadeColor(base,-14),null);context.restore();
      if(material!=='epoxy'){context.save();context.globalAlpha=material==='zep-gray-tile'?.32:.18;context.lineWidth=1;context.strokeStyle='#ffffff';context.beginPath();context.moveTo(cell[3].x,cell[3].y);context.lineTo(cell[0].x,cell[0].y);context.lineTo(cell[1].x,cell[1].y);context.stroke();context.strokeStyle=shadeColor(base,-34);context.globalAlpha=material==='zep-gray-tile'?.18:.1;context.beginPath();context.moveTo(cell[1].x,cell[1].y);context.lineTo(cell[2].x,cell[2].y);context.lineTo(cell[3].x,cell[3].y);context.stroke();context.restore();}
    }
  }
  function drawRoomPlatform(context,quad){context.save();context.shadowColor='rgba(8,13,20,.58)';context.shadowBlur=26;context.shadowOffsetX=0;context.shadowOffsetY=18;drawPolygon(context,quad,'rgba(25,34,42,.5)',null);context.restore();const depth=18,right=quad[1],front=quad[2],left=quad[3],rightFace=[right,front,{x:front.x,y:front.y+depth},{x:right.x,y:right.y+depth}],leftFace=[front,left,{x:left.x,y:left.y+depth},{x:front.x,y:front.y+depth}],rightShade=context.createLinearGradient(0,right.y,0,front.y+depth);rightShade.addColorStop(0,'#59636a');rightShade.addColorStop(1,'#30383e');const leftShade=context.createLinearGradient(0,left.y,0,front.y+depth);leftShade.addColorStop(0,'#4b565d');leftShade.addColorStop(1,'#273037');drawPolygon(context,rightFace,rightShade,'#263038',3);drawPolygon(context,leftFace,leftShade,'#222b31',3);context.strokeStyle='rgba(255,255,255,.22)';context.lineWidth=2;context.beginPath();context.moveTo(left.x,left.y+2);context.lineTo(front.x,front.y+2);context.lineTo(right.x,right.y+2);context.stroke();}
  function drawFloorMaterial(context,quad,material,base,grid,pattern){
    const gradient=context.createLinearGradient(0,quad[0].y,0,quad[2].y);gradient.addColorStop(0,shadeColor(base,20));gradient.addColorStop(.5,base);gradient.addColorStop(1,shadeColor(base,-16));drawPolygon(context,quad,gradient,grid,4);
    const floorTexture=material==='epoxy'?materialImages.floor:null,hqTexture=!!floorTexture;
    clipPolygon(context,quad,()=>{
      if(hqTexture){drawParallelogramTexture(context,floorTexture,quad[0],quad[1],quad[3]);context.fillStyle='rgba(161,205,216,.08)';context.fillRect(0,0,1024,768);}
      else if(material==='epoxy'){const gloss=context.createRadialGradient(455,350,20,455,350,470);gloss.addColorStop(0,'rgba(255,255,255,.34)');gloss.addColorStop(1,'rgba(255,255,255,0)');context.fillStyle=gloss;context.fillRect(0,100,1024,660);context.fillStyle='rgba(70,100,110,.08)';for(let i=0;i<150;i++){const x=(i*97)%1024,y=170+(i*53)%560;context.fillRect(x,y,1.5,1.5);}}
      if(material==='concrete'){context.fillStyle='rgba(25,31,35,.12)';for(let i=0;i<420;i++){const x=(i*83)%1024,y=(i*47)%768;context.fillRect(x,y,(i%3)+1,(i%2)+1);}}
      if(material==='wood'){for(let i=-300;i<1100;i+=34){context.strokeStyle=i%68===0?'rgba(68,42,25,.38)':'rgba(255,255,255,.2)';context.lineWidth=2;context.beginPath();context.moveTo(i,100);context.lineTo(i+680,768);context.stroke();}for(let i=0;i<22;i++){context.strokeStyle='rgba(70,45,28,.25)';context.beginPath();context.moveTo(i*86-300,250+(i%3)*62);context.lineTo(i*86+80,630+(i%3)*62);context.stroke();}}
      const shouldGrid=!hqTexture&&(material.includes('tile')||material==='epoxy'||pattern==='lab');if(shouldGrid){const steps=material==='zep-gray-tile'?ROOM_GRID_SIZE:material==='epoxy'?8:({small:20,medium:14,large:9,lab:16}[pattern]||12);drawIsoFloorCells(context,quad,steps,base,material);for(let i=1;i<steps;i++){const t=i/steps,strong=material==='epoxy'&&i%4===0;context.strokeStyle=strong?shadeColor(grid,-18):grid;context.globalAlpha=material==='zep-gray-tile'?.72:strong?.48:material==='epoxy'?.2:.4;context.lineWidth=material==='zep-gray-tile'?1.35:strong?1.8:1.1;let a=pointBetween(quad[0],quad[1],t),b=pointBetween(quad[3],quad[2],t);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();a=pointBetween(quad[0],quad[3],t);b=pointBetween(quad[1],quad[2],t);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}}
      context.globalAlpha=1;
    });
    context.strokeStyle='rgba(255,255,255,.58)';context.lineWidth=2;context.beginPath();context.moveTo(quad[0].x,quad[0].y+2);context.lineTo(quad[1].x,quad[1].y+2);context.moveTo(quad[0].x,quad[0].y+2);context.lineTo(quad[3].x,quad[3].y+2);context.stroke();
    context.strokeStyle=shadeColor(grid,-28);context.lineWidth=5;context.beginPath();context.moveTo(quad[3].x,quad[3].y);context.lineTo(quad[2].x,quad[2].y);context.lineTo(quad[1].x,quad[1].y);context.stroke();
  }
  function drawWallMaterial(context,wall,material,base,trim,sideShade=0){
    const points=[wall.bottomStart,wall.bottomEnd,wall.topEnd,wall.topStart],gradient=context.createLinearGradient(0,wall.topStart.y,0,wall.bottomStart.y);gradient.addColorStop(0,shadeColor(base,24));gradient.addColorStop(.16,shadeColor(base,12));gradient.addColorStop(.72,base);gradient.addColorStop(1,shadeColor(base,-24));context.save();if(material==='glass')context.globalAlpha=.78;drawPolygon(context,points,gradient,trim,3);context.restore();
    const wallTexture=material==='zep-blue-wallpaper'?materialImages.zepBlueWall:material==='zep-white-wallpaper'?materialImages.zepWhiteWall:material==='lab-panel'?materialImages.wall:null,hqTexture=!!wallTexture;if(hqTexture){clipPolygon(context,points,()=>{const wallpaper=material.startsWith('zep-');drawParallelogramTexture(context,wallTexture,wall.topStart,wall.topEnd,wall.bottomStart,wallpaper?{referenceWidth:450,sourceHeightRatio:1}:{});const light=context.createLinearGradient(0,wall.topStart.y,0,wall.bottomStart.y);light.addColorStop(0,'rgba(255,255,255,.18)');light.addColorStop(.62,'rgba(225,245,248,.02)');light.addColorStop(1,'rgba(45,58,66,.15)');context.fillStyle=light;context.fillRect(Math.min(wall.topStart.x,wall.bottomStart.x)-4,wall.topStart.y-4,Math.abs(wall.topEnd.x-wall.topStart.x)+12,wall.bottomStart.y-wall.topStart.y+12);});drawPolygon(context,points,null,trim,3);}
    clipPolygon(context,points,()=>{
      if((material==='lab-panel'&&!hqTexture)||material==='wood'||material==='glass'){const count=material==='wood'?10:7;for(let i=1;i<count;i++){const a=wallPoint(wall,i/count,0),b=wallPoint(wall,i/count,1);context.strokeStyle=material==='glass'?'rgba(220,255,255,.5)':material==='wood'?'rgba(68,43,28,.34)':'rgba(80,110,120,.2)';context.lineWidth=1.5;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();if(material==='lab-panel'){const shineA=wallPoint(wall,i/count+.006,.08),shineB=wallPoint(wall,i/count+.006,.94);context.strokeStyle='rgba(255,255,255,.44)';context.lineWidth=1;context.beginPath();context.moveTo(shineA.x,shineA.y);context.lineTo(shineB.x,shineB.y);context.stroke();const rivet=wallPoint(wall,i/count,.87);context.fillStyle='rgba(73,98,108,.45)';context.beginPath();context.arc(rivet.x,rivet.y,1.6,0,Math.PI*2);context.fill();}}}
      if(material==='brick'){for(let row=1;row<7;row++){let a=wallPoint(wall,0,row/7),b=wallPoint(wall,1,row/7);context.strokeStyle='rgba(105,78,62,.28)';context.lineWidth=1.5;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();const offset=row%2?.08:0;for(let col=offset;col<1;col+=.16){a=wallPoint(wall,col,(row-1)/7);b=wallPoint(wall,col,row/7);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}}}
      if(material==='concrete'){context.fillStyle='rgba(45,48,52,.13)';for(let i=0;i<90;i++){const u=((i*37)%100)/100,v=((i*61)%100)/100,p=wallPoint(wall,u,v);context.fillRect(p.x,p.y,2,2);}}
      if(material==='glass'){for(let i=0;i<3;i++){const a=wallPoint(wall,.08+i*.3,.86),b=wallPoint(wall,.23+i*.3,.2);context.strokeStyle='rgba(255,255,255,.45)';context.lineWidth=7;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}}
    });
    if(sideShade)drawPolygon(context,points,`rgba(24,39,50,${sideShade})`,null);
    const baseA=wallPoint(wall,0,.018),baseB=wallPoint(wall,1,.018);context.save();context.shadowColor='rgba(10,18,24,.34)';context.shadowBlur=5;context.shadowOffsetY=3;context.strokeStyle=shadeColor(trim,-18);context.lineWidth=12;context.beginPath();context.moveTo(baseA.x,baseA.y);context.lineTo(baseB.x,baseB.y);context.stroke();context.restore();
    const railA=wallPoint(wall,0,.075),railB=wallPoint(wall,1,.075);context.strokeStyle='rgba(255,255,255,.55)';context.lineWidth=2;context.beginPath();context.moveTo(railA.x,railA.y);context.lineTo(railB.x,railB.y);context.stroke();
  }
  function drawWallTopCap(context,wall,wallColor,trim,depth=11){const cap=[wall.topStart,wall.topEnd,{x:wall.topEnd.x,y:wall.topEnd.y-depth},{x:wall.topStart.x,y:wall.topStart.y-depth}],gradient=context.createLinearGradient(0,wall.topStart.y-depth,0,wall.topStart.y);gradient.addColorStop(0,shadeColor(wallColor,22));gradient.addColorStop(.48,shadeColor(wallColor,38));gradient.addColorStop(1,shadeColor(wallColor,-2));context.save();context.shadowColor='rgba(12,20,27,.3)';context.shadowBlur=5;context.shadowOffsetY=3;drawPolygon(context,cap,gradient,shadeColor(trim,-6),3);context.restore();context.strokeStyle='rgba(255,255,255,.68)';context.lineWidth=2;context.beginPath();context.moveTo(wall.topStart.x,wall.topStart.y-depth+1);context.lineTo(wall.topEnd.x,wall.topEnd.y-depth+1);context.stroke();}
  function drawCornerPost(context,bottom,top,trim){context.save();context.shadowColor='rgba(14,27,35,.3)';context.shadowBlur=5;context.shadowOffsetX=3;context.strokeStyle=shadeColor(trim,-12);context.lineWidth=9;context.lineCap='round';context.beginPath();context.moveTo(bottom.x,bottom.y);context.lineTo(top.x,top.y);context.stroke();context.shadowColor='transparent';context.strokeStyle=shadeColor(trim,30);context.lineWidth=3;context.beginPath();context.moveTo(bottom.x-1,bottom.y);context.lineTo(top.x-1,top.y);context.stroke();context.restore();}
  function floorPlanPoint(quad,x,y){const u=x/ROOM_GRID_SIZE,v=y/ROOM_GRID_SIZE;return pointBetween(pointBetween(quad[0],quad[1],u),pointBetween(quad[3],quad[2],u),v);}
  function drawInternalWalls(floorContext,topContext,quad,wallMaterial,wallColor,trim){
    const segments=state.roomPlan.map(segment=>{const a=floorPlanPoint(quad,segment.x1,segment.y1),b=floorPlanPoint(quad,segment.x2,segment.y2);return{a,b,depth:(a.y+b.y)/2};}).sort((a,b)=>a.depth-b.depth),height=104;
    segments.forEach(({a,b})=>{
      floorContext.save();floorContext.strokeStyle='rgba(20,31,39,.2)';floorContext.lineWidth=10;floorContext.lineCap='round';floorContext.shadowColor='rgba(16,25,32,.34)';floorContext.shadowBlur=9;floorContext.shadowOffsetX=2;floorContext.shadowOffsetY=3;floorContext.beginPath();floorContext.moveTo(a.x,a.y+1);floorContext.lineTo(b.x,b.y+1);floorContext.stroke();floorContext.restore();
      const wall={bottomStart:a,bottomEnd:b,topStart:{x:a.x,y:a.y-height},topEnd:{x:b.x,y:b.y-height}};drawWallMaterial(topContext,wall,wallMaterial,wallColor,trim,.045);
      drawWallTopCap(topContext,wall,wallColor,trim);
      drawCornerPost(topContext,a,{x:a.x,y:a.y-height},trim);drawCornerPost(topContext,b,{x:b.x,y:b.y-height},trim);
    });
  }
  function planPointFromEvent(event){const plan=$('#roomPlanCanvas'),rect=plan.getBoundingClientRect(),padding=16,span=plan.width-padding*2,x=(event.clientX-rect.left)*plan.width/rect.width,y=(event.clientY-rect.top)*plan.height/rect.height;return{x:Math.max(0,Math.min(ROOM_GRID_SIZE,Math.round((x-padding)/span*ROOM_GRID_SIZE))),y:Math.max(0,Math.min(ROOM_GRID_SIZE,Math.round((y-padding)/span*ROOM_GRID_SIZE)))};}
  function normalizePlanSegment(start,end){const point={...end};if(Math.abs(point.x-start.x)>=Math.abs(point.y-start.y))point.y=start.y;else point.x=start.x;if(point.x===start.x&&point.y===start.y)return null;const first=point.x<start.x||point.x===start.x&&point.y<start.y?point:start,second=first===point?start:point;return{x1:first.x,y1:first.y,x2:second.x,y2:second.y};}
  function planSegmentKey(segment){return`${segment.x1},${segment.y1}-${segment.x2},${segment.y2}`;}
  function renderRoomPlan(){const plan=$('#roomPlanCanvas');if(!plan)return;const pc=plan.getContext('2d'),padding=16,step=(plan.width-padding*2)/ROOM_GRID_SIZE;pc.clearRect(0,0,plan.width,plan.height);const bg=pc.createLinearGradient(0,0,0,plan.height);bg.addColorStop(0,'#171b2a');bg.addColorStop(1,'#0d101a');pc.fillStyle=bg;pc.fillRect(0,0,plan.width,plan.height);pc.strokeStyle='#343b55';pc.lineWidth=1;for(let i=0;i<=ROOM_GRID_SIZE;i++){const p=padding+i*step;pc.beginPath();pc.moveTo(padding,p);pc.lineTo(plan.width-padding,p);pc.stroke();pc.beginPath();pc.moveTo(p,padding);pc.lineTo(p,plan.height-padding);pc.stroke();}const draw=(segment,color,dashed=false)=>{pc.save();pc.strokeStyle=color;pc.lineWidth=4;pc.lineCap='round';if(dashed)pc.setLineDash([7,5]);pc.beginPath();pc.moveTo(padding+segment.x1*step,padding+segment.y1*step);pc.lineTo(padding+segment.x2*step,padding+segment.y2*step);pc.stroke();pc.restore();};state.roomPlan.forEach(segment=>draw(segment,'#63e6c1'));if(state.roomPlanPreview)draw(state.roomPlanPreview,'#9b8cff',true);pc.fillStyle='#b7bfd9';for(let y=0;y<=ROOM_GRID_SIZE;y++)for(let x=0;x<=ROOM_GRID_SIZE;x++){pc.beginPath();pc.arc(padding+x*step,padding+y*step,1.5,0,Math.PI*2);pc.fill();}}
  function setRoomPlanMode(mode){state.roomPlanMode=mode;$('#wallDrawModeButton').classList.toggle('active',mode==='draw');$('#wallEraseModeButton').classList.toggle('active',mode==='erase');}
  function eraseNearestPlanSegment(point){let nearest=-1,distance=Infinity;state.roomPlan.forEach((segment,index)=>{const horizontal=segment.y1===segment.y2,inside=horizontal?point.x>=segment.x1&&point.x<=segment.x2:point.y>=segment.y1&&point.y<=segment.y2,d=horizontal?Math.abs(point.y-segment.y1):Math.abs(point.x-segment.x1);if(inside&&d<distance){nearest=index;distance=d;}});if(nearest>=0&&distance<=1)state.roomPlan.splice(nearest,1);}
  function beginRoomPlan(event){event.preventDefault();const point=planPointFromEvent(event);if(state.roomPlanMode==='erase'){eraseNearestPlanSegment(point);renderRoomPlan();return;}state.roomPlanStart=point;state.roomPlanPreview=null;event.currentTarget.setPointerCapture?.(event.pointerId);}
  function moveRoomPlan(event){if(!state.roomPlanStart)return;state.roomPlanPreview=normalizePlanSegment(state.roomPlanStart,planPointFromEvent(event));renderRoomPlan();}
  function endRoomPlan(event){if(!state.roomPlanStart)return;const segment=normalizePlanSegment(state.roomPlanStart,planPointFromEvent(event));if(segment&&!state.roomPlan.some(item=>planSegmentKey(item)===planSegmentKey(segment)))state.roomPlan.push(segment);state.roomPlanStart=null;state.roomPlanPreview=null;renderRoomPlan();}
  const wallMaterialDefaults={'zep-blue-wallpaper':['#eaf2f6','#596675'],'zep-white-wallpaper':['#f7f5ef','#68727d'],'lab-panel':['#e8f3f5','#547184'],paint:['#f3edda','#6f765f'],concrete:['#c8cccf','#626a72'],brick:['#e3d4c3','#856e5b'],wood:['#c99d72','#664a35'],glass:['#a9dce8','#3e7182']};
  const floorMaterialDefaults={'zep-gray-tile':['#bfc6c9','#e9eef0','large'],epoxy:['#d9e3e6','#789baa','lab'],'light-tile':['#ded7c8','#9f9788','large'],'blue-tile':['#aebfc8','#657b88','medium'],concrete:['#aeb2b5','#74797c','none'],wood:['#b88b61','#745236','large'],'dark-tile':['#4f5962','#7e929f','medium']};
  function applyMaterialDefaults(kind,value){if(kind==='wall'){const selected=wallMaterialDefaults[value];if(selected){$('#roomWallColor').value=selected[0];$('#roomTrimColor').value=selected[1];}}else{const selected=floorMaterialDefaults[value];if(selected){$('#roomFloorColor').value=selected[0];$('#roomGridColor').value=selected[1];$('#roomTilePattern').value=selected[2];}}$('#roomPreset').value='custom';}
  function createRoomTemplate(){
    if(state.hasContent&&!confirm('현재 맵을 빈 방 템플릿으로 바꿀까요? 기존 그림은 실행 취소로 복구할 수 있습니다.'))return;
    pushHistory();setupLayers(1024,768);Object.values(state.layers).forEach(layer=>layer.getContext('2d').clearRect(0,0,layer.width,layer.height));
    const floor=state.layers.floor.getContext('2d'),top=state.layers.top.getContext('2d'),wide=$('#roomFloorRatio').value==='wide',wallColor=$('#roomWallColor').value,trim=$('#roomTrimColor').value,floorColor=$('#roomFloorColor').value,gridColor=$('#roomGridColor').value,pattern=$('#roomTilePattern').value,wallMaterial=$('#roomWallMaterial').value,floorMaterial=$('#roomFloorMaterial').value;
    const back={x:512,y:wide?178:150},left={x:wide?62:92,y:wide?422:392},right={x:wide?962:932,y:wide?422:392},front={x:512,y:wide?704:724},wallHeight=wide?126:142,leftTop={x:left.x,y:left.y-wallHeight},backTop={x:back.x,y:back.y-wallHeight},rightTop={x:right.x,y:right.y-wallHeight};
    const floorQuad=[back,right,front,left];drawRoomPlatform(floor,floorQuad);drawFloorMaterial(floor,floorQuad,floorMaterial,floorColor,gridColor,pattern);
    const leftWall={bottomStart:left,bottomEnd:back,topStart:leftTop,topEnd:backTop},rightWall={bottomStart:back,bottomEnd:right,topStart:backTop,topEnd:rightTop};
    drawWallMaterial(floor,leftWall,wallMaterial,wallColor,trim,.025);drawWallMaterial(floor,rightWall,wallMaterial,shadeColor(wallColor,-8),trim,.105);
    drawWallTopCap(floor,leftWall,wallColor,trim,12);drawWallTopCap(floor,rightWall,shadeColor(wallColor,-8),trim,12);
    [[left,back],[back,right]].forEach(([a,b])=>{floor.strokeStyle=shadeColor(trim,-8);floor.lineWidth=7;floor.beginPath();floor.moveTo(a.x,a.y);floor.lineTo(b.x,b.y);floor.stroke();});
    const windowCount=+$('#roomWindowCount').value,perWall=windowCount/2,centers=perWall===1?[.42]:perWall===2?[.3,.62]:[];centers.forEach(center=>drawWindow(floor,leftWall,center,.2,trim,wallMaterial));centers.forEach(center=>drawWindow(floor,rightWall,center,.2,trim,wallMaterial));
    const doorSide=$('#roomDoorSide').value;if(doorSide==='left')drawDoor(floor,leftWall,.82,trim,wallMaterial);if(doorSide==='right')drawDoor(floor,rightWall,.82,trim,wallMaterial);
    drawCornerPost(floor,left,leftTop,trim);drawCornerPost(floor,back,backTop,trim);drawCornerPost(floor,right,rightTop,trim);
    drawInternalWalls(floor,top,floorQuad,wallMaterial,wallColor,trim);
    state.grid=false;$('#gridToggle').checked=false;
    state.activeLayer='floor';state.hasContent=true;state.soloLayer=null;syncActiveLayer();showAllLayers();changed();toast('고정된 ZEP 빈 방을 만들었습니다. 이제 그림판과 오브젝트로 꾸며 보세요.');
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
    ['floor','object','top'].forEach(k => {
      const row=$(`.layer[data-layer="${k}"]`);
      if(!row||row.dataset.visible!=='false')pctx.drawImage(state.layers[k],0,0,preview.width,preview.height);
    });
  }
  function buildLayers() {
    $('#layerList').innerHTML = Object.entries(layerMeta).map(([key,m]) => `
      <div class="layer ${key === state.activeLayer ? 'active' : ''}" data-layer="${key}" data-visible="true">
        <span class="layer-swatch">${m.icon}</span><span><b>${m.name}</b><small>${m.sub}</small></span>
        <button class="visibility" type="button" title="보이기/숨기기">●</button>
      </div>`).join('');
  }
  function setLayerVisibility(key,visible){
    const row=$(`.layer[data-layer="${key}"]`);if(!row)return;
    row.dataset.visible=visible?'true':'false';
    row.querySelector('.visibility')?.classList.toggle('off',!visible);
  }
  function showAllLayers(){
    state.soloLayer=null;
    Object.keys(layerMeta).forEach(key=>setLayerVisibility(key,true));
    $$('.layer').forEach(row=>row.classList.remove('solo'));
    $('#showAllLayersButton').classList.add('active');
    render();
  }
  function showOnlyLayer(key){
    state.soloLayer=key;
    Object.keys(layerMeta).forEach(layerKey=>setLayerVisibility(layerKey,layerKey===key));
    $$('.layer').forEach(row=>row.classList.toggle('solo',row.dataset.layer===key));
    $('#showAllLayersButton').classList.remove('active');
    render();
    if(!hasPixels(state.layers[key]))toast(`${layerMeta[key].name} 레이어가 비어 있습니다. 먼저 AI 레이어 분리로 내용을 옮겨 주세요.`);
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
  function syncActiveLayer(){
    $$('.layer').forEach(el=>{
      const key=el.dataset.layer,empty=!hasPixels(state.layers[key]);
      el.classList.toggle('active',key===state.activeLayer);el.classList.toggle('empty',empty);
      const small=el.querySelector('small');if(small)small.textContent=`${layerMeta[key].sub}${empty?' · 비어 있음':''}`;
    });
    $('#activeLayerStatus').textContent=`${layerMeta[state.activeLayer].name} 레이어`;
  }

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
  function syncAIModeUI(){
    const object=state.aiKind==='object',layered=$('#aiMapMode').value==='layered';
    $('#aiMapModeLabel').classList.toggle('hidden',object);
    $('#aiGenerateButton').innerHTML=object?'<span>✦</span> 오브젝트 생성':layered?'<span>✦</span> 빈 타일 맵 생성 (실험)':'<span>✦</span> 빈 바닥·벽 맵 생성';
  }
  function setAIKind(kind){
    state.aiKind=kind;
    $$('[data-ai-kind]').forEach(b=>b.classList.toggle('active',b.dataset.aiKind===kind));
    const object=kind==='object';
    $('#aiScene').closest('label').classList.toggle('hidden',object);
    syncAIModeUI();
    $('#aiPrompt').placeholder=object?'예: 벚꽃이 핀 큰 나무, 아래에 작은 화단이 있는 오브젝트':'예: 흰색 타일 바닥과 밝은 벽, 뒤쪽에 창문과 출입문이 있는 빈 생명과학실';
    $('#promptExamples').innerHTML=(object?['벚꽃이 핀 큰 나무','과학실 실험대와 현미경','생태 연못 안내판']:['창문과 출입문이 있는 빈 생명과학실','넓은 타일 바닥의 빈 과학실','복도와 연결된 빈 연구실']).map(v=>`<button type="button">${v}</button>`).join('');
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
    top.fillStyle='#e8edef';top.fillRect(0,0,width,88);top.fillStyle='#25323b';top.fillRect(0,78,width,12);top.fillRect(0,0,18,height);top.fillRect(width-18,0,18,height);top.fillRect(0,height-24,width*.43,24);top.fillRect(width*.57,height-24,width*.43,24);for(let x=18;x<width-18;x+=154)top.drawImage(sprites[0][2],x,-8,150,104);
    collision.fillStyle='rgba(255,53,93,.72)';collision.fillRect(0,0,width,82);collision.fillRect(0,0,18,height);collision.fillRect(width-18,0,18,height);collision.fillRect(0,height-24,width*.43,24);collision.fillRect(width*.57,height-24,width*.43,24);
    const defaultSets={laboratory:[['dna-machine',13,26,10],['teacher-desk',31,27,10],['growth-chamber',73,25,9],['specimen-cabinet',88,25,9],['lab-bench',27,49,11],['lab-bench',52,49,11],['chemical-cabinet',88,51,9],['incubator',73,51,9],['sink-bench',27,73,11],['student-table',52,73,11],['bookshelf',12,68,9],['plant',68,78,7],['safety-station',91,81,7]],classroom:[['teacher-desk',50,25,11],['bookshelf',88,27,9],['student-table',22,48,9],['student-table',48,48,9],['student-table',74,48,9],['student-table',22,72,9],['student-table',48,72,9],['student-table',74,72,9],['plant',88,78,7]],library:[['bookshelf',13,28,9],['bookshelf',13,55,9],['bookshelf',87,28,9],['bookshelf',87,55,9],['student-table',36,48,10],['student-table',64,48,10],['student-table',36,72,10],['student-table',64,72,10],['teacher-desk',50,24,9],['plant',88,80,7]]};const defaults=defaultSets[plan.spaceType]||defaultSets.laboratory;
    const allowedTypes=new Set((plan.objects||[]).map(item=>String(item.type||''))),selected=plan.spaceType==='laboratory'?defaults:defaults.filter(([type])=>!allowedTypes.size||allowedTypes.has(type)||type==='student-table'||type==='teacher-desk'),items=[],mapping={'lab-bench':[0,1],'sink-bench':[1,1],'growth-chamber':[2,1],'specimen-cabinet':[3,1],'dna-machine':[0,2],incubator:[1,2],'chemical-cabinet':[2,2],bookshelf:[3,2],'teacher-desk':[0,3],'student-table':[1,3],plant:[2,3],'safety-station':[3,3]};
    items.forEach(item=>{const cell=mapping[item.type]||mapping['student-table'],sprite=sprites[cell[1]][cell[0]],x=item.x*width/100,y=item.y*height/100,w=Math.max(66,item.size*10.5),h=w;objects.drawImage(sprite,x-w/2,y-h*.62,w,h);collision.fillStyle='rgba(255,53,93,.7)';collision.fillRect(x-w*.32,y+h*.08,w*.64,h*.17);});
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
    (plan.trees||[]).slice(0,0).forEach((tree,index)=>{const x=px(tree.x),y=py(tree.y),s=Math.max(48,px(planNumber(tree.size,2,12,5))*2.5),sprite=sprites[1][index%3];objects.drawImage(sprite,x-s/2,y-s*.68,s,s);collision.fillStyle='rgba(255,53,93,.72)';collision.beginPath();collision.ellipse(x,y+s*.18,s*.16,s*.1,0,0,Math.PI*2);collision.fill();});
    const objectCells={bench:[0,2],sign:[1,2],lamp:[2,2],rock:[3,2],bush:[3,1],flower:[3,3]};(plan.objects||[]).slice(0,0).forEach(item=>{const x=px(item.x),y=py(item.y),s=Math.max(34,px(planNumber(item.size,1,8,3))*2.2),cell=objectCells[String(item.type||'bush')]||objectCells.bush,sprite=sprites[cell[1]][cell[0]];objects.drawImage(sprite,x-s/2,y-s*.55,s,s);collision.fillStyle='rgba(255,53,93,.68)';collision.beginPath();collision.ellipse(x,y+s*.18,s*.2,s*.1,0,0,Math.PI*2);collision.fill();});
    (plan.buildings||[]).slice(0,6).forEach((building,index)=>{const x=px(building.x),y=py(building.y),w=px(planNumber(building.w,8,42,22)),h=py(planNumber(building.h,8,35,18))*1.5,style=String(building.style||'').toLowerCase();let column=index%4;if(/lab|science|연구|과학/.test(style))column=1;else if(/green|온실/.test(style))column=2;else if(/gym|체육/.test(style))column=3;else if(/school|학교/.test(style))column=0;top.drawImage(sprites[0][column],x,y,w,h);collision.fillStyle='rgba(255,53,93,.72)';collision.fillRect(x+w*.08,y+h*.72,w*.84,h*.2);});
    return finishLayerCanvases(canvases);
  }
  function showAILayer(key){if(!state.aiLayers)return;$('#aiResultImage').src=state.aiLayers[key]||state.aiLayers.composite;$$('[data-ai-layer]').forEach(button=>button.classList.toggle('active',button.dataset.aiLayer===key));}
  async function compactAIReference(dataUrl){const img=await imageFromURL(dataUrl),scale=Math.min(1,512/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height)),canvas=makeLayer(Math.round((img.naturalWidth||img.width)*scale),Math.round((img.naturalHeight||img.height)*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.9);}
  function isIndoorMapPrompt(prompt){return /내부|실내|연구실|실험실|과학실|교실|도서관|laboratory|classroom|interior|indoor|library|lab\b/i.test(prompt);}
  async function createIndoorOpenRoomLayers(imageUrl){
    const image=await imageFromURL(imageUrl),width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,canvases={floor:makeLayer(width,height),object:makeLayer(width,height),top:makeLayer(width,height),collision:makeLayer(width,height)};
    canvases.floor.getContext('2d').drawImage(image,0,0,width,height);
    removeConnectedBackground(canvases.floor,24);
    return finishLayerCanvases(canvases);
  }
  async function createAISeparatedLayers(images,prompt){
    const floorImage=await imageFromURL(images.floor),width=floorImage.naturalWidth||floorImage.width,height=floorImage.naturalHeight||floorImage.height,canvases={floor:makeLayer(width,height),object:makeLayer(width,height),top:makeLayer(width,height),collision:makeLayer(width,height)},indoor=isIndoorMapPrompt(prompt);
    canvases.floor.getContext('2d').drawImage(floorImage,0,0,width,height);
    if(images.top){const img=await imageFromURL(images.top);canvases.top.getContext('2d').drawImage(img,0,0,width,height);removeConnectedBackground(canvases.top);}
    if(indoor)removeConnectedBackground(canvases.floor,24);
    return finishLayerCanvases(canvases);
  }
  async function requestAISeparatedLayers(reference,prompt){
    const res=await fetch('/api/zep/generate',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({operation:'split',kind:'map',prompt,scene:$('#aiScene').value,season:$('#aiSeason').value,view:$('#aiView').value,direction:$('#aiDirection').value,reference:await compactAIReference(reference),accessCode:$('#aiAccessCode').value})}),data=await res.json().catch(()=>({}));
    if(!res.ok||!data.layers)throw new Error(data.message||'자동 레이어 분리에 실패했습니다.');
    return createAISeparatedLayers(data.layers,prompt);
  }
  async function generateAI(){const prompt=$('#aiPrompt').value.trim();if(prompt.length<3)return toast('만들고 싶은 장면을 조금 더 자세히 적어 주세요.');const usage=todayAICount();if(usage.count>=20)return toast('이 브라우저의 오늘 생성 횟수 20회를 모두 사용했습니다.');const button=$('#aiGenerateButton'),loading=$('#aiLoading'),loadingMessage=$('#aiLoading span'),placeholder=$('#aiPlaceholder'),image=$('#aiResultImage'),qualityMap=state.aiKind==='map'&&$('#aiMapMode').value==='quality',indoorQuality=qualityMap&&isIndoorMapPrompt(`${prompt} ${$('#aiScene').value}`);button.disabled=true;loading.hidden=false;loadingMessage.textContent=indoorQuality?'프롬프트에서 방 구조·색상·바닥·창문·문 정보를 분석하고 있습니다.':'먼저 완성된 전체 맵을 만들고 있습니다.';placeholder.hidden=true;image.hidden=true;state.aiResult=null;state.aiResultKind=null;state.aiLayers=null;$('#aiLayerTabs').hidden=true;$('#aiLayerDownloads').hidden=true;toggleAIResult(false);try{const res=await fetch('/api/zep/generate',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({kind:state.aiKind,mapMode:$('#aiMapMode').value,prompt,scene:$('#aiScene').value,season:$('#aiSeason').value,view:$('#aiView').value,direction:$('#aiDirection').value,accessCode:$('#aiAccessCode').value})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.message||'결과를 만들지 못했습니다.');if(data.type==='layered-map'&&data.plan){state.aiLayers=await createLayeredMap(data.plan);state.aiResult=state.aiLayers.composite;state.aiResultKind='map';$('#aiLayerTabs').hidden=false;$('#aiLayerDownloads').hidden=false;showAILayer('composite');}else if(data.image){state.aiResult=data.image;state.aiResultKind=state.aiKind;if(qualityMap){loadingMessage.textContent=indoorQuality?'아래쪽이 열린 바닥과 위쪽 두 벽을 정리하고 있습니다.':'같은 구도로 바닥·오브젝트·윗배경을 각각 만드는 중입니다.';try{state.aiLayers=indoorQuality?await createIndoorOpenRoomLayers(data.image):await requestAISeparatedLayers(data.image,prompt);state.aiResult=state.aiLayers.composite;$('#aiLayerTabs').hidden=false;$('#aiLayerDownloads').hidden=false;showAILayer('composite');}catch(splitError){image.src=data.image;toast(`${splitError.message} 전체 맵은 정상 생성되었습니다.`);}}else image.src=data.image;}else throw new Error('생성 결과가 비어 있습니다.');image.hidden=false;if(usage.key)localStorage.setItem(usage.key,String(usage.count+1));toggleAIResult(true);if(state.aiLayers)toast(indoorQuality?'아래쪽 앞벽 없이 바닥과 위쪽 두 벽만 만들었습니다.':'바닥·오브젝트·윗배경이 각각 생성되었습니다.');else if(!qualityMap)toast('고품질 AI 이미지가 완성되었습니다.');}catch(error){placeholder.hidden=false;placeholder.innerHTML=`<span>!</span><b>생성하지 못했습니다</b><small>${String(error.message||error)}</small>`;toast(String(error.message||error));}finally{loading.hidden=true;loadingMessage.textContent='보통 수 초에서 수십 초가 걸립니다.';button.disabled=false;}}
  function toggleAIResult(enabled){const map=state.aiResultKind==='map',object=state.aiResultKind==='object';$('#applyAIMapButton').disabled=!enabled||!map;$('#applyAIMapButton').textContent=state.aiLayers?'분리 레이어 가져오기':'편집실로 가져와 분리';$('#applyAIObjectButton').disabled=!enabled||!object;$('#downloadAIButton').disabled=!enabled;$('#deleteAIResultButton').disabled=!enabled;}
  function deleteAIResult(){
    if(!state.aiResult)return;
    state.aiResult=null;state.aiResultKind=null;state.aiLayers=null;
    const image=$('#aiResultImage'),placeholder=$('#aiPlaceholder');
    image.removeAttribute('src');
    image.hidden=true;
    placeholder.innerHTML='<span>✦</span><b>생성된 결과가 여기에 나타납니다</b><small>추천 모드는 완성도 높은 맵을 먼저 만들고 편집실에서 필요한 부분을 나눕니다.</small>';
    placeholder.hidden=false;
    $('#aiLayerTabs').hidden=true;$('#aiLayerDownloads').hidden=true;
    toggleAIResult(false);
    toast('생성 결과를 삭제했습니다.');
  }
  async function applyAIMap(){
    if(!state.aiResult||state.aiResultKind!=='map')return;
    setWorkspace('map');pushHistory();
    if(state.aiLayers){
      for(const key of ['floor','object','top','collision'])await drawDataURL(state.layers[key],state.aiLayers[key],true);
      state.activeLayer='floor';state.hasContent=true;syncActiveLayer();showAllLayers();changed();$('#aiDialog').close();toast('바닥·오브젝트·윗배경·충돌 레이어를 각각 가져왔습니다.');return;
    }
    const img=await imageFromURL(state.aiResult);
    setupLayers(img.naturalWidth||img.width,img.naturalHeight||img.height);
    state.layers.floor.getContext('2d').drawImage(img,0,0,state.mapWidth,state.mapHeight);
    state.activeLayer='floor';state.hasContent=true;syncActiveLayer();showAllLayers();changed();$('#aiDialog').close();startLayerSplit();
  }
  async function applyAIObject(){if(!state.aiResult)return;const img=await imageFromURL(state.aiResult),temp=makeLayer(512,512),tc=temp.getContext('2d');tc.drawImage(img,0,0,512,512);removeConnectedBackground(temp);const cropped=cropTransparent(temp,12);setupObject(cropped.width,cropped.height);state.objectCanvas.getContext('2d').drawImage(cropped,0,0);$('#objectName').value=$('#aiPrompt').value.trim().slice(0,40)||'AI 오브젝트';setWorkspace('object');changed();$('#aiDialog').close();toast('배경을 제거해 오브젝트 공방으로 가져왔습니다.');}
  function removeConnectedBackground(c,threshold=82){const x=c.getContext('2d',{willReadFrequently:true}),img=x.getImageData(0,0,c.width,c.height),d=img.data,w=c.width,h=c.height,corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]].map(([cx,cy])=>{const p=(cy*w+cx)*4;return[d[p],d[p+1],d[p+2]];}),seen=new Uint8Array(w*h),queue=[];for(let px=0;px<w;px++){queue.push(px,0,px,h-1);}for(let py=1;py<h-1;py++){queue.push(0,py,w-1,py);}let head=0;while(head<queue.length){const px=queue[head++],py=queue[head++],i=py*w+px;if(px<0||py<0||px>=w||py>=h||seen[i])continue;seen[i]=1;const p=i*4,rgb=[d[p],d[p+1],d[p+2],d[p+3]],distance=Math.min(...corners.map(v=>Math.max(Math.abs(rgb[0]-v[0]),Math.abs(rgb[1]-v[1]),Math.abs(rgb[2]-v[2]))));if(distance>threshold)continue;d[p+3]=0;queue.push(px+1,py,px-1,py,px,py+1,px,py-1);}x.putImageData(img,0,0);}
  function cropTransparent(source,padding=8){const x=source.getContext('2d',{willReadFrequently:true}),d=x.getImageData(0,0,source.width,source.height).data;let minX=source.width,minY=source.height,maxX=-1,maxY=-1;for(let y=0;y<source.height;y++)for(let px=0;px<source.width;px++)if(d[(y*source.width+px)*4+3]>12){minX=Math.min(minX,px);minY=Math.min(minY,y);maxX=Math.max(maxX,px);maxY=Math.max(maxY,y);}if(maxX<0)return makeLayer(96,96);minX=Math.max(0,minX-padding);minY=Math.max(0,minY-padding);maxX=Math.min(source.width-1,maxX+padding);maxY=Math.min(source.height-1,maxY+padding);const rawW=maxX-minX+1,rawH=maxY-minY+1,scale=Math.min(1,256/Math.max(rawW,rawH)),w=Math.max(8,Math.ceil(rawW*scale/8)*8),h=Math.max(8,Math.ceil(rawH*scale/8)*8),out=makeLayer(w,h);out.getContext('2d').drawImage(source,minX,minY,rawW,rawH,0,0,w,h);return out;}
  function downloadAI(){if(!state.aiResult)return;fetch(state.aiResult).then(r=>r.blob()).then(blob=>downloadBlob(blob,`${safeName($('#aiPrompt').value||'zep-ai-image')}.${state.aiLayers?'png':'jpg'}`));}
  function downloadAILayer(key){if(!state.aiLayers?.[key])return;fetch(state.aiLayers[key]).then(r=>r.blob()).then(blob=>downloadBlob(blob,`${safeName($('#aiPrompt').value||'zep-ai-map')}-${key}.png`));}
  let toastTimer;function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}

  function bind() {
    $$('.workspace-tab').forEach(b=>b.addEventListener('click',()=>setWorkspace(b.dataset.workspace)));
    $('#layerList').addEventListener('click',e=>{const row=e.target.closest('.layer');if(!row)return;if(e.target.closest('.visibility')){state.soloLayer=null;row.dataset.visible=row.dataset.visible==='false'?'true':'false';e.target.classList.toggle('off',row.dataset.visible==='false');$$('.layer').forEach(item=>item.classList.remove('solo'));$('#showAllLayersButton').classList.remove('active');render();return;}state.activeLayer=row.dataset.layer;clearSelection();syncActiveLayer();showOnlyLayer(state.activeLayer);});
    $('#showAllLayersButton').addEventListener('click',showAllLayers);
    $('#toolGrid').addEventListener('click',e=>{const b=e.target.closest('.tool');if(b)setTool(b.dataset.tool);});
    canvas.addEventListener('pointerdown',beginDraw);canvas.addEventListener('pointermove',moveDraw);canvas.addEventListener('pointerup',endDraw);canvas.addEventListener('pointercancel',endDraw);
    $('#brushSize').addEventListener('input',e=>{state.size=+e.target.value;$('#brushSizeValue').textContent=`${state.size} px`;});
    $('#tolerance').addEventListener('input',e=>{state.tolerance=+e.target.value;$('#toleranceValue').textContent=state.tolerance;});
    $('#colorInput').addEventListener('input',e=>setColor(e.target.value));$('#colorText').addEventListener('change',e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value))setColor(e.target.value);else e.target.value=state.color.toUpperCase();});
    $('#palette').addEventListener('click',e=>{if(e.target.dataset.color)setColor(e.target.dataset.color);});
    $('#resizeMapButton').addEventListener('click',()=>{const w=Math.max(64,Math.min(4096,+$('#mapWidth').value||640)),h=Math.max(64,Math.min(4096,+$('#mapHeight').value||480));if(confirm('기존 그림을 유지하면서 캔버스 크기를 바꿀까요?')){pushHistory();setupLayers(w,h,true);changed();}});
    $('#roomPreset').addEventListener('change',e=>applyRoomPreset(e.target.value));$('#createRoomTemplateButton').addEventListener('click',createRoomTemplate);
    $('#roomWallMaterial').addEventListener('change',e=>applyMaterialDefaults('wall',e.target.value));$('#roomFloorMaterial').addEventListener('change',e=>applyMaterialDefaults('floor',e.target.value));
    const roomPlanCanvas=$('#roomPlanCanvas');roomPlanCanvas.addEventListener('pointerdown',beginRoomPlan);roomPlanCanvas.addEventListener('pointermove',moveRoomPlan);roomPlanCanvas.addEventListener('pointerup',endRoomPlan);roomPlanCanvas.addEventListener('pointercancel',endRoomPlan);
    $('#wallDrawModeButton').addEventListener('click',()=>setRoomPlanMode('draw'));$('#wallEraseModeButton').addEventListener('click',()=>setRoomPlanMode('erase'));$('#clearRoomWallsButton').addEventListener('click',()=>{state.roomPlan=[];state.roomPlanStart=null;state.roomPlanPreview=null;renderRoomPlan();});
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
    $('#helpButton').addEventListener('click',()=>$('#helpDialog').showModal());$('#aiButton').addEventListener('click',()=>{$('#aiDialog').showModal();checkAIStatus();});$('#aiCloseButton').addEventListener('click',()=>$('#aiDialog').close());$$('[data-ai-kind]').forEach(b=>b.addEventListener('click',()=>setAIKind(b.dataset.aiKind)));$('#promptExamples').addEventListener('click',e=>{if(e.target.closest('button'))$('#aiPrompt').value=e.target.textContent;});$('#aiView').addEventListener('change',e=>localStorage.setItem('zep-ai-view',e.target.value));$('#aiMapMode').addEventListener('change',syncAIModeUI);$('#aiLayerTabs').addEventListener('click',e=>{const button=e.target.closest('[data-ai-layer]');if(button)showAILayer(button.dataset.aiLayer);});$('#aiLayerDownloads').addEventListener('click',e=>{const button=e.target.closest('[data-download-ai-layer]');if(button)downloadAILayer(button.dataset.downloadAiLayer);});$('#aiGenerateButton').addEventListener('click',generateAI);$('#applyAIMapButton').addEventListener('click',applyAIMap);$('#applyAIObjectButton').addEventListener('click',applyAIObject);$('#downloadAIButton').addEventListener('click',downloadAI);$('#deleteAIResultButton').addEventListener('click',deleteAIResult);$('#projectName').addEventListener('input',scheduleSave);
    window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}const keys={b:'brush',e:'eraser',l:'line',r:'rect',o:'ellipse',f:'fill',i:'picker',w:'wand'};if(keys[e.key.toLowerCase()])setTool(keys[e.key.toLowerCase()]);if(e.key==='['){state.size=Math.max(1,state.size-1);$('#brushSize').value=state.size;$('#brushSizeValue').textContent=`${state.size} px`;}if(e.key===']'){state.size=Math.min(96,state.size+1);$('#brushSize').value=state.size;$('#brushSizeValue').textContent=`${state.size} px`;}});
  }
  async function init(){setupLayers(640,480);setupObject(96,96);buildLayers();$('#palette').innerHTML=palette.map(c=>`<button type="button" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');setColor(state.color);await loadMaterialAssets();try{state.library=JSON.parse(localStorage.getItem('zep-object-library')||'[]');}catch{state.library=[];}const savedView=localStorage.getItem('zep-ai-view');if([...$('#aiView').options].some(option=>option.value===savedView))$('#aiView').value=savedView;renderLibrary();bind();renderRoomPlan();syncActiveLayer();showAllLayers();setAIKind(state.aiKind);if(new URLSearchParams(location.search).get('ai')==='1'){$('#aiDialog').showModal();checkAIStatus();}await loadAutosave();syncActiveLayer();render();}
  init();
})();
