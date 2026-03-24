/** 5つのプレイヤー行動シグナル (正規化済み 0–1) */
export interface SignalData {
  leftRightBias: number;   // 1=右寄り, 0=左寄り, 0.5=中央
  rangePreference: number; // 1=遠距離, 0=近距離
  shotSpread: number;      // 1=散弾, 0=集中射撃
  fireRateSpam: number;    // 1=高連射, 0=低連射
  cornerPressure: number;  // 1=コーナー追い込み多, 0=中央戦闘
}

/** AIヒーロー行動を制御する4つのウェイト (0–1) */
export interface Weights {
  dodgeSide: number;     // 回避方向の偏り (1=右, 0=左)
  burstTiming: number;   // バースト射撃の密度 (1=高密度)
  preferredDist: number; // 理想距離 (1=遠距離, 0=近距離)
  moveSpeed: number;     // 移動速度 (1=高速, 0=低速)
}

export const DEFAULT_WEIGHTS: Weights = {
  dodgeSide: 0.5,
  burstTiming: 0.3,
  preferredDist: 0.5,
  moveSpeed: 0.4,
};

export const DEFAULT_SIGNALS: SignalData = {
  leftRightBias: 0.5,
  rangePreference: 0.5,
  shotSpread: 0.3,
  fireRateSpam: 0.3,
  cornerPressure: 0.3,
};
