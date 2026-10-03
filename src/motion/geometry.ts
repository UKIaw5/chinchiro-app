/**
 * 動きの設計と描画で共有する寸法（単位：サイコロの一辺 = 1）。
 * お椀の内側は「平らな底 + 円錐状の壁」として扱う。
 */
export const DIE_SIZE = 1;
export const DIE_HALF = DIE_SIZE / 2;

/** お椀の底（平らな部分）の半径 */
export const BOWL_FLOOR_RADIUS = 2.3;
/** お椀の縁（内側）の半径 */
export const BOWL_RIM_RADIUS = 4.3;
/** 底から縁までの深さ */
export const BOWL_DEPTH = 2.0;

/** お椀の内面の高さ（その地点の床・壁の y） */
export function surfaceY(x: number, z: number): number {
  'worklet';
  const r = Math.hypot(x, z);
  if (r <= BOWL_FLOOR_RADIUS) return 0;
  return Math.min(BOWL_DEPTH, ((r - BOWL_FLOOR_RADIUS) * BOWL_DEPTH) / (BOWL_RIM_RADIUS - BOWL_FLOOR_RADIUS));
}
