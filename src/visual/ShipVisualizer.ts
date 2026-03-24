import Phaser from "phaser";
import type { Weights } from "../types";

/**
 * ウェイト値をヒーロー機体のビジュアルにマッピングして描画する。
 * RenderTexture に焼き込み、ゲームプレイ中は静的テクスチャを利用する。
 *
 * ウェイト → ビジュアルのマッピング:
 *   dodgeSide    → 左/右にシールドフィン
 *   burstTiming  → エンジンノズル数 + 炎の長さ
 *   preferredDist → 機体コアサイズ (コスメのみ、当たり判定は固定)
 *   moveSpeed    → 機体の色相 (青=高速, 赤=低速)
 *
 * ヒーローは画面上部から下を向いてボス(プレイヤー)を攻撃する。
 * 機首は下方向 (+Y)、エンジンノズルは上方向 (-Y)。
 */
export class ShipVisualizer {
  static readonly HITBOX_RADIUS = 18;

  static draw(g: Phaser.GameObjects.Graphics, weights: Weights): void {
    g.clear();

    const { dodgeSide, burstTiming, preferredDist, moveSpeed } = weights;

    // ── 色相計算 ──
    const hue = moveSpeed * 200 + 10; // 10(赤) → 210(青)
    const coreColor = Phaser.Display.Color.HSLToColor(hue / 360, 0.85, 0.65).color;
    const darkColor  = Phaser.Display.Color.HSLToColor(hue / 360, 0.85, 0.28).color;
    const glowColor  = Phaser.Display.Color.HSLToColor(hue / 360, 1.0,  0.85).color;

    // ── コアサイズ ──
    const coreR = 12 + preferredDist * 7; // 12–19 px

    // ── エンジンノズル (上部、-Y 方向) ──
    const nozzleCount = 1 + Math.round(burstTiming * 3); // 1–4個
    for (let i = 0; i < nozzleCount; i++) {
      const ox = (i - (nozzleCount - 1) / 2) * 7;
      const nozzleLen = 7 + burstTiming * 7;

      // ノズル本体
      g.fillStyle(darkColor, 1);
      g.fillRect(ox - 2.5, -coreR - 2, 5, nozzleLen);

      // エンジン炎 (上向き)
      g.fillStyle(0xffcc00, 0.9);
      g.fillTriangle(
        ox - 3, -coreR - 2 - nozzleLen,
        ox + 3, -coreR - 2 - nozzleLen,
        ox,     -coreR - 2 - nozzleLen - (10 + burstTiming * 12),
      );
      g.fillStyle(glowColor, 0.5);
      g.fillTriangle(
        ox - 2, -coreR - 2 - nozzleLen,
        ox + 2, -coreR - 2 - nozzleLen,
        ox,     -coreR - 2 - nozzleLen - (6 + burstTiming * 8),
      );
    }

    // ── シールドフィン (左右、dodgeSide でアシンメトリ) ──
    const shieldL = 1 - dodgeSide;
    const shieldR = dodgeSide;

    if (shieldL > 0.15) {
      const fw = shieldL * 16;
      const fh = shieldL * 12;
      g.fillStyle(coreColor, 0.7);
      g.fillTriangle(-coreR - 2, -fh / 2, -coreR - 2 - fw, 0, -coreR - 2, fh / 2);
      g.lineStyle(1, glowColor, 0.5);
      g.strokeTriangle(-coreR - 2, -fh / 2, -coreR - 2 - fw, 0, -coreR - 2, fh / 2);
    }
    if (shieldR > 0.15) {
      const fw = shieldR * 16;
      const fh = shieldR * 12;
      g.fillStyle(coreColor, 0.7);
      g.fillTriangle(coreR + 2, -fh / 2, coreR + 2 + fw, 0, coreR + 2, fh / 2);
      g.lineStyle(1, glowColor, 0.5);
      g.strokeTriangle(coreR + 2, -fh / 2, coreR + 2 + fw, 0, coreR + 2, fh / 2);
    }

    // ── 胴体ウイング ──
    g.fillStyle(darkColor, 1);
    g.fillTriangle(0, coreR * 0.3, -coreR * 1.4, coreR * 0.1, -coreR * 0.6, -coreR * 0.6);
    g.fillTriangle(0, coreR * 0.3,  coreR * 1.4, coreR * 0.1,  coreR * 0.6, -coreR * 0.6);

    // ウイングアクセント
    g.fillStyle(coreColor, 0.5);
    g.fillTriangle(0, coreR * 0.1, -coreR * 1.1, coreR * 0.05, -coreR * 0.5, -coreR * 0.4);
    g.fillTriangle(0, coreR * 0.1,  coreR * 1.1, coreR * 0.05,  coreR * 0.5, -coreR * 0.4);

    // ── コア ──
    g.fillStyle(darkColor, 1);
    g.fillCircle(0, 0, coreR + 2.5);
    g.fillStyle(coreColor, 1);
    g.fillCircle(0, 0, coreR);
    // 内側グロー
    g.fillStyle(glowColor, 0.35);
    g.fillCircle(0, 0, coreR * 0.55);
    // ハイライト
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(-coreR * 0.28, -coreR * 0.28, coreR * 0.28);

    // ── 機首 (下方向 +Y) ──
    g.fillStyle(coreColor, 1);
    g.fillTriangle(0, coreR + 10, -coreR * 0.5, coreR * 0.15, coreR * 0.5, coreR * 0.15);

    // キャノン先端
    g.fillStyle(glowColor, 0.8);
    g.fillCircle(0, coreR + 10, 3);

    // エネルギーリング (外周)
    g.lineStyle(1, coreColor, 0.3);
    g.strokeCircle(0, 0, coreR + 6);
  }

  static bake(
    scene: Phaser.Scene,
    rt: Phaser.GameObjects.RenderTexture,
    weights: Weights,
  ): void {
    const g = scene.add.graphics();
    ShipVisualizer.draw(g, weights);

    const cx = rt.width / 2;
    const cy = rt.height / 2;
    rt.clear();
    rt.draw(g, cx, cy);
    g.destroy();
  }
}
