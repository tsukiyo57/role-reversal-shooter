import Phaser from "phaser";
import type { Weights } from "../types";
import { ShipVisualizer } from "../visual/ShipVisualizer";
import { ShipImageGenerator } from "../ai/ShipImageGenerator";

/**
 * ステージクリア画面。
 *
 * ComfyUI (localhost:8188) が起動中なら animagine-xl-4.0 で機体画像を AI 生成し、
 * 起動していない場合は手続き型描画 (ShipVisualizer) にフォールバックする。
 */
export class StageClearScene extends Phaser.Scene {
  private stage = 1;
  private prevWeights: Weights = {} as Weights;
  private newWeights:  Weights = {} as Weights;
  private aiTextureKey: string | null = null;
  private prevHeroTextureKey: string | null = null;

  constructor() { super("StageClearScene"); }

  init(data: { stage: number; prevWeights: Weights; newWeights: Weights; prevHeroTextureKey?: string | null }): void {
    this.stage              = data.stage;
    this.prevWeights        = data.prevWeights;
    this.newWeights         = data.newWeights;
    this.prevHeroTextureKey = data.prevHeroTextureKey ?? null;
    this.aiTextureKey       = null;
  }

  create(): void {
    const W = this.cameras.main.width;
    const H = this.cameras.main.height;

    this.cameras.main.setBackgroundColor(0x04040f);

    // 星空
    const sg = this.add.graphics();
    for (let i = 0; i < 100; i++) {
      sg.fillStyle(0xaabbff, 0.1 + Math.random() * 0.25);
      sg.fillCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
        Math.random() < 0.15 ? 1.2 : 0.65);
    }

    // ── ヘッダー ──
    const header = this.add.text(W / 2, 24, `STAGE  ${this.stage}  CLEAR`, {
      fontFamily: "monospace", fontSize: "28px", color: "#00ffaa",
      shadow: { offsetX: 0, offsetY: 0, color: "#00cc88", blur: 18, fill: true },
    }).setOrigin(0.5, 0).setAlpha(0);

    const sub = this.add.text(W / 2, 62, "ヒーローが学習し、さらに強化された", {
      fontFamily: "monospace", fontSize: "12px", color: "#446655",
    }).setOrigin(0.5, 0).setAlpha(0);

    this.tweens.add({ targets: header, alpha: 1, duration: 500 });
    this.tweens.add({ targets: sub,    alpha: 1, duration: 600, delay: 200 });

    // ── 機体ビジュアル ──
    const shipY  = 175;
    const prevX  = W / 2 - 118;
    const nextX  = W / 2 + 118;

    this.add.text(prevX, shipY - 56, "進化前", {
      fontFamily: "monospace", fontSize: "10px", color: "#445566",
    }).setOrigin(0.5, 0);
    this.add.text(nextX, shipY - 56, "進化後", {
      fontFamily: "monospace", fontSize: "10px", color: "#00aa77",
    }).setOrigin(0.5, 0);
    this.add.text(W / 2, shipY - 14, "→", {
      fontFamily: "monospace", fontSize: "22px", color: "#336655",
    }).setOrigin(0.5, 0.5);

    // 進化前: AI生成済みテクスチャがあればそれを使用、なければ手続き型
    const rtPrev = this.add.renderTexture(prevX, shipY, 100, 100).setOrigin(0.5, 0.5).setAlpha(0.55);
    if (this.prevHeroTextureKey && this.textures.exists(this.prevHeroTextureKey)) {
      const tempImg = this.add.image(-1000, -1000, this.prevHeroTextureKey);
      const src = this.textures.get(this.prevHeroTextureKey).getSourceImage() as HTMLImageElement;
      const sc = Math.min(88 / src.width, 88 / src.height);
      tempImg.setScale(sc);
      rtPrev.draw(tempImg, 50, 50);
      tempImg.destroy();
    } else {
      ShipVisualizer.bake(this, rtPrev, this.prevWeights);
    }
    rtPrev.setScale(1.3);

    // 進化後: AI 生成を試みる (ローディング表示 → 差し替え)
    const rtNew = this.add.renderTexture(nextX, shipY, 100, 100).setOrigin(0.5, 0.5);
    ShipVisualizer.bake(this, rtNew, this.newWeights);
    rtNew.setScale(1.3);

    // 光彩
    const aura = this.add.graphics();
    aura.fillStyle(0x0066ff, 0.07);
    aura.fillCircle(nextX, shipY, 72);
    aura.setDepth(-1);

    this.tweens.add({
      targets: rtNew, alpha: { from: 1, to: 0.72 },
      duration: 900, yoyo: true, repeat: -1,
    });

    // ── AI 生成ラベル ──
    const aiLabel = this.add.text(nextX, shipY + 58, "手続き型描画", {
      fontFamily: "monospace", fontSize: "9px", color: "#335544",
    }).setOrigin(0.5, 0);

    // ComfyUI 利用可能なら非同期生成
    this.tryAIGeneration(rtNew, aiLabel, nextX, shipY);

    // ── 進化ログ ──
    const logY = 258;
    this.add.text(W / 2, logY, "── 進化ログ ──", {
      fontFamily: "monospace", fontSize: "11px", color: "#334455",
    }).setOrigin(0.5, 0);

    this.buildEvolutionLog().forEach((entry, i) => {
      const y = logY + 22 + i * 24;
      if (entry.changed) {
        this.add.rectangle(W / 2, y + 9, 390, 20,
          entry.delta > 0 ? 0x003322 : 0x220011, 0.7);
      }
      this.add.text(W / 2, y, entry.line, {
        fontFamily: "monospace", fontSize: "12px",
        color: entry.changed ? (entry.delta > 0 ? "#44ee99" : "#ff6677") : "#3a4a5a",
      }).setOrigin(0.5, 0);
    });

    // ── ネクストステージボタン ──
    const btnY = H - 40;
    const btn = this.add.rectangle(W / 2, btnY, 220, 42, 0x002211)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0x00aa66).setAlpha(0);
    const btnTxt = this.add.text(W / 2, btnY, `STAGE ${this.stage + 1}  ▶  開始`, {
      fontFamily: "monospace", fontSize: "14px", color: "#00ffaa",
    }).setOrigin(0.5, 0.5).setDepth(1).setAlpha(0);

    this.tweens.add({ targets: [btn, btnTxt], alpha: 1, duration: 400, delay: 900 });

    btn.on("pointerover",  () => { btn.fillColor = 0x003322; });
    btn.on("pointerout",   () => { btn.fillColor = 0x002211; });
    btn.on("pointerdown",  () => {
      this.scene.start("GameScene", { stage: this.stage + 1, weights: { ...this.newWeights }, heroTextureKey: this.aiTextureKey });
    });

    this.cameras.main.fadeIn(400);
  }

  // ─────────────────────────────────────────────────────────
  //  AI 画像生成 (非同期、失敗してもフォールバック済み)
  // ─────────────────────────────────────────────────────────
  private async tryAIGeneration(
    rt: Phaser.GameObjects.RenderTexture,
    label: Phaser.GameObjects.Text,
    x: number,
    y: number,
  ): Promise<void> {
    const available = await ShipImageGenerator.isAvailable();
    console.log("[StageClearScene] ComfyUI available:", available);
    if (!available) return;

    label.setText("AI 生成中…").setColor("#558866");

    // 手続き型RTをベース画像としてキャプチャ（平面視を保証するため）
    const baseBlob = await new Promise<Blob | null>((resolve) => {
      try {
        rt.snapshot((snap) => {
          if (!(snap instanceof HTMLImageElement)) { resolve(null); return; }
          const canvas = document.createElement("canvas");
          canvas.width = 512; canvas.height = 512;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 512, 512);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(snap, 0, 0, 512, 512);
          canvas.toBlob(b => resolve(b), "image/png");
        });
      } catch { resolve(null); }
    });

    // 生成中アニメーション
    const loadingTween = this.tweens.add({
      targets: rt, alpha: { from: 0.3, to: 0.9 },
      duration: 400, yoyo: true, repeat: -1,
    });

    const blobUrl = await ShipImageGenerator.generate(this.newWeights, baseBlob);

    loadingTween.stop();
    this.tweens.killTweensOf(rt);

    console.log("[StageClearScene] blobUrl:", blobUrl, "isActive:", this.scene.isActive());
    if (!blobUrl || !this.scene.isActive()) {
      label.setText(blobUrl ? "シーン終了" : "生成失敗").setColor("#554433");
      return;
    }

    // 生成成功: 画像テクスチャとして読み込んでRTに差し替え
    // タイムスタンプで一意なキーにしてPhaserキャッシュ衝突を回避
    const key = `ai_ship_${Date.now()}`;

    const onLoaded = () => {
      if (!this.scene.isActive()) return;
      const img = this.add.image(x, y, key).setOrigin(0.5, 0.5);
      const maxSize = 130;
      const tex = this.textures.get(key).getSourceImage() as HTMLImageElement;
      const scale = Math.min(maxSize / tex.width, maxSize / tex.height);
      img.setScale(scale);
      img.setDepth(rt.depth + 1);
      rt.setVisible(false);

      this.tweens.add({
        targets: img, alpha: { from: 1, to: 0.72 },
        duration: 900, yoyo: true, repeat: -1,
      });

      this.aiTextureKey = key;
      label.setText("AI 生成").setColor("#00ffaa");
      URL.revokeObjectURL(blobUrl);
    };

    if (this.textures.exists(key)) {
      // 既にキャッシュ済み (通常は起きないがフォールバック)
      onLoaded();
    } else {
      this.load.image(key, blobUrl);
      this.load.once("complete", onLoaded);
      this.load.start();
    }
  }

  // ─────────────────────────────────────────────────────────
  //  進化ログ
  // ─────────────────────────────────────────────────────────
  private buildEvolutionLog(): Array<{ line: string; changed: boolean; delta: number }> {
    const pw = this.prevWeights;
    const nw = this.newWeights;
    const THRESHOLD = 0.04;
    const fmt = (v: number) => (v * 100).toFixed(0) + "%";

    const entries: Array<{ key: keyof Weights; label: string; descFn: (v: number) => string }> = [
      { key: "dodgeSide",    label: "◈ 回避傾向 ",
        descFn: (v) => v > 0.55 ? "右優位" : v < 0.45 ? "左優位" : "中立" },
      { key: "burstTiming",  label: "◈ 射撃スタイル",
        descFn: (v) => v > 0.6 ? "バースト型" : v < 0.4 ? "精密型" : "混合型" },
      { key: "preferredDist",label: "◈ 戦闘距離  ",
        descFn: (v) => v > 0.6 ? "遠距離" : v < 0.4 ? "近接" : "中距離" },
      { key: "moveSpeed",    label: "◈ 機動性   ",
        descFn: (v) => v > 0.6 ? "高速" : v < 0.4 ? "重装甲" : "標準" },
    ];

    return entries.map(({ key, label, descFn }) => {
      const prev  = pw[key];
      const next  = nw[key];
      const delta = next - prev;
      const changed = Math.abs(delta) >= THRESHOLD;

      const arrow = changed ? (delta > 0 ? "▲ " : "▼ ") : "  ";
      const sign  = changed
        ? (delta > 0 ? `+${(delta * 100).toFixed(0)}` : `${(delta * 100).toFixed(0)}`)
        : "    ";

      const line = changed
        ? `${arrow}${label}  ${descFn(prev)} ${fmt(prev)} → ${descFn(next)} ${fmt(next)}  (${sign})`
        : `  ${label}  ${descFn(next)} ${fmt(next)}  変化なし`;

      return { line, changed, delta };
    });
  }
}
