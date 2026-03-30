import type { Weights } from "../types";

// Vite dev server proxies /comfy/* → localhost:8188 (vite.config.ts)
// In production (GitHub Pages), /comfy/* is unreachable → isAvailable() returns false → fallback
const COMFY_URL = "/comfy";
const CHECKPOINT       = "ziovXLScifi_v10.safetensors";
const CONTROLNET_CANNY = "controlnet-union-sdxl-promax.safetensors";

/**
 * ComfyUI (localhost:8188) を使ってウェイトベースの機体画像を生成する。
 * ComfyUI が起動していない場合は null を返す (手続き型描画へフォールバック)。
 */
export class ShipImageGenerator {
  static async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** ウェイトから機体画像を生成して Blob URL を返す。失敗時は null。
   *  baseBlob: 前ステージの機体画像。img2img でベース画像として使用し「進化」を表現する。
   */
  static async generate(weights: Weights, baseBlob?: Blob | null): Promise<string | null> {
    try {
      const clientId = crypto.randomUUID();

      // ベース画像があれば ComfyUI にアップロードして img2img を試みる
      let baseImageName: string | null = null;
      if (baseBlob) {
        baseImageName = await uploadBaseImage(baseBlob);
        console.log("[ShipImageGenerator] Base image uploaded:", baseImageName);
      }

      const workflow = buildWorkflow(weights, clientId, baseImageName);
      console.log("[ShipImageGenerator] Submitting", baseImageName ? "img2img" : "txt2img", "workflow");

      // ① ワークフローをキュー投入
      const queueRes = await fetch(`${COMFY_URL}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!queueRes.ok) {
        console.warn("[ShipImageGenerator] Queue submit failed:", queueRes.status);
        return null;
      }

      const { prompt_id } = (await queueRes.json()) as { prompt_id: string };
      console.log("[ShipImageGenerator] Job queued:", prompt_id);

      // ② 完了をポーリング (最大 120 秒)
      const result = await pollResult(prompt_id);
      console.log("[ShipImageGenerator] Result:", result ? "success" : "null");
      return result;
    } catch (e) {
      console.error("[ShipImageGenerator] Error:", e);
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────
//  ヘルパー
// ─────────────────────────────────────────────────────────

/** ベース画像を ComfyUI にアップロードしてファイル名を返す。失敗時は null。 */
async function uploadBaseImage(blob: Blob): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("image", blob, "base_ship.png");
    form.append("overwrite", "true");
    const res = await fetch(`${COMFY_URL}/upload/image`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn("[ShipImageGenerator] Upload failed:", res.status);
      return null;
    }
    const json = (await res.json()) as { name: string; subfolder?: string };
    return json.subfolder ? `${json.subfolder}/${json.name}` : json.name;
  } catch (e) {
    console.warn("[ShipImageGenerator] Upload error:", e);
    return null;
  }
}

async function pollResult(promptId: string): Promise<string | null> {
  const DEADLINE = Date.now() + 120_000;
  while (Date.now() < DEADLINE) {
    await sleep(1500);
    try {
      const res = await fetch(`${COMFY_URL}/history/${promptId}`,
        { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;

      const history = (await res.json()) as Record<string, ComfyHistory>;
      const entry   = history[promptId];
      if (!entry) continue; // まだキューに入っている

      // エラーで終了した場合は即座に中断
      if (entry.status?.status_str === "error") {
        console.warn("[ShipImageGenerator] ComfyUI job failed:", promptId);
        return null;
      }
      if (!entry.status?.completed) continue;

      // 出力ノードから最初の画像を取得
      for (const nodeOut of Object.values(entry.outputs)) {
        const img = nodeOut.images?.[0];
        if (!img) continue;
        const url = `${COMFY_URL}/view?filename=${encodeURIComponent(img.filename)}`
                  + `&subfolder=${encodeURIComponent(img.subfolder)}`
                  + `&type=${encodeURIComponent(img.type)}`;
        const blob = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).blob();
        const transparent = await removeBackground(blob);
        return URL.createObjectURL(transparent);
      }
    } catch {
      // continue polling
    }
  }
  console.warn("[ShipImageGenerator] Timed out waiting for job:", promptId);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 黒背景をCanvas経由で透過に変換して新しいBlobを返す */
async function removeBackground(blob: Blob): Promise<Blob> {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width  = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const w = canvas.width, h = canvas.height;

  // 画像端から連続する明るいピクセルのみを透過（フラッドフィル）
  // 中央の機体白部分は除去しない
  const visited = new Uint8Array(w * h);
  const queue: number[] = [];

  // 純白 or 純黒に近いピクセルを背景と判定（フラッドフィルなので機体内部は保護される）
  const isBg = (idx: number) => {
    const r = px[idx], g = px[idx + 1], b = px[idx + 2];
    const brightness = (r + g + b) / 3;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    return (brightness > 245 && saturation < 15)   // 白背景
        || (brightness < 18  && saturation < 12);  // 黒背景
  };

  // 4辺のピクセルをシードとしてキューに追加
  for (let x = 0; x < w; x++) { queue.push(0 * w + x); queue.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { queue.push(y * w + 0); queue.push(y * w + (w - 1)); }

  while (queue.length > 0) {
    const pos = queue.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;
    const pidx = pos * 4;
    if (!isBg(pidx)) continue;
    px[pidx + 3] = 0; // 透過
    const x = pos % w, y = Math.floor(pos / w);
    if (x > 0)     queue.push(pos - 1);
    if (x < w - 1) queue.push(pos + 1);
    if (y > 0)     queue.push(pos - w);
    if (y < h - 1) queue.push(pos + w);
  }

  ctx.putImageData(data, 0, 0);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

// ─────────────────────────────────────────────────────────
//  プロンプト生成
// ─────────────────────────────────────────────────────────

function buildPositivePrompt(w: Weights, evolved = false): string {
  const { dodgeSide, burstTiming, moveSpeed } = w;

  const speed  = moveSpeed > 0.65
    ? "sleek fighter, thin fuselage, sharp swept wings"
    : moveSpeed < 0.35
    ? "heavy cruiser, thick armor, wide body"
    : "balanced fighter craft";

  const weapon = burstTiming > 0.65
    ? "multi-barrel gatling guns, spread cannons on wings, extra missile pods"
    : burstTiming < 0.35
    ? "single long railgun, precision sniper barrel, targeting sensors"
    : "twin forward cannons";

  const wing   = dodgeSide > 0.65
    ? "right wing larger than left, asymmetric design"
    : dodgeSide < 0.35
    ? "left wing larger than right, asymmetric design"
    : "symmetric delta wings";

  // 進化時のみ追加する「強化・部品増加」プロンプト
  const evolutionParts = evolved ? [
    "(heavily upgraded warship:1.4), (additional armor plating:1.3)",
    "(extra weapon hardpoints:1.3), (bolted-on booster pods:1.2)",
    "(reinforced hull panels:1.2), (additional thruster nozzles:1.2)",
    "battle-scarred, modified, overbuilt, more complex than before",
  ] : [];

  // 視点語を最前に並べることでモデルの視点バイアスを強制
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
    ...evolutionParts,
  ].join(", ");
}

function buildNegativePrompt(): string {
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

// ─────────────────────────────────────────────────────────
//  ComfyUI ワークフロー (animagine-xl-4.0 / SDXL)
// ─────────────────────────────────────────────────────────

function buildWorkflow(weights: Weights, _clientId: string, baseImageName: string | null): object {
  const seed = Math.floor(Math.random() * 2 ** 32);

  if (baseImageName) {
    // ── img2img + ControlNet Canny: 前ステージの輪郭を保持しながら進化を表現 ──
    // ノード構成:
    //   1  CheckpointLoaderSimple
    //   2  CLIPTextEncode (positive)
    //   3  CLIPTextEncode (negative)
    //   4  LoadImage (ベース画像)
    //   4b CannyEdgePreprocessor (翼・機体輪郭を抽出)
    //   4c ControlNetLoader
    //   4d ControlNetApplyAdvanced (positive/negativeに適用)
    //   4e VAEEncode (img2img 用 latent)
    //   5  KSampler
    //   6  VAEDecode
    //   7  SaveImage
    return {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: CHECKPOINT },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { clip: ["1", 1], text: buildPositivePrompt(weights, true) },
      },
      "3": {
        class_type: "CLIPTextEncode",
        inputs: { clip: ["1", 1], text: buildNegativePrompt() },
      },
      "4": {
        class_type: "LoadImage",
        inputs: { image: baseImageName },
      },
      // Canny エッジ抽出（翼・機体の輪郭線を ControlNet に渡す）
      "4b": {
        class_type: "CannyEdgePreprocessor",
        inputs: {
          image:      ["4", 0],
          low_threshold:  100,
          high_threshold: 200,
          resolution:    1024,
        },
      },
      "4c": {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: CONTROLNET_CANNY },
      },
      // ControlNet を positive/negative conditioning 両方に適用
      // strength 0.7: 輪郭を強く保持しつつプロンプトによる追加パーツの余地を残す
      // end_percent 0.75: 後半 25% ステップは自由生成（追加部品が自然に馴染む）
      "4d": {
        class_type: "ControlNetApplyAdvanced",
        inputs: {
          positive:         ["2", 0],
          negative:         ["3", 0],
          control_net:      ["4c", 0],
          image:            ["4b", 0],
          strength:         0.7,
          start_percent:    0.0,
          end_percent:      0.75,
        },
      },
      "4e": {
        class_type: "VAEEncode",
        inputs: { pixels: ["4", 0], vae: ["1", 2] },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          model:        ["1", 0],
          positive:     ["4d", 0],
          negative:     ["4d", 1],
          latent_image: ["4e", 0],
          seed,
          steps:        30,
          cfg:          7,
          sampler_name: "dpmpp_2m_sde",
          scheduler:    "karras",
          denoise:      0.80,
        },
      },
      "6": {
        class_type: "VAEDecode",
        inputs: { samples: ["5", 0], vae: ["1", 2] },
      },
      "7": {
        class_type: "SaveImage",
        inputs: { images: ["6", 0], filename_prefix: "hero_ship" },
      },
    };
  }

  // ── txt2img: ベース画像なし (初回生成) ──
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: CHECKPOINT },
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["1", 1], text: buildPositivePrompt(weights) },
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["1", 1], text: buildNegativePrompt() },
    },
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width: 1024, height: 1024, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model:        ["1", 0],
        positive:     ["2", 0],
        negative:     ["3", 0],
        latent_image: ["4", 0],
        seed,
        steps:        30,
        cfg:          7,
        sampler_name: "dpmpp_2m_sde",
        scheduler:    "karras",
        denoise:      1,
      },
    },
    "6": {
      class_type: "VAEDecode",
      inputs: { samples: ["5", 0], vae: ["1", 2] },
    },
    "7": {
      class_type: "SaveImage",
      inputs: { images: ["6", 0], filename_prefix: "hero_ship" },
    },
  };
}

// ─────────────────────────────────────────────────────────
//  型
// ─────────────────────────────────────────────────────────

interface ComfyHistory {
  status: { completed: boolean; status_str?: string };
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
}
