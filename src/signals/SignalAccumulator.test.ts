import { describe, it, expect, beforeEach } from "vitest";
import { SignalAccumulator } from "./SignalAccumulator";

describe("SignalAccumulator", () => {
  const W = 640;
  const H = 480;
  let acc: SignalAccumulator;

  beforeEach(() => {
    acc = new SignalAccumulator(W, H);
  });

  it("ゼロフレーム時にデフォルト値を返す (ゼロ除算guard)", () => {
    const signals = acc.normalize(0);
    expect(signals.leftRightBias).toBe(0.5);
    expect(signals.rangePreference).toBe(0.5);
    expect(signals.shotSpread).toBe(0.3);
    expect(signals.cornerPressure).toBe(0.3);
  });

  it("全シグナルが [0,1] の範囲内に収まる", () => {
    // プレイヤーが右端に貼り付いてコーナー圧力最大
    for (let i = 0; i < 60; i++) {
      acc.tick(W - 1, H - 1, 10, 10);
    }
    const signals = acc.normalize(0.5);
    Object.values(signals).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  it("左端プレイヤー → leftRightBias が小さくなる", () => {
    for (let i = 0; i < 30; i++) acc.tick(10, H / 2, W / 2, H / 4);
    const signals = acc.normalize(0);
    expect(signals.leftRightBias).toBeLessThan(0.1);
  });

  it("右端プレイヤー → leftRightBias が大きくなる", () => {
    for (let i = 0; i < 30; i++) acc.tick(W - 10, H / 2, W / 2, H / 4);
    const signals = acc.normalize(0);
    expect(signals.leftRightBias).toBeGreaterThan(0.9);
  });

  it("reset() 後はゼロフレーム状態に戻る", () => {
    for (let i = 0; i < 10; i++) acc.tick(100, 100, 300, 200);
    acc.reset();
    const signals = acc.normalize(0);
    expect(signals.leftRightBias).toBe(0.5); // reset 後はデフォルト
  });

  it("recordShot が shotSpread に反映される", () => {
    for (let i = 0; i < 30; i++) acc.tick(320, 240, 320, 100);
    // 真上に向けて撃つ (spread=0)
    for (let i = 0; i < 10; i++) acc.recordShot(0);
    const signals = acc.normalize(0);
    expect(signals.shotSpread).toBe(0);
  });
});
