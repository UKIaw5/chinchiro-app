/**
 * 物理演算と 3D 描画で共有する寸法（単位：サイコロの一辺 = 1）。
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

/** 物理演算・再生のフレームレート */
export const SIM_FPS = 60;
