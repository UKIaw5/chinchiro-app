import { Dice } from '../lib/dice';
import { DIE_HALF, surfaceY } from './geometry';
import { FACE_NORMALS, Impact, RollRecording, SETTLE_SECONDS, rotationBetween } from './recording';

/**
 * 物理演算を使わず、サイコロの動きを設計して作る。
 *   - 投げ入れ → 数回跳ねる → お椀の壁沿いに回り込む → 減速して止まる
 *   - 回転は「転がった距離」から決め、回転の速さが急に変わらないよう滑らかにつなぐ
 *   - 止まったときの向きは、最初から狙った目が上になるよう決めておく
 */

/** 記録のコマ数（1秒あたり） */
const FPS = 120;
const GRAVITY = 60;
/** 跳ね返りの強さ（着地の速さに対する割合） */
const RESTITUTION = 0.42;
/** 転がりの度合い（1 = 滑らずに転がる） */
const ROLL_FACTOR = 0.5;
/** 回転の速さの変化をならす時間（秒） */
const SPIN_SMOOTHING = 0.06;
/** この角度（rad）転がるごとに、角が当たる「コトッ」という音を鳴らす */
const CLICK_ANGLE = 1.5;
/**
 * 床を進む速さの上限（サイコロの大きさ/秒）。60fps で目が追える速さに抑える。
 * 減速は一定なので最高速は 2 × 距離 ÷ 時間。これを超える場合は回り込む距離を縮める。
 */
const MAX_SPEED = 11;
/** 空中での回転の速さ（rad/s） */
const AIR_SPIN = 10;

type V = [number, number, number];
type Q = [number, number, number, number];

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const qmul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qconj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q: Q): Q => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};
function qexp(v: V): Q {
  const angle = Math.hypot(v[0], v[1], v[2]);
  if (angle < 1e-9) return [0, 0, 0, 1];
  const s = Math.sin(angle / 2) / angle;
  return [v[0] * s, v[1] * s, v[2] * s, Math.cos(angle / 2)];
}
function qlog(q: Q): V {
  const sign = q[3] < 0 ? -1 : 1;
  const [x, y, z, w] = [q[0] * sign, q[1] * sign, q[2] * sign, q[3] * sign];
  const s = Math.hypot(x, y, z);
  if (s < 1e-9) return [0, 0, 0];
  const angle = 2 * Math.atan2(s, w);
  return [(x / s) * angle, (y / s) * angle, (z / s) * angle];
}
function randomQuat(): Q {
  return qnorm([rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(-1, 1)]);
}

const polar = (r: number, theta: number): [number, number] => [r * Math.cos(theta), r * Math.sin(theta)];

/** 通過点をなめらかに結ぶ曲線（Catmull-Rom）を細かく刻み、距離で引けるようにする */
function buildPath(points: [number, number][]) {
  const pts = [points[0], ...points, points[points.length - 1]];
  const samples: [number, number][] = [];
  for (let s = 1; s < pts.length - 2; s++) {
    const [p0, p1, p2, p3] = [pts[s - 1], pts[s], pts[s + 1], pts[s + 2]];
    for (let k = 0; k < 60; k++) {
      const t = k / 60;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      samples.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  samples.push(points[points.length - 1]);
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  return {
    total,
    at(distance: number): [number, number] {
      const d = Math.min(Math.max(distance, 0), total);
      let lo = 0;
      let hi = lengths.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (lengths[mid] < d) lo = mid;
        else hi = mid;
      }
      const span = lengths[hi] - lengths[lo] || 1;
      const t = (d - lengths[lo]) / span;
      return [samples[lo][0] + (samples[hi][0] - samples[lo][0]) * t, samples[lo][1] + (samples[hi][1] - samples[lo][1]) * t];
    },
  };
}

/** 落下と跳ね返り：時刻 → 面からの高さ。着地の時刻と速さも返す */
function buildBounces(dropHeight: number) {
  const landings: { time: number; speed: number }[] = [];
  let time = Math.sqrt((2 * dropHeight) / GRAVITY);
  let speed = GRAVITY * time;
  landings.push({ time, speed });
  while (speed * RESTITUTION > 2.5) {
    speed *= RESTITUTION;
    time += (2 * speed) / GRAVITY;
    landings.push({ time, speed });
  }
  return {
    landings,
    heightAt(t: number): number {
      if (t < landings[0].time) return Math.max(0, dropHeight - 0.5 * GRAVITY * t * t);
      for (let i = 0; i < landings.length - 1; i++) {
        if (t < landings[i + 1].time) {
          const dt = t - landings[i].time;
          const v = landings[i + 1].speed;
          return Math.max(0, v * dt - 0.5 * GRAVITY * dt * dt);
        }
      }
      return 0;
    },
  };
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 止まる位置：3個が重ならず、底の内側に収まる三角形の配置 */
function restPositions(): [number, number][] {
  const center = polar(rand(0, 0.45), rand(0, Math.PI * 2));
  const phase = rand(0, Math.PI * 2);
  return [0, 1, 2].map((i) => {
    const [dx, dz] = polar(rand(0.85, 1.0), phase + (i * Math.PI * 2) / 3 + rand(-0.2, 0.2));
    return [center[0] + dx, center[1] + dz];
  });
}

/** サイコロ同士の中心がこれより近づかないようにする（サイコロの大きさ = 1） */
const MIN_GAP = 1.3;

function smoothOffsets(values: [number, number][], sigmaFrames: number): [number, number][] {
  const radius = Math.ceil(sigmaFrames * 3);
  const kernel: number[] = [];
  for (let i = -radius; i <= radius; i++) kernel.push(Math.exp(-(i * i) / (2 * sigmaFrames * sigmaFrames)));
  const sum = kernel.reduce((x, y) => x + y, 0);
  return values.map((_, f) => {
    let x = 0;
    let z = 0;
    kernel.forEach((w, k) => {
      const v = values[Math.min(values.length - 1, Math.max(0, f + k - radius))];
      x += (v[0] * w) / sum;
      z += (v[1] * w) / sum;
    });
    return [x, z];
  });
}

/** 近づきすぎたコマで押し離し、そのずらし量をならす、を数回くり返す（ground を書き換える） */
function separate(grounds: [number, number][][], frameCount: number) {
  const offsets = grounds.map(() => Array.from({ length: frameCount }, () => [0, 0] as [number, number]));
  for (let iteration = 0; iteration < 10; iteration++) {
    for (let f = 0; f < frameCount; f++) {
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const ax = grounds[i][f][0] + offsets[i][f][0];
          const az = grounds[i][f][1] + offsets[i][f][1];
          const bx = grounds[j][f][0] + offsets[j][f][0];
          const bz = grounds[j][f][1] + offsets[j][f][1];
          const d = Math.hypot(bx - ax, bz - az);
          if (d >= MIN_GAP) continue;
          const [nx, nz] = d > 1e-6 ? [(bx - ax) / d, (bz - az) / d] : [1, 0];
          const push = (MIN_GAP - d) / 2;
          offsets[i][f] = [offsets[i][f][0] - nx * push, offsets[i][f][1] - nz * push];
          offsets[j][f] = [offsets[j][f][0] + nx * push, offsets[j][f][1] + nz * push];
        }
      }
    }
    for (let i = 0; i < 3; i++) offsets[i] = smoothOffsets(offsets[i], 0.05 * FPS);
  }
  grounds.forEach((g, i) => g.forEach((p, f) => (g[f] = [p[0] + offsets[i][f][0], p[1] + offsets[i][f][1]])));
}

export function designThrow(target: Dice): RollRecording {
  const frameCount = Math.round(SETTLE_SECONDS * FPS);
  const dt = 1 / FPS;
  const transforms = new Array<number>(frameCount * 3 * 7).fill(0);
  const impacts: Impact[] = [];

  const swirl = Math.random() < 0.5 ? -1 : 1;
  const stopTimes = shuffle([1.5, 1.75, 2.0]).map((t) => t + rand(-0.04, 0.04));
  const rests = restPositions();

  // 1) 各サイコロの床上の道筋と、跳ね返りの高さを決める
  const plans = [0, 1, 2].map((die) => {
    const lane = die - 1;
    const delay = die * 0.07;
    const stopAt = stopTimes[die];
    const jitter = () => rand(-0.2, 0.2);

    // 手前の上から投げ込み、奥の壁 → 横の壁 → 手前寄りを回って中央付近で止まる
    // 3個が重なって見えないよう、投げ入れ位置と回り込む角度をずらす
    const start: [number, number] = [lane * 1.3 + jitter(), 2.7 + rand(0, 0.3)];
    const radii = [3.1 + lane * 0.25, 2.9 - lane * 0.25, 2.0 + lane * 0.3];
    const maxLength = (MAX_SPEED * (stopAt - delay)) / 2;
    let sweep = 1;
    let path = buildPath([start, rests[die]]);
    for (let attempt = 0; attempt < 12; attempt++) {
      path = buildPath([
        start,
        polar(radii[0], -Math.PI / 2 + swirl * 0.35 * sweep + lane * 0.5),
        polar(radii[1], -Math.PI / 2 + swirl * 1.4 * sweep + lane * 0.5),
        polar(radii[2], -Math.PI / 2 + swirl * 2.3 * sweep + lane * 0.5),
        rests[die],
      ]);
      if (path.total <= maxLength) break;
      sweep *= 0.85;
    }
    const bounces = buildBounces(rand(1.8, 2.4));
    for (const landing of bounces.landings) {
      if (landing.time + delay < stopAt) impacts.push({ time: landing.time + delay, strength: Math.min(1, landing.speed / 14) });
    }

    const ground: [number, number][] = [];
    const air: number[] = [];
    for (let f = 0; f < frameCount; f++) {
      const t = f * dt;
      const u = Math.min(Math.max((t - delay) / (stopAt - delay), 0), 1);
      // 減速は一定（摩擦で止まる感じ）：距離 = L × (1 - (1-u)²)
      ground.push(path.at(path.total * (1 - (1 - u) * (1 - u))));
      air.push(bounces.heightAt(Math.max(0, t - delay)));
    }
    return { delay, stopAt, stopFrame: Math.min(frameCount - 1, Math.round(stopAt * FPS)), ground, air };
  });

  // 2) すり抜けて重なって見えないよう、近づきすぎたサイコロどうしを押し離す（ずらし量は時間方向にならす）
  separate(plans.map((p) => p.ground), frameCount);

  // 3) 位置と回転を仕上げる
  for (let die = 0; die < 3; die++) {
    const { delay, stopAt, stopFrame, ground, air } = plans[die];

    // 止まったときの向き：狙った目を上にし、向き（ヨー）はランダム
    const yaw = qexp([0, rand(0, Math.PI * 2), 0]);
    const restQ = qnorm(qmul(yaw, rotationBetween(FACE_NORMALS[target[die]], [0, 1, 0])));

    const positions: V[] = ground.map(([x, z], f) => [x, surfaceY(x, z) + DIE_HALF + air[f], z]);

    // 回転：転がった距離から角速度を作り、急に変わらないようならしてから積み上げる
    let q = randomQuat();
    const raw: Q[] = [q];
    // 空中の回転：向きはランダム、速さは一定（60fps で目が追える程度）
    const axis = qlog(randomQuat());
    const axisLen = Math.hypot(axis[0], axis[1], axis[2]) || 1;
    let spin: V = [(axis[0] / axisLen) * AIR_SPIN, (axis[1] / axisLen) * AIR_SPIN, (axis[2] / axisLen) * AIR_SPIN];
    let rolled = 0;
    const smooth = 1 - Math.exp(-dt / SPIN_SMOOTHING);
    for (let f = 1; f < frameCount; f++) {
      const t = f * dt;
      const p = positions[f];
      const prev = positions[f - 1];
      const vx = (p[0] - prev[0]) / dt;
      const vz = (p[2] - prev[2]) / dt;
      const airborne = p[1] - DIE_HALF - surfaceY(p[0], p[2]) > 0.05;
      // 床を転がる：進む向きと直交する水平軸まわり（up × v）
      const rollSpin: V = [(vz / DIE_HALF) * ROLL_FACTOR, 0, (-vx / DIE_HALF) * ROLL_FACTOR];
      const desired: V = airborne ? [spin[0] * 0.995, spin[1] * 0.995, spin[2] * 0.995] : rollSpin;
      spin = [spin[0] + (desired[0] - spin[0]) * smooth, spin[1] + (desired[1] - spin[1]) * smooth, spin[2] + (desired[2] - spin[2]) * smooth];
      q = qnorm(qmul(qexp([spin[0] * dt, spin[1] * dt, spin[2] * dt]), q));
      raw.push(q);

      if (!airborne && t > delay && t < stopAt) {
        rolled += Math.hypot(spin[0], spin[1], spin[2]) * dt;
        if (rolled >= CLICK_ANGLE) {
          rolled -= CLICK_ANGLE;
          impacts.push({ time: t, strength: Math.min(0.5, Math.max(0.12, Math.hypot(vx, vz) / 14)) });
        }
      }
    }

    // 止まる時刻までに、狙った向きへ少しずつ寄せていく（なめらかに補正）
    const error = qlog(qmul(restQ, qconj(raw[stopFrame])));
    for (let f = 0; f < frameCount; f++) {
      const s = Math.min(1, f / stopFrame);
      const w = s * s * (3 - 2 * s);
      const fixed = f >= stopFrame ? restQ : qnorm(qmul(qexp([error[0] * w, error[1] * w, error[2] * w]), raw[f]));
      const b = (f * 3 + die) * 7;
      const p = f >= stopFrame ? positions[stopFrame] : positions[f];
      transforms[b] = p[0];
      transforms[b + 1] = p[1];
      transforms[b + 2] = p[2];
      transforms[b + 3] = fixed[0];
      transforms[b + 4] = fixed[1];
      transforms[b + 5] = fixed[2];
      transforms[b + 6] = fixed[3];
    }
  }

  impacts.sort((a, b) => a.time - b.time);
  return {
    fps: FPS,
    frameCount,
    transforms,
    impacts,
  };
}
