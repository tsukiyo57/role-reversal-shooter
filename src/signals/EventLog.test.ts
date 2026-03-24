import { describe, it, expect, beforeEach } from "vitest";
import { EventLog } from "./EventLog";

describe("EventLog", () => {
  let log: EventLog;

  beforeEach(() => {
    log = new EventLog();
  });

  it("発射なし → fireRate 0", () => {
    expect(log.getFireRate(1000)).toBe(0);
  });

  it("durationMs=0 → 0 を返す (ゼロ除算guard)", () => {
    log.recordShot(0);
    expect(log.getFireRate(0)).toBe(0);
  });

  it("10発/秒 → fireRate 1.0 (上限)", () => {
    const duration = 1000;
    for (let i = 0; i < 10; i++) log.recordShot(i * 100);
    expect(log.getFireRate(duration)).toBe(1.0);
  });

  it("20発/秒 → fireRate 1.0 にクランプ", () => {
    const duration = 1000;
    for (let i = 0; i < 20; i++) log.recordShot(i * 50);
    expect(log.getFireRate(duration)).toBe(1.0);
  });

  it("5発/秒 → fireRate 0.5", () => {
    const duration = 1000;
    for (let i = 0; i < 5; i++) log.recordShot(i * 200);
    expect(log.getFireRate(duration)).toBe(0.5);
  });

  it("reset() 後は発射なし状態に戻る", () => {
    for (let i = 0; i < 10; i++) log.recordShot(i * 100);
    log.reset();
    expect(log.getFireRate(1000)).toBe(0);
  });
});
