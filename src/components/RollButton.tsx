import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  size: number;
  disabled: boolean;
  onPress: () => void;
};

/** 中央の「振る」ボタン。押す場所の目印。 */
export function RollButton({ size, disabled, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="サイコロを振る"
      style={({ pressed }) => [
        styles.outer,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.inner, { borderRadius: size / 2 }]}>
        <Text style={[styles.label, { fontSize: size * 0.3 }]}>振る</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    padding: 6,
    backgroundColor: '#7A1E12',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C8102E',
    borderWidth: 2,
    borderColor: '#F2C46D',
  },
  label: {
    color: '#FFF8E7',
    fontWeight: '900',
    letterSpacing: 4,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.45,
  },
});
