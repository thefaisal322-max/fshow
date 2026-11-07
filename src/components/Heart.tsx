import { Ionicons } from '@expo/vector-icons';
import { forwardRef, ReactNode, useImperativeHandle, useRef } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { colors } from '@/theme';

export type HeartBurstHandle = { burst: () => void };

/** Big heart that pops in the middle and fades (double-tap like). */
export const HeartBurst = forwardRef<HeartBurstHandle, { size?: number }>(function HeartBurst({ size = 100 }, ref) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useImperativeHandle(ref, () => ({
    burst: () => {
      scale.setValue(0.3);
      opacity.setValue(1);
      Animated.sequence([
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
        Animated.delay(250),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    },
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.center, { opacity, transform: [{ scale }] }]}>
      <Ionicons name="heart" size={size} color={colors.error} style={st.shadow} />
    </Animated.View>
  );
});

/**
 * Detects single vs double taps. Double tap → onDouble (instant).
 * Single tap → onSingle after a short wait (so it does not fire on the first tap of a double).
 */
export function DoubleTap({
  onDouble,
  onSingle,
  children,
  style,
}: {
  onDouble: () => void;
  onSingle?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Pressable
      style={style}
      onPress={() => {
        const now = Date.now();
        if (now - last.current < 280) {
          if (timer.current) clearTimeout(timer.current);
          last.current = 0;
          onDouble();
        } else {
          last.current = now;
          if (onSingle) timer.current = setTimeout(onSingle, 280);
        }
      }}
    >
      {children}
    </Pressable>
  );
}

const st = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 } },
});
