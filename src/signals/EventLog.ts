/**
 * 弾発射イベントをタイムスタンプで記録し、連射スパム率を計算する。
 */
export class EventLog {
  private shots: number[] = []; // ms タイムスタンプ

  recordShot(timestampMs: number): void {
    this.shots.push(timestampMs);
  }

  /**
   * shots/second を [0,1] に正規化して返す。
   * MAX_FIRE_RATE: 10発/秒を上限とする。
   */
  getFireRate(durationMs: number): number {
    const MAX_FIRE_RATE = 10; // shots/sec
    if (durationMs <= 0) return 0;
    const shotsPerSec = (this.shots.length / durationMs) * 1000;
    return Math.min(shotsPerSec / MAX_FIRE_RATE, 1);
  }

  reset(): void {
    this.shots = [];
  }
}
