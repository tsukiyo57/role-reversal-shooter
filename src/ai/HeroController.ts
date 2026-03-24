import type { Weights } from "../types";

/**
 * AIヒーローの行動状態マシン。
 *
 *   HOLD_DISTANCE ←→ BURST_FIRE
 *        ↓↑
 *      DODGE
 *
 * ウェイト → 状態遷移の閾値を制御する。
 */

type HeroState = "HOLD_DISTANCE" | "BURST_FIRE" | "DODGE";

const BASE_SPEED = 120; // px/sec

export class HeroController {
  private state: HeroState = "HOLD_DISTANCE";
  private stateTimer = 0;
  private dodgeDir = 1; // +1=右, -1=左

  constructor(private weights: Weights) {}

  applyWeights(weights: Weights): void {
    this.weights = weights;
  }

  /**
   * 毎フレーム呼び出す。
   * @returns velocity {vx, vy} と shoot フラグ
   */
  update(
    dt: number,
    heroX: number,
    heroY: number,
    playerX: number,
    playerY: number,
    heroHp: number,
    maxHp: number,
  ): { vx: number; vy: number; shoot: boolean } {
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.transition(heroX, heroY, playerX, playerY, heroHp, maxHp);
    }

    return this.act(heroX, heroY, playerX, playerY);
  }

  private transition(
    heroX: number,
    _heroY: number,
    playerX: number,
    _playerY: number,
    heroHp: number,
    maxHp: number,
  ): void {
    const hpRatio = heroHp / maxHp;
    const { dodgeSide, burstTiming, preferredDist } = this.weights;

    // 体力が低い → 回避優先
    if (hpRatio < 0.3) {
      this.state = "DODGE";
      // dodgeSide: 1=右に回避, 0=左に回避
      this.dodgeDir = playerX > heroX
        ? (dodgeSide > 0.5 ? -1 : 1)  // プレイヤーが右にいたら逆方向
        : (dodgeSide > 0.5 ? 1 : -1);
      this.stateTimer = 0.4 + (1 - dodgeSide) * 0.3;
      return;
    }

    // burstTiming が高い → BURST_FIRE
    if (burstTiming > 0.6) {
      this.state = "BURST_FIRE";
      this.stateTimer = 0.3 + burstTiming * 0.4;
    } else if (preferredDist > 0.6) {
      // 遠距離好み → 距離を維持
      this.state = "HOLD_DISTANCE";
      this.stateTimer = 0.5 + preferredDist * 0.5;
    } else {
      // デフォルト: 距離を詰めながら牽制
      this.state = "HOLD_DISTANCE";
      this.stateTimer = 0.6;
    }
  }

  private act(
    heroX: number,
    heroY: number,
    playerX: number,
    playerY: number,
  ): { vx: number; vy: number; shoot: boolean } {
    const speed = BASE_SPEED * (0.5 + this.weights.moveSpeed * 0.8);
    const dx = playerX - heroX;
    const dy = playerY - heroY;
    const dist = Math.hypot(dx, dy) || 1;
    const targetDist = 150 + this.weights.preferredDist * 200; // 150–350 px

    let vx = 0;
    let vy = 0;
    let shoot = false;

    switch (this.state) {
      case "HOLD_DISTANCE": {
        // 目標距離を維持しながら横移動
        const ratio = dist / targetDist;
        if (ratio > 1.2) {
          // 近づく
          vx = (dx / dist) * speed;
          vy = (dy / dist) * speed;
        } else if (ratio < 0.8) {
          // 離れる
          vx = -(dx / dist) * speed;
          vy = -(dy / dist) * speed;
        } else {
          // 横ストラフ
          vx = -(dy / dist) * speed * 0.6;
          vy = (dx / dist) * speed * 0.6;
        }
        shoot = dist < targetDist * 1.5;
        break;
      }
      case "BURST_FIRE": {
        // ほぼ静止してバースト射撃
        vx = -(dy / dist) * speed * 0.2;
        vy = (dx / dist) * speed * 0.2;
        shoot = true;
        break;
      }
      case "DODGE": {
        // 横に素早く回避
        vx = this.dodgeDir * speed * 1.4;
        vy = -(dy / dist) * speed * 0.3; // 少し後退
        shoot = dist < 200;
        break;
      }
    }

    return { vx, vy, shoot };
  }

  getState(): HeroState {
    return this.state;
  }
}
