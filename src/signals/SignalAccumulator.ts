import type { SignalData } from "../types";

/**
 * フレームごとにプレイヤーの行動を蓄積し、ステージ終了時に正規化する。
 *
 * 収集方法:
 *   - 位置・距離系シグナル → アキュムレーター (フレームごと加算)
 *   - fireRateSpam        → EventLog 側 (別クラス)
 */
export class SignalAccumulator {
  private frames = 0;

  // 位置系アキュムレーター
  private sumX = 0;         // プレイヤー x の重み付き合計
  private sumRange = 0;     // ヒーローとの距離の合計
  private sumSpread = 0;    // 射角の合計 (弾発射時にのみ更新)
  private spreadCount = 0;  // 射撃フレーム数
  private sumCorner = 0;    // コーナー圧力の合計

  private readonly arenaW: number;
  private readonly arenaH: number;

  constructor(arenaW: number, arenaH: number) {
    this.arenaW = arenaW;
    this.arenaH = arenaH;
  }

  /**
   * 毎フレーム呼び出す。
   * @param playerX   プレイヤー x座標
   * @param playerY   プレイヤー y座標
   * @param heroX     ヒーロー x座標
   * @param heroY     ヒーロー y座標
   */
  tick(playerX: number, playerY: number, heroX: number, heroY: number): void {
    this.frames++;

    // leftRightBias: プレイヤーのアリーナ内X位置 (0=左端, 1=右端)
    this.sumX += playerX / this.arenaW;

    // rangePreference: プレイヤーとヒーローの距離をアリーナ対角で正規化
    const diag = Math.hypot(this.arenaW, this.arenaH);
    const dist = Math.hypot(heroX - playerX, heroY - playerY);
    this.sumRange += Math.min(dist / diag, 1);

    // cornerPressure: ヒーローがコーナーに追い詰められている度合い
    const cornerDist = Math.min(heroX, this.arenaW - heroX, heroY, this.arenaH - heroY);
    const cornerRatio = 1 - Math.min(cornerDist / (Math.min(this.arenaW, this.arenaH) * 0.2), 1);
    this.sumCorner += cornerRatio;
  }

  /**
   * 弾を発射したフレームで呼び出す。
   * @param spreadAngle 発射角の絶対値 (0=まっすぐ, π/2=真横)
   */
  recordShot(spreadAngle: number): void {
    this.sumSpread += Math.min(Math.abs(spreadAngle) / (Math.PI / 2), 1);
    this.spreadCount++;
  }

  /**
   * ステージ終了時に正規化済みシグナルを返す。
   * fireRateSpam は EventLog から受け取る。
   * @param fireRateSpam EventLog.getFireRate() の値
   */
  normalize(fireRateSpam: number): SignalData {
    // CRITICAL GAP 対応: ゼロ除算guard
    if (this.frames === 0) {
      return {
        leftRightBias: 0.5,
        rangePreference: 0.5,
        shotSpread: 0.3,
        fireRateSpam: Math.min(fireRateSpam, 1),
        cornerPressure: 0.3,
      };
    }

    return {
      leftRightBias: this.sumX / this.frames,
      rangePreference: this.sumRange / this.frames,
      shotSpread: this.spreadCount > 0 ? this.sumSpread / this.spreadCount : 0.3,
      fireRateSpam: Math.min(fireRateSpam, 1),
      cornerPressure: this.sumCorner / this.frames,
    };
  }

  reset(): void {
    this.frames = 0;
    this.sumX = 0;
    this.sumRange = 0;
    this.sumSpread = 0;
    this.spreadCount = 0;
    this.sumCorner = 0;
  }
}
