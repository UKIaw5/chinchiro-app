import { Canvas, Picture, createPicture } from '@shopify/react-native-skia';
import { Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, SharedValue, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { DieFace } from '../lib/dice';
import { Impact, RollRecording, SETTLE_SECONDS } from '../motion/recording';
import { BACKGROUND, drawTableAndBowl } from './bowl';
import { wideCamera } from './camera';
import { DIE_FACES, ONE_PIP_RADIUS, PIP_LAYOUT, PIP_RADIUS, PIP_SPACING } from './dieShape';
import { FACE_PX, FrameData, IDENTITY, Motion, SHADOW_PX, computeFrame, toMotion } from './frame';

export type DiceSceneHandle = {
  /** 投げ入れから再生する。衝突のたびに onImpact が呼ばれる。 */
  play(recording: RollRecording, onImpact: (impact: Impact) => void): void;
  /** アニメーションなしで静止状態を表示する */
  show(recording: RollRecording): void;
};

/**
 * サイコロの各面を普通の View として置き、毎コマその「3D の変形行列」だけを UI スレッドで更新する。
 * 描画そのものは iOS（Core Animation）が行うので、毎コマ絵を描き直す方式より軽く、画面更新と同期する。
 */

/** 静止してからカメラが寄り始めるまで（秒） */
const ZOOM_DELAY = 0.05;
const ZOOM_SCALE = 0.5;

type Props = {
  ref?: Ref<DiceSceneHandle>;
  style?: StyleProp<ViewStyle>;
};

function DieFaceView({ frame, index, face }: { frame: SharedValue<FrameData | null>; index: number; face: DieFace }) {
  const faceStyle = useAnimatedStyle(() => {
    const fr = frame.value;
    if (!fr) return { opacity: 0, transform: [{ matrix: IDENTITY }] };
    return { opacity: fr.visible[index], transform: [{ matrix: fr.matrices[index] }] };
  });
  const shadeStyle = useAnimatedStyle(() => ({ opacity: frame.value?.shade[index] ?? 0 }));

  return (
    <Animated.View style={[styles.face, faceStyle]}>
      {PIP_LAYOUT[face].map((pip) => {
        const row = Math.floor(pip / 3) - 1;
        const col = (pip % 3) - 1;
        const r = (face === 1 ? ONE_PIP_RADIUS : PIP_RADIUS) * FACE_PX;
        return (
          <View
            key={pip}
            style={[
              styles.pip,
              face === 1 && styles.redPip,
              {
                width: r * 2,
                height: r * 2,
                borderRadius: r,
                // View の右 = 面の u、View の下 = 面の -v
                left: FACE_PX / 2 + col * PIP_SPACING * FACE_PX - r,
                top: FACE_PX / 2 - row * PIP_SPACING * FACE_PX - r,
              },
            ]}
          />
        );
      })}
      <Animated.View style={[styles.shade, shadeStyle]} />
    </Animated.View>
  );
}

function ShadowView({ frame, die }: { frame: SharedValue<FrameData | null>; die: number }) {
  const style = useAnimatedStyle(() => {
    const s = frame.value?.shadows[die];
    if (!s) return { opacity: 0 };
    return {
      opacity: s[4],
      transform: [{ translateX: s[0] }, { translateY: s[1] }, { scaleX: s[2] }, { scaleY: s[3] }],
    };
  });
  return <Animated.View style={[styles.shadow, style]} />;
}

export function DiceScene({ ref, style }: Props) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const motion = useSharedValue<Motion | null>(null);
  const progress = useSharedValue(1);
  const zoom = useSharedValue(0);
  const view = useSharedValue({ width: 0, height: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  useImperativeHandle(ref, () => ({
    play(recording, onImpact) {
      clearTimers();
      motion.value = toMotion(recording);
      progress.value = 0;
      progress.value = withTiming(1, { duration: SETTLE_SECONDS * 1000, easing: Easing.linear });
      zoom.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
      // 音・振動は JS のタイマーで（UI の動きとは独立）
      for (const impact of recording.impacts) {
        timers.current.push(setTimeout(() => onImpact(impact), impact.time * 1000));
      }
      timers.current.push(
        setTimeout(
          () => {
            zoom.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
          },
          (SETTLE_SECONDS + ZOOM_DELAY) * 1000,
        ),
      );
    },
    show(recording) {
      clearTimers();
      motion.value = toMotion(recording);
      progress.value = 1;
      zoom.value = 0;
    },
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    view.value = { width, height };
    setSize({ width, height });
  };

  const frame = useDerivedValue<FrameData | null>(() => {
    const m = motion.value;
    const v = view.value;
    if (!m || v.width === 0) return null;
    const cam = wideCamera(v.width, v.height);
    return computeFrame(m, progress.value * (m.frameCount - 1), cam, v.width, v.height);
  });

  // 寄り（ズーム）と揺れは、場面全体をまとめて動かす
  const stageStyle = useAnimatedStyle(() => {
    const fr = frame.value;
    const v = view.value;
    if (!fr) return {};
    const z = zoom.value;
    const s = 1 + ZOOM_SCALE * z;
    const dx = fr.centroid[0] - v.width / 2;
    const dy = fr.centroid[1] - v.height / 2;
    return {
      transform: [{ translateX: -s * dx * z }, { translateY: -s * dy * z + fr.shake }, { scale: s }],
    };
  });

  // お椀は動かないので、大きさが決まったときに一度だけ描く
  const bowl = useMemo(() => {
    if (!size) return null;
    const cam = wideCamera(size.width, size.height);
    return createPicture((canvas) => drawTableAndBowl(canvas, cam, size.width, size.height), {
      width: size.width,
      height: size.height,
    });
  }, [size]);

  const centerStyle = size && {
    left: size.width / 2,
    top: size.height / 2,
  };

  return (
    <View style={[styles.root, style]} onLayout={onLayout}>
      {size && bowl && (
        <Animated.View style={[StyleSheet.absoluteFill, stageStyle]}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Picture picture={bowl} />
          </Canvas>
          <View style={[styles.anchor, centerStyle]}>
            {[0, 1, 2].map((die) => (
              <ShadowView key={die} frame={frame} die={die} />
            ))}
            {[0, 1, 2].map((die) =>
              // 並び順は DIE_FACES（frame の計算と同じ順）
              DIE_FACES.map(({ face }, i) => <DieFaceView key={`${die}-${face}`} frame={frame} index={die * 6 + i} face={face} />),
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    backgroundColor: BACKGROUND,
  },
  anchor: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  face: {
    position: 'absolute',
    left: -FACE_PX / 2,
    top: -FACE_PX / 2,
    width: FACE_PX,
    height: FACE_PX,
    borderRadius: FACE_PX * 0.14,
    backgroundColor: '#FBF8F0',
    borderWidth: 2,
    borderColor: '#DCD5C6',
    overflow: 'hidden',
  },
  pip: {
    position: 'absolute',
    backgroundColor: '#1A1A1A',
  },
  redPip: {
    backgroundColor: '#C8102E',
  },
  shade: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  shadow: {
    position: 'absolute',
    left: -SHADOW_PX / 2,
    top: -SHADOW_PX / 2,
    width: SHADOW_PX,
    height: SHADOW_PX,
    borderRadius: SHADOW_PX / 2,
    backgroundColor: 'rgba(40,30,20,1)',
  },
});
