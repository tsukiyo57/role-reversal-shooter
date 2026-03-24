import type { SignalData, Weights } from "../types";

const ALPHA = 0.3; // EMA 学習率

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function ema(prev: number, signal: number): number {
  // CRITICAL GAP 対応: NaN guard
  const safePrev = Number.isFinite(prev) ? prev : 0.5;
  const safeSignal = Number.isFinite(signal) ? signal : 0.5;
  return clamp(ALPHA * safeSignal + (1 - ALPHA) * safePrev);
}

/**
 * ステージ終了時に EMA でウェイトを更新する。
 * シグナル → ウェイトのマッピング (設計書より):
 *   leftRightBias + cornerPressure → dodgeSide
 *   fireRateSpam                   → burstTiming
 *   rangePreference                → preferredDist
 *   shotSpread                     → moveSpeed
 */
export function updateWeights(prev: Weights, signals: SignalData): Weights {
  const dodgeSideSignal = clamp(
    signals.leftRightBias * 0.6 + signals.cornerPressure * 0.4
  );

  return {
    dodgeSide: ema(prev.dodgeSide, dodgeSideSignal),
    burstTiming: ema(prev.burstTiming, signals.fireRateSpam),
    preferredDist: ema(prev.preferredDist, signals.rangePreference),
    moveSpeed: ema(prev.moveSpeed, signals.shotSpread),
  };
}
