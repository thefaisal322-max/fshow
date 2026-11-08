import { Ionicons } from '@expo/vector-icons';
import { forwardRef, ReactNode, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, GestureResponderEvent, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors } from '@/theme';

export type HeartBurstHandle = { burst: (x?: number, y?: number) => void };

type One = { id: number; x: number; y: number; rot: number };

/**
 * Hearts that pop exactly where you tapped (like TikTok) and fly up while fading.
 * Without a position the heart pops in the middle. Several taps = several hearts.
 */
export const HeartBurst = forwardRef<HeartBurstHandle, { size?: number }>(function HeartBurst({ size = 100 }, ref) {
  const [hearts, setHearts] = useState<One[]>([]);
  const box = useRef({ w: 0, h: 0 });
  const seq = useRef(0);

  useImperativeHandle(ref, () => ({
    burst: (x?: number, y?: number) => {
      const id = ++seq.current;
      const cx = x ?? box.current.w / 2;
      const cy = y ?? box.current.h / 2;
      setHearts((h) => [...h.slice(-6), { id, x: cx, y: cy, rot: Math.round(Math.random() * 40 - 20) }]);
    },
  }));

  const done = useCallback((id: number) => setHearts((h) => h.filter((x) => x.id !== id)), []);

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => (box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {hearts.map((h) => (
        <FlyingHeart key={h.id} heart={h} size={size} onDone={done} />
      ))}
    </View>
  );
});

function FlyingHeart({ heart, size, onDone }: { heart: One; size: number; onDone: (id: number) => void }) {
  const scale = useRef(new Animated.Value(0.2)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(lift, { toValue: -size * 0.9, duration: 450, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.4, duration: 450, useNativeDriver: true }),
      ]),
    ]).start(() => onDone(heart.id));
  }, [heart.id, lift, onDone, opacity, scale, size]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: heart.x - size / 2,
        top: heart.y - size / 2,
        opacity,
        transform: [{ translateY: lift }, { scale }, { rotate: `${heart.rot}deg` }],
      }}
    >
      <Ionicons name="heart" size={size} color={colors.error} style={st.shadow} />
    </Animated.View>
  );
}

/**
 * Detects single vs double taps. Double tap → onDouble(x, y) at once (more quick taps = more hearts).
 * Single tap → onSingle after a short wait (so it does not fire on the first tap of a double).
 */
export function DoubleTap({
  onDouble,
  onSingle,
  onLong,
  children,
  style,
}: {
  onDouble: (x: number, y: number) => void;
  onSingle?: () => void;
  onLong?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <Pressable
      style={style}
      onLongPress={onLong}
      delayLongPress={450}
      onPress={(e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        const now = Date.now();
        if (now - last.current < 300) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = null;
          last.current = now; // keep tapping for more hearts
          onDouble(locationX, locationY);
        } else {
          last.current = now;
          if (onSingle) timer.current = setTimeout(onSingle, 300);
        }
      }}
    >
      {children}
    </Pressable>
  );
}

const st = StyleSheet.create({
  shadow: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 } },
});
