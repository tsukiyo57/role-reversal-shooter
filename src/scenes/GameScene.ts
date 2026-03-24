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

// ボス (プレイヤー) は画面上部、ヒーロー (AI) は画面下部
const BOSS_INIT_Y = 80;
const HERO_INIT_Y = H - 90;

export class GameScene extends Phaser.Scene {
  private stage = 1;
  private weights: Weights    = { ...DEFAULT_WEIGHTS };
  private signals: SignalData = { ...DEFAULT_SIGNALS };
  private stageStartTime = 0;

  private player!: Phaser.GameObjects.Arc;
  private playerGfx!: Phaser.GameObjects.Graphics;
  private hero!: Phaser.GameObjects.Image;
  private heroRt!: Phaser.GameObjects.RenderTexture;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private heroBullets!: Phaser.Physics.Arcade.Group;

  private playerHp = PLAYER_HP;
  private playerHpFill!: Phaser.GameObjects.Rectangle;
  private heroLives = HERO_LIVES;
  private heroLivesText!: Phaser.GameObjects.Text;
  private heroInvincible = false;
  private heroInvTimer = 0;

  private accumulator!: SignalAccumulator;
  private eventLog!: EventLog;
  private heroCtrl!: HeroController;
  private debugHud!: DebugHUD;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private giveUpKey!: Phaser.Input.Keyboard.Key;
  private lastPlayerShot = 0;
  private readonly PLAYER_FIRE_RATE = 280;
  private heroShootTimer = 0;

  constructor() { super("GameScene"); }

  init(data: { stage?: number; weights?: Weights }): void {
    if (data.stage)   this.stage   = data.stage;
    if (data.weights) this.weights = { ...data.weights };
    this.playerHp       = PLAYER_HP;
    this.heroLives      = HERO_LIVES;
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

  private createStarfield(): void {
    const g = this.add.graphics();
    for (let i = 0; i < 130; i++) {
      g.fillStyle(0xaabbff, 0.12 + Math.random() * 0.32);
      g.fillCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H),
        Math.random() < 0.12 ? 1.3 : 0.65);
    }
    for (let i = 0; i < 20; i++) {
      g.fillStyle(0xffffff, 0.55 + Math.random() * 0.45);
      g.fillCircle(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 0.7);
    }
    for (let i = 0; i < 2; i++) {
      g.fillStyle(0x223366, 0.06);
      g.fillEllipse(Phaser.Math.Between(60, W - 60), Phaser.Math.Between(60, H - 60),
        Phaser.Math.Between(160, 240), Phaser.Math.Between(60, 100));
    }
  }

  private initSystems(): void {
    this.accumulator = new SignalAccumulator(W, H);
    this.eventLog    = new EventLog();
    this.heroCtrl    = new HeroController({ ...this.weights });
    this.debugHud    = new DebugHUD(this);
  }

  private initUI(): void {
    // ── 上部: BOSS HP (プレイヤーのHP、ボスは上部にいる) ──
    const bossBarY = 18;
    this.add.text(W / 2, bossBarY - 12, "BOSS  HP", {
      fontFamily: "monospace", fontSize: "9px", color: "#882233",
    }).setOrigin(0.5, 1);
    this.add.rectangle(W / 2, bossBarY, 306, 14, 0x100008).setStrokeStyle(1, 0x551122);
    this.playerHpFill = this.add
      .rectangle(W / 2 - 150, bossBarY, 300, 10, 0xdd1133)
      .setOrigin(0, 0.5);

    // ── 下部左: HERO 残機 ──
    this.add.text(14, H - 34, "HERO", {
      fontFamily: "monospace", fontSize: "9px", color: "#2255aa",
    });
    this.heroLivesText = this.add.text(14, H - 22, this.heroLivesStr(), {
      fontFamily: "monospace", fontSize: "15px", color: "#4488ff",
    });

    // ── 上部右: ステージ ──
    this.add.text(W - 10, 8, `◈ STAGE ${this.stage}`, {
      fontFamily: "monospace", fontSize: "11px", color: "#3a4a6a",
    }).setOrigin(1, 0);

    // ヒント
    this.add.text(W - 8, H - 6, "[Z]射撃  [G]ギブアップ  [D]DEBUG", {
      fontFamily: "monospace", fontSize: "8px", color: "#222a36",
    }).setOrigin(1, 1);
  }

  private heroLivesStr(): string {
    return "◆".repeat(this.heroLives) + "◇".repeat(HERO_LIVES - this.heroLives);
  }

  private initEntities(): void {
    // ── ヒーロー (画面下部) ──
    this.heroRt = this.add.renderTexture(W / 2, HERO_INIT_Y, 90, 90).setOrigin(0.5, 0.5);
    ShipVisualizer.bake(this, this.heroRt, this.weights);

    this.hero = this.add.image(W / 2, HERO_INIT_Y, "__DEFAULT").setAlpha(0);
    this.physics.add.existing(this.hero);
    (this.hero.body as Phaser.Physics.Arcade.Body)
      .setCircle(ShipVisualizer.HITBOX_RADIUS)
      .setCollideWorldBounds(true);

    // ── プレイヤー(ボス) 物理ボディ (画面上部) ──
    this.player = this.add.arc(W / 2, BOSS_INIT_Y, 24, 0, 360, false, 0xff0000).setAlpha(0);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    this.playerGfx = this.add.graphics();
    this.drawBossShip(W / 2, BOSS_INIT_Y);

    this.playerBullets = this.physics.add.group();
    this.heroBullets   = this.physics.add.group();

    this.cursors   = this.input.keyboard!.createCursorKeys();
    this.fireKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.giveUpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
  }

  /**
   * ボス機体を描画 (画面上部から下を向いて攻撃する悪の要塞)。
   * キャノンは下向き (+Y)、エンジン排気は上向き (-Y)。
   */
  private drawBossShip(cx: number, cy: number): void {
    const g = this.playerGfx;
    g.clear();

    // シャドウ
    g.fillStyle(0x110005, 0.5);
    g.fillEllipse(cx, cy + 4, 84, 18);

    // ── 上部スカート / エンジンベース (-Y 方向) ──
    g.fillStyle(0x1a000a, 1);
    g.fillRect(cx - 32, cy - 38, 64, 16);
    g.fillTriangle(cx - 32, cy - 38, cx - 44, cy - 48, cx - 32, cy - 48);
    g.fillTriangle(cx + 32, cy - 38, cx + 44, cy - 48, cx + 32, cy - 48);

    // エンジン排気 (上向き)
    g.fillStyle(0x111111, 1);
    g.fillRect(cx - 26, cy - 46, 12, 8);
    g.fillRect(cx + 14, cy - 46, 12, 8);

    g.fillStyle(0xff3300, 0.55);
    g.fillTriangle(cx - 20, cy - 54, cx - 26, cy - 54, cx - 20, cy - 64);
    g.fillTriangle(cx + 20, cy - 54, cx + 26, cy - 54, cx + 20, cy - 64);
    g.fillStyle(0xff9900, 0.3);
    g.fillTriangle(cx - 20, cy - 54, cx - 23, cy - 54, cx - 20, cy - 60);
    g.fillTriangle(cx + 20, cy - 54, cx + 23, cy - 54, cx + 20, cy - 60);

    // ── メインハル ──
    g.fillStyle(0x2a0011, 1);
    g.fillRect(cx - 20, cy - 22, 40, 44);
    g.fillRect(cx - 38, cy - 6, 18, 30);
    g.fillRect(cx + 20, cy - 6, 18, 30);
    g.fillTriangle(cx - 20, cy + 22, cx - 36, cy + 8, cx - 20, cy + 8);
    g.fillTriangle(cx + 20, cy + 22, cx + 36, cy + 8, cx + 20, cy + 8);

    g.fillStyle(0x44001a, 1);
    g.fillRect(cx - 18, cy - 20, 36, 40);
    g.fillStyle(0x550022, 1);
    g.fillRect(cx - 14, cy - 16, 28, 32);

    // ── サイドタレット ──
    g.fillStyle(0x180010, 1);
    g.fillRect(cx - 50, cy - 4, 14, 10);
    g.fillStyle(0x111111, 1);
    g.fillRect(cx - 46, cy + 4, 5, 14);
    g.fillStyle(0xaa2233, 0.7);
    g.fillCircle(cx - 43, cy + 18, 3.5);

    g.fillStyle(0x180010, 1);
    g.fillRect(cx + 36, cy - 4, 14, 10);
    g.fillStyle(0x111111, 1);
    g.fillRect(cx + 41, cy + 4, 5, 14);
    g.fillStyle(0xaa2233, 0.7);
    g.fillCircle(cx + 43, cy + 18, 3.5);

    // ── メインキャノン (下向き +Y) ──
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(cx - 6, cy + 20, 12, 20);
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(cx - 4, cy + 36, 8, 10);
    g.fillStyle(0xff1133, 0.85);
    g.fillCircle(cx, cy + 46, 4.5);
    g.fillStyle(0xff5566, 0.45);
    g.fillCircle(cx, cy + 46, 8);

    // ── コア / 邪悪な目 ──
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

    g.lineStyle(1, 0x880022, 0.4);
    g.strokeCircle(cx, cy, 20);
  }

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

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

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

    // プレイヤー操作
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    if (this.cursors.left.isDown)  body.setVelocityX(-PLAYER_SPEED);
    if (this.cursors.right.isDown) body.setVelocityX(PLAYER_SPEED);
    if (this.cursors.up.isDown)    body.setVelocityY(-PLAYER_SPEED);
    if (this.cursors.down.isDown)  body.setVelocityY(PLAYER_SPEED);

    this.drawBossShip(this.player.x, this.player.y);

    const now = this.time.now;
    if (this.fireKey.isDown && now - this.lastPlayerShot > this.PLAYER_FIRE_RATE) {
      this.firePlayerBullet(px, py, hx, hy);
      this.lastPlayerShot = now;
    }

    this.accumulator.tick(px, py, hx, hy);

    if (Phaser.Input.Keyboard.JustDown(this.giveUpKey)) {
      this.gameOver();
      return;
    }

    // AI 更新
    const fakeHp = ([0, 2, 5, 10] as const)[Math.max(0, Math.min(3, this.heroLives))];
    const { vx, vy, shoot } = this.heroCtrl.update(dt, hx, hy, px, py, fakeHp, 10);
    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
    this.heroRt.setPosition(this.hero.x, this.hero.y);

    if (!this.heroInvincible) {
      this.heroShootTimer -= delta;
      if (shoot && this.heroShootTimer <= 0) {
        this.fireHeroBullet(hx, hy, px, py);
        this.heroShootTimer = 600 - this.weights.burstTiming * 300;
      }
    }

    this.cleanupBullets(this.playerBullets);
    this.cleanupBullets(this.heroBullets);

    const liveFireRate = this.eventLog.getFireRate(this.time.now - this.stageStartTime);
    this.debugHud.update(this.accumulator.normalize(liveFireRate), this.weights, this.heroCtrl.getState());
  }

  // ── 弾発射 ──────────────────────────────────────────────
  private firePlayerBullet(px: number, py: number, tx: number, ty: number): void {
    const angle  = Math.atan2(ty - py, tx - px);
    const spread = (Math.random() - 0.5) * 0.10;

    // ボス弾: 赤 — ボス機体の配色に合わせる
    const bullet = this.add.arc(px, py + 14, 4, 0, 360, false, 0xff2244);
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

    // ヒーロー弾: シアン青 — ヒーロー機体の配色に合わせる
    const bullet = this.add.arc(hx, hy - 14, 5, 0, 360, false, 0x44aaff);
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
      if (bullet.y < -24 || bullet.y > H + 24 || bullet.x < -24 || bullet.x > W + 24)
        bullet.destroy();
      return true;
    });
  }

  // ── ヒット処理 ───────────────────────────────────────────
  private onHeroHit(): void {
    this.heroLives = Math.max(0, this.heroLives - 1);
    this.heroLivesText.setText(this.heroLivesStr());

    if (this.heroLives <= 0) { this.stageClear(); return; }

    // 残機あり → 位置そのまま・無敵時間のみ
    this.heroInvincible = true;
    this.heroInvTimer   = 2000;

    this.tweens.killTweensOf(this.heroRt);
    this.tweens.add({
      targets: this.heroRt,
      alpha: { from: 0.15, to: 0.9 },
      duration: 160, repeat: 10, yoyo: true,
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

  // ── ステージ遷移 ─────────────────────────────────────────
  private stageClear(): void {
    const duration    = this.time.now - this.stageStartTime;
    const fireRate    = this.eventLog.getFireRate(duration);
    this.signals      = this.accumulator.normalize(fireRate);

    const prevWeights = { ...this.weights };
    const newWeights  = updateWeights(this.weights, this.signals);

    this.scene.start("StageClearScene", { stage: this.stage, prevWeights, newWeights });
  }

  private gameOver(): void {
    this.scene.start("GameOverScene", { weights: { ...this.weights }, stageReached: this.stage });
  }
}
