import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, Pressable, StyleSheet, TextStyle, View, useWindowDimensions } from 'react-native';

import { RollButton } from './src/components/RollButton';
import { useDiceRoll } from './src/hooks/useDiceRoll';
import { HAND_TIERS, HandKind, HandTier, zoneAt } from './src/lib/dice';
import { DiceScene, DiceSceneHandle } from './src/scene/DiceScene';

const HAND_COLORS: Record<HandKind, string> = {
  pinzoro: '#FFD54A',
  arashi: '#FFD54A',
  shigoro: '#FFD54A',
  hifumi: '#FF6B6B',
  me: '#FFFFFF',
  menashi: '#A7B5AC',
};

/**
 * 役名の書体（使う文字だけに絞ったサブセット。assets/fonts/）
 *   太い筆文字風 Zen Antique … 最上級 / 極太ゴシック Dela Gothic One … 小当たり・ヒフミ
 */
const FONT_BRUSH = 'ZenAntique-Hand';
const FONT_GOTHIC = 'DelaGothicOne-Hand';

/** 役の格ごとの見せ方：書体・大きさ・光り方・登場時の拡大率 */
const TIER_LOOK: Record<HandTier, { font?: string; style: TextStyle; fromScale: number }> = {
  jackpot: {
    font: FONT_BRUSH,
    fromScale: 2.6,
    style: { fontSize: 80, letterSpacing: 6, textShadowColor: 'rgba(255,160,0,0.95)', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
  },
  win: {
    font: FONT_GOTHIC,
    fromScale: 1.8,
    style: { fontSize: 54, letterSpacing: 4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 3 } },
  },
  lose: {
    font: FONT_GOTHIC,
    fromScale: 1.8,
    style: { fontSize: 54, letterSpacing: 4, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 3 } },
  },
  none: {
    fromScale: 1,
    style: { fontSize: 40, fontWeight: '700', letterSpacing: 2 },
  },
};

export default function App() {
  const { width, height } = useWindowDimensions();
  const scene = useRef<DiceSceneHandle>(null);
  const { hand, rolling, roll } = useDiceRoll(scene);
  const [labelAnim] = useState(() => new Animated.Value(0));
  const [fontsLoaded] = useFonts({
    [FONT_BRUSH]: require('./assets/fonts/ZenAntique-Hand.ttf'),
    [FONT_GOTHIC]: require('./assets/fonts/DelaGothicOne-Hand.ttf'),
  });
  const look = hand ? TIER_LOOK[HAND_TIERS[hand.kind]] : null;

  useEffect(() => {
    if (!hand) {
      labelAnim.setValue(0);
      return;
    }
    // 最上級は大きく弾ませる
    const jackpot = HAND_TIERS[hand.kind] === 'jackpot';
    Animated.spring(labelAnim, { toValue: 1, friction: jackpot ? 4 : 5, tension: jackpot ? 120 : 140, useNativeDriver: true }).start();
  }, [hand, labelAnim]);

  // 四隅以外はどこを押しても中央扱い（ボタンは目印）
  const handlePress = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    roll(zoneAt(pageX, pageY, width, height));
  };

  const buttonSize = Math.min(width * 0.36, 150);

  return (
    <Pressable style={styles.container} onPress={handlePress}>
      <StatusBar style="light" />
      <View style={styles.sceneArea}>
        <DiceScene ref={scene} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.middle}>
        <RollButton size={buttonSize} disabled={rolling} onPress={() => roll('center')} />
      </View>

      <View style={styles.bottom}>
        {hand && look && (
          <Animated.Text
            style={[
              styles.label,
              look.style,
              // 書体の読み込み前は標準の書体で表示する
              look.font && fontsLoaded && { fontFamily: look.font, fontWeight: 'normal' },
              {
                color: HAND_COLORS[hand.kind],
                opacity: labelAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                transform: [{ scale: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [look.fromScale, 1] }) }],
              },
            ]}
          >
            {hand.label}
          </Animated.Text>
        )}
      </View>
    </Pressable>
  );
}

// 上：お椀 / 中央：振るボタン / 下：役名
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14532D',
  },
  sceneArea: {
    flex: 47,
    // ステータスバー（時計・電池表示）とお椀が重ならないように
    marginTop: 48,
    pointerEvents: 'none',
  },
  middle: {
    flex: 23,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  bottom: {
    flex: 30,
    alignItems: 'center',
    paddingTop: 8,
    pointerEvents: 'none',
  },
  label: {
    fontWeight: '900',
  },
});
