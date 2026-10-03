import { DieFace } from '../lib/dice';
import { DIE_HALF } from '../motion/geometry';
import { FACE_NORMALS } from '../motion/recording';
import { Vec3, normalize } from './math3d';

/** 目の 3x3 グリッド上の位置（0〜8、左上から右下へ） */
export const PIP_LAYOUT: Record<DieFace, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
/** 目どうしの間隔・目の半径（サイコロの一辺 = 1） */
export const PIP_SPACING = 0.27;
export const PIP_RADIUS = 0.085;
export const ONE_PIP_RADIUS = 0.15;

export type FaceShape = {
  face: DieFace;
  normal: Vec3;
  /** 面の4隅（ローカル座標）。面上の軸 (u, v) で (-,-), (+,-), (+,+), (-,+) の順 */
  corners: Vec3[];
};

/** 目 1〜6 の順に並んだ6面 */
export const DIE_FACES: FaceShape[] = ([1, 2, 3, 4, 5, 6] as DieFace[]).map((face) => {
  const n = FACE_NORMALS[face] as Vec3;
  const helper: Vec3 = Math.abs(n[1]) > 0.5 ? [1, 0, 0] : [0, 1, 0];
  // 面上の2軸 u, v（u × v = n）
  const u = normalize([helper[1] * n[2] - helper[2] * n[1], helper[2] * n[0] - helper[0] * n[2], helper[0] * n[1] - helper[1] * n[0]]);
  const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const at = (a: number, b: number): Vec3 => [
    n[0] * DIE_HALF + u[0] * a + v[0] * b,
    n[1] * DIE_HALF + u[1] * a + v[1] * b,
    n[2] * DIE_HALF + u[2] * a + v[2] * b,
  ];
  return { face, normal: n, corners: [at(-DIE_HALF, -DIE_HALF), at(DIE_HALF, -DIE_HALF), at(DIE_HALF, DIE_HALF), at(-DIE_HALF, DIE_HALF)] };
});
