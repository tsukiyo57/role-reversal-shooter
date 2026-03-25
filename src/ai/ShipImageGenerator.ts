import type { Weights } from "../types";

// Vite dev server proxies /comfy/* → localhost:8188 (vite.config.ts)
// In production (GitHub Pages), /comfy/* is unreachable → isAvailable() returns false → fallback
const COMFY_URL = "/comfy";
const CHECKPOINT = "animagine-xl-4.0.safetensors";

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
   *  baseBlob: 手続き型描画のキャプチャ。img2img で視点を固定するために使う。
   */
  static async generate(weights: Weights, baseBlob?: Blob | null): Promise<string | null> {
    try {
      const clientId = crypto.randomUUID();

      // ベース画像をアップロードしてimg2imgのファイル名を取得
      let baseImageName: string | null = null;
      if (baseBlob) {
        try {
          const form = new FormData();
          form.append("image", baseBlob, "base_ship.png");
          const up = await fetch(`${COMFY_URL}/upload/image`, {
            method: "POST", body: form,
            signal: AbortSignal.timeout(8000),
          });
          if (up.ok) {
            const json = (await up.json()) as { name: string };
            baseImageName = json.name;
            console.log("[ShipImageGenerator] Uploaded base image:", baseImageName);
          }
        } catch {
          console.warn("[ShipImageGenerator] Failed to upload base image, falling back to txt2img");
        }
      }

      const workflow = buildWorkflow(weights, clientId, baseImageName);
      console.log("[ShipImageGenerator] Submitting workflow, img2img:", !!baseImageName);

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

  const isBright = (idx: number) => {
    const r = px[idx], g = px[idx + 1], b = px[idx + 2];
    // 彩度が低く明るいピクセルのみ背景と判定（色のついた機体部分を保護）
    const brightness = (r + g + b) / 3;
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    return brightness > 230 && saturation < 20;
  };

  // 4辺のピクセルをシードとしてキューに追加
  for (let x = 0; x < w; x++) { queue.push(0 * w + x); queue.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { queue.push(y * w + 0); queue.push(y * w + (w - 1)); }

  while (queue.length > 0) {
    const pos = queue.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;
    const pidx = pos * 4;
    if (!isBright(pidx)) continue;
    px[pidx + 3] = 0; // 透過
    const x = pos % w, y = Math.floor(pos / w);
    if (x > 0)     queue.push(pos - 1);
    if (x < w - 1) queue.push(pos + 1);
    if (y > 0)     queue.push(pos - w);
    if (y < h - 1) queue.push(pos + w);
  }

  // 背景除去済みピクセルに隣接する低彩度グレー（影）も透過にする
  const shadow = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = y * w + x;
      const pidx = pos * 4;
      if (px[pidx + 3] > 0) continue; // 既に透過済みはスキップ
      // 隣接4ピクセルにまだ不透明なものがあるか確認
      const neighbors = [pos - 1, pos + 1, pos - w, pos + w];
      const nextToOpaque = neighbors.some(n => n >= 0 && n < w * h && px[n * 4 + 3] > 0);
      if (!nextToOpaque) continue;
      // 影判定: 低彩度かつ中間輝度（白背景に落ちた影）
      const r = px[pidx], g = px[pidx + 1], b = px[pidx + 2];
      const brightness = (r + g + b) / 3;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (brightness > 150 && saturation < 40) shadow[pos] = 1;
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (shadow[i]) px[i * 4 + 3] = 0;
  }

  ctx.putImageData(data, 0, 0);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

// ─────────────────────────────────────────────────────────
//  プロンプト生成
// ─────────────────────────────────────────────────────────

function buildPositivePrompt(w: Weights): string {
  const { dodgeSide, burstTiming, moveSpeed } = w;

  const speed  = moveSpeed > 0.65
    ? "sleek fighter, thin fuselage, sharp swept wings"
    : moveSpeed < 0.35
    ? "heavy cruiser, thick armor, wide body"
    : "balanced fighter craft";

  const weapon = burstTiming > 0.65
    ? "multi-barrel gatling guns, spread cannons on wings"
    : burstTiming < 0.35
    ? "single long railgun, precision sniper barrel"
    : "twin forward cannons";

  const wing   = dodgeSide > 0.65
    ? "right wing larger than left, asymmetric design"
    : dodgeSide < 0.35
    ? "left wing larger than right, asymmetric design"
    : "symmetric delta wings";

  // 視点語を最前に並べることでモデルの視点バイアスを強制
  return [
    "2d top down, overhead view, top-down view, view from directly above",
    "masterpiece, best quality, highres",
    "no_humans, spacecraft, mecha, science_fiction, top-down_view, from_above",
    "game_sprite, simple_background, white_background, single_object",
    "(nose pointing up:1.6), (engine exhaust at bottom:1.5)",
    "metallic hull, glowing engine, mechanical_detail, plasma_thruster",
    speed, weapon, wing,
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
  ].join(", ");
}

// ─────────────────────────────────────────────────────────
//  ComfyUI ワークフロー (animagine-xl-4.0 / SDXL)
// ─────────────────────────────────────────────────────────

function buildWorkflow(weights: Weights, _clientId: string, baseImageName: string | null): object {
  const seed = Math.floor(Math.random() * 2 ** 32);

  // img2img: ベース画像あり → LoadImage→VAEEncode、denoise=0.7で視点を保持
  // txt2img: ベース画像なし → EmptyLatentImage、denoise=1
  const useImg2Img = !!baseImageName;

  const latentNode = useImg2Img
    ? {
        "4a": { class_type: "LoadImage",  inputs: { image: baseImageName, upload: "image" } },
        "4b": { class_type: "VAEEncode",  inputs: { pixels: ["4a", 0], vae: ["1", 2] } },
      }
    : {
        "4b": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
      };

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
    ...latentNode,
    "5": {
      class_type: "KSampler",
      inputs: {
        model:        ["1", 0],
        positive:     ["2", 0],
        negative:     ["3", 0],
        latent_image: ["4b", 0],
        seed,
        steps:        25,
        cfg:          5,
        sampler_name: "dpmpp_2m_sde",
        scheduler:    "karras",
        denoise:      useImg2Img ? 0.85 : 1,
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
