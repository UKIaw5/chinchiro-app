import * as Haptics from 'expo-haptics';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { useDiceSound } from '../audio/useDiceSound';
import { HAND_TIERS, Hand, HandTier, Zone, evaluate, randomDice, rollForZone } from '../lib/dice';
import { designThrow } from '../motion/designThrow';
import { Impact } from '../motion/recording';
import { DiceSceneHandle } from '../scene/DiceScene';

/**
 * 時刻表（どのタップでも同じ）
 *   0     投げ入れ
 *   〜2.0 転がって止まる（designThrow で設計した動き。3個が順に止まる）
 *   〜2.9 タメ（静寂・カメラが寄る）
 *   2.9   役名を表示
 */
export const REVEAL_MS = 2900;

/** 衝突ごとの軽い振動の最短間隔 */
const IMPACT_HAPTIC_INTERVAL_MS = 90;

function vibrate(action: () => Promise<void>) {
  action().catch(() => {});
}

/** 役が出たときの振動も格に合わせる */
function revealHaptics(tier: HandTier) {
  switch (tier) {
    case 'jackpot':
      vibrate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      setTimeout(() => vibrate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)), 180);
      break;
    case 'win':
      vibrate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      break;
    case 'lose':
      vibrate(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
      break;
    case 'none':
      vibrate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      break;
  }
}

export function useDiceRoll(scene: RefObject<DiceSceneHandle | null>) {
  const [hand, setHand] = useState<Hand | null>(null);
  const [rolling, setRolling] = useState(false);
  const { playClack, playResult } = useDiceSound();

  const rollingRef = useRef(false);
  const lastImpactHaptic = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // 初期表示：適当な出目でお椀の中に置いておく
    scene.current?.show(designThrow(randomDice()));
  }, [scene]);

  useEffect(() => () => clearTimeout(revealTimer.current), []);

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

    setHand(null);
    setRolling(true);
    vibrate(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    scene.current?.play(designThrow(result), onImpact);

    revealTimer.current = setTimeout(() => {
      const hand = evaluate(result);
      const tier = HAND_TIERS[hand.kind];
      setHand(hand);
      playResult(tier);
      revealHaptics(tier);
      setRolling(false);
      rollingRef.current = false;
    }, REVEAL_MS);
  };

  return { hand, rolling, roll };
}
