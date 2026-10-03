import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { DieFace } from '../lib/dice';
import { BOWL_DEPTH, BOWL_FLOOR_RADIUS, BOWL_RIM_RADIUS, DIE_HALF, DIE_SIZE } from '../physics/geometry';
import { FACE_NORMALS } from '../physics/simulateRoll';

/** 目の 3x3 グリッド上の位置（0〜8、左上から右下へ） */
const PIP_POSITIONS: Record<DieFace, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const PIP_SPACING = 0.27;
const PIP_RADIUS = 0.085;
const ONE_PIP_RADIUS = 0.15;

/** 面に貼る目の円盤をまとめたジオメトリ（黒い目と赤い 1 の目で分ける） */
function createPipGeometries() {
  const black: THREE.BufferGeometry[] = [];
  const red: THREE.BufferGeometry[] = [];

  for (const face of [1, 2, 3, 4, 5, 6] as DieFace[]) {
    const normal = new THREE.Vector3(...FACE_NORMALS[face]);
    // 面上の2軸
    const helper = Math.abs(normal.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(helper, normal).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

    for (const index of PIP_POSITIONS[face]) {
      const row = Math.floor(index / 3) - 1;
      const col = (index % 3) - 1;
      const isOne = face === 1;
      const disc = new THREE.CircleGeometry(isOne ? ONE_PIP_RADIUS : PIP_RADIUS, 24);
      disc.applyQuaternion(orientation);
      const position = normal
        .clone()
        .multiplyScalar(DIE_HALF + 0.002)
        .addScaledVector(u, col * PIP_SPACING)
        .addScaledVector(v, row * PIP_SPACING);
      disc.translate(position.x, position.y, position.z);
      (isOne ? red : black).push(disc);
    }
  }

  return { black: mergeGeometries(black), red: mergeGeometries(red) };
}

export function createDiceFactory() {
  const bodyGeometry = new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 4, 0.12);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#FBF8F0', roughness: 0.35 });
  const pips = createPipGeometries();
  const blackMaterial = new THREE.MeshStandardMaterial({ color: '#151515', roughness: 0.6 });
  const redMaterial = new THREE.MeshStandardMaterial({ color: '#C8102E', roughness: 0.5 });

  /**
   * サイコロ1個。外側の Group に物理演算の位置・回転を、
   * 内側の `faceFix` に目の割り当て直しの回転を入れる。
   */
  return function createDie() {
    const root = new THREE.Group();
    const faceFix = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    faceFix.add(body, new THREE.Mesh(pips.black, blackMaterial), new THREE.Mesh(pips.red, redMaterial));
    root.add(faceFix);
    return { root, faceFix };
  };
}

/** 陶器の丼。内側の形は物理演算の当たり判定（平らな底 + 円錐の壁）に合わせる。 */
export function createBowl() {
  const points: THREE.Vector2[] = [];
  const fillet = 0.25;
  const dr = BOWL_RIM_RADIUS - BOWL_FLOOR_RADIUS;
  const slope = Math.hypot(dr, BOWL_DEPTH);

  // 内側：底の中心 → 底の端 →（角を丸めて）→ 壁 → 縁
  points.push(new THREE.Vector2(0, 0));
  points.push(new THREE.Vector2(BOWL_FLOOR_RADIUS - fillet, 0));
  const cornerStart = new THREE.Vector2(BOWL_FLOOR_RADIUS - fillet, 0);
  const corner = new THREE.Vector2(BOWL_FLOOR_RADIUS, 0);
  const cornerEnd = new THREE.Vector2(BOWL_FLOOR_RADIUS + (dr / slope) * fillet, (BOWL_DEPTH / slope) * fillet);
  const curve = new THREE.QuadraticBezierCurve(cornerStart, corner, cornerEnd);
  points.push(...curve.getPoints(6).slice(1));
  points.push(new THREE.Vector2(BOWL_RIM_RADIUS, BOWL_DEPTH));

  // 縁を丸く回り込んで外側へ
  const lipCenter = new THREE.Vector2(BOWL_RIM_RADIUS + 0.14, BOWL_DEPTH);
  for (let i = 1; i <= 8; i++) {
    const a = Math.PI - (i / 8) * Math.PI;
    points.push(new THREE.Vector2(lipCenter.x + Math.cos(a) * 0.14, lipCenter.y + Math.sin(a) * 0.14));
  }

  // 外側：膨らみながら高台へ
  const outer = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(BOWL_RIM_RADIUS + 0.28, BOWL_DEPTH),
    new THREE.Vector2(BOWL_RIM_RADIUS + 0.2, -0.3),
    new THREE.Vector2(BOWL_FLOOR_RADIUS + 0.2, -0.45),
  );
  points.push(...outer.getPoints(10).slice(1));
  points.push(new THREE.Vector2(BOWL_FLOOR_RADIUS + 0.15, -0.7));
  points.push(new THREE.Vector2(BOWL_FLOOR_RADIUS - 0.15, -0.7));
  points.push(new THREE.Vector2(BOWL_FLOOR_RADIUS - 0.25, -0.5));
  points.push(new THREE.Vector2(0, -0.5));

  const group = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(points, 96),
    new THREE.MeshStandardMaterial({ color: '#F3EFE6', roughness: 0.22, side: THREE.DoubleSide }),
  );
  bowl.castShadow = true;
  bowl.receiveShadow = true;

  // 縁の藍色の線
  const rimLine = new THREE.Mesh(
    new THREE.TorusGeometry(BOWL_RIM_RADIUS + 0.14, 0.05, 12, 120),
    new THREE.MeshStandardMaterial({ color: '#1F3A6E', roughness: 0.3 }),
  );
  rimLine.rotation.x = Math.PI / 2;
  rimLine.position.y = BOWL_DEPTH + 0.13;

  group.add(bowl, rimLine);
  return group;
}

/** お椀が置かれている高さ（高台の底） */
export const TABLE_Y = -0.7;
