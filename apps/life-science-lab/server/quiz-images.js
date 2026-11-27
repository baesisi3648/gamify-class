import {hmac,readSession} from './auth.js';

const MAX_BYTES=5*1024*1024;
const types=new Set(['image/jpeg','image/png','image/webp']);
const imageIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function matchesType(type,bytes){
  if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==='image/png')return [137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
  if(type==='image/webp')return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  return false;
}

export async function handleQuizImage(request,env){
  try{
    if(!env.REPORT_IMAGES||!env.LAB_SESSION_SECRET)return json({error:'이미지 저장소를 사용할 수 없습니다.'},503);
    const user=await readSession(request,env.LAB_SESSION_SECRET);
    if(!user)return json({error:'로그인해 주세요.'},401);
    const url=new URL(request.url),id=url.pathname.match(/^\/api\/lab\/quiz-image\/([^/]+)$/)?.[1];
    const groupId=String(user.groupId||'legacy');
    if(env.LAB_DB){
      if(groupId!=='legacy'){
        const stored=await env.LAB_DB.prepare('SELECT data FROM Settings WHERE id=?').bind('group:'+groupId).first();
        const group=stored?JSON.parse(stored.data).value:null;
        if(!group||user.role==='teacher'&&!user.owner&&user.groupVersion!==group.authVersion)return json({error:'연구 그룹에 다시 로그인하세요.'},401);
      }
      if(user.role==='student'){
        const stored=await env.LAB_DB.prepare('SELECT data FROM Students WHERE id=?').bind(user.id).first();
        const student=stored&&JSON.parse(stored.data);
        if(!student||student.active===false||student.authVersion!==user.authVersion||student.groupId!==groupId&&!(groupId==='legacy'&&!student.groupId))return json({error:'학생 계정으로 다시 로그인하세요.'},401);
      }
    }
    if(request.method==='POST' && url.pathname==='/api/lab/quiz-image'){
      if(user.role!=='teacher'||request.headers.get('Origin')!==url.origin)return json({error:'교사만 문제 이미지를 등록할 수 있습니다.'},403);
      const type=(request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
      if(!types.has(type))return json({error:'JPG, PNG, WebP 이미지만 등록할 수 있습니다.'},415);
      if(Number(request.headers.get('Content-Length')||0)>MAX_BYTES)return json({error:'이미지는 5MB 이하로 등록해 주세요.'},413);
      const body=await request.arrayBuffer();
      if(!body.byteLength||body.byteLength>MAX_BYTES)return json({error:'이미지는 5MB 이하로 등록해 주세요.'},413);
      if(!matchesType(type,new Uint8Array(body,0,Math.min(body.byteLength,16))))return json({error:'이미지 파일 형식을 확인해 주세요.'},415);
      const imageId=crypto.randomUUID();
      const key='quiz-images/'+await hmac(env.LAB_SESSION_SECRET,groupId+':'+imageId);
      await env.REPORT_IMAGES.put(key,body,{httpMetadata:{contentType:type},customMetadata:{groupId,imageId}});
      return json({result:{id:imageId}});
    }
    if(request.method==='GET' && id && imageIdPattern.test(id)){
      const key='quiz-images/'+await hmac(env.LAB_SESSION_SECRET,groupId+':'+id);
      const object=await env.REPORT_IMAGES.get(key);
      if(!object)return json({error:'문제 이미지를 찾을 수 없습니다.'},404);
      return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, no-store','Content-Disposition':'inline','X-Content-Type-Options':'nosniff'}});
    }
    return json({error:'이미지 요청을 확인해 주세요.'},405);
  }catch{return json({error:'이미지 요청을 처리하지 못했습니다.'},502);}
}
