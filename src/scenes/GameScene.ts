import Phaser from "phaser";
import { SignalAccumulator } from "../signals/SignalAccumulator";
import { EventLog } from "../signals/EventLog";
import { updateWeights } from "../ai/WeightUpdater";
import { HeroController } from "../ai/HeroController";
import { ShipVisualizer } from "../visual/ShipVisualizer";
import { DebugHUD } from "../ui/DebugHUD";
import { DEFAULT_WEIGHTS, DEFAULT_SIGNALS } from "../types";
import type { Weights, SignalData } from "../types";

const W = 640;
const H = 480;
const PLAYER_HP    = 10;
const HERO_LIVES   = 3;
const BULLET_SPEED = 380;
const PLAYER_SPEED = 200;

export class GameScene extends Phaser.Scene {
  // ── ゲーム状態 ──
  private stage = 1;
  private weights: Weights    = { ...DEFAULT_WEIGHTS };
  private signals: SignalData = { ...DEFAULT_SIGNALS };
  private stageStartTime = 0;

  // ── エンティティ ──
  private player!: Phaser.GameObjects.Arc;          // 物理ボディ (不可視)
  private playerGfx!: Phaser.GameObjects.Graphics;  // ボス機体描画
  private hero!: Phaser.GameObjects.Image;
  private heroRt!: Phaser.GameObjects.RenderTexture;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private heroBullets!: Phaser.Physics.Arcade.Group;

  // ── HP / 残機 ──
  private playerHp = PLAYER_HP;
  private playerHpFill!: Phaser.GameObjects.Rectangle;
  private heroLives = HERO_LIVES;
  private heroLivesText!: Phaser.GameObjects.Text;
  private heroInvincible = false;
  private heroInvTimer = 0;

  // ── システム ──
  private accumulator!: SignalAccumulator;
  private eventLog!: EventLog;
  private heroCtrl!: HeroController;
  private debugHud!: DebugHUD;

  // ── 入力 ──
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private giveUpKey!: Phaser.Input.Keyboard.Key;
  private lastPlayerShot = 0;
  private readonly PLAYER_FIRE_RATE = 280;

  // ── ヒーロー射撃タイマー ──
  private heroShootTimer = 0;

  constructor() {
    super("GameScene");
  }

  init(data: { stage?: number; weights?: Weights }): void {
    if (data.stage)   this.stage   = data.stage;
    if (data.weights) this.weights = { ...data.weights };
    this.playerHp     = PLAYER_HP;
    this.heroLives    = HERO_LIVES;
    this.heroInvincible = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x03030d);
    this.createStarfield();
    this.initSystems();
    this.initUI();
    this.initEntities();
    this.initPhysics();
    this.stageStartTime = this.time.now;
    this.cameras.main.fadeIn(300);
  }

  // ─────────────────────────────────────────────────────────
  //  星空背景
  // ─────────────────────────────────────────────────────────
  private createStarfield(): void {
    const g = this.add.graphics();
    for (let i = 0; i < 130; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H);
      const r = Math.random() < 0.12 ? 1.3 : 0.65;
      g.fillStyle(0xaabbff, 0.12 + Math.random() * 0.32);
      g.fillCircle(x, y, r);
    }
    for (let i = 0; i < 20; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H);
      g.fillStyle(0xffffff, 0.55 + Math.random() * 0.45);
      g.fillCircle(x, y, 0.7);
    }
    // 遠い星雲
    for (let i = 0; i < 2; i++) {
      g.fillStyle(0x223366, 0.06);
      g.fillEllipse(
        Phaser.Math.Between(60, W - 60),
        Phaser.Math.Between(60, H - 60),
        Phaser.Math.Between(160, 240),
        Phaser.Math.Between(60, 100),
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  //  システム初期化
  // ─────────────────────────────────────────────────────────
  private initSystems(): void {
    this.accumulator = new SignalAccumulator(W, H);
    this.eventLog    = new EventLog();
    this.heroCtrl    = new HeroController({ ...this.weights });
    this.debugHud    = new DebugHUD(this);
  }

  // ─────────────────────────────────────────────────────────
  //  UI
  // ─────────────────────────────────────────────────────────
  private initUI(): void {
    // ── 上部左: ヒーロー残機 ──
    this.add.text(14, 10, "HERO", {
      fontFamily: "monospace", fontSize: "9px", color: "#2255aa",
    });
    this.heroLivesText = this.add.text(14, 22, this.heroLivesStr(), {
      fontFamily: "monospace", fontSize: "15px", color: "#4488ff",
    });

    // ── 上部中央: ステージ ──
    this.add.text(W / 2, 10, `◈  STAGE ${this.stage}  ◈`, {
      fontFamily: "monospace", fontSize: "11px", color: "#3a4a6a",
    }).setOrigin(0.5, 0);

    // ── 下部: ボスHPバー ──
    const barY = H - 18;
    this.add.text(W / 2, barY - 14, "BOSS  HP", {
      fontFamily: "monospace", fontSize: "9px", color: "#882233",
    }).setOrigin(0.5, 1);
    this.add.rectangle(W / 2, barY, 306, 14, 0x100008).setStrokeStyle(1, 0x551122);
    this.playerHpFill = this.add
      .rectangle(W / 2 - 150, barY, 300, 10, 0xdd1133)
      .setOrigin(0, 0.5);

    // ヒント
    this.add.text(W - 8, H - 6, "[Z]射撃  [G]ギブアップ  [D]DEBUG", {
      fontFamily: "monospace", fontSize: "8px", color: "#222a36",
    }).setOrigin(1, 1);
  }

  private heroLivesStr(): string {
    return "◆".repeat(this.heroLives) + "◇".repeat(HERO_LIVES - this.heroLives);
  }

  // ─────────────────────────────────────────────────────────
  //  エンティティ
  // ─────────────────────────────────────────────────────────
  private initEntities(): void {
    // ヒーロー (上部)
    this.heroRt = this.add.renderTexture(W / 2, 100, 90, 90).setOrigin(0.5, 0.5);
    ShipVisualizer.bake(this, this.heroRt, this.weights);

    this.hero = this.add.image(W / 2, 100, "__DEFAULT").setAlpha(0);
    this.physics.add.existing(this.hero);
    (this.hero.body as Phaser.Physics.Arcade.Body)
      .setCircle(ShipVisualizer.HITBOX_RADIUS)
      .setCollideWorldBounds(true);

    // プレイヤー(ボス) 物理ボディ (不可視)
    this.player = this.add.arc(W / 2, H - 72, 24, 0, 360, false, 0xff0000).setAlpha(0);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // ボス機体グラフィック
    this.playerGfx = this.add.graphics();
    this.drawBossShip(W / 2, H - 72);

    // 弾グループ
    this.playerBullets = this.physics.add.group();
    this.heroBullets   = this.physics.add.group();

    // 入力
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.fireKey  = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.giveUpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
  }

  /**
   * ボス機体を描画する（Gradius ボスラッシュ / 悪の要塞スタイル）。
   * 毎フレーム clear() して再描画することで移動に追従する。
   *
   * 配色: 深紅 + 暗紫 + 赤いコア
   * 形状: 幅広の六角形ハル + 上向きキャノン + サイドタレット + 赤い「目」
   */
  private drawBossShip(cx: number, cy: number): void {
    const g = this.playerGfx;
    g.clear();

    // ── シャドウ ──
    g.fillStyle(0x110005, 0.55);
    g.fillEllipse(cx, cy + 6, 84, 20);

    // ── 下部スカート / エンジンベース ──
    g.fillStyle(0x1a000a, 1);
    g.fillRect(cx - 32, cy + 22, 64, 16);
    g.fillTriangle(cx - 32, cy + 38, cx - 44, cy + 48, cx - 32, cy + 48);
    g.fillTriangle(cx + 32, cy + 38, cx + 44, cy + 48, cx + 32, cy + 48);

    // エンジン排気
    g.fillStyle(0x111111, 1);
    g.fillRect(cx - 26, cy + 38, 12, 8);
    g.fillRect(cx + 14, cy + 38, 12, 8);

    // 排気炎
    g.fillStyle(0xff3300, 0.55);
    g.fillTriangle(cx - 20, cy + 46, cx - 26, cy + 46, cx - 20, cy + 56);
    g.fillTriangle(cx + 20, cy + 46, cx + 26, cy + 46, cx + 20, cy + 56);
    g.fillStyle(0xff9900, 0.3);
    g.fillTriangle(cx - 20, cy + 46, cx - 23, cy + 46, cx - 20, cy + 52);
    g.fillTriangle(cx + 20, cy + 46, cx + 23, cy + 46, cx + 20, cy + 52);

    // ── メインハル (幅広六角形) ──
    g.fillStyle(0x2a0011, 1);
    // 中央ブロック
    g.fillRect(cx - 20, cy - 20, 40, 42);
    // 側面張り出し
    g.fillRect(cx - 38, cy - 6,  18, 30);
    g.fillRect(cx + 20, cy - 6,  18, 30);
    // 肩部 (上側アーク)
    g.fillTriangle(cx - 20, cy - 20, cx - 36, cy - 8, cx - 20, cy - 8);
    g.fillTriangle(cx + 20, cy - 20, cx + 36, cy - 8, cx + 20, cy - 8);

    // ── 装甲パネル (ハイライト層) ──
    g.fillStyle(0x44001a, 1);
    g.fillRect(cx - 18, cy - 18, 36, 38);
    g.fillStyle(0x550022, 1);
    g.fillRect(cx - 14, cy - 14, 28, 30);

    // ── サイドタレット ──
    // 左
    g.fillStyle(0x180010, 1);
    g.fillRect(cx - 50, cy - 2, 14, 10);
    g.fillStyle(0x220015, 1);
    g.fillRect(cx - 48, cy - 2, 10, 6);
    // 左キャノン上向き
    g.fillStyle(0x111111, 1);
    g.fillRect(cx - 46, cy - 14, 5, 14);
    g.fillStyle(0xaa2233, 0.7);
    g.fillCircle(cx - 43, cy - 14, 3.5);

    // 右
    g.fillStyle(0x180010, 1);
    g.fillRect(cx + 36, cy - 2, 14, 10);
    g.fillStyle(0x220015, 1);
    g.fillRect(cx + 38, cy - 2, 10, 6);
    // 右キャノン上向き
    g.fillStyle(0x111111, 1);
    g.fillRect(cx + 41, cy - 14, 5, 14);
    g.fillStyle(0xaa2233, 0.7);
    g.fillCircle(cx + 43, cy - 14, 3.5);

    // ── メインキャノン (上向き) ──
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(cx - 6, cy - 38, 12, 20);
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(cx - 4, cy - 44, 8, 10);
    // キャノン先端グロー
    g.fillStyle(0xff1133, 0.85);
    g.fillCircle(cx, cy - 44, 4.5);
    g.fillStyle(0xff5566, 0.45);
    g.fillCircle(cx, cy - 44, 8);

    // ── コア / 邪悪な「目」 ──
    g.fillStyle(0x440010, 1);
    g.fillCircle(cx, cy, 15);
    g.fillStyle(0x990022, 1);
    g.fillCircle(cx, cy, 11);
    g.fillStyle(0xff1133, 0.95);
    g.fillCircle(cx, cy, 7.5);
    g.fillStyle(0xff7788, 0.65);
    g.fillCircle(cx, cy, 4);
    g.fillStyle(0xffffff, 0.45);
    g.fillCircle(cx - 2.5, cy - 2.5, 2);

    // ── エネルギーリング ──
    g.lineStyle(1, 0x880022, 0.4);
    g.strokeCircle(cx, cy, 20);
    g.lineStyle(1, 0x440011, 0.25);
    g.strokeCircle(cx, cy, 28);
  }

  // ─────────────────────────────────────────────────────────
  //  物理 (衝突判定)
  // ─────────────────────────────────────────────────────────
  private initPhysics(): void {
    this.physics.add.overlap(this.playerBullets, this.hero, (_, bullet) => {
      if (this.heroInvincible) return;
      (bullet as Phaser.GameObjects.Arc).destroy();
      this.onHeroHit();
    });

    this.physics.add.overlap(this.heroBullets, this.player, (_, bullet) => {
      (bullet as Phaser.GameObjects.Arc).destroy();
      this.onPlayerHit();
    });
  }

  // ─────────────────────────────────────────────────────────
  //  毎フレーム更新
  // ─────────────────────────────────────────────────────────
  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    // 無敵タイマー
    if (this.heroInvincible) {
      this.heroInvTimer -= delta;
      if (this.heroInvTimer <= 0) {
        this.heroInvincible = false;
        this.heroRt.setAlpha(1);
        this.tweens.killTweensOf(this.heroRt);
      }
    }

    const px = this.player.x;
    const py = this.player.y;
    const hx = this.hero.x;
    const hy = this.hero.y;

    // ── プレイヤー操作 ──
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    if (this.cursors.left.isDown)  body.setVelocityX(-PLAYER_SPEED);
    if (this.cursors.right.isDown) body.setVelocityX(PLAYER_SPEED);
    if (this.cursors.up.isDown)    body.setVelocityY(-PLAYER_SPEED);
    if (this.cursors.down.isDown)  body.setVelocityY(PLAYER_SPEED);

    // ボス機体をボディ位置に追従
    this.drawBossShip(this.player.x, this.player.y);

    // ── 射撃 ──
    const now = this.time.now;
    if (this.fireKey.isDown && now - this.lastPlayerShot > this.PLAYER_FIRE_RATE) {
      this.firePlayerBullet(px, py, hx, hy);
      this.lastPlayerShot = now;
    }

    // ── シグナル収集 ──
    this.accumulator.tick(px, py, hx, hy);

    // ── ギブアップ [G] ──
    if (Phaser.Input.Keyboard.JustDown(this.giveUpKey)) {
      this.gameOver();
      return;
    }

    // ── AI ヒーロー更新 ──
    // 残機 → フェイクHP (1残機 → ratio 0.2 → DODGE モード発動)
    const fakeHp = ([0, 2, 5, 10] as const)[Math.max(0, Math.min(3, this.heroLives))];
    const { vx, vy, shoot } = this.heroCtrl.update(dt, hx, hy, px, py, fakeHp, 10);
    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
    this.heroRt.setPosition(this.hero.x, this.hero.y);

    // ── ヒーロー射撃 ──
    if (!this.heroInvincible) {
      this.heroShootTimer -= delta;
      if (shoot && this.heroShootTimer <= 0) {
        this.fireHeroBullet(hx, hy, px, py);
        this.heroShootTimer = 600 - this.weights.burstTiming * 300;
      }
    }

    // ── 範囲外弾の削除 ──
    this.cleanupBullets(this.playerBullets);
    this.cleanupBullets(this.heroBullets);

    // ── デバッグ HUD ──
    const liveFireRate = this.eventLog.getFireRate(this.time.now - this.stageStartTime);
    const liveSignals  = this.accumulator.normalize(liveFireRate);
    this.debugHud.update(liveSignals, this.weights, this.heroCtrl.getState());
  }

  // ─────────────────────────────────────────────────────────
  //  弾発射
  // ─────────────────────────────────────────────────────────
  private firePlayerBullet(px: number, py: number, tx: number, ty: number): void {
    const angle  = Math.atan2(ty - py, tx - px);
    const spread = (Math.random() - 0.5) * 0.10;

    // ★ group.add() AFTER 作成、THEN setVelocity
    const bullet = this.add.arc(px, py - 14, 4, 0, 360, false, 0x00ffbb);
    bullet.setDepth(5);
    this.playerBullets.add(bullet);
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle + spread) * BULLET_SPEED,
      Math.sin(angle + spread) * BULLET_SPEED,
    );

    this.accumulator.recordShot(angle);
    this.eventLog.recordShot(this.time.now);
  }

  private fireHeroBullet(hx: number, hy: number, tx: number, ty: number): void {
    const angle = Math.atan2(ty - hy, tx - hx);
    const bullet = this.add.arc(hx, hy + 14, 5, 0, 360, false, 0xff2244);
    bullet.setDepth(5);
    this.heroBullets.add(bullet);
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle) * BULLET_SPEED * 0.82,
      Math.sin(angle) * BULLET_SPEED * 0.82,
    );
  }

  private cleanupBullets(group: Phaser.Physics.Arcade.Group): void {
    group.children.each((b) => {
      const bullet = b as Phaser.GameObjects.Arc;
      if (bullet.y < -24 || bullet.y > H + 24 || bullet.x < -24 || bullet.x > W + 24) {
        bullet.destroy();
      }
      return true;
    });
  }

  // ─────────────────────────────────────────────────────────
  //  ヒット処理
  // ─────────────────────────────────────────────────────────
  private onHeroHit(): void {
    this.heroLives = Math.max(0, this.heroLives - 1);
    this.heroLivesText.setText(this.heroLivesStr());

    if (this.heroLives <= 0) {
      this.stageClear();
      return;
    }

    // 残機あり → 位置はそのまま、無敵時間だけ付与
    this.heroInvincible = true;
    this.heroInvTimer   = 2000;

    this.tweens.killTweensOf(this.heroRt);
    this.tweens.add({
      targets:  this.heroRt,
      alpha:    { from: 0.15, to: 0.9 },
      duration: 160,
      repeat:   10,
      yoyo:     true,
      onComplete: () => { this.heroRt.setAlpha(1); },
    });

    this.cameras.main.flash(250, 0, 60, 200, false);
  }

  private onPlayerHit(): void {
    this.playerHp = Math.max(0, this.playerHp - 1);
    this.playerHpFill.width = (this.playerHp / PLAYER_HP) * 300;
    this.cameras.main.flash(180, 180, 0, 0, false);
    if (this.playerHp <= 0) this.gameOver();
  }

  // ─────────────────────────────────────────────────────────
  //  ステージクリア / ゲームオーバー
  // ─────────────────────────────────────────────────────────
  private stageClear(): void {
    const duration  = this.time.now - this.stageStartTime;
    const fireRate  = this.eventLog.getFireRate(duration);
    this.signals    = this.accumulator.normalize(fireRate);

    const prevWeights = { ...this.weights };
    const newWeights  = updateWeights(this.weights, this.signals);

    this.scene.start("StageClearScene", {
      stage:       this.stage,
      prevWeights,
      newWeights,
    });
  }

  private gameOver(): void {
    this.scene.start("GameOverScene", {
      weights:      { ...this.weights },
      stageReached: this.stage,
    });
  }
}
