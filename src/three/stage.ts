import * as THREE from 'three';

import { BOWL_RIM_RADIUS } from '../physics/geometry';
import { RollRecording } from '../physics/simulateRoll';
import { TABLE_Y, createBowl, createDiceFactory } from './models';

export const BACKGROUND = '#14532D';
const FOV = 32;
/** 寄ったときのカメラ距離（引きの距離に対する割合） */
const ZOOM_RATIO = 0.6;

/** 照明・お椀・サイコロ・カメラを組み立てる（React Native / ブラウザ共通） */
export function createStage(canvas: HTMLCanvasElement, context: WebGL2RenderingContext, width: number, height: number) {
  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);

  scene.add(new THREE.HemisphereLight('#FFF6E5', '#1B3A26', 1.4));
  const sun = new THREE.DirectionalLight('#FFFFFF', 2.2);
  sun.position.set(-4, 12, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.bias = -0.0005;
  sun.shadow.radius = 4;
  scene.add(sun);

  // 影だけを落とすテーブル面（背景色と継ぎ目が出ないように）
  const table = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.35 }));
  table.rotation.x = -Math.PI / 2;
  table.position.y = TABLE_Y;
  table.receiveShadow = true;
  scene.add(table);

  scene.add(createBowl());

  const createDie = createDiceFactory();
  const dice = [createDie(), createDie(), createDie()];
  for (const die of dice) scene.add(die.root);

  // お椀が横幅に収まる距離にカメラを置く（縦長画面向け）
  const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 100);
  const halfHFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camera.aspect);
  const wideDistance = Math.max((BOWL_RIM_RADIUS + 0.9) / Math.tan(halfHFov), 16);
  const viewDir = new THREE.Vector3(0, 1, 0.62).normalize();
  const wideTarget = new THREE.Vector3(0, 0.4, 0);
  const wideEye = wideTarget.clone().addScaledVector(viewDir, wideDistance);

  const centroid = new THREE.Vector3();

  return {
    wideEye,
    wideTarget,

    /** 記録の指定フレームをサイコロに反映し、3個の重心を返す */
    applyFrame(recording: RollRecording, frame: number): THREE.Vector3 {
      const t = recording.transforms;
      centroid.set(0, 0, 0);
      dice.forEach((die, i) => {
        const base = (frame * 3 + i) * 7;
        die.root.position.set(t[base], t[base + 1], t[base + 2]);
        die.root.quaternion.set(t[base + 3], t[base + 4], t[base + 5], t[base + 6]);
        die.faceFix.quaternion.set(...recording.faceFix[i]);
        centroid.add(die.root.position);
      });
      return centroid.divideScalar(3);
    },

    /** サイコロに寄ったときのカメラ位置 */
    zoomEye(focus: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
      return out.copy(focus).addScaledVector(viewDir, wideDistance * ZOOM_RATIO);
    },

    render(eye: THREE.Vector3, target: THREE.Vector3) {
      camera.position.copy(eye);
      camera.lookAt(target);
      renderer.render(scene, camera);
    },
  };
}
