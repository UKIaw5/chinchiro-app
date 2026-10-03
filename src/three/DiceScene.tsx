import { ExpoWebGLRenderingContext, GLView } from 'expo-gl';
import { Ref, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import * as THREE from 'three';

import { SIM_FPS } from '../physics/geometry';
import { Impact, RollRecording, SETTLE_SECONDS } from '../physics/simulateRoll';
import { createStage } from './stage';

/** 静止してからカメラが寄り始めるまで */
const ZOOM_DELAY = 0.05;

export type DiceSceneHandle = {
  /** 投げ入れから再生する。衝突のたびに onImpact が呼ばれる。 */
  play(recording: RollRecording, onImpact: (impact: Impact) => void): void;
  /** アニメーションなしで静止状態を表示する */
  show(recording: RollRecording): void;
};

type Props = {
  ref?: Ref<DiceSceneHandle>;
  style?: StyleProp<ViewStyle>;
};

type SceneState = {
  recording: RollRecording | null;
  startedAt: number;
  animating: boolean;
  /** 静止後にサイコロへ寄るか */
  zoom: boolean;
  nextImpact: number;
  onImpact: ((impact: Impact) => void) | null;
};

export function DiceScene({ ref, style }: Props) {
  const state = useRef<SceneState>({ recording: null, startedAt: 0, animating: false, zoom: false, nextImpact: 0, onImpact: null });
  const requestRender = useRef<() => void>(() => {});
  const frameHandle = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    play(recording, onImpact) {
      state.current = { recording, startedAt: performance.now(), animating: true, zoom: true, nextImpact: 0, onImpact };
      requestRender.current();
    },
    show(recording) {
      state.current = { recording, startedAt: performance.now() - 10_000, animating: false, zoom: false, nextImpact: 0, onImpact: null };
      requestRender.current();
    },
  }));

  useEffect(
    () => () => {
      if (frameHandle.current !== null) cancelAnimationFrame(frameHandle.current);
    },
    [],
  );

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    // three.js が要求する最低限の canvas もどき
    const canvas = {
      width,
      height,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      clientWidth: width,
      clientHeight: height,
      getContext: () => gl,
    } as unknown as HTMLCanvasElement;

    const stage = createStage(canvas, gl as unknown as WebGL2RenderingContext, width, height);
    const eye = stage.wideEye.clone();
    const target = stage.wideTarget.clone();
    const desiredEye = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();

    const tick = () => {
      frameHandle.current = null;
      const s = state.current;
      if (!s.recording) {
        stage.render(eye, target);
        gl.endFrameEXP();
        return;
      }

      const elapsed = (performance.now() - s.startedAt) / 1000;
      const frame = Math.min(s.recording.frameCount - 1, Math.floor(elapsed * SIM_FPS));
      const centroid = stage.applyFrame(s.recording, frame);

      // 再生位置を過ぎた衝突を通知
      while (s.animating && s.nextImpact < s.recording.impacts.length && s.recording.impacts[s.nextImpact].time <= elapsed) {
        s.onImpact?.(s.recording.impacts[s.nextImpact]);
        s.nextImpact++;
      }

      // 止まったらサイコロに寄る（タメの演出）
      const zoomed = s.zoom && elapsed >= SETTLE_SECONDS + ZOOM_DELAY;
      if (zoomed) {
        desiredTarget.copy(centroid);
        stage.zoomEye(centroid, desiredEye);
      } else {
        desiredTarget.copy(stage.wideTarget);
        desiredEye.copy(stage.wideEye);
      }
      const smoothing = s.animating ? (zoomed ? 0.06 : 0.12) : 1;
      eye.lerp(desiredEye, smoothing);
      target.lerp(desiredTarget, smoothing);

      stage.render(eye, target);
      gl.endFrameEXP();

      const cameraMoving = eye.distanceToSquared(desiredEye) > 1e-4;
      if (frame < s.recording.frameCount - 1 || cameraMoving) {
        frameHandle.current = requestAnimationFrame(tick);
      } else {
        s.animating = false;
      }
    };

    requestRender.current = () => {
      if (frameHandle.current === null) frameHandle.current = requestAnimationFrame(tick);
    };
    requestRender.current();
  };

  return <GLView style={style} onContextCreate={onContextCreate} msaaSamples={4} />;
}
