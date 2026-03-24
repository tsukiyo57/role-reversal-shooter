import Phaser from "phaser";
import type { Weights } from "../types";
import { ShipVisualizer } from "../visual/ShipVisualizer";

/**
 * ステージクリア画面。
 * プレイヤーがヒーローの残機をすべて削った後に表示される。
 * 進化前後の機体を並べ、変化したウェイトを "進化ログ" として提示する。
 */
export class StageClearScene extends Phaser.Scene {
  private stage = 1;
  private prevWeights: Weights = {} as Weights;
  private newWeights: Weights = {} as Weights;

  constructor() {
    super("StageClearScene");
  }

  init(data: { stage: number; prevWeights: Weights; newWeights: Weights }): void {
    this.stage = data.stage;
    this.prevWeights = data.prevWeights;
    this.newWeights = data.newWeights;
  }

  create(): void {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor(0x04040f);

    // 星空
    const sg = this.add.graphics();
    for (let i = 0; i < 100; i++) {
      sg.fillStyle(0xaabbff, 0.1 + Math.random() * 0.25);
      sg.fillCircle(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H),
        Math.random() < 0.15 ? 1.2 : 0.65,
      );
    }

    // ── ヘッダー ──
    const stageTxt = this.add.text(W / 2, 22, `STAGE  ${this.stage}  CLEAR`, {
      fontFamily: "monospace",
      fontSize: "28px",
      color: "#00ffaa",
      shadow: { offsetX: 0, offsetY: 0, color: "#00cc88", blur: 18, fill: true },
    }).setOrigin(0.5, 0).setAlpha(0);

    const subTxt = this.add.text(W / 2, 60, "ヒーローが学習し、さらに強化された", {
      fontFamily: "monospace", fontSize: "12px", color: "#446655",
    }).setOrigin(0.5, 0).setAlpha(0);

    this.tweens.add({ targets: stageTxt, alpha: 1, duration: 500, ease: "Power2" });
    this.tweens.add({ targets: subTxt,  alpha: 1, duration: 600, delay: 200 });

    // ── 機体ビジュアル (前後比較) ──
    const shipY = 175;
    const lx = W / 2 - 110;
    const rx = W / 2 + 110;

    // 前のラベル
    this.add.text(lx, shipY - 58, "進化前", {
      fontFamily: "monospace", fontSize: "10px", color: "#445566",
    }).setOrigin(0.5, 0);

    // 後のラベル
    this.add.text(rx, shipY - 58, "進化後", {
      fontFamily: "monospace", fontSize: "10px", color: "#00aa77",
    }).setOrigin(0.5, 0);

    // 矢印
    this.add.text(W / 2, shipY - 16, "→", {
      fontFamily: "monospace", fontSize: "22px", color: "#336655",
    }).setOrigin(0.5, 0.5);

    // 進化前機体
    const rtPrev = this.add.renderTexture(lx, shipY, 100, 100).setOrigin(0.5, 0.5).setAlpha(0.65);
    ShipVisualizer.bake(this, rtPrev, this.prevWeights);
    rtPrev.setScale(1.3);

    // 進化後機体 (輝く)
    const rtNew = this.add.renderTexture(rx, shipY, 100, 100).setOrigin(0.5, 0.5);
    ShipVisualizer.bake(this, rtNew, this.newWeights);
    rtNew.setScale(1.3);

    // 進化後機体の光彩
    const aura = this.add.graphics();
    aura.fillStyle(0x0066ff, 0.07);
    aura.fillCircle(rx, shipY, 70);
    aura.setDepth(-1);

    // 進化後機体の点滅
    this.tweens.add({
      targets: rtNew,
      alpha: { from: 1, to: 0.75 },
      duration: 900,
      yoyo: true,
      repeat: -1,
    });

    // ── 進化ログ ──
    const logY = 252;
    this.add.text(W / 2, logY, "── 進化ログ ──", {
      fontFamily: "monospace", fontSize: "11px", color: "#334455",
    }).setOrigin(0.5, 0);

    const entries = this.buildEvolutionLog();
    entries.forEach((entry, i) => {
      const y = logY + 22 + i * 24;
      // 背景帯
      if (entry.changed) {
        this.add.rectangle(W / 2, y + 8, 380, 20, entry.delta > 0 ? 0x003322 : 0x220011, 0.7);
      }
      this.add.text(W / 2, y, entry.line, {
        fontFamily: "monospace",
        fontSize: "12px",
        color: entry.changed ? (entry.delta > 0 ? "#44ee99" : "#ff6677") : "#3a4a5a",
      }).setOrigin(0.5, 0);
    });

    // ── ネクストステージボタン ──
    const btnY = H - 44;
    const btn = this.add.rectangle(W / 2, btnY, 220, 44, 0x002211)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0x00aa66)
      .setAlpha(0);

    const btnTxt = this.add.text(W / 2, btnY, `STAGE ${this.stage + 1}  ▶  開始`, {
      fontFamily: "monospace", fontSize: "14px", color: "#00ffaa",
    }).setOrigin(0.5, 0.5).setDepth(1).setAlpha(0);

    this.tweens.add({ targets: [btn, btnTxt], alpha: 1, duration: 400, delay: 800 });

    btn.on("pointerover",  () => { btn.fillColor = 0x003322; });
    btn.on("pointerout",   () => { btn.fillColor = 0x002211; });
    btn.on("pointerdown",  () => {
      this.scene.start("GameScene", {
        stage: this.stage + 1,
        weights: { ...this.newWeights },
      });
    });

    // ── フェードイン ──
    this.cameras.main.fadeIn(400);
  }

  /**
   * 各ウェイトの変化を人間が読めるログに変換する。
   */
  private buildEvolutionLog(): Array<{ line: string; changed: boolean; delta: number }> {
    const pw = this.prevWeights;
    const nw = this.newWeights;
    const THRESHOLD = 0.04; // これ以上変化したら「変化あり」

    const format = (v: number): string => (v * 100).toFixed(0) + "%";

    const entries: Array<{ key: keyof Weights; label: string; descFn: (v: number) => string }> = [
      {
        key: "dodgeSide",
        label: "◈ 回避傾向",
        descFn: (v) => v > 0.55 ? "右回避優位" : v < 0.45 ? "左回避優位" : "中立",
      },
      {
        key: "burstTiming",
        label: "◈ 射撃スタイル",
        descFn: (v) => v > 0.6 ? "バースト型" : v < 0.4 ? "精密型" : "混合型",
      },
      {
        key: "preferredDist",
        label: "◈ 戦闘距離",
        descFn: (v) => v > 0.6 ? "遠距離戦術" : v < 0.4 ? "近接特化" : "中距離",
      },
      {
        key: "moveSpeed",
        label: "◈ 機動性",
        descFn: (v) => v > 0.6 ? "高速機動" : v < 0.4 ? "重装甲型" : "標準",
      },
    ];

    return entries.map(({ key, label, descFn }) => {
      const prev = pw[key];
      const next = nw[key];
      const delta = next - prev;
      const changed = Math.abs(delta) >= THRESHOLD;

      const arrow = !changed ? "  " : delta > 0 ? "▲ " : "▼ ";
      const sign  = !changed ? "    " : delta > 0 ? `+${(delta * 100).toFixed(0)}` : `${(delta * 100).toFixed(0)}`;
      const prevDesc = descFn(prev);
      const nextDesc = descFn(next);

      const line = changed
        ? `${arrow}${label}  ${prevDesc} ${format(prev)} → ${nextDesc} ${format(next)}  (${sign})`
        : `  ${label}  ${nextDesc} ${format(next)}  変化なし`;

      return { line, changed, delta };
    });
  }
}
