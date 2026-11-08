import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { tr } from '@/i18n';

/** Video inside a post: shows the first frame, plays with the built-in controls. */
export function FeedVideo({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={style} nativeControls contentFit="contain" allowsFullscreen surfaceType="textureView" />;
}

/**
 * Full-screen reel: plays only while it is the active page, loops, tap to pause.
 * Shows a spinner while loading, a retry button if it fails, and a thin progress bar.
 * Vertical videos fill the screen; wide videos are shown whole (like TikTok).
 */
export function ReelVideo({
  uri,
  active,
  paused,
  style,
  bottomBar = 0,
}: {
  uri: string;
  active: boolean;
  paused: boolean;
  style?: StyleProp<ViewStyle>;
  /** distance of the progress bar from the bottom */
  bottomBar?: number;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    (p as any).timeUpdateEventInterval = 0.25;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
  }, [active, paused, player, status]);

  useEffect(() => {
    if (!active) {
      player.currentTime = 0;
      setProgress(0);
    }
  }, [active, player]);

  // Wide or square video → show it whole instead of cutting the sides.
  useEffect(() => {
    const p: any = player;
    const apply = (track: any) => {
      const w = track?.size?.width;
      const h = track?.size?.height;
      if (w && h) setFit(w / h > 0.75 ? 'contain' : 'cover');
    };
    apply(p.videoTrack);
    const subs = [
      p.addListener?.('videoTrackChange', (e: any) => apply(e?.videoTrack)),
      p.addListener?.('sourceLoad', (e: any) => apply(e?.availableVideoTracks?.[0])),
      p.addListener?.('timeUpdate', (e: any) => {
        const d = Number(p.duration) || 0;
        if (d > 0) setProgress(Math.min(1, (Number(e?.currentTime) || 0) / d));
      }),
    ];
    return () => subs.forEach((s) => s?.remove?.());
  }, [player]);

  return (
    <View style={style}>
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit={fit} surfaceType="textureView" />
      {status === 'loading' && active ? <ActivityIndicator color="#fff" size="large" style={st.center} /> : null}
      {status === 'error' ? (
        <View style={st.center}>
          <Ionicons name="alert-circle-outline" size={42} color="#fff" />
          <Text style={st.err}>{tr('video_error')}</Text>
          <Pressable onPress={() => player.replace(uri)} style={st.retry}>
            <Text style={{ color: '#000', fontWeight: '800' }}>{tr('retry')}</Text>
          </Pressable>
        </View>
      ) : null}
      {active ? (
        <View style={[st.track, { bottom: bottomBar }]}>
          <View style={[st.fill, { width: `${Math.round(progress * 1000) / 10}%` as `${number}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 8 },
  err: { color: '#fff', fontSize: 14 },
  retry: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 7 },
  track: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { height: 2, backgroundColor: '#fff' },
});
