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

  /** ウェイトから機体画像を生成して Blob URL を返す。失敗時は null。 */
  static async generate(weights: Weights): Promise<string | null> {
    try {
      const clientId = crypto.randomUUID();
      const workflow = buildWorkflow(weights, clientId);

      // ① ワークフローをキュー投入
      const queueRes = await fetch(`${COMFY_URL}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!queueRes.ok) return null;

      const { prompt_id } = (await queueRes.json()) as { prompt_id: string };

      // ② 完了をポーリング (最大 90 秒)
      return await pollResult(prompt_id);
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────
//  ヘルパー
// ─────────────────────────────────────────────────────────

async function pollResult(promptId: string): Promise<string | null> {
  const DEADLINE = Date.now() + 90_000;
  while (Date.now() < DEADLINE) {
    await sleep(1200);
    try {
      const res = await fetch(`${COMFY_URL}/history/${promptId}`,
        { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;

      const history = (await res.json()) as Record<string, ComfyHistory>;
      const entry   = history[promptId];
      if (!entry?.status?.completed) continue;

      // 出力ノードから最初の画像を取得
      for (const nodeOut of Object.values(entry.outputs)) {
        const img = nodeOut.images?.[0];
        if (!img) continue;
        const url = `${COMFY_URL}/view?filename=${encodeURIComponent(img.filename)}`
                  + `&subfolder=${encodeURIComponent(img.subfolder)}`
                  + `&type=${encodeURIComponent(img.type)}`;
        const blob = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).blob();
        return URL.createObjectURL(blob);
      }
    } catch {
      // continue polling
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────
//  プロンプト生成
// ─────────────────────────────────────────────────────────

function buildPositivePrompt(w: Weights): string {
  const { dodgeSide, burstTiming, preferredDist, moveSpeed } = w;

  const speed  = moveSpeed > 0.65
    ? "sleek high-speed blue fighter jet, thin aerodynamic body"
    : moveSpeed < 0.35
    ? "heavy armored purple battlecruiser, thick hull plating"
    : "blue combat spacecraft, balanced design";

  const weapon = burstTiming > 0.65
    ? "multiple burst cannons, gatling gun pods on wings"
    : burstTiming < 0.35
    ? "single massive precision railgun, sniper configuration"
    : "twin cannons, dual weapon hardpoints";

  const dist   = preferredDist > 0.65
    ? "long extended barrel weapons, long-range sniper craft"
    : preferredDist < 0.35
    ? "close-combat interceptor, short stubby cannons, claw grips"
    : "medium range weapons, standard loadout";

  const wing   = dodgeSide > 0.65
    ? "right wing larger and more prominent, asymmetric wing design"
    : dodgeSide < 0.35
    ? "left wing larger and more prominent, asymmetric wing design"
    : "symmetric swept wings";

  return [
    "masterpiece, best quality",
    "anime-style sci-fi spaceship top-down view",
    speed, weapon, dist, wing,
    "glowing engine exhaust, neon cockpit, space background",
    "game sprite, clean lineart, detailed illustration",
    "1girl is not here, no humans",
  ].join(", ");
}

function buildNegativePrompt(): string {
  return [
    "nsfw, low quality, blurry, watermark, text, logo",
    "human, person, character, face",
    "multiple ships, crowded",
    "bad anatomy, worst quality",
  ].join(", ");
}

// ─────────────────────────────────────────────────────────
//  ComfyUI ワークフロー (animagine-xl-4.0 / SDXL)
// ─────────────────────────────────────────────────────────

function buildWorkflow(weights: Weights, _clientId: string): object {
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
      inputs: { width: 512, height: 512, batch_size: 1 },
    },
    "5": {
      class_type: "KSampler",
      inputs: {
        model:        ["1", 0],
        positive:     ["2", 0],
        negative:     ["3", 0],
        latent_image: ["4", 0],
        seed:         Math.floor(Math.random() * 2 ** 32),
        steps:        20,
        cfg:          7,
        sampler_name: "dpmpp_2m",
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
  status: { completed: boolean };
  outputs: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>;
}
