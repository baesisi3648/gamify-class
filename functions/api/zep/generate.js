const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const FALLBACK_MODEL = "@cf/black-forest-labs/flux-1-schnell";
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
      fallbackModel: FALLBACK_MODEL,
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
  const operation = body.operation === "split" ? "split" : "generate";
  if (prompt.length < 3) {
    return Response.json({ ok: false, code: "PROMPT_REQUIRED", message: "만들고 싶은 장면을 세 글자 이상 적어 주세요." }, { status: 400, headers });
  }

  try {
    if (kind === "map" && operation === "split") {
      const reference = String(body.reference || "");
      if (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(reference) || reference.length > 1600000) {
        return Response.json({ ok: false, code: "REFERENCE_REQUIRED", message: "레이어 분리에 사용할 기준 이미지를 읽을 수 없습니다." }, { status: 400, headers });
      }
      const layers = await generateSeparatedLayers(env.AI, reference, { prompt, scene, season, view, direction });
      return Response.json({ ok: true, kind, type: "ai-separated-layers", layers, model: MODEL }, { headers });
    }
    if (kind === "map" && mapMode === "layered") {
      const contextText = `${prompt} ${scene}`;
      const indoor = /내부|실내|연구실|실험실|교실|과학실|도서관|laboratory|classroom|interior|indoor|library|lab\b/i.test(contextText);
      const spaceType = /도서관|library/i.test(contextText) ? "library" : /교실|classroom/i.test(contextText) && !/과학|생명|실험|lab/i.test(contextText) ? "classroom" : indoor ? "laboratory" : "campus";
      const plan = await generateLayerPlan(env.AI, { prompt, scene, season, view, direction, environment: indoor ? "indoor" : "outdoor", spaceType });
      return Response.json({ ok: true, kind, type: "layered-map", plan, model: PLAN_MODEL }, { headers });
    }
    const indoor = kind === "map" && isIndoorRequest(`${prompt} ${scene}`);
    let architectureBrief = "";
    if (indoor) {
      try {
        architectureBrief = await generateIndoorArchitectureBrief(env.AI, { prompt, scene });
      } catch {
        architectureBrief = fallbackIndoorArchitectureBrief(prompt, scene);
      }
    }
    const finalPrompt = buildPrompt({ kind, prompt, scene, season, view, direction, architectureBrief });
    const generated = await generateImage(env.AI, finalPrompt);
    return Response.json({ ok: true, image: generated.image, kind, model: generated.model, degraded: generated.degraded, interpretedArchitecture: architectureBrief }, { headers });
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

async function generateSeparatedLayers(ai, reference, request) {
  const camera = `The canvas, crop, camera, perspective, scale and coordinates must exactly match reference image 0. Requested view: ${request.view}.`;
  const shared = `Reference image 0 is a finished ZEP-style game map for: ${request.prompt}. ${camera} Do not redesign, rotate, resize, move or duplicate anything. No text, labels, logos, characters or UI.`;
  const floorPrompt = `${shared} Create the BELOW-AVATAR BASE LAYER only. Keep the complete walkable floor and only the FAR/BACK walls located along the upper-left and upper-right edges of the isometric room. Keep windows and doors only on those two far/back walls. The bottom-left and bottom-right sides must remain completely OPEN with no near wall, front wall, rim, border, railing, curb, parapet, lip, dark band or raised edge. Remove all furniture, equipment, plants and props, then reconstruct the floor tiles underneath them. Never add a ceiling, roof, beam, floating wall, inner wall crossing the room, or impossible extra structure. Output a complete 1024x768 image with one structurally coherent open-front room.`;
  const topPrompt = `${shared} Create an EMPTY ABOVE-AVATAR FOREGROUND LAYER. The room has no near/front walls and no foreground structures. Output one perfectly uniform vivid magenta background #ff00ff with no shadows, shapes or objects.`;
  const [floor, top] = await Promise.all([
    generateReferenceImage(ai, floorPrompt, reference),
    generateReferenceImage(ai, topPrompt, reference)
  ]);
  return { floor, top };
}

async function generateReferenceImage(ai, prompt, reference) {
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", "1024");
  form.append("height", "768");
  form.append("guidance", "6");
  form.append("input_image_0", dataUrlToBlob(reference), "reference.jpg");
  const serialized = new Response(form);
  const result = await ai.run(MODEL, {
    multipart: {
      body: serialized.body,
      contentType: serialized.headers.get("content-type")
    }
  });
  const image = await normalizeImage(result);
  if (!image) throw new Error("EMPTY_LAYER_IMAGE");
  return image;
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = dataUrl.split(",", 2);
  const mime = header.match(/^data:([^;]+)/i)?.[1] || "image/jpeg";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function generateImage(ai, prompt) {
  try {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", "1024");
    form.append("height", "768");
    form.append("guidance", "7");
    const serialized = new Response(form);
    const result = await ai.run(MODEL, {
      multipart: {
        body: serialized.body,
        contentType: serialized.headers.get("content-type")
      }
    });
    const image = await normalizeImage(result);
    if (!image) throw new Error("EMPTY_QUALITY_IMAGE");
    return { image, model: MODEL, degraded: false };
  } catch (qualityError) {
    const result = await ai.run(FALLBACK_MODEL, { prompt, steps: 4 });
    const image = await normalizeImage(result);
    if (!image) throw qualityError;
    return { image, model: FALLBACK_MODEL, degraded: true };
  }
}

function isIndoorRequest(text) {
  return /내부|실내|연구실|실험실|과학실|교실|도서관|laboratory|classroom|interior|indoor|library|lab\b/i.test(String(text || ""));
}

async function generateIndoorArchitectureBrief(ai, request) {
  const result = await ai.run(PLAN_MODEL, {
    messages: [
      {
        role: "system",
        content: "Convert the user's room request into a concise architecture-only brief for an EMPTY, UNFURNISHED, open-front isometric game room. Preserve only explicitly requested room type, room shape, wall colors/materials, floor colors/materials/pattern, window count/style/placement, door count/style/placement, architectural lighting, and atmosphere. Exclude and never mention furniture, lab equipment, appliances, cabinets, shelves, desks, chairs, plants, decorations, signs, displays, specimens, or props. Do not invent details the user did not request. Return JSON only with this exact structure: {\"roomType\":\"\",\"shape\":\"\",\"walls\":\"\",\"floor\":\"\",\"windows\":\"\",\"doors\":\"\",\"lighting\":\"\",\"atmosphere\":\"\"}. Every value must be a short English phrase or an empty string."
      },
      {
        role: "user",
        content: `Room request: ${request.prompt}\nPreset: ${request.scene}`
      }
    ],
    response_format: { type: "json_object" },
    max_tokens: 500,
    temperature: 0.1
  });
  const raw = result?.response ?? result;
  const data = typeof raw === "string" ? JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "")) : raw;
  const labels = { roomType: "room type", shape: "room shape", walls: "wall finish", floor: "floor finish", windows: "windows", doors: "doors", lighting: "architectural lighting", atmosphere: "atmosphere" };
  const details = Object.entries(labels).map(([key, label]) => {
    const value = String(data?.[key] || "").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
    return value ? `${label}: ${value}` : "";
  }).filter(Boolean);
  return details.length ? details.join("; ") : fallbackIndoorArchitectureBrief(request.prompt, request.scene);
}

function fallbackIndoorArchitectureBrief(prompt, scene) {
  const text = `${prompt} ${scene}`;
  if (/도서관|library/i.test(text)) return "room type: empty school library shell; wall finish: warm neutral colors; floor finish: quiet warm-toned tile";
  if (/생명|과학|실험|연구|science|laboratory|lab\b/i.test(text)) return "room type: empty Korean school science classroom shell; wall finish: clean white and pale blue; floor finish: light laboratory-grade tile";
  return "room type: empty Korean school classroom shell; wall finish: calm neutral colors; floor finish: clean light tile";
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

function buildPrompt({ kind, prompt, scene, season, view, direction, architectureBrief = "" }) {
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
  const indoorRequest = isIndoorRequest(`${prompt} ${scene}`);
  const indoorPurpose = /도서관|library/i.test(`${prompt} ${scene}`)
    ? "an empty unfurnished school library room shell"
    : /생명|과학|실험|연구|science|laboratory|lab\b/i.test(`${prompt} ${scene}`)
      ? "an empty unfurnished Korean school science classroom shell"
      : "an empty unfurnished Korean school classroom shell";
  if (indoorRequest) {
    return [
      "Create a completely EMPTY and UNFURNISHED open-front room shell for a ZEP-style 2D social game.",
      `Room identity: ${indoorPurpose}. This identity controls only wall colors and architectural finishes, never room contents.`,
      architectureBrief ? `MANDATORY USER ARCHITECTURE: ${architectureBrief}. Every non-empty detail in this brief is required and overrides all defaults. Follow exact colors, materials, patterns, counts and wall placements without adding any objects.` : "",
      `Camera geometry: ${views[view] || views.topdown}. Orientation: ${mapDirections[direction] || mapDirections.auto}.`,
      "The ONLY visible components are one continuous clean tiled floor and exactly two continuous full-height BACK walls: one along the upper-left edge and one along the upper-right edge.",
      "The two back walls must meet perfectly at one clean central back corner. Both walls must remain structurally continuous from the outer end to that shared corner, with no broken section, black void, missing panel, detached fragment, notch or unexplained opening.",
      "Windows and framed doors may be embedded neatly within the two back walls, but may never interrupt their top trim, base trim, shared corner or structural continuity.",
      "The bottom-left and bottom-right edges facing the viewer are completely OPEN. The floor tiles continue cleanly to those open edges. There is no front wall, near wall, outer wall face, rim, border, railing, curb, parapet, lip, threshold or dark raised band.",
      "No furniture and no freestanding objects of any kind: no laboratory benches, sinks, microscopes, cabinets, shelves, appliances, tables, chairs, plants, equipment, decorations, signs, displays, props or loose items.",
      "No ceiling, roof, overhead frame, beam, interior partition, diagonal wall, doubled wall, floating structure, exterior scenery, grass, path, sky, collage, sprite sheet or duplicate room.",
      "Professional polished 2D pixel-art game environment foundation, cohesive lighting, consistent scale, clean isometric geometry and coherent tile alignment, with no perspective horizon.",
      moods[season] || moods["bright-day"], common,
      architectureBrief ? `FINAL CHECK: visibly apply all of these mandatory architectural details: ${architectureBrief}. Keep the room empty, with two intact back walls, zero front walls, zero furniture and zero objects.` : "FINAL CHECK: empty floor, two intact back walls, zero front walls, zero furniture, zero objects."
    ].join(" ");
  }
  const environmentRules = "This is an EMPTY outdoor environment foundation map. Keep only terrain, paths, water and permanent building architecture on one consistent tile grid with plausible spacing and clear walkable routes. ABSOLUTELY NO trees, plants, benches, signs, lamps, rocks, vehicles, furniture, decorations, equipment, props or other freestanding objects, even if the user mentions them.";
  return [
    "Create a complete map background for a ZEP-style 2D social game.",
    scenes[scene] || scenes.custom,
    `User request: ${prompt}.`,
    `Camera geometry: ${views[view] || views.topdown}. Orientation: ${mapDirections[direction] || mapDirections.auto}.`,
    environmentRules,
    "Professional polished 2D pixel-art game environment foundation with cohesive art direction, deliberate lighting, harmonious color palette and hand-crafted ZEP map quality. Keep the space empty so separately created objects can be added later. Coherent 32-pixel tile grid matching the requested camera geometry, clear walkable paths, readable footprints, consistent scale, clean boundaries, no perspective horizon, no collage and no mismatched sprite angles.",
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
