/**
 * AI機体生成テストスクリプト
 * ゲームを起動せずに ComfyUI の img2img + ControlNet Canny ワークフローをテストする。
 * ベース画像: public/hero_default.png (赤い機体)
 *
 * 使い方: node scripts/test-ai-generation.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMFY_URL  = "http://localhost:8188";
const CHECKPOINT = "ziovXLScifi_v10.safetensors";
const CONTROLNET = "controlnet-union-sdxl-promax.safetensors";
const OUTPUT_DIR = path.join(__dirname, "../test-output");

// テスト用ウェイト: シールド・装甲強化（重装甲・近接・低速）
const TEST_WEIGHTS = {
  dodgeSide:     0.5,   // 左右対称
  burstTiming:   0.2,   // 精密型 → 単発砲
  preferredDist: 0.1,   // 超近接 → 分厚い装甲
  moveSpeed:     0.05,  // 最低速 → 重装甲クルーザー・ワイドボディ
};

// ─────────────────────────────────────────────────────────
//  メイン
// ─────────────────────────────────────────────────────────
async function main() {
  console.log("=== AI機体生成テスト ===\n");

  // 出力ディレクトリ作成
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ComfyUI 起動確認
  console.log("[1/5] ComfyUI 接続確認...");
  const alive = await checkComfyUI();
  if (!alive) {
    console.error("❌ ComfyUI が起動していません (localhost:8188)");
    process.exit(1);
  }
  console.log("✅ ComfyUI 接続OK\n");

  // ベース画像 (hero_default.png) を 1024×1024 に変換
  console.log("[2/5] ベース画像 (hero_default.png) を準備...");
  const heroPath = path.join(__dirname, "../public/hero_default.png");
  const baseBlob = await prepareBaseImage(heroPath);
  const baseSavePath = path.join(OUTPUT_DIR, "base_input.png");
  fs.writeFileSync(baseSavePath, Buffer.from(await baseBlob.arrayBuffer()));
  console.log(`✅ ベース画像保存: ${baseSavePath} (${(baseBlob.size / 1024).toFixed(0)} KB)\n`);

  // ComfyUI にアップロード
  console.log("[3/5] ベース画像をアップロード...");
  const baseImageName = await uploadBaseImage(baseBlob);
  if (!baseImageName) {
    console.error("❌ アップロード失敗");
    process.exit(1);
  }
  console.log(`✅ アップロード完了: ${baseImageName}\n`);

  // ワークフロー投入
  console.log("[4/5] img2img + ControlNet Canny ワークフロー投入...");
  console.log("  ウェイト:", TEST_WEIGHTS);
  const clientId = crypto.randomUUID();
  const workflow = buildWorkflow(TEST_WEIGHTS, baseImageName);

  const queueRes = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: AbortSignal.timeout(8000),
  });

  if (!queueRes.ok) {
    const text = await queueRes.text();
    console.error(`❌ キュー投入失敗 (${queueRes.status}):`, text);
    process.exit(1);
  }

  const { prompt_id } = await queueRes.json();
  console.log(`✅ ジョブキュー投入: ${prompt_id}\n`);

  // ポーリングで完了待ち
  console.log("[5/5] 生成完了を待機中 (最大120秒)...");
  const imageBuffer = await pollAndDownload(prompt_id);
  if (!imageBuffer) {
    console.error("❌ 生成失敗またはタイムアウト");
    process.exit(1);
  }

  // 背景除去
  console.log("  背景除去中...");
  const transparent = await removeBackground(imageBuffer);

  // 保存
  const timestamp  = new Date().toISOString().replace(/[:.]/g, "-");
  const rawPath    = path.join(OUTPUT_DIR, `result_raw_${timestamp}.png`);
  const finalPath  = path.join(OUTPUT_DIR, `result_transparent_${timestamp}.png`);
  fs.writeFileSync(rawPath,   imageBuffer);
  fs.writeFileSync(finalPath, transparent);

  console.log(`\n✅ 生成成功!`);
  console.log(`  生成画像 (背景あり): ${rawPath}`);
  console.log(`  生成画像 (透過):     ${finalPath}`);
}

// ─────────────────────────────────────────────────────────
//  ヘルパー
// ─────────────────────────────────────────────────────────

async function checkComfyUI() {
  try {
    const res = await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

/** hero_default.png を白背景 1024×1024 の Blob に変換（機体を70%サイズで中央配置）*/
async function prepareBaseImage(imagePath) {
  const meta = await sharp(imagePath).metadata();
  const sc   = Math.min(716 / meta.width, 716 / meta.height);
  const dw   = Math.round(meta.width  * sc);
  const dh   = Math.round(meta.height * sc);
  const left = Math.round((1024 - dw) / 2);
  const top  = Math.round((1024 - dh) / 2);

  const buf = await sharp(imagePath)
    .resize(dw, dh)
    .toFormat("png")
    .toBuffer();

  const composed = await sharp({
    create: { width: 1024, height: 1024, channels: 4,
              background: { r: 255, g: 255, b: 255, alpha: 255 } },
  })
    .composite([{ input: buf, left, top }])
    .png()
    .toBuffer();

  return new Blob([composed], { type: "image/png" });
}

async function uploadBaseImage(blob) {
  const form = new FormData();
  form.append("image", blob, "base_ship.png");
  form.append("overwrite", "true");
  const res = await fetch(`${COMFY_URL}/upload/image`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) { console.error("upload status:", res.status, await res.text()); return null; }
  const json = await res.json();
  return json.subfolder ? `${json.subfolder}/${json.name}` : json.name;
}

async function pollAndDownload(promptId) {
  const DEADLINE = Date.now() + 120_000;
  while (Date.now() < DEADLINE) {
    await sleep(2000);
    process.stdout.write(".");
    try {
      const res = await fetch(`${COMFY_URL}/history/${promptId}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const history = await res.json();
      const entry   = history[promptId];
      if (!entry) continue;

      if (entry.status?.status_str === "error") {
        console.error("\n❌ ComfyUI ジョブがエラーで終了しました");
        console.error("  詳細:", JSON.stringify(entry.status, null, 2));
        return null;
      }
      if (!entry.status?.completed) continue;

      for (const nodeOut of Object.values(entry.outputs)) {
        const img = nodeOut.images?.[0];
        if (!img) continue;
        const url = `${COMFY_URL}/view?filename=${encodeURIComponent(img.filename)}`
                  + `&subfolder=${encodeURIComponent(img.subfolder)}`
                  + `&type=${encodeURIComponent(img.type)}`;
        console.log(`\n  画像取得: ${url}`);
        const imgRes = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        return Buffer.from(await imgRes.arrayBuffer());
      }
    } catch (e) { /* continue */ }
  }
  console.log();
  return null;
}

/** 黒・白背景をフラッドフィルで透過化 */
async function removeBackground(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const px = data;
  const w  = info.width, h = info.height;
  const visited = new Uint8Array(w * h);
  const queue   = [];

  const isBg = (idx) => {
    const r = px[idx], g = px[idx+1], b = px[idx+2];
    const brightness  = (r + g + b) / 3;
    const saturation  = Math.max(r, g, b) - Math.min(r, g, b);
    return (brightness > 245 && saturation < 15)
        || (brightness < 18  && saturation < 12);
  };

  for (let x = 0; x < w; x++) { queue.push(x); queue.push((h-1)*w + x); }
  for (let y = 0; y < h; y++) { queue.push(y*w); queue.push(y*w + (w-1)); }

  while (queue.length > 0) {
    const pos = queue.pop();
    if (visited[pos]) continue;
    visited[pos] = 1;
    const pidx = pos * 4;
    if (!isBg(pidx)) continue;
    px[pidx + 3] = 0;
    const x = pos % w, y = Math.floor(pos / w);
    if (x > 0)     queue.push(pos - 1);
    if (x < w - 1) queue.push(pos + 1);
    if (y > 0)     queue.push(pos - w);
    if (y < h < 1) queue.push(pos + w);
  }

  return sharp(Buffer.from(px), { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─────────────────────────────────────────────────────────
//  プロンプト
// ─────────────────────────────────────────────────────────
function buildPositivePrompt(w) {
  const { dodgeSide, burstTiming, moveSpeed } = w;
  const speed  = moveSpeed   > 0.65 ? "sleek fighter, thin fuselage, sharp swept wings"
               : moveSpeed   < 0.35 ? "heavy cruiser, thick armor, wide body"
               :                       "balanced fighter craft";
  const weapon = burstTiming > 0.65 ? "multi-barrel gatling guns, spread cannons on wings, extra missile pods"
               : burstTiming < 0.35 ? "single long railgun, precision sniper barrel, targeting sensors"
               :                       "twin forward cannons";
  const wing   = dodgeSide   > 0.65 ? "right wing larger than left, asymmetric design"
               : dodgeSide   < 0.35 ? "left wing larger than right, asymmetric design"
               :                       "symmetric delta wings";
  return [
    "2d top down, overhead view, top-down view, view from directly above",
    "masterpiece, best quality, highres",
    "no_humans, spacecraft, mecha, science_fiction, top-down_view, from_above",
    "game_sprite, simple_background, white_background, single_object",
    "(nose pointing up:1.6), (engine exhaust at bottom:1.5)",
    "(large spacecraft filling the frame:1.5), (zoomed in, close-up:1.4)",
    "(wide swept wings must be preserved:1.5), (keep both wings intact:1.4)",
    "metallic hull, glowing engine, mechanical_detail, plasma_thruster",
    speed, weapon, wing,
    "(heavily upgraded warship:1.4), (additional armor plating:1.3)",
    "(extra weapon hardpoints:1.3), (bolted-on booster pods:1.2)",
    "(reinforced hull panels:1.2), (additional thruster nozzles:1.2)",
    "battle-scarred, modified, overbuilt, more complex than before",
  ].join(", ");
}

function buildNegativePrompt() {
  return [
    "worst quality, low quality, blurry, watermark, text, signature",
    "human, person, face, body, 1girl, 1boy, character",
    "side view, front view, isometric, 3/4 view, perspective view, dutch angle, low angle",
    "diagonal, tilted, angled, foreshortening, vanishing point, depth of field",
    "background, scenery, landscape, space background, nebula, stars, planet, sky",
    "interior, corridor, hallway, room, tunnel, environment",
    "shadow, drop shadow, cast shadow, soft shadow, hard shadow",
    "border, frame, panel, dramatic lighting, cinematic, bokeh, glow effect",
    "small, tiny, distant, far away, miniature, shrunk, zoomed out, wide shot",
    "no wings, missing wings, broken wings, thin wings, narrow wings, stub wings",
  ].join(", ");
}

function buildWorkflow(weights, baseImageName) {
  const seed = Math.floor(Math.random() * 2 ** 32);
  return {
    "1":  { class_type: "CheckpointLoaderSimple",
            inputs: { ckpt_name: CHECKPOINT } },
    "2":  { class_type: "CLIPTextEncode",
            inputs: { clip: ["1",1], text: buildPositivePrompt(weights) } },
    "3":  { class_type: "CLIPTextEncode",
            inputs: { clip: ["1",1], text: buildNegativePrompt() } },
    "4":  { class_type: "LoadImage",
            inputs: { image: baseImageName } },
    "4b": { class_type: "CannyEdgePreprocessor",
            inputs: { image: ["4",0], low_threshold: 100, high_threshold: 200, resolution: 1024 } },
    "4c": { class_type: "ControlNetLoader",
            inputs: { control_net_name: CONTROLNET } },
    "4d": { class_type: "ControlNetApplyAdvanced",
            inputs: { positive: ["2",0], negative: ["3",0],
                      control_net: ["4c",0], image: ["4b",0],
                      strength: 0.45, start_percent: 0.0, end_percent: 0.65 } },
    "4e": { class_type: "VAEEncode",
            inputs: { pixels: ["4",0], vae: ["1",2] } },
    "5":  { class_type: "KSampler",
            inputs: { model: ["1",0], positive: ["4d",0], negative: ["4d",1],
                      latent_image: ["4e",0], seed, steps: 30, cfg: 7,
                      sampler_name: "dpmpp_2m_sde", scheduler: "karras", denoise: 0.90 } },
    "6":  { class_type: "VAEDecode",
            inputs: { samples: ["5",0], vae: ["1",2] } },
    "7":  { class_type: "SaveImage",
            inputs: { images: ["6",0], filename_prefix: "hero_ship_test" } },
  };
}

main().catch(e => { console.error(e); process.exit(1); });
