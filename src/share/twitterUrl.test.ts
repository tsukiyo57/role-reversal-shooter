import { describe, it, expect } from "vitest";
import { buildTwitterUrl } from "./twitterUrl";
import { DEFAULT_WEIGHTS } from "../types";

describe("buildTwitterUrl", () => {
  it("URL が twitter.com/intent/tweet で始まる", () => {
    const url = buildTwitterUrl(DEFAULT_WEIGHTS, 3);
    expect(url).toMatch(/^https:\/\/twitter\.com\/intent\/tweet/);
  });

  it("text パラメータにステージ数が含まれる", () => {
    const url = buildTwitterUrl(DEFAULT_WEIGHTS, 5);
    expect(decodeURIComponent(url)).toContain("ステージ5");
  });

  it("hashtags パラメータが含まれる", () => {
    const url = buildTwitterUrl(DEFAULT_WEIGHTS, 1);
    expect(url).toContain("hashtags=");
  });

  it("url パラメータが含まれる", () => {
    const url = buildTwitterUrl(DEFAULT_WEIGHTS, 1, "https://example.com/game");
    expect(decodeURIComponent(url)).toContain("https://example.com/game");
  });

  it("ステージ1と5でURLが異なる", () => {
    const url1 = buildTwitterUrl(DEFAULT_WEIGHTS, 1);
    const url5 = buildTwitterUrl(DEFAULT_WEIGHTS, 5);
    expect(url1).not.toBe(url5);
  });
});
