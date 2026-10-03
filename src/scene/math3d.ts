/**
 * 描画用の最小限の 3D 計算。UI スレッド（worklet）で毎コマ使うので、数値配列だけで完結させる。
 */
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type Camera = {
  eye: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  /** 焦点距離（ピクセル） */
  focal: number;
  cx: number;
  cy: number;
};

export function sub(a: Vec3, b: Vec3): Vec3 {
  'worklet';
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a: Vec3, b: Vec3): number {
  'worklet';
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  'worklet';
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(a: Vec3): Vec3 {
  'worklet';
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  'worklet';
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** ベクトルを四元数で回転する */
export function rotate(q: Quat, v: Vec3): Vec3 {
  'worklet';
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

export function slerp(a: Quat, b: Quat, t: number): Quat {
  'worklet';
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let k0 = 1 - t;
  let k1 = t;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    k0 = Math.sin((1 - t) * angle) / sin;
    k1 = Math.sin(t * angle) / sin;
  }
  const q: Quat = [a[0] * k0 + bx * k1, a[1] * k0 + by * k1, a[2] * k0 + bz * k1, a[3] * k0 + bw * k1];
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function makeCamera(eye: Vec3, target: Vec3, fovDeg: number, width: number, height: number): Camera {
  'worklet';
  const forward = normalize(sub(target, eye));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const focal = height / 2 / Math.tan(((fovDeg / 2) * Math.PI) / 180);
  return { eye, right, up, forward, focal, cx: width / 2, cy: height / 2 };
}

/** ワールド座標を画面座標へ。戻り値の 3 番目は奥行き（カメラからの距離） */
export function project(cam: Camera, p: Vec3): Vec3 {
  'worklet';
  const v = sub(p, cam.eye);
  const z = Math.max(dot(v, cam.forward), 0.01);
  return [cam.cx + (dot(v, cam.right) / z) * cam.focal, cam.cy - (dot(v, cam.up) / z) * cam.focal, z];
}
