import * as Haptics from 'expo-haptics';
import { ReactNode, useRef } from 'react';
import { Animated, Easing, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

/**
 * Tap → onPress. Keep holding for `holdMs` (5 s) → onHold.
 * While holding, a light fill grows across the button so you can see it working.
 */
export function HoldButton({
  onPress,
  onHold,
  holdMs = 5000,
  disabled,
  style,
  fill = 'rgba(255,255,255,0.35)',
  children,
}: {
  onPress: () => void;
  onHold?: () => void;
  holdMs?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fill?: string;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const ticks = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = () => {
    anim.current?.stop();
    ticks.current.forEach(clearTimeout);
    ticks.current = [];
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      delayLongPress={onHold ? holdMs : undefined}
      onLongPress={
        onHold
          ? () => {
              stop();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onHold();
            }
          : undefined
      }
      onPressIn={() => {
        if (!onHold) return;
        // small ticks each second so the person feels it counting
        ticks.current = [1, 2, 3, 4].map((s) =>
          setTimeout(() => Haptics.selectionAsync().catch(() => {}), (holdMs / 5) * s),
        );
        anim.current = Animated.timing(progress, { toValue: 1, duration: holdMs, easing: Easing.linear, useNativeDriver: false });
        anim.current.start();
      }}
      onPressOut={stop}
      style={[style, { overflow: 'hidden' }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: fill, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
      {children}
    </Pressable>
  );
}
