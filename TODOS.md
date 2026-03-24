# TODOS

## v2 機能

### 1. 雑魚フェーズの追加
- **What:** ボスフェーズの前に雑魚キャラフェーズを追加し、2フェーズ構成にする
- **Why:** より本格的なシューティングゲーム体験。ボスフェーズまでの前哨戦でプレイヤーの行動パターンをより多く収集できる
- **How:** `MinionScene` を新規作成。雑魚敵は固定パターンで動く。撃破後にボスフェーズへ
- **Depends on:** v1 完成・プレイテスト後に着手

### 2. ビジュアルコスメティクスとヒットボックスの分離
- **What:** `preferredDist` ウェイトによる機体コアサイズ変化を当たり判定から完全分離
- **Why:** 現在の `HITBOX_RADIUS = 18` は固定だが、将来コアサイズをアニメーションさせた際に誤ってヒットボックスも変わるリスクがある
- **How:** `ShipVisualizer.draw()` の cosmetic サイズ変更と `HITBOX_RADIUS` を独立した設定値として明示的にドキュメント化。テスト追加
- **Depends on:** v1 安定後

### 3. ボスの系譜表示（ゲームオーバー画面）
- **What:** ゲームオーバー画面で「過去のボスの進化の歴史」をタイムライン表示
- **Why:** プレイヤーがどのステージでどう進化したかを可視化することでシェア動機を高める
- **How:** `GameScene` で各ステージのウェイトスナップショットを配列で保持 → `GameOverScene` に渡す → 小さなサムネイルで並べて表示
- **Depends on:** v1 完成後

## 完了済み

- [x] ボスフェーズのみの v1 実装（SignalAccumulator, WeightUpdater, HeroController, ShipVisualizer, DebugHUD, ShareCard）
- [x] 22 ユニットテスト
- [x] TypeScript コンパイルエラーなし
