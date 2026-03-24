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
const PLAYER_HP = 5;
const HERO_HP_BASE = 8;
const BULLET_SPEED = 350;
const PLAYER_SPEED = 180;
const STAGE_HP_SCALE = 1.3; // ステージごとにヒーローHP増加

export class GameScene extends Phaser.Scene {
  // --- ゲーム状態 ---
  private stage = 1;
  private weights: Weights = { ...DEFAULT_WEIGHTS };
  private signals: SignalData = { ...DEFAULT_SIGNALS };
  private stageStartTime = 0;

  // --- エンティティ ---
  private player!: Phaser.GameObjects.Arc;
  private hero!: Phaser.GameObjects.Image;
  private heroRt!: Phaser.GameObjects.RenderTexture;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private heroBullets!: Phaser.Physics.Arcade.Group;

  // --- HP ---
  private playerHp = PLAYER_HP;
  private heroHp = HERO_HP_BASE;
  private heroMaxHp = HERO_HP_BASE;
  private heroHpFill!: Phaser.GameObjects.Rectangle;
  private playerHpText!: Phaser.GameObjects.Text;

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
  private readonly PLAYER_FIRE_RATE = 300; // ms

  // --- ヒーロー射撃タイマー ---
  private heroShootTimer = 0;

  constructor() {
    super("GameScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x0a0a1f);

    this.initSystems();
    this.initUI();
    this.initEntities();
    this.initPhysics();

    this.stageStartTime = this.time.now;
  }

  private initSystems(): void {
    this.accumulator = new SignalAccumulator(W, H);
    this.eventLog = new EventLog();
    this.heroCtrl = new HeroController({ ...this.weights });
    this.debugHud = new DebugHUD(this);
  }

  private initUI(): void {
    // ヒーローHP バー (上部)
    this.add.rectangle(W / 2, 18, 200, 12, 0x333355).setOrigin(0.5, 0.5);
    this.heroHpFill = this.add.rectangle(W / 2 - 98, 18, 196, 8, 0x5566ff).setOrigin(0, 0.5);
    this.add.text(W / 2, 30, "HERO HP", { fontFamily: "monospace", fontSize: "9px", color: "#8888cc" }).setOrigin(0.5, 0);

    // プレイヤーHP テキスト (下部)
    this.playerHpText = this.add.text(10, H - 22, `❤ x${this.playerHp}`, {
      fontFamily: "monospace", fontSize: "14px", color: "#ff6677",
    });

    // ステージ表示
    this.add.text(W / 2, 8, `STAGE ${this.stage}`, {
      fontFamily: "monospace", fontSize: "11px", color: "#aaaaee",
    }).setOrigin(0.5, 0);

    // ヒント
    this.add.text(W - 8, H - 12, "[Z] 射撃  [D] DEBUG", {
      fontFamily: "monospace", fontSize: "9px", color: "#445566",
    }).setOrigin(1, 1);
  }

  private initEntities(): void {
    // プレイヤー (下部・緑の三角形をArcで代替)
    this.player = this.add.arc(W / 2, H - 60, 14, 0, 360, false, 0x44ff88);
    this.physics.add.existing(this.player);
    (this.player.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    // ヒーロー RenderTexture (上部)
    this.heroRt = this.add.renderTexture(W / 2, 80, 80, 80).setOrigin(0.5, 0.5);
    ShipVisualizer.bake(this, this.heroRt, this.weights);

    // ヒーロー の物理ボディ用の不可視 Arc
    this.hero = this.add.image(W / 2, 80, "__DEFAULT").setAlpha(0);
    this.physics.add.existing(this.hero);
    (this.hero.body as Phaser.Physics.Arcade.Body)
      .setCircle(ShipVisualizer.HITBOX_RADIUS)
      .setCollideWorldBounds(true);

    // 弾グループ
    this.playerBullets = this.physics.add.group();
    this.heroBullets = this.physics.add.group();

    // HP 計算
    this.heroHp = Math.round(HERO_HP_BASE * Math.pow(STAGE_HP_SCALE, this.stage - 1));
    this.heroMaxHp = this.heroHp;

    // 入力
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.giveUpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.G);
  }

  private initPhysics(): void {
    // プレイヤー弾 → ヒーロー当たり判定
    this.physics.add.overlap(
      this.playerBullets,
      this.hero,
      (_, bullet) => {
        (bullet as Phaser.GameObjects.Arc).destroy();
        this.heroHp--;
        this.updateHeroHpBar();
        if (this.heroHp <= 0) this.stageClear();
      },
    );

    // ヒーロー弾 → プレイヤー当たり判定
    this.physics.add.overlap(
      this.heroBullets,
      this.player,
      (_, bullet) => {
        (bullet as Phaser.GameObjects.Arc).destroy();
        this.playerHp--;
        this.playerHpText.setText(`❤ x${this.playerHp}`);
        if (this.playerHp <= 0) this.gameOver();
      },
    );
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const px = this.player.x;
    const py = this.player.y;
    const hx = this.hero.x;
    const hy = this.hero.y;

    // --- プレイヤー操作 ---
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    if (this.cursors.left.isDown) body.setVelocityX(-PLAYER_SPEED);
    if (this.cursors.right.isDown) body.setVelocityX(PLAYER_SPEED);
    if (this.cursors.up.isDown) body.setVelocityY(-PLAYER_SPEED);
    if (this.cursors.down.isDown) body.setVelocityY(PLAYER_SPEED);

    // --- プレイヤー射撃 ---
    const now = this.time.now;
    if (this.fireKey.isDown && now - this.lastPlayerShot > this.PLAYER_FIRE_RATE) {
      this.firePlayerBullet(px, py, hx, hy);
      this.lastPlayerShot = now;
    }

    // --- シグナル収集 ---
    this.accumulator.tick(px, py, hx, hy);

    // ギブアップ [G]
    if (Phaser.Input.Keyboard.JustDown(this.giveUpKey)) {
      this.gameOver();
      return;
    }

    // --- AI ヒーロー更新 ---
    const { vx, vy, shoot } = this.heroCtrl.update(
      dt, hx, hy, px, py, this.heroHp, this.heroMaxHp,
    );
    (this.hero.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);
    this.heroRt.setPosition(this.hero.x, this.hero.y);

    // ヒーロー射撃
    this.heroShootTimer -= delta;
    if (shoot && this.heroShootTimer <= 0) {
      this.fireHeroBullet(hx, hy, px, py);
      const burstInterval = 600 - this.weights.burstTiming * 300; // 300–600ms
      this.heroShootTimer = burstInterval;
    }

    // 古い弾を削除
    this.playerBullets.children.each((b) => {
      const bullet = b as Phaser.GameObjects.Arc;
      if (bullet.y < -10 || bullet.y > H + 10 || bullet.x < -10 || bullet.x > W + 10) {
        bullet.destroy();
      }
      return true;
    });
    this.heroBullets.children.each((b) => {
      const bullet = b as Phaser.GameObjects.Arc;
      if (bullet.y < -10 || bullet.y > H + 10 || bullet.x < -10 || bullet.x > W + 10) {
        bullet.destroy();
      }
      return true;
    });

    // --- デバッグHUD 更新 ---
    // 表示用の現在シグナル (蓄積中の暫定値)
    const liveDuration = this.time.now - this.stageStartTime;
    const liveFireRate = this.eventLog.getFireRate(liveDuration);
    const liveSignals = this.accumulator.normalize(liveFireRate);
    this.debugHud.update(liveSignals, this.weights, this.heroCtrl.getState());
  }

  private firePlayerBullet(px: number, py: number, tx: number, ty: number): void {
    const angle = Math.atan2(ty - py, tx - px);
    const bullet = this.add.arc(px, py, 4, 0, 360, false, 0x44ffaa);
    this.physics.add.existing(bullet);
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle) * BULLET_SPEED,
      Math.sin(angle) * BULLET_SPEED,
    );
    this.playerBullets.add(bullet);

    // シグナル記録
    this.accumulator.recordShot(angle);
    this.eventLog.recordShot(this.time.now);
  }

  private fireHeroBullet(hx: number, hy: number, tx: number, ty: number): void {
    const angle = Math.atan2(ty - hy, tx - hx);
    const bullet = this.add.arc(hx, hy, 5, 0, 360, false, 0xff4466);
    this.physics.add.existing(bullet);
    (bullet.body as Phaser.Physics.Arcade.Body).setVelocity(
      Math.cos(angle) * BULLET_SPEED * 0.9,
      Math.sin(angle) * BULLET_SPEED * 0.9,
    );
    this.heroBullets.add(bullet);
  }

  private updateHeroHpBar(): void {
    const ratio = Math.max(0, this.heroHp / this.heroMaxHp);
    this.heroHpFill.width = 196 * ratio;
  }

  private stageClear(): void {
    // シグナル集計
    const duration = this.time.now - this.stageStartTime;
    const fireRate = this.eventLog.getFireRate(duration);
    this.signals = this.accumulator.normalize(fireRate);

    // ウェイト更新
    this.weights = updateWeights(this.weights, this.signals);

    // リセット
    this.accumulator.reset();
    this.eventLog.reset();
    this.stage++;

    // シーン再起動で次ステージへ
    this.scene.restart({ stage: this.stage, weights: this.weights });
  }

  private gameOver(): void {
    this.scene.start("GameOverScene", {
      weights: { ...this.weights },
      stageReached: this.stage,
    });
  }

  init(data: { stage?: number; weights?: Weights }): void {
    if (data.stage) this.stage = data.stage;
    if (data.weights) this.weights = data.weights;
    this.playerHp = PLAYER_HP;
  }
}
