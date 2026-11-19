import * as Haptics from 'expo-haptics';
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { GiftCode } from '@/lib/coins';

const FX = {
  clockWhite: require('../../assets/fx/clock_white.png'),
  clockRed: require('../../assets/fx/clock_red.png'),
  petalRed: require('../../assets/fx/petal_red.png'),
  petalYellow: require('../../assets/fx/petal_yellow.png'),
  glowOrange: require('../../assets/fx/glow_orange.png'),
  glowRed: require('../../assets/fx/glow_red.png'),
  glowPurple: require('../../assets/fx/glow_purple.png'),
  glowGold: require('../../assets/fx/glow_gold.png'),
  gradRed: require('../../assets/fx/grad_red.png'),
  night: require('../../assets/fx/night.jpg'),
  moon: require('../../assets/fx/moon.png'),
  claws: require('../../assets/fx/claws.png'),
  wings: require('../../assets/fx/wings_fire.png'),
  spark: require('../../assets/fx/spark.png'),
  logo: require('../../assets/logo-mark.png'),
};

/** how long each effect lasts (ms) */
const LENGTH: Record<GiftCode, number> = {
  bronze_watch: 3000,
  yellow_flower: 3200,
  gold_watch: 3400,
  bird: 3800,
  rose: 3600,
  smart_gift: 3400,
  tiger: 4000,
  fplus: 4000,
};

/**
 * Full-screen gift effect (like TikTok gifts):
 *  bronze watch — a glowing white clock · gold watch — a red clock in red light · rose / yellow flower — falling petals
 *  bird — a fire eagle with burning wings · tiger — night, moon, roar and claw marks · smart gift — a box that bursts
 *  F+ — the Faisal Show mark in golden rays
 */
export function GiftFx({ gift, from, onDone }: { gift: GiftCode; from?: string; onDone: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current; // 0 → 1 over the whole effect
  const done = useRef(onDone);
  done.current = onDone;
  const total = LENGTH[gift] ?? 3200;

  useEffect(() => {
    Haptics.impactAsync(gift === 'tiger' || gift === 'bird' || gift === 'fplus' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.timing(t, { toValue: 1, duration: total, easing: Easing.linear, useNativeDriver: true }).start(() => done.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // whole effect: fade in, stay, fade out
  const fade = t.interpolate({ inputRange: [0, 0.08, 0.86, 1], outputRange: [0, 1, 1, 0] });

  let body: ReactNode = null;
  if (gift === 'bronze_watch' || gift === 'gold_watch') body = <Clock t={t} W={W} H={H} red={gift === 'gold_watch'} />;
  else if (gift === 'rose' || gift === 'yellow_flower') body = <Petals t={t} W={W} H={H} yellow={gift === 'yellow_flower'} />;
  else if (gift === 'bird') body = <FireBird t={t} W={W} H={H} />;
  else if (gift === 'tiger') body = <Tiger t={t} W={W} H={H} />;
  else if (gift === 'smart_gift') body = <GiftBox t={t} W={W} H={H} />;
  else body = <FPlus t={t} W={W} H={H} />;

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 60 }]}>
      {body}
      {from ? (
        <View style={st.label}>
          <Text style={st.labelText} numberOfLines={1}>
            {from}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

type P = { t: Animated.Value; W: number; H: number };

function Clock({ t, W, H, red }: P & { red: boolean }) {
  const size = Math.min(W, H) * 0.86;
  const scale = t.interpolate({ inputRange: [0, 0.15, 0.25, 1], outputRange: [0.3, 1.08, 1, 1.04] });
  const spin = t.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '20deg'] });
  const minute = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1080deg'] });
  const hour = t.interpolate({ inputRange: [0, 1], outputRange: ['120deg', '210deg'] });
  const pulse = t.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0.3, 1, 0.6, 1, 0.6, 0.9] });
  const color = red ? '#FF3B3B' : '#FFFFFF';
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center' }]}>
      {red ? <Image source={FX.gradRed} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: W, height: H * 0.55 }} resizeMode="stretch" /> : null}
      <Animated.Image
        source={red ? FX.glowRed : FX.spark}
        style={{ position: 'absolute', width: size * 1.5, height: size * 1.5, opacity: Animated.multiply(pulse, red ? 0.9 : 0.35) }}
      />
      <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', transform: [{ scale }] }}>
        <Animated.Image source={red ? FX.clockRed : FX.clockWhite} style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: spin }] }} />
        {/* hands */}
        <Animated.View style={[st.handBox, { width: size, height: size, transform: [{ rotate: hour }] }]}>
          <View style={[st.hand, { height: size * 0.17, width: 7, backgroundColor: color, marginBottom: size * 0.17, shadowColor: color }]} />
        </Animated.View>
        <Animated.View style={[st.handBox, { width: size, height: size, transform: [{ rotate: minute }] }]}>
          <View style={[st.hand, { height: size * 0.24, width: 4, backgroundColor: color, marginBottom: size * 0.24, shadowColor: color }]} />
        </Animated.View>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color }} />
      </Animated.View>
    </View>
  );
}

function Petals({ t, W, H, yellow }: P & { yellow: boolean }) {
  const petals = useMemo(
    () =>
      [...Array(42)].map(() => ({
        x: Math.random() * W,
        size: 16 + Math.random() * 30,
        start: Math.random() * 0.55,
        len: 0.35 + Math.random() * 0.35,
        sway: 20 + Math.random() * 50,
        spin: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 540),
      })),
    [W],
  );
  const big = t.interpolate({ inputRange: [0, 0.12, 0.2, 0.75, 0.9], outputRange: [0.2, 1.25, 1, 1, 0.6] });
  const bigOp = t.interpolate({ inputRange: [0, 0.1, 0.75, 0.9], outputRange: [0, 1, 1, 0] });
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.82)' }]}>
      {petals.map((p, i) => {
        const a = p.start;
        const b = Math.min(1, p.start + p.len);
        const y = t.interpolate({ inputRange: [0, a, b, 1], outputRange: [-60, -60, H + 60, H + 60] });
        const x = t.interpolate({ inputRange: [0, a, (a + b) / 2, b, 1], outputRange: [p.x, p.x, p.x + p.sway, p.x - p.sway / 2, p.x - p.sway / 2] });
        const r = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] });
        return (
          <Animated.Image
            key={i}
            source={yellow ? FX.petalYellow : FX.petalRed}
            style={{ position: 'absolute', width: p.size, height: p.size, transform: [{ translateX: x }, { translateY: y }, { rotate: r }] }}
          />
        );
      })}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.Image source={yellow ? FX.glowGold : FX.glowRed} style={{ position: 'absolute', width: W * 1.1, height: W * 1.1, opacity: Animated.multiply(bigOp, 0.55) }} />
        <Animated.Text style={{ fontSize: 120, opacity: bigOp, transform: [{ scale: big }] }}>{yellow ? '🌼' : '🌹'}</Animated.Text>
      </View>
    </View>
  );
}

function FireBird({ t, W, H }: P) {
  const sparks = useMemo(
    () => [...Array(36)].map(() => ({ x: Math.random() * W, start: Math.random() * 0.7, size: 3 + Math.random() * 7, drift: (Math.random() - 0.5) * 80 })),
    [W],
  );
  // wings beat 4 times
  const flap = t.interpolate({
    inputRange: [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 1],
    outputRange: [0.2, 1, 0.78, 1.05, 0.8, 1.05, 0.8, 1.05, 1],
  });
  const rise = t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [H * 0.3, 0, -H * 0.06] });
  const glowS = t.interpolate({ inputRange: [0, 0.2, 0.5, 0.8, 1], outputRange: [0.4, 1.1, 0.95, 1.15, 1] });
  const wingW = W * 1.25;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,2,0,0.88)', alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.Image source={FX.glowOrange} style={{ position: 'absolute', width: W * 1.8, height: W * 1.8, transform: [{ scale: glowS }] }} />
      {sparks.map((s, i) => {
        const y = t.interpolate({ inputRange: [0, s.start, Math.min(1, s.start + 0.3), 1], outputRange: [H, H, H * 0.1, H * 0.1] });
        const op = t.interpolate({ inputRange: [0, s.start, s.start + 0.05, Math.min(1, s.start + 0.3)], outputRange: [0, 0, 1, 0], extrapolate: 'clamp' });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: s.x,
              top: 0,
              width: s.size,
              height: s.size,
              borderRadius: s.size,
              backgroundColor: i % 3 ? '#FFB020' : '#FFF3B0',
              opacity: op,
              transform: [{ translateY: y }, { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, s.drift] }) }],
            }}
          />
        );
      })}
      <Animated.View style={{ alignItems: 'center', justifyContent: 'center', transform: [{ translateY: rise }] }}>
        <Animated.Image
          source={FX.wings}
          resizeMode="contain"
          style={{ width: wingW, height: wingW * 0.76, transform: [{ scaleY: flap }, { scaleX: Animated.add(0.15, Animated.multiply(flap, 0.85)) }] }}
        />
        <Text style={{ position: 'absolute', fontSize: 110, textShadowColor: '#FF7A00', textShadowRadius: 30 }}>🦅</Text>
      </Animated.View>
    </View>
  );
}

function Tiger({ t, W, H }: P) {
  const bg = t.interpolate({ inputRange: [0, 0.1, 1], outputRange: [1.15, 1, 1.05] });
  const tiger = t.interpolate({ inputRange: [0, 0.18, 0.28, 0.34, 0.4, 1], outputRange: [0.2, 1.15, 1, 1.25, 1.1, 1.15] });
  // the roar shakes the screen
  const shake = t.interpolate({ inputRange: [0, 0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.42, 1], outputRange: [0, 0, -10, 10, -8, 8, -4, 0, 0] });
  const claw = t.interpolate({ inputRange: [0, 0.42, 0.46, 0.7, 0.8], outputRange: [0, 0, 1, 1, 0], extrapolate: 'clamp' });
  const clawY = t.interpolate({ inputRange: [0, 0.42, 0.48, 1], outputRange: [-H * 0.25, -H * 0.25, 0, 0] });
  const moonGlow = t.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0.6, 1, 0.8, 1] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: shake }] }]}>
      <Animated.Image source={FX.night} style={{ position: 'absolute', width: W, height: H, transform: [{ scale: bg }] }} resizeMode="cover" />
      <Animated.Image source={FX.moon} style={{ position: 'absolute', top: H * 0.06, left: W * 0.5 - W * 0.32, width: W * 0.64, height: W * 0.64, opacity: moonGlow }} />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.Text style={{ fontSize: Math.min(W * 0.6, 260), marginTop: H * 0.12, textShadowColor: '#9fd3ff', textShadowRadius: 40, transform: [{ scale: tiger }] }}>🐯</Animated.Text>
      </View>
      <Animated.Image
        source={FX.claws}
        style={{ position: 'absolute', left: W * 0.1, top: H * 0.25, width: W * 0.8, height: W * 0.8, opacity: claw, transform: [{ translateY: clawY }] }}
      />
    </Animated.View>
  );
}

function GiftBox({ t, W, H }: P) {
  const bits = useMemo(
    () =>
      [...Array(46)].map((_, i) => ({
        a: Math.random() * Math.PI * 2,
        r: 120 + Math.random() * Math.max(W, H) * 0.45,
        size: 7 + Math.random() * 9,
        color: ['#FE2C55', '#FFD54F', '#2D9CDB', '#31A24C', '#9B51E0', '#FFFFFF'][i % 6],
        spin: Math.random() * 720,
      })),
    [W, H],
  );
  const box = t.interpolate({ inputRange: [0, 0.12, 0.18, 0.24, 0.3, 0.36, 0.4, 0.45, 1], outputRange: [0.2, 1.1, 0.95, 1.12, 0.95, 1.15, 1.35, 0, 0] });
  const boom = t.interpolate({ inputRange: [0, 0.4, 0.9, 1], outputRange: [0, 0, 1, 1] });
  const ring = t.interpolate({ inputRange: [0, 0.4, 0.7], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,0,24,0.85)', alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.Image source={FX.glowPurple} style={{ position: 'absolute', width: W * 1.6, height: W * 1.6, opacity: 0.8 }} />
      <Animated.View
        style={{
          position: 'absolute',
          width: 160,
          height: 160,
          borderRadius: 80,
          borderWidth: 6,
          borderColor: '#FFD54F',
          opacity: ring.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 1, 0] }),
          transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.3, 4] }) }],
        }}
      />
      {bits.map((b, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: b.size,
            height: b.size * 1.6,
            borderRadius: 2,
            backgroundColor: b.color,
            opacity: boom.interpolate({ inputRange: [0, 0.01, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: boom.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(b.a) * b.r] }) },
              { translateY: boom.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, Math.sin(b.a) * b.r * 0.8, Math.sin(b.a) * b.r * 0.8 + 140] }) },
              { rotate: boom.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.spin}deg`] }) },
            ],
          }}
        />
      ))}
      <Animated.Text style={{ fontSize: 130, transform: [{ scale: box }] }}>🎁</Animated.Text>
      <Animated.Text style={{ position: 'absolute', fontSize: 70, opacity: boom.interpolate({ inputRange: [0, 0.05, 0.8, 1], outputRange: [0, 1, 1, 0] }), transform: [{ scale: boom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.4, 1.2] }) }] }}>
        ✨💎✨
      </Animated.Text>
    </View>
  );
}

function FPlus({ t, W }: P) {
  const rays = [...Array(12)];
  const spin = t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '120deg'] });
  const pop = t.interpolate({ inputRange: [0, 0.15, 0.25, 1], outputRange: [0.2, 1.25, 1, 1.08] });
  const size = W * 0.42;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,8,0,0.88)', alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.Image source={FX.glowGold} style={{ position: 'absolute', width: W * 1.7, height: W * 1.7, transform: [{ scale: pop }] }} />
      <Animated.View style={{ position: 'absolute', width: W * 1.4, height: W * 1.4, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: spin }] }}>
        {rays.map((_, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: 10,
              height: W * 0.7,
              backgroundColor: 'rgba(255,215,0,0.28)',
              borderRadius: 5,
              transform: [{ rotate: `${(i * 360) / rays.length}deg` }],
            }}
          />
        ))}
      </Animated.View>
      <Animated.View style={{ transform: [{ scale: pop }], alignItems: 'center' }}>
        <Image source={FX.logo} style={{ width: size, height: size, borderRadius: size / 4 }} />
        <View style={[st.plus, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, right: -size * 0.12, top: -size * 0.12 }]}>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.3 }}>+</Text>
        </View>
        <Text style={st.fplus}>F+ · 7 days ✔</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  handBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  hand: { borderRadius: 4, shadowOpacity: 1, shadowRadius: 8, elevation: 6 },
  label: { position: 'absolute', alignSelf: 'center', bottom: '16%', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, maxWidth: '86%' },
  labelText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  plus: { position: 'absolute', backgroundColor: '#FE2C55', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  fplus: { color: '#FFD54F', fontWeight: '900', fontSize: 22, marginTop: 14, textShadowColor: '#000', textShadowRadius: 6 },
});
