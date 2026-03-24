import Phaser from "phaser";
import type { Weights } from "../types";
import { ShipVisualizer } from "../visual/ShipVisualizer";

export interface ShareCardData {
  weights: Weights;
  stageReached: number;
  dataUrl: string;
  twitterUrl: string;
}

/**
 * ゲームオーバー時に進化機体のシェアカードを生成する。
 *
 * CRITICAL GAP 対応: canvas.toDataURL() は GitHub Pages では
 * クロスオリジン問題が起きない (同一オリジン) が、try/catch で保護する。
 */
export class ShareCard {
  /**
   * オフスクリーン Canvas に機体を描画して PNG dataURL を生成する。
   */
  static generate(
    scene: Phaser.Scene,
    weights: Weights,
    stageReached: number,
  ): ShareCardData {
    const W = 400;
    const H = 300;

    // オフスクリーン canvas
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    let dataUrl = "";

    if (ctx) {
      // 背景
      ctx.fillStyle = "#0a0a1f";
      ctx.fillRect(0, 0, W, H);

      // タイトル
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("あなたを倒したAI機体", W / 2, 28);

      ctx.fillStyle = "#8888cc";
      ctx.font = "12px monospace";
      ctx.fillText(`ステージ ${stageReached} まで生き延びた`, W / 2, 48);

      // 機体を Phaser の Graphics で一時描画 → canvas に転写
      const tempG = scene.add.graphics();
      ShipVisualizer.draw(tempG, weights);

      // Phaser の canvas をひとつ取得して機体部分を ctx に転写
      const phaserCanvas = scene.game.canvas;
      try {
        ctx.drawImage(phaserCanvas, 0, 0, 100, 100, W / 2 - 50, 80, 100, 100);
      } catch {
        // クロスオリジン等でエラーの場合は機体テキストで代替
        ctx.fillStyle = "#6677ff";
        ctx.font = "40px monospace";
        ctx.textAlign = "center";
        ctx.fillText("⬡", W / 2, 140);
      }
      tempG.destroy();

      // ウェイト情報テキスト
      ctx.fillStyle = "#aaaadd";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      const lines = [
        `回避: ${weights.dodgeSide > 0.5 ? "右寄り" : "左寄り"} (${(weights.dodgeSide * 100).toFixed(0)}%)`,
        `射撃: ${weights.burstTiming > 0.5 ? "バースト型" : "精密型"} (${(weights.burstTiming * 100).toFixed(0)}%)`,
        `距離: ${weights.preferredDist > 0.5 ? "遠距離" : "近距離"} (${(weights.preferredDist * 100).toFixed(0)}%)`,
        `速度: ${weights.moveSpeed > 0.5 ? "高速" : "低速"} (${(weights.moveSpeed * 100).toFixed(0)}%)`,
      ];
      lines.forEach((l, i) => ctx.fillText(l, 30, 210 + i * 18));

      ctx.fillStyle = "#555588";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("role-reversal-shooter", W / 2, H - 12);

      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch (e) {
        // CRITICAL GAP 対応: SecurityError フォールバック
        console.warn("ShareCard: toDataURL failed", e);
        dataUrl = "";
      }
    }

    const twitterUrl = ShareCard.buildTwitterUrl(weights, stageReached);
    return { weights, stageReached, dataUrl, twitterUrl };
  }

  static buildTwitterUrl(_weights: Weights, stageReached: number): string {
    const desc = `ステージ${stageReached}まで戦ったのに…AIに倒されてしまった😭\n`
      + `この機体は私の攻撃スタイルから進化した。あなたは倒せる？`;
    const params = new URLSearchParams({
      text: desc,
      url: window.location.href,
      hashtags: "役割逆転シューター,役割逆転AIシューター",
    });
    return `https://twitter.com/intent/tweet?${params.toString()}`;
  }
}
