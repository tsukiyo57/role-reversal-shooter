import Phaser from "phaser";
import type { Weights } from "../types";

/**
 * ヒーロー機体 — Vic Viper スタイル
 *
 * 機体は上を向いている（ヒーローは画面下部からボスを攻撃）。
 *   -Y = 機首方向（上 / 前）
 *   +Y = エンジン方向（下 / 後）
 */
export class ShipVisualizer {
  static readonly HITBOX_RADIUS = 18;

  static draw(g: Phaser.GameObjects.Graphics, weights: Weights): void {
    g.clear();
    const { dodgeSide, burstTiming, preferredDist, moveSpeed } = weights;

    // ── 色計算 ──
    const hue  = 220 - moveSpeed * 40; // 180–220° (シアン→青)
    const body = Phaser.Display.Color.HSLToColor(hue / 360, 0.85, 0.45).color;
    const lit  = Phaser.Display.Color.HSLToColor(hue / 360, 0.90, 0.65).color;
    const glow = Phaser.Display.Color.HSLToColor(hue / 360, 1.00, 0.82).color;
    const dark = Phaser.Display.Color.HSLToColor(hue / 360, 0.85, 0.22).color;
    const engA = 0.55 + moveSpeed * 0.45;

    const sc = 0.85 + preferredDist * 0.30;

    // ── エンジン (後部 / 下 / +Y) ──
    const nCount = 1 + Math.round(burstTiming * 2);
    for (let i = 0; i < nCount; i++) {
      const ox   = (i - (nCount - 1) / 2) * 9 * sc;
      const nLen = (9 + burstTiming * 7) * sc;

      g.fillStyle(dark, 1);
      g.fillRect(ox - 3.5 * sc, 22 * sc, 7 * sc, nLen);

      g.fillStyle(dark, 1);
      g.fillCircle(ox, 22 * sc, 5 * sc);
      g.fillStyle(glow, 0.9);
      g.fillCircle(ox, 22 * sc, 3.5 * sc);

      // 炎 (下向き / 後方)
      g.fillStyle(0x44ccff, engA);
      g.fillTriangle(
        ox - 3 * sc, 22 * sc + nLen,
        ox + 3 * sc, 22 * sc + nLen,
        ox,          22 * sc + nLen + (11 + burstTiming * 10) * sc,
      );
      g.fillStyle(0xffffff, engA * 0.55);
      g.fillTriangle(
        ox - 1.5 * sc, 22 * sc + nLen,
        ox + 1.5 * sc, 22 * sc + nLen,
        ox,            22 * sc + nLen + (6 + burstTiming * 6) * sc,
      );
    }

    // ── 胴体 ──
    const bw = (5 + preferredDist * 3) * sc;
    g.fillStyle(dark, 1);
    g.fillRect(-bw - 1.5, -22 * sc, (bw + 1.5) * 2, 46 * sc);
    g.fillStyle(body, 1);
    g.fillRect(-bw, -20 * sc, bw * 2, 44 * sc);
    g.fillStyle(lit, 0.45);
    g.fillRect(-bw * 0.4, -18 * sc, bw * 0.8, 38 * sc);

    // ── デルタウィング (dodgeSide 非対称) ──
    const lSpan = (20 + (1 - dodgeSide) * 20) * sc;
    const rSpan = (20 + dodgeSide         * 20) * sc;
    const wTop  = -16 * sc;
    const wBot  =  10 * sc;

    g.fillStyle(dark, 1);
    g.fillTriangle(-bw, wTop, -bw - lSpan, wBot * 0.8, -bw, wBot);
    g.fillStyle(body, 0.85);
    g.fillTriangle(-bw, wTop + 2 * sc, -bw - lSpan * 0.75, wBot * 0.5, -bw, wBot - 2 * sc);
    g.fillStyle(lit, 0.35);
    g.fillTriangle(-bw, wTop + 4 * sc, -bw - lSpan * 0.45, wBot * 0.3, -bw, wBot * 0.5);

    g.fillStyle(dark, 1);
    g.fillTriangle(bw, wTop, bw + rSpan, wBot * 0.8, bw, wBot);
    g.fillStyle(body, 0.85);
    g.fillTriangle(bw, wTop + 2 * sc, bw + rSpan * 0.75, wBot * 0.5, bw, wBot - 2 * sc);
    g.fillStyle(lit, 0.35);
    g.fillTriangle(bw, wTop + 4 * sc, bw + rSpan * 0.45, wBot * 0.3, bw, wBot * 0.5);

    if ((1 - dodgeSide) > 0.3) {
      g.fillStyle(glow, (1 - dodgeSide) * 0.7);
      g.fillCircle(-bw - lSpan * 0.85, wBot * 0.7, 2.5 * sc);
    }
    if (dodgeSide > 0.3) {
      g.fillStyle(glow, dodgeSide * 0.7);
      g.fillCircle(bw + rSpan * 0.85, wBot * 0.7, 2.5 * sc);
    }

    // ── コックピット ──
    g.fillStyle(0x000d1a, 1);
    g.fillEllipse(0, 2 * sc, 12 * sc, 16 * sc);
    g.fillStyle(0xffcc44, 0.95);
    g.fillEllipse(0, 2 * sc, 8.5 * sc, 11 * sc);
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(-1.5 * sc, 0, 3.5 * sc, 4.5 * sc);

    // ── 機首プロング / ツインキャノン (-Y = 前方 / 上) ──
    const pLen = (14 + burstTiming * 10) * sc;
    const pGap = (bw + 3) * sc;

    g.fillStyle(body, 0.9);
    g.fillRect(-pGap - 3 * sc, -20 * sc - 4 * sc, pGap * 2 + 6 * sc, 4 * sc);

    g.fillStyle(dark, 1);
    g.fillRect(-pGap - 3 * sc, -20 * sc - pLen, 6 * sc, pLen);
    g.fillStyle(lit, 0.6);
    g.fillRect(-pGap - 2 * sc, -20 * sc - pLen, 3.5 * sc, pLen * 0.7);

    g.fillStyle(dark, 1);
    g.fillRect(pGap - 3 * sc, -20 * sc - pLen, 6 * sc, pLen);
    g.fillStyle(lit, 0.6);
    g.fillRect(pGap - 2 * sc, -20 * sc - pLen, 3.5 * sc, pLen * 0.7);

    g.fillStyle(glow, 0.95);
    g.fillCircle(-pGap, (-20 - pLen / sc) * sc, 4 * sc);
    g.fillCircle( pGap, (-20 - pLen / sc) * sc, 4 * sc);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(-pGap, (-20 - pLen / sc) * sc, 2 * sc);
    g.fillCircle( pGap, (-20 - pLen / sc) * sc, 2 * sc);

    g.lineStyle(1, glow, 0.18);
    g.strokeCircle(0, 0, 30 * sc);
  }

  static bake(
    scene: Phaser.Scene,
    rt: Phaser.GameObjects.RenderTexture,
    weights: Weights,
  ): void {
    const g = scene.add.graphics();
    ShipVisualizer.draw(g, weights);
    rt.clear();
    rt.draw(g, rt.width / 2, rt.height / 2);
    g.destroy();
  }
}
