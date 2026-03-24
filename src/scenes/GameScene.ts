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
const PLAYER_HP = 10;
const HERO_LIVES = 3;
const BULLET_SPEED = 380;
const PLAYER_SPEED = 200;

export class GameScene extends Phaser.Scene {
  // --- ゲーム状態 ---
  private stage = 1;
  private weights: Weights = { ...DEFAULT_WEIGHTS };
  private signals: SignalData = { ...DEFAULT_SIGNALS };
  private stageStartTime = 0;

  // --- エンティティ ---
  private player!: Phaser.GameObjects.Arc;          // 物理ボディ(不可視)
  private playerGfx!: Phaser.GameObjects.Graphics;  // ボス機体ビジュアル
  private hero!: Phaser.GameObjects.Image;
  private heroRt!: Phaser.GameObjects.RenderTexture;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private heroBullets!: Phaser.Physics.Arcade.Group;

  // --- HP / 残機 ---
  private playerHp = PLAYER_HP;
  private playerHpFill!: Phaser.GameObjects.Rectangle;
  private heroLives = HERO_LIVES;
  private heroLivesText!: Phaser.GameObjects.Text;
  private heroInvincible = false;
  private heroRespawnTimer = 0;

  // --- システム ---
  private accumulator!: SignalAccumulator;
  private eventLog!: EventLog;
  private heroCtrl!: HeroController;
  private debugHud!: DebugHUD;

  // --- 入力 ---
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private giveUpKey!: Phaser.Input.Keyboard.Key;
  private lastPlayerShot = 0;
  private readonly PLAYER_FIRE_RATE = 280;

  // --- ヒーロー射撃タイマー ---
  private heroShootTimer = 0;

  constructor() {
    super("GameScene");
  }

  init(data: { stage?: number; weights?: Weights }): void {
    if (data.stage) this.stage = data.stage;
    if (data.weights) this.weights = { ...data.weights };
    this.playerHp = PLAYER_HP;
    this.heroLives = HERO_LIVES;
    this.heroInvincible = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x04040f);

    this.createStarfield();
    this.initSystems();
    this.initUI();
    this.initEntities();
    this.initPhysics();

    this.stageStartTime = this.time.now;
  }

  // ─── 星空背景 ───────────────────────────────────────────────
  private createStarfield(): void {
    const g = this.add.graphics();

    // 遠い星 (暗め・小さい)
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H);
      const size = Math.random() < 0.15 ? 1.2 : 0.7;
      const alpha = 0.15 + Math.random() * 0.35;
      g.fillStyle(0xaabbff, alpha);
      g.fillCircle(x, y, size);
    }
    // 明るい星 (少数)
    for (let i = 0; i < 25; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H);
      g.fillStyle(0xffffff, 0.6 + Math.random() * 0.4);
      g.fillCircle(x, y, 0.8);
    }
    // 遠くの星雲 (ぼんやりした大きい楕円)
    for (let i = 0; i < 3; i++) {
      const x = Phaser.Math.Between(50, W - 50);
      const y = Phaser.Math.Between(50, H - 50);
      g.fillStyle(0x334477, 0.08);
      g.fillEllipse(x, y, 200, 80);
    }
  }

  // ─── システム初期化 ───────────────────────────────────────
  private initSystems(): void {
    this.accumulator = new SignalAccumulator(W, H);
    this.eventLog = new EventLog();
    this.heroCtrl = new HeroController({ ...this.weights });
    this.debugHud = new DebugHUD(this);
  }

  // ─── UI ──────────────────────────────────────────────────
  private initUI(): void {
    // ── 上部左: ヒーロー残機 ──
    this.add.text(14, 10, "HERO", {
      fontFamily: "monospace", fontSize: "9px", color: "#4466cc",
    });
    this.heroLivesText = this.add.text(14, 22, this.heroLivesStr(), {
      fontFamily: "monospace", fontSize: "15px", color: "#7799ff",
    });

    // ── 上部中央: ステージ ──
    const stageLabel = this.add.text(W / 2, 10, `◈  STAGE ${this.stage}  ◈`, {
      fontFamily: "monospace", fontSize: "11px", color: "#556688",
    }).setOrigin(0.5, 0);
    this.tweens.add({
      targets: stageLabel,
      alpha: { from: 1, to: 0.4 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });

    // ── 下部: ボスHPバー ──
    const barY = H - 20;
    this.add.text(W / 2, barY - 13, "BOSS  HP", {
      fontFamily: "monospace", fontSize: "9px", color: "#cc3344",
    }).setOrigin(0.5, 1);
    // バー外枠
    this.add.rectangle(W / 2, barY, 304, 14, 0x110008).setStrokeStyle(1, 0x661122);
    // バー本体
    this.playerHpFill = this.add
      .rectangle(W / 2 - 150, barY, 300, 10, 0xee1133)
      .setOrigin(0, 0.5);

    // ヒント
    this.add.text(W - 8, H - 6, "[Z]射撃  [G]ギブアップ  [D]DEBUG", {
      fontFamily: "monospace", fontSize: "8px", color: "#2a3a4a",
    }).setOrigin(1, 1);
  }

  private heroLivesStr(): string {
    return "◆".repeat(this.heroLives) + "◇".repeat(HERO_LIVES - this.heroLives);
  }

  // ─── エンティティ ─────────────────────────────────────────
  private initEntities(): void {
    // ヒーロー (上部)
    this.heroRt = this.add.renderTexture(W / 2, 95, 80, 80).setOrigin(0.5, 0.5);
    ShipVisualizer.bake(this, this.heroRt, this.weights);

    this.hero = this.add.image(W / 2, 95, "__DEFAULT").setAlpha(0);
    this.physics.add.existing(this.hero);
    (this.hero.body as Phaser.Physics.Arcade.Body)
      .setCircle(ShipVisualizer.HITBOX_RADIUS)
      .setCollideWorldBounds(true);

    // プレイヤー(ボス) 物理ボディ (不可視 Arc)
    this.player = this.add.arc(W / 2, H - 70, 20, 0, 360, false, 0x00ff88).setAlpha(0);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // ボス機体グラフィック
    this.playerGfx = this.add.graphics();
    this.drawBossShip(W / 2, H - 70);

    // 弾グループ
    this.playerBullets = this.physics.add.group();
    this.heroBullets = this.physics.add.group();

    // 入力
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.giveUpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
  }

  /**
   * ボス機体を指定座標に描画する。
   * 毎フレーム clear() して再描画することで移動に追従する。
   */
  private drawBossShip(cx: number, cy: number): void {
    const g = this.playerGfx;
    g.clear();

    // 翼 (左右の三角)
    g.fillStyle(0x005533, 1);
    g.fillTriangle(cx, cy + 4, cx - 36, cy + 22, cx - 14, cy + 8);
    g.fillTriangle(cx, cy + 4, cx + 36, cy + 22, cx + 14, cy + 8);

    // 胴体シルエット
    g.fillStyle(0x007744, 1);
    g.fillTriangle(cx, cy - 24, cx - 16, cy + 18, cx + 16, cy + 18);

    // エンジンポッド (下部)
    g.fillStyle(0x004422, 1);
    g.fillRect(cx - 18, cy + 14, 10, 12);
    g.fillRect(cx + 8, cy + 14, 10, 12);

    // エンジン炎
    const flicker = 0.7 + Math.random() * 0.3;
    g.fillStyle(0x00ffaa, flicker);
    g.fillTriangle(cx - 13, cy + 26, cx - 11, cy + 26, cx - 12, cy + 34);
    g.fillTriangle(cx + 13, cy + 26, cx + 11, cy + 26, cx + 12, cy + 34);

    // コア (中心の光る部分)
    g.fillStyle(0x003322, 1);
    g.fillCircle(cx, cy + 2, 10);
    g.fillStyle(0x00ff88, 0.9);
    g.fillCircle(cx, cy + 2, 7);
    g.fillStyle(0xaaffdd, 0.8);
    g.fillCircle(cx - 2, cy, 3);

    // エネルギーリング
    g.lineStyle(1, 0x00ffaa, 0.4);
    g.strokeCircle(cx, cy + 2, 14);

    // 機首キャノン
    g.fillStyle(0x00aa66, 1);
    g.fillRect(cx - 2, cy - 30, 4, 8);
    g.fillStyle(0x00ffaa, 0.7);
    g.fillCircle(cx, cy - 30, 2.5);
  }

  // ─── 物理 ────────────────────────────────────────────────
  private initPhysics(): void {
    // プレイヤー弾 → ヒーロー
    this.physics.add.overlap(this.playerBullets, this.hero, (_, bullet) => {
      if (this.heroInvincible) return;
      (bullet as Phaser.GameObjects.Arc).destroy();
      this.onHeroHit();
    });

    // ヒーロー弾 → プレイヤー(ボス)
    this.physics.add.overlap(this.heroBullets, this.player, (_, bullet) => {
      (bullet as Phaser.GameObjects.Arc).destroy();
      this.onPlayerHit();
    });
  }

  // ─── 毎フレーム更新 ───────────────────────────────────────
  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    // 無敵タイマー
    if (this.heroInvincible) {
      this.heroRespawnTimer -= delta;
      if (this.heroRespawnTimer <= 0) {
        this.heroInvincible = false;
        this.heroRt.setAlpha(1);
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

    // ボス機体をボディに追従
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
    // 残機をHP的な値にマッピング (1残機=低HP → DODGEモード発動)
    const fakeHp = ([0, 2, 5, 10] as const)[Math.max(0, Math.min(3, this.heroLives))];
    const { vx, vy, shoot } = this.heroCtrl.update(dt, hx, hy, px, py, fakeHp, 10);
    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
    this.heroRt.setPosition(this.hero.x, this.hero.y);

    // ── ヒーロー射撃 ──
    if (!this.heroInvincible) {
      this.heroShootTimer -= delta;
      if (shoot && this.heroShootTimer <= 0) {
        this.fireHeroBullet(hx, hy, px, py);
        const interval = 600 - this.weights.burstTiming * 300;
        this.heroShootTimer = interval;
      }
    }

    // ── 範囲外弾の削除 ──
    this.cleanupBullets(this.playerBullets);
    this.cleanupBullets(this.heroBullets);

    // ── デバッグ HUD ──
    const liveDuration = this.time.now - this.stageStartTime;
    const liveFireRate = this.eventLog.getFireRate(liveDuration);
    const liveSignals = this.accumulator.normalize(liveFireRate);
    this.debugHud.update(liveSignals, this.weights, this.heroCtrl.getState());
  }

  // ─── 弾発射 ──────────────────────────────────────────────
  private firePlayerBullet(px: number, py: number, tx: number, ty: number): void {
    const angle = Math.atan2(ty - py, tx - px);
    const spread = (Math.random() - 0.5) * 0.12;

    // ★ group.add() してから setVelocity — 順序が重要
    const bullet = this.add.arc(px, py - 12, 4, 0, 360, false, 0x00ffbb);
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

    const bullet = this.add.arc(hx, hy + 12, 5, 0, 360, false, 0xff2244);
    bullet.setDepth(5);
    this.heroBullets.add(bullet);
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle) * BULLET_SPEED * 0.85,
      Math.sin(angle) * BULLET_SPEED * 0.85,
    );
  }

  private cleanupBullets(group: Phaser.Physics.Arcade.Group): void {
    group.children.each((b) => {
      const bullet = b as Phaser.GameObjects.Arc;
      if (bullet.y < -20 || bullet.y > H + 20 || bullet.x < -20 || bullet.x > W + 20) {
        bullet.destroy();
      }
      return true;
    });
  }

  // ─── ヒット処理 ──────────────────────────────────────────
  private onHeroHit(): void {
    this.heroLives = Math.max(0, this.heroLives - 1);
    this.heroLivesText.setText(this.heroLivesStr());

    if (this.heroLives <= 0) {
      this.stageClear();
      return;
    }

    // 残機あり → 無敵 + リスポーン
    this.heroInvincible = true;
    this.heroRespawnTimer = 2200;

    // 中央上部にリセット
    (this.hero.body as Phaser.Physics.Arcade.Body).reset(W / 2, 95);
    this.heroRt.setPosition(W / 2, 95);

    // 点滅 tween
    this.tweens.add({
      targets: this.heroRt,
      alpha: { from: 0.2, to: 0.85 },
      duration: 180,
      repeat: 10,
      yoyo: true,
      onComplete: () => { this.heroRt.setAlpha(1); },
    });

    // 画面フラッシュ (青)
    this.cameras.main.flash(300, 0, 80, 200, false);
  }

  private onPlayerHit(): void {
    this.playerHp = Math.max(0, this.playerHp - 1);
    this.playerHpFill.width = (this.playerHp / PLAYER_HP) * 300;

    // 画面フラッシュ (赤)
    this.cameras.main.flash(200, 200, 0, 0, false);

    if (this.playerHp <= 0) this.gameOver();
  }

  // ─── ステージクリア / ゲームオーバー ─────────────────────
  private stageClear(): void {
    const duration = this.time.now - this.stageStartTime;
    const fireRate = this.eventLog.getFireRate(duration);
    this.signals = this.accumulator.normalize(fireRate);
    this.weights = updateWeights(this.weights, this.signals);

    this.accumulator.reset();
    this.eventLog.reset();
    this.stage++;

    this.scene.restart({ stage: this.stage, weights: this.weights });
  }

  private gameOver(): void {
    this.scene.start("GameOverScene", {
      weights: { ...this.weights },
      stageReached: this.stage,
    });
  }
}
