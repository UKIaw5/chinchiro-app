import { BOWL_RIM_RADIUS } from '../motion/geometry';
import { Camera, Vec3, makeCamera, normalize } from './math3d';

/** 縦の画角（度） */
export const FOV = 32;
/** お椀を見下ろす向き（手前上から斜めに） */
export const VIEW_DIR: Vec3 = normalize([0, 1, 0.62]);
/** カメラが向く点 */
export const WIDE_TARGET: Vec3 = [0, 0.4, 0];
/** 斜め上から見たお椀の見かけの半分の高さ（余白込み） */
const BOWL_VIEW_HALF_HEIGHT = 4.9;

/** お椀が縦横どちらにも収まるカメラ距離 */
export function wideDistance(width: number, height: number): number {
  'worklet';
  const halfV = ((FOV / 2) * Math.PI) / 180;
  const halfH = Math.atan(Math.tan(halfV) * (width / height));
  return Math.max((BOWL_RIM_RADIUS + 0.9) / Math.tan(halfH), BOWL_VIEW_HALF_HEIGHT / Math.tan(halfV));
}

/** お椀全体が収まる固定カメラ */
export function wideCamera(width: number, height: number): Camera {
  'worklet';
  const d = wideDistance(width, height);
  const eye: Vec3 = [WIDE_TARGET[0] + VIEW_DIR[0] * d, WIDE_TARGET[1] + VIEW_DIR[1] * d, WIDE_TARGET[2] + VIEW_DIR[2] * d];
  return makeCamera(eye, WIDE_TARGET, FOV, width, height);
}
