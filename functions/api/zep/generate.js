const MODEL = "@cf/black-forest-labs/flux-1-schnell";
const PLAN_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  };

  if (request.method === "GET") {
    return Response.json({
      ok: true,
      ready: Boolean(env.AI),
      protected: Boolean(env.ZEP_AI_ACCESS_CODE),
      model: MODEL,
      layeredMapModel: PLAN_MODEL
    }, { headers });
  }

  if (request.method !== "POST") {
    return Response.json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "POST 요청만 사용할 수 있습니다." }, { status: 405, headers });
  }

  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) {
    return Response.json({ ok: false, code: "ORIGIN_BLOCKED", message: "이 사이트 안에서만 생성할 수 있습니다." }, { status: 403, headers });
  }

  if (!env.AI) {
    return Response.json({
      ok: false,
      code: "AI_BINDING_MISSING",
      message: "Cloudflare 프로젝트에 Workers AI 바인딩이 아직 연결되지 않았습니다."
    }, { status: 503, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "INVALID_JSON", message: "요청 내용을 읽을 수 없습니다." }, { status: 400, headers });
  }

  if (env.ZEP_AI_ACCESS_CODE && !(await safeEqual(String(body.accessCode || ""), String(env.ZEP_AI_ACCESS_CODE)))) {
    return Response.json({ ok: false, code: "ACCESS_DENIED", message: "AI 생성 관리자 코드가 올바르지 않습니다." }, { status: 401, headers });
  }

  const kind = body.kind === "object" ? "object" : "map";
  const prompt = String(body.prompt || "").trim().slice(0, 700);
  const scene = String(body.scene || "custom").trim().slice(0, 40);
  const season = String(body.season || "bright-day").trim().slice(0, 40);
  const view = String(body.view || "topdown").trim().slice(0, 30);
  const direction = String(body.direction || "auto").trim().slice(0, 30);
  const mapMode = body.mapMode === "layered" ? "layered" : "quality";
  if (prompt.length < 3) {
    return Response.json({ ok: false, code: "PROMPT_REQUIRED", message: "만들고 싶은 장면을 세 글자 이상 적어 주세요." }, { status: 400, headers });
  }

  try {
    if (kind === "map" && mapMode === "layered") {
      const contextText = `${prompt} ${scene}`;
      const indoor = /내부|실내|연구실|실험실|교실|과학실|도서관|laboratory|classroom|interior|indoor|library|lab\b/i.test(contextText);
      const spaceType = /도서관|library/i.test(contextText) ? "library" : /교실|classroom/i.test(contextText) && !/과학|생명|실험|lab/i.test(contextText) ? "classroom" : indoor ? "laboratory" : "campus";
      const plan = await generateLayerPlan(env.AI, { prompt, scene, season, view, direction, environment: indoor ? "indoor" : "outdoor", spaceType });
      return Response.json({ ok: true, kind, type: "layered-map", plan, model: PLAN_MODEL }, { headers });
    }
    const finalPrompt = buildPrompt({ kind, prompt, scene, season, view, direction });
    const result = await env.AI.run(MODEL, { prompt: finalPrompt, steps: 4 });
    const image = await normalizeImage(result);
    if (!image) throw new Error("EMPTY_IMAGE");
    return Response.json({ ok: true, image, kind, model: MODEL }, { headers });
  } catch (error) {
    const message = String(error?.message || error || "");
    const quota = /quota|limit|capacity|neurons|3040|429/i.test(message);
    return Response.json({
      ok: false,
      code: quota ? "AI_QUOTA_EXCEEDED" : "AI_GENERATION_FAILED",
      message: quota ? "오늘의 무료 AI 생성 한도에 도달했거나 모델이 잠시 혼잡합니다." : "이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
    }, { status: quota ? 429 : 502, headers });
  }
}

async function generateLayerPlan(ai, request) {
  const allowedIndoorObjects = request.spaceType === "library" ? "bookshelf, student-table, teacher-desk, plant" : request.spaceType === "classroom" ? "teacher-desk, student-table, bookshelf, plant" : "lab-bench, sink-bench, growth-chamber, specimen-cabinet, dna-machine, incubator, chemical-cabinet, bookshelf, teacher-desk, student-table, plant, safety-station";
  const indoorGuide = request.environment === "indoor"
    ? `This is an INDOOR ${request.spaceType} map. Set environment to indoor and spaceType to ${request.spaceType}. Do not create grass, outdoor roads, ponds, outdoor trees, or exterior buildings. Keep buildings, trees, waters, and paths as empty arrays. Create 8-14 furniture objects using only these types: ${allowedIndoorObjects}. Arrange clear walkable aisles and represent every concrete noun in the user's request when an allowed matching asset exists.`
    : "This is an OUTDOOR map. Set environment to outdoor. Use 2-4 buildings, 2-5 paths, 0-2 waters, 5-14 trees, and 3-10 small objects. Outdoor object type must be bench, flower, rock, sign, lamp, or bush.";
  const result = await ai.run(PLAN_MODEL, {
    messages: [
      { role: "system", content: `You design playable ZEP-style school RPG maps. Return JSON only, without markdown. All x,y,w,h,size,width values are percentages from 0 to 100. Keep every shape inside the map and preserve walkable space. ${indoorGuide} Buildings belong to the top layer, trees and furniture belong to the object layer, and terrain belongs to the floor layer. Use this exact structure: {\"environment\":\"${request.environment}\",\"spaceType\":\"${request.spaceType}\",\"name\":\"map name\",\"palette\":{\"ground\":\"#79ad58\",\"path\":\"#d7bd7b\",\"water\":\"#58a9c7\",\"roof\":\"#b9564d\",\"wall\":\"#e5c78f\",\"tree\":\"#397a46\",\"accent\":\"#f1d36b\"},\"paths\":[],\"waters\":[],\"buildings\":[],\"trees\":[],\"objects\":[{\"type\":\"student-table\",\"x\":50,\"y\":55,\"size\":8}]}` },
      { role: "user", content: `Create a map plan. Request: ${request.prompt}. Scene: ${request.scene}. Season: ${request.season}. View: ${request.view}. Direction: ${request.direction}.` }
    ],
    response_format: { type: "json_object" },
    max_tokens: 1800,
    temperature: 0.65
  });
  const raw = result?.response ?? result;
  const plan = typeof raw === "string" ? JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) : raw;
  if (!plan || !Array.isArray(plan.buildings) || !Array.isArray(plan.trees)) throw new Error("INVALID_LAYER_PLAN");
  return plan;
}

function buildPrompt({ kind, prompt, scene, season, view, direction }) {
  const scenes = {
    school: "a Korean school campus with classrooms, gym, athletic field, garden and connected walking paths",
    forest: "an ecology park with forest trails, stream, pond, meadow and observation areas",
    classroom: "a creative school interior with classrooms, science lab, library and hallways",
    village: "a friendly walkable village with plaza, small shops, houses, park and branching paths",
    laboratory: "a playful science research facility with laboratories, greenhouse and exhibit rooms",
    fantasy: "an original fantasy village with gardens, bridges, ruins and winding paths",
    custom: "the environment described by the user"
  };
  const moods = {
    "bright-day": "bright clear daytime",
    spring: "fresh spring with blossoms",
    summer: "lush green summer",
    autumn: "warm colorful autumn",
    winter: "gentle snowy winter",
    night: "cozy moonlit night with readable paths"
  };
  const views = {
    topdown: "true 90-degree overhead orthographic view looking straight down, flat square tile grid",
    diagonal: "high diagonal three-quarter top-down view, about 55 degrees above the ground, square-grid RPG perspective",
    isometric: "classic 2:1 isometric orthographic view with 30-degree diamond-grid axes, no vanishing point",
    oblique: "lower elevated oblique RPG view, about 35 degrees above the ground, showing fronts and roofs clearly"
  };
  const mapDirections = {
    auto: "choose the clearest orientation for the layout",
    south: "orient the main entrance toward the bottom center of the image",
    southwest: "orient the main entrance toward the lower-left corner",
    southeast: "orient the main entrance toward the lower-right corner"
  };
  const objectDirections = {
    auto: "choose the most recognizable facing direction",
    front: "show the front face toward the viewer",
    "front-left": "show the front and left side equally",
    "front-right": "show the front and right side equally",
    left: "show the left side profile",
    right: "show the right side profile",
    back: "show the rear face away from the viewer"
  };
  const common = "Original artwork only. No text, no letters, no numbers, no logos, no watermark, no characters, no UI frame.";
  if (kind === "object") {
    return [
      "Create one isolated game object for a ZEP-style map asset.",
      `Object requested by the user: ${prompt}.`,
      `Camera geometry: ${views[view] || views.topdown}. Facing direction: ${objectDirections[direction] || objectDirections.auto}.`,
      "Centered original pixel-art game asset, complete object fully visible, crisp edges, consistent game sprite lighting. The geometry and camera angle must strictly match the requested view so it can be placed on a map generated with the same view setting.",
      "Place the object on a flat, perfectly uniform vivid magenta background (#ff00ff), with no floor, no scenery, no border and minimal shadow so the background can be removed automatically.",
      moods[season] || moods["bright-day"], common
    ].join(" ");
  }
  const indoorRequest = /내부|실내|연구실|실험실|과학실|교실|도서관|laboratory|classroom|interior|indoor|library|lab\b/i.test(`${prompt} ${scene}`);
  const environmentRules = indoorRequest
    ? "This is strictly an indoor room map, not a campus exterior. Show one coherent enclosed room from wall to wall. Put windows only in the perimeter wall, never floating over furniture. Arrange laboratory benches, sinks, microscopes, storage cabinets and safety equipment on one consistent tile grid, with matching scale and camera angle and wide walkable aisles. Do not show grass, outdoor paths, exterior buildings, sky, gardens or duplicate rooms."
    : "This is an outdoor environment map. Keep every structure, path and prop on one consistent tile grid with plausible spacing and clear walkable routes.";
  return [
    "Create a complete map background for a ZEP-style 2D social game.",
    scenes[scene] || scenes.custom,
    `User request: ${prompt}.`,
    `Camera geometry: ${views[view] || views.topdown}. Orientation: ${mapDirections[direction] || mapDirections.auto}.`,
    environmentRules,
    "Coherent 32-pixel tile grid matching the requested camera geometry, clear walkable paths, readable building footprints, consistent scale, clean boundaries, no perspective horizon, no cutaway layers.",
    "Keep important structures away from the outermost edge. Make the whole composition useful as a playable map rather than a poster.",
    moods[season] || moods["bright-day"], common
  ].join(" ");
}

async function normalizeImage(result) {
  if (result?.image) return `data:image/jpeg;base64,${result.image}`;
  if (result instanceof Response) {
    const type = result.headers.get("Content-Type") || "image/jpeg";
    const bytes = new Uint8Array(await result.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:${type};base64,${btoa(binary)}`;
  }
  return "";
}

async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b))
  ]);
  const av = new Uint8Array(ah), bv = new Uint8Array(bh);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}
