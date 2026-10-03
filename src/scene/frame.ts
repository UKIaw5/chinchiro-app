import { DIE_HALF, surfaceY } from '../motion/geometry';
import { Impact, RollRecording } from '../motion/recording';
import { DIE_FACES } from './dieShape';
import { Camera, Vec3, dot, lerp3, normalize, project, rotate, slerp, sub } from './math3d';

/**
 * 1コマ分の「各面の変形行列・影・揺れ」を計算する（UI スレッドの worklet）。
 * 描画そのものは iOS に任せ、ここでは数値だけを作る。
 */

/** 面の View の大きさ（ピクセル）。寄ったときにぼやけないよう、画面上の最大サイズより大きめにする */
export const FACE_PX = 140;
/** 影の View の大きさ（ピクセル） */
export const SHADOW_PX = 100;
const LIGHT: Vec3 = normalize([-4, 12, 6]);
/** 衝突時の揺れ（ピクセル）と、揺れの周波数・収まる速さ */
const SHAKE_PX = 3;
const SHAKE_FREQUENCY = 9;
const SHAKE_DECAY = 10;
const SHAKE_MIN_STRENGTH = 0.4;

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export type Motion = {
  fps: number;
  frameCount: number;
  transforms: number[];
  impacts: Impact[];
};

export type FrameData = {
  /** 18面それぞれの変形行列・表示するか・暗さ */
  matrices: number[][];
  visible: number[];
  shade: number[];
  /** 3個の影 [x, y, 横倍率, 縦倍率, 濃さ] */
  shadows: number[][];
  /** 3個の中心（画面座標） */
  centroid: [number, number];
  shake: number;
};

export function toMotion(recording: RollRecording): Motion {
  return {
    fps: recording.fps,
    frameCount: recording.frameCount,
    transforms: Array.from(recording.transforms),
    impacts: recording.impacts,
  };
}

/**
 * View の正方形（中心原点、一辺 size）を、画面上の四角形 quad（左上・右上・右下・左下、View 中心からの相対座標）へ
 * 写す射影変換を、React Native の 4x4 行列（行ベクトル形式）で返す。
 */
export function squareToQuad(quad: number[][], size: number): number[] | null {
  'worklet';
  const [x0, y0] = quad[0];
  const [x1, y1] = quad[1];
  const [x2, y2] = quad[2];
  const [x3, y3] = quad[3];
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return null;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const f = y0;
  // 単位正方形 (u, v) ← View 座標 (x, y)：u = x/size + 0.5, v = y/size + 0.5
  return [
    a / size, d / size, 0, g / size,
    b / size, e / size, 0, h / size,
    0, 0, 1, 0,
    c + 0.5 * (a + b), f + 0.5 * (d + e), 0, 1 + 0.5 * (g + h),
  ];
}

export function computeFrame(m: Motion, framePosition: number, cam: Camera, width: number, height: number): FrameData {
  'worklet';
  const last = m.frameCount - 1;
  const clamped = Math.min(Math.max(framePosition, 0), last);
  const f0 = Math.floor(clamped);
  const f1 = Math.min(f0 + 1, last);
  const t = clamped - f0;
  const tr = m.transforms;
  const cx = width / 2;
  const cy = height / 2;

  const matrices: number[][] = [];
  const visible: number[] = [];
  const shade: number[] = [];
  const shadows: number[][] = [];
  let sx = 0;
  let sy = 0;

  for (let die = 0; die < 3; die++) {
    const a = (f0 * 3 + die) * 7;
    const b = (f1 * 3 + die) * 7;
    const pos = lerp3([tr[a], tr[a + 1], tr[a + 2]], [tr[b], tr[b + 1], tr[b + 2]], t);
    const q = slerp([tr[a + 3], tr[a + 4], tr[a + 5], tr[a + 6]], [tr[b + 3], tr[b + 4], tr[b + 5], tr[b + 6]], t);
    const toWorld = (p: Vec3): Vec3 => {
      const r = rotate(q, p);
      return [r[0] + pos[0], r[1] + pos[1], r[2] + pos[2]];
    };

    for (const face of DIE_FACES) {
      const normal = rotate(q, face.normal);
      const center = toWorld([face.normal[0] * DIE_HALF, face.normal[1] * DIE_HALF, face.normal[2] * DIE_HALF]);
      const facing = dot(normal, normalize(sub(cam.eye, center)));
      let matrix: number[] | null = null;
      if (facing > 0.02) {
        // View の左上・右上・右下・左下 = 面の (u-, v+), (u+, v+), (u+, v-), (u-, v-)
        const order = [3, 2, 1, 0];
        const quad = order.map((i) => {
          const p = project(cam, toWorld(face.corners[i]));
          return [p[0] - cx, p[1] - cy];
        });
        matrix = squareToQuad(quad, FACE_PX);
      }
      matrices.push(matrix ?? IDENTITY);
      visible.push(matrix ? 1 : 0);
      const light = 0.62 + 0.45 * Math.max(0, dot(normal, LIGHT));
      shade.push(Math.min(0.6, Math.max(0, 1 - light)));
    }

    // 影：面（床や壁）に落ちる位置。高く跳ねているほど大きく薄く
    const ground = surfaceY(pos[0], pos[2]);
    const lift = Math.max(0, pos[1] - DIE_HALF - ground);
    const gx = pos[0] + 0.18 + lift * 0.3;
    const gz = pos[2] - 0.12 - lift * 0.45;
    const gc = project(cam, [gx, surfaceY(gx, gz) + 0.01, gz]);
    const radius = 0.62 + lift * 0.08;
    const right = project(cam, [gx + radius, surfaceY(gx, gz) + 0.01, gz]);
    const front = project(cam, [gx, surfaceY(gx, gz) + 0.01, gz + radius]);
    shadows.push([
      gc[0] - cx,
      gc[1] - cy,
      (Math.abs(right[0] - gc[0]) * 2) / SHADOW_PX,
      (Math.abs(front[1] - gc[1]) * 2) / SHADOW_PX,
      0.32 / (1 + lift * 0.6),
    ]);

    const pc = project(cam, pos);
    sx += pc[0];
    sy += pc[1];
  }

  // 強い衝突のたびに、小さく揺れてすぐ収まる
  const time = clamped / m.fps;
  let shake = 0;
  for (const impact of m.impacts) {
    if (impact.time > time) break;
    if (impact.strength < SHAKE_MIN_STRENGTH) continue;
    const age = time - impact.time;
    shake += impact.strength * SHAKE_PX * Math.exp(-age * SHAKE_DECAY) * Math.sin(age * SHAKE_FREQUENCY * Math.PI * 2);
  }

  return { matrices, visible, shade, shadows, centroid: [sx / 3, sy / 3], shake };
}

