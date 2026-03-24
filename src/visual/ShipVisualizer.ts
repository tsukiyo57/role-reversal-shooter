import Phaser from "phaser";
import type { Weights } from "../types";

/**
 * ヒーロー機体ビジュアル — Vic Viper (Gradius) スタイル
 *
 * 機体は下を向いている（ヒーローは画面上部からボスを攻撃）。
 *   +Y = 機首方向 (下 / 前)
 *   -Y = エンジン方向 (上 / 後)
 *
 * ウェイト → ビジュアル:
 *   moveSpeed    → 色相 (青=高速 / 紫=低速) + エンジン輝度
 *   burstTiming  → 機首プロング長 + 追加キャノン
 *   dodgeSide    → 左右ウィング非対称
 *   preferredDist → 機体全体スケール
 */
export class ShipVisualizer {
  static readonly HITBOX_RADIUS = 18;

  static draw(g: Phaser.GameObjects.Graphics, weights: Weights): void {
    g.clear();
    const { dodgeSide, burstTiming, preferredDist, moveSpeed } = weights;

    // ── 色計算 ──
    // moveSpeed 0=紫系, 1=シアン系  (Hue 230 → 185°)
    const hue   = 230 - moveSpeed * 45;
    const body  = Phaser.Display.Color.HSLToColor(hue / 360, 0.85, 0.45).color;
    const lit   = Phaser.Display.Color.HSLToColor(hue / 360, 0.90, 0.65).color;
    const glow  = Phaser.Display.Color.HSLToColor(hue / 360, 1.00, 0.82).color;
    const dark  = Phaser.Display.Color.HSLToColor(hue / 360, 0.85, 0.22).color;
    const engAlpha = 0.55 + moveSpeed * 0.45;

    // ── スケール ──
    const sc = 0.85 + preferredDist * 0.30; // 0.85–1.15

    // ── エンジンポッド (後部 / 上 / -Y) ──
    const nCount = 1 + Math.round(burstTiming * 2); // 1–3基
    for (let i = 0; i < nCount; i++) {
      const ox = (i - (nCount - 1) / 2) * 9 * sc;
      const nLen = (9 + burstTiming * 7) * sc;

      // ポッド本体
      g.fillStyle(dark, 1);
      g.fillRect(ox - 3.5 * sc, -24 * sc - nLen, 7 * sc, nLen);

      // エンジンリング
      g.fillStyle(dark, 1);
      g.fillCircle(ox, -24 * sc, 5 * sc);
      g.fillStyle(glow, 0.9);
      g.fillCircle(ox, -24 * sc, 3.5 * sc);

      // 炎 (後方 = 上)
      g.fillStyle(0x44ccff, engAlpha);
      g.fillTriangle(
        ox - 3 * sc, -24 * sc - nLen,
        ox + 3 * sc, -24 * sc - nLen,
        ox,          -24 * sc - nLen - (11 + burstTiming * 10) * sc,
      );
      g.fillStyle(0xffffff, engAlpha * 0.55);
      g.fillTriangle(
        ox - 1.5 * sc, -24 * sc - nLen,
        ox + 1.5 * sc, -24 * sc - nLen,
        ox,            -24 * sc - nLen - (6 + burstTiming * 6) * sc,
      );
    }

    // ── メイン胴体 ──
    const bw = (5 + preferredDist * 3) * sc; // ボディ幅
    g.fillStyle(dark, 1);
    g.fillRect(-bw - 1.5, -22 * sc, (bw + 1.5) * 2, 46 * sc);
    g.fillStyle(body, 1);
    g.fillRect(-bw, -21 * sc, bw * 2, 44 * sc);
    // 胴体ライン (ハイライト)
    g.fillStyle(lit, 0.45);
    g.fillRect(-bw * 0.4, -19 * sc, bw * 0.8, 38 * sc);

    // ── デルタウィング (dodgeSide で非対称) ──
    const lSpan = (20 + (1 - dodgeSide) * 20) * sc;
    const rSpan = (20 + dodgeSide         * 20) * sc;
    const wTop  = -10 * sc;
    const wBot  =  16 * sc;

    // 左ウィング
    g.fillStyle(dark, 1);
    g.fillTriangle(-bw, wTop, -bw - lSpan, wBot * 0.7, -bw, wBot);
    g.fillStyle(body, 0.85);
    g.fillTriangle(-bw, wTop + 2 * sc, -bw - lSpan * 0.75, wBot * 0.5, -bw, wBot - 2 * sc);
    g.fillStyle(lit, 0.35);
    g.fillTriangle(-bw, wTop + 4 * sc, -bw - lSpan * 0.45, wBot * 0.35, -bw, wBot * 0.6);

    // 右ウィング
    g.fillStyle(dark, 1);
    g.fillTriangle(bw, wTop, bw + rSpan, wBot * 0.7, bw, wBot);
    g.fillStyle(body, 0.85);
    g.fillTriangle(bw, wTop + 2 * sc, bw + rSpan * 0.75, wBot * 0.5, bw, wBot - 2 * sc);
    g.fillStyle(lit, 0.35);
    g.fillTriangle(bw, wTop + 4 * sc, bw + rSpan * 0.45, wBot * 0.35, bw, wBot * 0.6);

    // ウィングチップ発光
    if ((1 - dodgeSide) > 0.3) {
      g.fillStyle(glow, (1 - dodgeSide) * 0.7);
      g.fillCircle(-bw - lSpan * 0.85, wBot * 0.65, 2.5 * sc);
    }
    if (dodgeSide > 0.3) {
      g.fillStyle(glow, dodgeSide * 0.7);
      g.fillCircle(bw + rSpan * 0.85, wBot * 0.65, 2.5 * sc);
    }

    // ── コックピット ──
    g.fillStyle(0x000d1a, 1);
    g.fillEllipse(0, -2 * sc, 12 * sc, 16 * sc);
    g.fillStyle(0xffcc44, 0.95);
    g.fillEllipse(0, -2 * sc, 8.5 * sc, 11 * sc);
    // ガラスハイライト
    g.fillStyle(0xffffff, 0.35);
    g.fillEllipse(-1.5 * sc, -4 * sc, 3.5 * sc, 4.5 * sc);

    // ── 機首プロング / ツインキャノン (+Y 方向) ──
    const pLen  = (14 + burstTiming * 10) * sc;
    const pGap  = (bw + 3) * sc;

    // 接続バー
    g.fillStyle(body, 0.9);
    g.fillRect(-pGap - 3 * sc, 18 * sc, pGap * 2 + 6 * sc, 4 * sc);

    // 左プロング
    g.fillStyle(dark, 1);
    g.fillRect(-pGap - 3 * sc, 20 * sc, 6 * sc, pLen);
    g.fillStyle(lit, 0.6);
    g.fillRect(-pGap - 2 * sc, 20 * sc, 3.5 * sc, pLen * 0.7);

    // 右プロング
    g.fillStyle(dark, 1);
    g.fillRect(pGap - 3 * sc, 20 * sc, 6 * sc, pLen);
    g.fillStyle(lit, 0.6);
    g.fillRect(pGap - 2 * sc, 20 * sc, 3.5 * sc, pLen * 0.7);

    // キャノン先端グロー
    g.fillStyle(glow, 0.95);
    g.fillCircle(-pGap, (20 + pLen) * sc, 4 * sc);
    g.fillCircle( pGap, (20 + pLen) * sc, 4 * sc);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(-pGap, (20 + pLen) * sc, 2 * sc);
    g.fillCircle( pGap, (20 + pLen) * sc, 2 * sc);

    // ── 外周エネルギーリング ──
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
