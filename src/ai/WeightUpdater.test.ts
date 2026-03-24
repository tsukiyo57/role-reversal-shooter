import { describe, it, expect } from "vitest";
import { updateWeights } from "./WeightUpdater";
import { DEFAULT_WEIGHTS, DEFAULT_SIGNALS } from "../types";
import type { Weights, SignalData } from "../types";

describe("updateWeights (EMA α=0.3)", () => {
  it("全ウェイトが [0,1] の範囲内に収まる", () => {
    const result = updateWeights(DEFAULT_WEIGHTS, DEFAULT_SIGNALS);
    Object.values(result).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  it("EMA が正しく適用される (burstTiming=0, signal=1.0 → 0.3)", () => {
    const prev: Weights = { ...DEFAULT_WEIGHTS, burstTiming: 0 };
    const signals: SignalData = { ...DEFAULT_SIGNALS, fireRateSpam: 1.0 };
    const result = updateWeights(prev, signals);
    // 0.3 * 1.0 + 0.7 * 0 = 0.3
    expect(result.burstTiming).toBeCloseTo(0.3, 5);
  });

  it("prev=NaN でも有効な値を返す (NaN guard)", () => {
    const prev: Weights = { dodgeSide: NaN, burstTiming: NaN, preferredDist: NaN, moveSpeed: NaN };
    const result = updateWeights(prev, DEFAULT_SIGNALS);
    Object.values(result).forEach((v) => {
      expect(Number.isFinite(v)).toBe(true);
    });
  });

  it("各ウェイトは独立して更新される (1つの変化が他に影響しない)", () => {
    const prev: Weights = { dodgeSide: 0.5, burstTiming: 0.5, preferredDist: 0.5, moveSpeed: 0.5 };
    const signals: SignalData = { ...DEFAULT_SIGNALS, fireRateSpam: 1.0 }; // burstTimingだけ変わるはず

    const result = updateWeights(prev, signals);

    // burstTiming は変化する
    expect(result.burstTiming).not.toBeCloseTo(0.5, 2);

    // preferredDist: 0.3 * DEFAULT_SIGNALS.rangePreference + 0.7 * 0.5
    // DEFAULT_SIGNALS.rangePreference = 0.5 → 結果は 0.5 (変化なし)
    expect(result.preferredDist).toBeCloseTo(0.5, 5);
  });

  it("クランプ: 範囲外入力でも [0,1] に収まる", () => {
    const badSignals: SignalData = {
      leftRightBias: 2.0,
      rangePreference: -1.0,
      shotSpread: 999,
      fireRateSpam: -5,
      cornerPressure: 1.5,
    };
    const result = updateWeights(DEFAULT_WEIGHTS, badSignals);
    Object.values(result).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });
});
