import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { RollButton } from './src/components/RollButton';
import { useDiceRoll } from './src/hooks/useDiceRoll';
import { HandKind, zoneAt } from './src/lib/dice';
import { DiceScene, DiceSceneHandle } from './src/three/DiceScene';

const HAND_COLORS: Record<HandKind, string> = {
  pinzoro: '#FFD54A',
  arashi: '#FFD54A',
  shigoro: '#FFD54A',
  hifumi: '#FF6B6B',
  me: '#FFFFFF',
  menashi: '#A7B5AC',
};

export default function App() {
  const { width, height } = useWindowDimensions();
  const scene = useRef<DiceSceneHandle>(null);
  const { hand, rolling, roll } = useDiceRoll(scene);
  const [labelAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!hand) {
      labelAnim.setValue(0);
      return;
    }
    Animated.spring(labelAnim, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
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

      <View style={styles.bottom}>
        <View style={styles.labelArea}>
          {hand && (
            <Animated.Text
              style={[
                styles.label,
                {
                  color: HAND_COLORS[hand.kind],
                  opacity: labelAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                  transform: [{ scale: labelAnim.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }],
                },
              ]}
            >
              {hand.label}
            </Animated.Text>
          )}
        </View>
        <RollButton size={buttonSize} disabled={rolling} onPress={() => roll('center')} />
      </View>
    </Pressable>
  );
}

// ボタンは四隅の判定領域（下 20%）にかからない位置に置く
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14532D',
  },
  sceneArea: {
    flex: 58,
    pointerEvents: 'none',
  },
  bottom: {
    flex: 42,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  labelArea: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  label: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 3 },
  },
});
