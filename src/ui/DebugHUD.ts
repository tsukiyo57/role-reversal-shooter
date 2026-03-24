import Phaser from "phaser";
import type { SignalData, Weights } from "../types";

/**
 * デバッグ用オーバーレイ HUD。[D] キーでON/OFF。
 *
 * 表示内容:
 *   - 現在のシグナル値
 *   - 現在のウェイト値
 *   - AI 最後の行動状態
 */
export class DebugHUD {
  private visible = false;
  private panel: Phaser.GameObjects.Rectangle;
  private text: Phaser.GameObjects.Text;
  private key: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene) {
    this.panel = scene.add
      .rectangle(8, 8, 230, 220, 0x000022, 0.75)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);

    this.text = scene.add
      .text(14, 14, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#aaffaa",
        lineSpacing: 3,
      })
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);

    this.key = scene.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.D,
    );
  }

  update(signals: SignalData, weights: Weights, aiState: string): void {
    if (Phaser.Input.Keyboard.JustDown(this.key)) {
      this.visible = !this.visible;
      this.panel.setVisible(this.visible);
      this.text.setVisible(this.visible);
    }

    if (!this.visible) return;

    const fmt = (v: number) => v.toFixed(2);
    const lines = [
      "── DEBUG HUD (D key) ──",
      "Signals:",
      `  leftRightBias : ${fmt(signals.leftRightBias)}`,
      `  rangePreference: ${fmt(signals.rangePreference)}`,
      `  shotSpread    : ${fmt(signals.shotSpread)}`,
      `  fireRateSpam  : ${fmt(signals.fireRateSpam)}`,
      `  cornerPressure: ${fmt(signals.cornerPressure)}`,
      "Weights:",
      `  dodgeSide    : ${fmt(weights.dodgeSide)}`,
      `  burstTiming  : ${fmt(weights.burstTiming)}`,
      `  preferredDist: ${fmt(weights.preferredDist)}`,
      `  moveSpeed    : ${fmt(weights.moveSpeed)}`,
      `AI State: ${aiState}`,
    ];
    this.text.setText(lines.join("\n"));
    this.panel.height = lines.length * 14 + 12;
  }

  destroy(): void {
    this.panel.destroy();
    this.text.destroy();
  }
}
