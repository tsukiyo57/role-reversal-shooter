import Phaser from "phaser";
import type { Weights } from "../types";
import { ShareCard } from "../share/ShareCard";
import { ShipVisualizer } from "../visual/ShipVisualizer";

/**
 * ゲームオーバー画面。
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

    // タイトル
    this.add.text(W / 2, 30, "DEFEATED", {
      fontFamily: "monospace", fontSize: "28px", color: "#ff4466",
      shadow: { offsetX: 0, offsetY: 0, color: "#ff2244", blur: 12, fill: true },
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, 68, `ステージ ${this.stageReached} で倒された`, {
      fontFamily: "monospace", fontSize: "14px", color: "#8888aa",
    }).setOrigin(0.5, 0);

    // 機体ビジュアル (大きく表示)
    const rt = this.add.renderTexture(W / 2, 200, 160, 160).setOrigin(0.5, 0.5);
    ShipVisualizer.bake(this, rt, this.weights);
    rt.setScale(2);

    // ウェイト説明
    const { dodgeSide, burstTiming, preferredDist, moveSpeed } = this.weights;
    const desc = [
      `回避方向: ${dodgeSide > 0.5 ? "右→学習" : "左→学習"}`,
      `射撃: ${burstTiming > 0.5 ? "バースト型に進化" : "精密型を維持"}`,
      `距離: ${preferredDist > 0.5 ? "遠距離戦術を習得" : "近距離特化"}`,
      `速度: ${moveSpeed > 0.5 ? "高速機動型" : "重装甲型"}`,
    ];

    desc.forEach((line, i) => {
      this.add.text(W / 2, 320 + i * 20, line, {
        fontFamily: "monospace", fontSize: "12px", color: "#8899cc",
      }).setOrigin(0.5, 0);
    });

    // Xシェアボタン
    const shareBtn = this.add.rectangle(W / 2, H - 70, 220, 40, 0x1a1a3a)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x5566ff);

    this.add.text(W / 2, H - 70, "X (Twitter) でシェア", {
      fontFamily: "monospace", fontSize: "13px", color: "#aabbff",
    }).setOrigin(0.5, 0.5).setDepth(1);

    shareBtn.on("pointerdown", () => {
      const card = ShareCard.generate(this, this.weights, this.stageReached);
      window.open(card.twitterUrl, "_blank");
    });

    shareBtn.on("pointerover", () => { shareBtn.fillColor = 0x2a2a5a; });
    shareBtn.on("pointerout", () => { shareBtn.fillColor = 0x1a1a3a; });

    // もう一度プレイ
    const retryBtn = this.add.rectangle(W / 2, H - 22, 160, 32, 0x0a1a0a)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x44aa66);

    this.add.text(W / 2, H - 22, "もう一度挑戦", {
      fontFamily: "monospace", fontSize: "12px", color: "#44cc77",
    }).setOrigin(0.5, 0.5).setDepth(1);

    retryBtn.on("pointerdown", () => {
      this.scene.start("GameScene");
    });
  }
}
