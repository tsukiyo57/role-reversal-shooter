import Phaser from "phaser";
import type { Weights } from "../types";
import { ShareCard } from "../share/ShareCard";
import { ShipVisualizer } from "../visual/ShipVisualizer";

/**
 * ゲームオーバー/リザルト画面。
 * 進化したヒーロー機体を大きく表示し、Xシェアボタンを提供する。
 */
export class GameOverScene extends Phaser.Scene {
  private weights: Weights = {} as Weights;
  private stageReached = 1;

  constructor() {
    super("GameOverScene");
  }

  init(data: { weights: Weights; stageReached: number }): void {
    this.weights = data.weights;
    this.stageReached = data.stageReached;
  }

  create(): void {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor(0x04040f);

    // 星空
    const sg = this.add.graphics();
    for (let i = 0; i < 100; i++) {
      sg.fillStyle(0xaabbff, 0.1 + Math.random() * 0.3);
      sg.fillCircle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H),
        Math.random() < 0.2 ? 1.2 : 0.7,
      );
    }

    // ── タイトル ──
    this.add.text(W / 2, 28, "HERO  SURVIVED", {
      fontFamily: "monospace",
      fontSize: "26px",
      color: "#ff3355",
      shadow: { offsetX: 0, offsetY: 0, color: "#ff0033", blur: 16, fill: true },
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 64, `あなたは ステージ ${this.stageReached} でヒーローに敗れた`, {
      fontFamily: "monospace", fontSize: "13px", color: "#556688",
    }).setOrigin(0.5, 0);

    // ── ヒーロー機体 (大きく表示) ──
    const rt = this.add.renderTexture(W / 2, 185, 160, 160).setOrigin(0.5, 0.5);
    ShipVisualizer.bake(this, rt, this.weights);
    rt.setScale(1.8);

    // 機体の後ろに光彩
    const glow = this.add.graphics();
    glow.fillStyle(0x3344ff, 0.08);
    glow.fillCircle(W / 2, 185, 90);
    glow.fillStyle(0x2233ff, 0.05);
    glow.fillCircle(W / 2, 185, 120);
    glow.setDepth(-1);

    // ── 進化ステータス ──
    const { dodgeSide, burstTiming, preferredDist, moveSpeed } = this.weights;
    const desc = [
      `◆ 回避  ${dodgeSide > 0.5 ? "右優位に進化" : "左優位に進化"}  (${(dodgeSide * 100).toFixed(0)}%)`,
      `◆ 射撃  ${burstTiming > 0.5 ? "バースト型に進化" : "精密型を維持"}  (${(burstTiming * 100).toFixed(0)}%)`,
      `◆ 距離  ${preferredDist > 0.5 ? "遠距離戦術を習得" : "近距離特化"}  (${(preferredDist * 100).toFixed(0)}%)`,
      `◆ 速度  ${moveSpeed > 0.5 ? "高速機動型" : "重装甲型"}  (${(moveSpeed * 100).toFixed(0)}%)`,
    ];

    desc.forEach((line, i) => {
      this.add.text(W / 2, 306 + i * 22, line, {
        fontFamily: "monospace", fontSize: "12px", color: "#7788bb",
      }).setOrigin(0.5, 0);
    });

    // ── X シェアボタン ──
    const shareBtn = this.add
      .rectangle(W / 2, H - 68, 230, 40, 0x0d0d22)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x4455dd);

    this.add.text(W / 2, H - 68, "✕  X (Twitter) でシェア", {
      fontFamily: "monospace", fontSize: "13px", color: "#8899ee",
    }).setOrigin(0.5, 0.5).setDepth(1);

    shareBtn.on("pointerdown", () => {
      const card = ShareCard.generate(this, this.weights, this.stageReached);
      window.open(card.twitterUrl, "_blank");
    });
    shareBtn.on("pointerover", () => { shareBtn.fillColor = 0x1a1a44; });
    shareBtn.on("pointerout",  () => { shareBtn.fillColor = 0x0d0d22; });

    // ── もう一度プレイ ──
    const retryBtn = this.add
      .rectangle(W / 2, H - 22, 170, 32, 0x041408)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x336644);

    this.add.text(W / 2, H - 22, "► もう一度挑戦", {
      fontFamily: "monospace", fontSize: "12px", color: "#44bb77",
    }).setOrigin(0.5, 0.5).setDepth(1);

    retryBtn.on("pointerdown", () => { this.scene.start("GameScene"); });
    retryBtn.on("pointerover", () => { retryBtn.fillColor = 0x0a2a18; });
    retryBtn.on("pointerout",  () => { retryBtn.fillColor = 0x041408; });
  }
}
