const MODEL = "@cf/black-forest-labs/flux-1-schnell";

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
      model: MODEL
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
  if (prompt.length < 3) {
    return Response.json({ ok: false, code: "PROMPT_REQUIRED", message: "만들고 싶은 장면을 세 글자 이상 적어 주세요." }, { status: 400, headers });
  }

  const finalPrompt = buildPrompt({ kind, prompt, scene, season });
  try {
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

function buildPrompt({ kind, prompt, scene, season }) {
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
  const common = "Original artwork only. No text, no letters, no numbers, no logos, no watermark, no characters, no UI frame.";
  if (kind === "object") {
    return [
      "Create one isolated game object for a ZEP-style map asset.",
      `Object requested by the user: ${prompt}.`,
      "Strict top-down or three-quarter top-down pixel art, centered, complete object fully visible, crisp edges, consistent game sprite lighting.",
      "Place the object on a flat, perfectly uniform vivid magenta background (#ff00ff), with no floor, no scenery, no border and minimal shadow so the background can be removed automatically.",
      moods[season] || moods["bright-day"], common
    ].join(" ");
  }
  return [
    "Create a complete map background for a ZEP-style 2D social game.",
    scenes[scene] || scenes.custom,
    `User request: ${prompt}.`,
    "Strict orthographic top-down pixel art, coherent 32-pixel tile grid, clear walkable paths, readable building footprints, consistent scale, clean boundaries, no perspective horizon, no cutaway layers.",
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
