import Phaser from "phaser";
import type { Weights } from "../types";

/**
 * ウェイト値をヒーロー機体のビジュアルにマッピングして描画する。
 * RenderTexture に焼き込み、ゲームプレイ中は静的テクスチャを利用する。
 *
 * ウェイト → ビジュアルのマッピング:
 *   dodgeSide    → 左/右にシールドパーツ
 *   burstTiming  → エンジンノズル数 + パーティクル密度
 *   preferredDist → 機体コアサイズ (コスメのみ、当たり判定は固定)
 *   moveSpeed    → 機体の色相 (青=高速, 赤=低速)
 */
export class ShipVisualizer {
  static readonly HITBOX_RADIUS = 18; // 当たり判定は常に固定

  /**
   * ウェイトに基づいてヒーロー機体の Graphics を描画する。
   * @param g 描画先 Phaser.GameObjects.Graphics (毎回 clear() してから呼ぶ)
   */
  static draw(g: Phaser.GameObjects.Graphics, weights: Weights): void {
    g.clear();

    const { dodgeSide, burstTiming, preferredDist, moveSpeed } = weights;

    // --- 色相計算 (moveSpeed: 青=1, 赤=0) ---
    const hue = moveSpeed * 200 + 10; // 10(赤) → 210(青)
    const saturation = 0.8;
    const lightness = 0.65;
    const coreColor = Phaser.Display.Color.HSLToColor(
      hue / 360,
      saturation,
      lightness,
    ).color;
    const darkColor = Phaser.Display.Color.HSLToColor(
      hue / 360,
      saturation,
      0.3,
    ).color;

    // --- コアサイズ (preferredDist: コスメのみ) ---
    const coreR = 12 + preferredDist * 8; // 12–20 px (コスメ)

    // --- シールドパーツ (dodgeSide) ---
    const shieldLeft = 1 - dodgeSide;   // 左シールド強度
    const shieldRight = dodgeSide;       // 右シールド強度

    if (shieldLeft > 0.2) {
      g.fillStyle(coreColor, 0.6);
      g.fillTriangle(
        -coreR - 4, 0,
        -coreR - 4 - shieldLeft * 14, -shieldLeft * 10,
        -coreR - 4 - shieldLeft * 14, shieldLeft * 10,
      );
    }
    if (shieldRight > 0.2) {
      g.fillStyle(coreColor, 0.6);
      g.fillTriangle(
        coreR + 4, 0,
        coreR + 4 + shieldRight * 14, -shieldRight * 10,
        coreR + 4 + shieldRight * 14, shieldRight * 10,
      );
    }

    // --- エンジンノズル (burstTiming) ---
    const nozzleCount = 1 + Math.round(burstTiming * 3); // 1–4個
    for (let i = 0; i < nozzleCount; i++) {
      const offset = (i - (nozzleCount - 1) / 2) * 6;
      g.fillStyle(darkColor, 1);
      g.fillRect(offset - 2, coreR + 2, 4, 6 + burstTiming * 6);
      // エンジン炎
      g.fillStyle(0xffaa00, 0.7);
      g.fillTriangle(
        offset - 2, coreR + 8 + burstTiming * 6,
        offset + 2, coreR + 8 + burstTiming * 6,
        offset, coreR + 16 + burstTiming * 10,
      );
    }

    // --- コア本体 ---
    g.fillStyle(darkColor, 1);
    g.fillCircle(0, 0, coreR + 2);
    g.fillStyle(coreColor, 1);
    g.fillCircle(0, 0, coreR);

    // --- コアハイライト ---
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(-coreR * 0.3, -coreR * 0.3, coreR * 0.3);

    // --- 機首 (前方三角) ---
    g.fillStyle(coreColor, 1);
    g.fillTriangle(0, -coreR, -coreR * 0.7, -coreR * 0.2, coreR * 0.7, -coreR * 0.2);
  }

  /**
   * RenderTexture にウェイトベースのビジュアルを焼き込む。
   * ステージ間でのみ呼び出す (毎フレームではない)。
   */
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
