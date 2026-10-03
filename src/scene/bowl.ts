import { BlurStyle, PaintStyle, SkCanvas, Skia, TileMode } from '@shopify/react-native-skia';

import { BOWL_DEPTH, BOWL_FLOOR_RADIUS, BOWL_RIM_RADIUS } from '../motion/geometry';
import { Camera, Vec3, dot, project, sub } from './math3d';

/** 卓（フェルト）の色 */
export const BACKGROUND = '#14532D';

const TABLE_Y = -0.7;
const RIM_OUTER = BOWL_RIM_RADIUS + 0.28;
const BOWL_RGB: [number, number, number] = [246, 243, 236];

/** 外側の胴の輪切り [半径, 高さ, 明るさ]（下から上へ。縁 → 膨らみ → 高台の曲線） */
const BODY_RINGS: [number, number, number][] = (() => {
  const rings: [number, number, number][] = [[BOWL_FLOOR_RADIUS + 0.15, TABLE_Y, 0.62]];
  const p0 = [BOWL_FLOOR_RADIUS + 0.2, -0.45];
  const p1 = [BOWL_RIM_RADIUS + 0.2, -0.3];
  const p2 = [RIM_OUTER, BOWL_DEPTH];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    rings.push([r, y, 0.66 + 0.34 * t]);
  }
  return rings;
})();

function circlePoints(cam: Camera, center: Vec3, radius: number, segments: number, from = 0, to = Math.PI * 2) {
  'worklet';
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = from + ((to - from) * i) / segments;
    pts.push(project(cam, [center[0] + Math.cos(a) * radius, center[1], center[2] + Math.sin(a) * radius]));
  }
  return pts;
}

function polygon(points: Vec3[]) {
  'worklet';
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) builder.lineTo(points[i][0], points[i][1]);
  builder.close();
  return builder.detach();
}

function shade(rgb: [number, number, number], k: number, alpha = 1) {
  'worklet';
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x * k)));
  return Skia.Color(`rgba(${c(rgb[0])},${c(rgb[1])},${c(rgb[2])},${alpha})`);
}

function drawBowl(canvas: SkCanvas, cam: Camera) {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);

  // テーブルに落ちる影
  paint.setColor(Skia.Color('rgba(0,0,0,0.35)'));
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 10, true));
  canvas.drawPath(polygon(circlePoints(cam, [0.6, TABLE_Y, -0.4], RIM_OUTER + 0.2, 48)), paint);
  paint.setMaskFilter(null);

  // 外側の胴：下から順に輪切りの楕円を重ねて、丸く膨らんだ側面を描く
  const body = Skia.Paint();
  body.setAntiAlias(true);
  for (const [r, y, k] of BODY_RINGS) {
    const ring = circlePoints(cam, [0, y, 0], r, 48);
    const left = project(cam, [-r, y, 0]);
    const right = project(cam, [r, y, 0]);
    // 左上からの光：左側を明るく、右側と下側を暗く
    body.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: left[0], y: left[1] },
        { x: right[0], y: right[1] },
        [shade(BOWL_RGB, k * 1.02), shade(BOWL_RGB, k * 0.9), shade(BOWL_RGB, k * 0.72)],
        [0, 0.45, 1],
        TileMode.Clamp,
      ),
    );
    canvas.drawPath(polygon(ring), body);
  }

  // 縁（外周）と藍色の線
  paint.setColor(Skia.Color('#F7F4EE'));
  canvas.drawPath(polygon(circlePoints(cam, [0, BOWL_DEPTH, 0], RIM_OUTER, 72)), paint);
  const line = Skia.Paint();
  line.setAntiAlias(true);
  line.setStyle(PaintStyle.Stroke);
  line.setColor(Skia.Color('#1F3A6E'));
  const lineRadius = BOWL_RIM_RADIUS + 0.14;
  const lineWidth = Math.max(1.5, (cam.focal * 0.09) / dot(sub([0, BOWL_DEPTH, lineRadius], cam.eye), cam.forward));
  line.setStrokeWidth(lineWidth);
  canvas.drawPath(polygon(circlePoints(cam, [0, BOWL_DEPTH + 0.02, 0], lineRadius, 72)), line);

  // 内側の壁（奥ほど明るく、縁際を暗く）
  const center = project(cam, [0, 0, 0]);
  const rimRight = project(cam, [BOWL_RIM_RADIUS, BOWL_DEPTH, 0]);
  const radius = Math.abs(rimRight[0] - center[0]) * 1.1;
  paint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: center[0], y: center[1] },
      radius,
      [Skia.Color('#ECE9E2'), Skia.Color('#E2DED6'), Skia.Color('#C9C3B8')],
      [0, 0.55, 1],
      TileMode.Clamp,
    ),
  );
  canvas.drawPath(polygon(circlePoints(cam, [0, BOWL_DEPTH, 0], BOWL_RIM_RADIUS, 72)), paint);

  // 底（平らな部分）
  paint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: center[0], y: center[1] },
      radius * 0.6,
      [Skia.Color('#F1EEE8'), Skia.Color('#E4E0D8')],
      [0, 1],
      TileMode.Clamp,
    ),
  );
  canvas.drawPath(polygon(circlePoints(cam, [0, 0, 0], BOWL_FLOOR_RADIUS, 72)), paint);
  paint.setShader(null);
}

/** 卓とお椀（動かないので、画面の大きさが決まったときに一度だけ描く） */
export function drawTableAndBowl(canvas: SkCanvas, cam: Camera, width: number, height: number) {
  'worklet';
  const bg = Skia.Paint();
  bg.setColor(Skia.Color(BACKGROUND));
  canvas.drawRect({ x: 0, y: 0, width, height }, bg);
  drawBowl(canvas, cam);
}
