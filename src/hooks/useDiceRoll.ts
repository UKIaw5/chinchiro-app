import * as Haptics from 'expo-haptics';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { useDiceSound } from '../audio/useDiceSound';
import { Hand, Zone, evaluate, randomDice, rollForZone } from '../lib/dice';
import { Impact, Throw, applyTarget, simulateThrow } from '../physics/simulateRoll';
import { DiceSceneHandle } from '../three/DiceScene';

/**
 * 時刻表（どのタップでも同じ）
 *   0     投げ入れ
 *   〜2.2 転がって止まる（simulateRoll の SETTLE_SECONDS）
 *   〜2.9 タメ（静寂・カメラが寄る）
 *   2.9   役名を表示
 */
export const REVEAL_MS = 2900;

/** 衝突ごとの軽い振動の最短間隔 */
const IMPACT_HAPTIC_INTERVAL_MS = 90;

function vibrate(action: () => Promise<void>) {
  action().catch(() => {});
}

export function useDiceRoll(scene: RefObject<DiceSceneHandle | null>) {
  const [hand, setHand] = useState<Hand | null>(null);
  const [rolling, setRolling] = useState(false);
  const { playClack } = useDiceSound();

  const rollingRef = useRef(false);
  /** 次に使う転がり方（出目と無関係なので事前に計算しておく） */
  const nextThrow = useRef<Throw | null>(null);
  const lastImpactHaptic = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const prepareNextThrow = useCallback(() => {
    setTimeout(() => {
      nextThrow.current ??= simulateThrow();
    }, 0);
  }, []);

  useEffect(() => {
    // 初期表示：適当な出目でお椀の中に置いておく
    scene.current?.show(applyTarget(simulateThrow(), randomDice()));
    prepareNextThrow();
    return () => clearTimeout(revealTimer.current);
  }, [scene, prepareNextThrow]);

  const onImpact = useCallback(
    (impact: Impact) => {
      playClack(impact.strength);
      const now = Date.now();
      if (impact.strength > 0.35 && now - lastImpactHaptic.current > IMPACT_HAPTIC_INTERVAL_MS) {
        lastImpactHaptic.current = now;
        vibrate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      }
    },
    [playClack],
  );

  const roll = (zone: Zone) => {
    if (rollingRef.current) return;
    rollingRef.current = true;

    // 結果はタップ時点で確定させ、役名は時刻表どおりに出す
    const result = rollForZone(zone);
    const thrown = nextThrow.current ?? simulateThrow();
    nextThrow.current = null;

    setHand(null);
    setRolling(true);
    vibrate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    scene.current?.play(applyTarget(thrown, result), onImpact);

    revealTimer.current = setTimeout(() => {
      setHand(evaluate(result));
      setRolling(false);
      rollingRef.current = false;
      vibrate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      prepareNextThrow();
    }, REVEAL_MS);
  };

  return { hand, rolling, roll };
}

