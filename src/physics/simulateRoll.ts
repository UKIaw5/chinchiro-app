import * as CANNON from 'cannon-es';

import { Dice, DieFace } from '../lib/dice';
import { BOWL_DEPTH, BOWL_FLOOR_RADIUS, BOWL_RIM_RADIUS, DIE_HALF, SIM_FPS } from './geometry';

/** 投げ入れてから全サイコロが止まるまでの時間 */
export const SETTLE_SECONDS = 2.2;
const TOTAL_FRAMES = Math.round(SETTLE_SECONDS * SIM_FPS);
/** この時刻を過ぎたら減衰を強めて確実に止める */
const BRAKE_FRAME = Math.round(1.1 * SIM_FPS);
const GRAVITY = -40;
const MAX_ATTEMPTS = 30;
/** お椀に立てかかって止まるのは許すが、どの面が上か一目で分かる傾きまで */
const MIN_FLATNESS = 0.9;

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

/** 投げ入れから静止までの記録。出目とは無関係に計算できるので事前に用意しておける。 */
export type Throw = {
  frameCount: number;
  /** frameCount × 3個 × [px, py, pz, qx, qy, qz, qw] */
  transforms: Float32Array;
  impacts: Impact[];
  /** 静止時に上を向いている目（標準の目の配置での値） */
  restingFaces: DieFace[];
};

export type RollRecording = Throw & {
  /** 各サイコロのモデルに掛けるローカル回転。狙った目が上を向くよう面を入れ替える。 */
  faceFix: [number, number, number, number][];
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createBowl(world: CANNON.World, floorMaterial: CANNON.Material, material: CANNON.Material) {
  const floor = new CANNON.Body({ type: CANNON.Body.STATIC, material: floorMaterial, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);

  // 円錐状の壁を細長い箱の輪で近似する
  const segments = 32;
  const thickness = 0.6;
  const dr = BOWL_RIM_RADIUS - BOWL_FLOOR_RADIUS;
  const slopeLength = Math.hypot(dr, BOWL_DEPTH);
  // 壁の内面の法線（半径方向成分, 上方向成分）
  const nr = -BOWL_DEPTH / slopeLength;
  const ny = dr / slopeLength;
  const midRadius = (BOWL_FLOOR_RADIUS + BOWL_RIM_RADIUS) / 2;
  const width = ((2 * Math.PI * BOWL_RIM_RADIUS) / segments) * 1.15;
  // 底より下まで伸ばして隙間をなくす
  const extendedLength = slopeLength + 1.2;

  // 外に飛び出さないよう、縁の上に見えない垂直の壁も置く
  const fenceHeight = 6;

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const radial = new CANNON.Vec3(Math.cos(theta), 0, Math.sin(theta));
    const tangent = new CANNON.Vec3(-Math.sin(theta), 0, Math.cos(theta));

    // 斜面に沿った方向（ローカル x）、内面の法線（ローカル y）、接線（ローカル z）
    const slopeDir = new CANNON.Vec3(radial.x * (dr / slopeLength), BOWL_DEPTH / slopeLength, radial.z * (dr / slopeLength));
    const normal = new CANNON.Vec3(radial.x * nr, ny, radial.z * nr);
    const quaternion = quaternionFromBasis(slopeDir, normal, tangent);

    const surfaceCenter = new CANNON.Vec3(radial.x * midRadius, BOWL_DEPTH / 2, radial.z * midRadius);
    const center = surfaceCenter.vsub(normal.scale(thickness / 2));
    const wall = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material,
      shape: new CANNON.Box(new CANNON.Vec3(extendedLength / 2, thickness / 2, width / 2)),
      position: center,
      quaternion,
    });
    world.addBody(wall);

    const fence = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material,
      shape: new CANNON.Box(new CANNON.Vec3(thickness / 2, fenceHeight / 2, width / 2)),
      position: new CANNON.Vec3(
        radial.x * (BOWL_RIM_RADIUS + thickness / 2),
        BOWL_DEPTH + fenceHeight / 2,
        radial.z * (BOWL_RIM_RADIUS + thickness / 2),
      ),
      quaternion: quaternionFromBasis(radial, new CANNON.Vec3(0, 1, 0), tangent),
    });
    world.addBody(fence);
  }
}

/** 直交する3軸（ローカル x, y, z のワールド方向）から回転を作る */
function quaternionFromBasis(x: CANNON.Vec3, y: CANNON.Vec3, z: CANNON.Vec3): CANNON.Quaternion {
  const m00 = x.x, m01 = y.x, m02 = z.x;
  const m10 = x.y, m11 = y.y, m12 = z.y;
  const m20 = x.z, m21 = y.z, m22 = z.z;
  const trace = m00 + m11 + m22;
  const q = new CANNON.Quaternion();
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q.set((m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s);
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q.set(0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q.set((m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q.set((m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
  }
  return q.normalize();
}

/** 静止したサイコロで、上を向いているローカル軸と「平らに置かれている度合い」を返す */
function upFace(q: CANNON.Quaternion): { face: DieFace; flatness: number } {
  let best: DieFace = 1;
  let bestDot = -Infinity;
  for (const face of [1, 2, 3, 4, 5, 6] as DieFace[]) {
    const [x, y, z] = FACE_NORMALS[face];
    const dot = q.vmult(new CANNON.Vec3(x, y, z)).y;
    if (dot > bestDot) {
      bestDot = dot;
      best = face;
    }
  }
  return { face: best, flatness: bestDot };
}

type Attempt = { throw: Throw; clean: boolean };

function attempt(): Attempt {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
  world.allowSleep = true;
  world.solver = new CANNON.GSSolver();
  (world.solver as CANNON.GSSolver).iterations = 20;

  const floorMaterial = new CANNON.Material('floor');
  const wallMaterial = new CANNON.Material('wall');
  const dieMaterial = new CANNON.Material('die');
  world.addContactMaterial(new CANNON.ContactMaterial(floorMaterial, dieMaterial, { friction: 0.25, restitution: 0.45 }));
  world.addContactMaterial(new CANNON.ContactMaterial(wallMaterial, dieMaterial, { friction: 0.1, restitution: 0.45 }));
  world.addContactMaterial(new CANNON.ContactMaterial(dieMaterial, dieMaterial, { friction: 0.2, restitution: 0.35 }));
  createBowl(world, floorMaterial, wallMaterial);

  // 手前（+z）の上から、奥へ向かって投げ入れる
  const throwDir = rand(-0.4, 0.4);
  const dice = [0, 1, 2].map((i) => {
    const body = new CANNON.Body({
      mass: 1,
      material: dieMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(DIE_HALF, DIE_HALF, DIE_HALF)),
      position: new CANNON.Vec3((i - 1) * 1.25 + rand(-0.15, 0.15), rand(4.2, 5.0), rand(2.2, 2.8)),
      linearDamping: 0.05,
      angularDamping: 0.05,
      sleepSpeedLimit: 0.12,
      sleepTimeLimit: 0.25,
    });
    body.quaternion.setFromEuler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
    body.velocity.set(throwDir * 4 + rand(-1, 1), rand(-3, -1), rand(-7, -5));
    body.angularVelocity.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    world.addBody(body);
    return body;
  });

  const dt = 1 / SIM_FPS;
  const transforms = new Float32Array(TOTAL_FRAMES * 3 * 7);
  const impacts: Impact[] = [];
  const prevVelocity = dice.map((d) => d.velocity.clone());
  const lastImpactFrame = [-100, -100, -100];

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    if (frame === BRAKE_FRAME) {
      for (const d of dice) {
        d.linearDamping = 0.6;
        d.angularDamping = 0.6;
      }
    }
    world.step(dt);

    dice.forEach((d, i) => {
      const base = (frame * 3 + i) * 7;
      transforms[base] = d.position.x;
      transforms[base + 1] = d.position.y;
      transforms[base + 2] = d.position.z;
      transforms[base + 3] = d.quaternion.x;
      transforms[base + 4] = d.quaternion.y;
      transforms[base + 5] = d.quaternion.z;
      transforms[base + 6] = d.quaternion.w;

      // 重力以外による急な速度変化 = 何かにぶつかった
      const dv = d.velocity.vsub(prevVelocity[i]);
      dv.y -= GRAVITY * dt;
      const change = dv.length();
      if (change > 1.5 && frame - lastImpactFrame[i] >= 4) {
        impacts.push({ time: frame * dt, strength: Math.min(1, change / 10) });
        lastImpactFrame[i] = frame;
      }
      prevVelocity[i].copy(d.velocity);
    });
  }

  const clean = dice.every((d) => {
    const { flatness } = upFace(d.quaternion);
    return (
      d.velocity.length() < 0.1 &&
      d.angularVelocity.length() < 0.2 &&
      flatness > MIN_FLATNESS
    );
  });

  return {
    throw: { frameCount: TOTAL_FRAMES, transforms, impacts, restingFaces: dice.map((d) => upFace(d.quaternion).face) },
    clean,
  };
}

/** 物理演算で投げ入れから静止までを計算する（重い処理。出目とは無関係） */
export function simulateThrow(): Throw {
  let result = attempt();
  for (let i = 1; i < MAX_ATTEMPTS && !result.clean; i++) {
    result = attempt();
  }
  return result.throw;
}

/** 止まったときに上を向いている面へ、狙った目を割り当て直す（軽い処理） */
export function applyTarget(thrown: Throw, target: Dice): RollRecording {
  const faceFix = thrown.restingFaces.map((face, i) => {
    const [ux, uy, uz] = FACE_NORMALS[face];
    const [tx, ty, tz] = FACE_NORMALS[target[i]];
    const fix = new CANNON.Quaternion();
    fix.setFromVectors(new CANNON.Vec3(tx, ty, tz), new CANNON.Vec3(ux, uy, uz));
    return [fix.x, fix.y, fix.z, fix.w] as [number, number, number, number];
  });
  return { ...thrown, faceFix };
}
