import { DieFace } from '../lib/dice';

/** 投げ入れてから全サイコロが止まるまでの時間（記録の長さ） */
export const SETTLE_SECONDS = 2.2;

/** 各目の面が向いているローカル軸（向かい合う面の和が 7） */
export const FACE_NORMALS: Record<DieFace, [number, number, number]> = {
  1: [0, 1, 0],
  6: [0, -1, 0],
  2: [1, 0, 0],
  5: [-1, 0, 0],
  3: [0, 0, 1],
  4: [0, 0, -1],
};

export type Impact = {
  /** 投げ入れからの秒数 */
  time: number;
  /** 0〜1 の強さ */
  strength: number;
};

/** 1回振ったときの動きの記録 */
export type RollRecording = {
  /** 1秒あたりの記録コマ数 */
  fps: number;
  frameCount: number;
  /** frameCount × 3個 × [px, py, pz, qx, qy, qz, qw] */
  transforms: number[];
  /** 衝突（音・振動・揺れ）のタイミング */
  impacts: Impact[];
};

/** 単位ベクトル from を to に重ねる回転（どちらも座標軸方向なので、結果は立方体の対称回転になる） */
export function rotationBetween(from: [number, number, number], to: [number, number, number]): [number, number, number, number] {
  const d = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (d > 0.999) return [0, 0, 0, 1];
  if (d < -0.999) {
    // 真逆：from に垂直な座標軸まわりに 180°
    const axis: [number, number, number] = Math.abs(from[0]) < 0.5 ? [1, 0, 0] : [0, 1, 0];
    return [axis[0], axis[1], axis[2], 0];
  }
  const cx = from[1] * to[2] - from[2] * to[1];
  const cy = from[2] * to[0] - from[0] * to[2];
  const cz = from[0] * to[1] - from[1] * to[0];
  const w = 1 + d;
  const len = Math.hypot(cx, cy, cz, w);
  return [cx / len, cy / len, cz / len, w / len];
}
