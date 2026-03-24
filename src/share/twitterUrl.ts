import type { Weights } from "../types";

/** Twitter intent URLを生成する純粋関数 (Phaserに非依存) */
export function buildTwitterUrl(
  _weights: Weights,
  stageReached: number,
  pageUrl = typeof window !== "undefined" ? window.location.href : "",
): string {
  const desc = `ステージ${stageReached}まで戦ったのに…AIに倒されてしまった😭\n`
    + `この機体は私の攻撃スタイルから進化した。あなたは倒せる？`;
  const params = new URLSearchParams({
    text: desc,
    url: pageUrl,
    hashtags: "役割逆転シューター,役割逆転AIシューター",
  });
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}
