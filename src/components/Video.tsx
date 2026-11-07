import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

/** Video inside a post: shows the first frame, plays with the built-in controls. */
export function FeedVideo({ uri, style }: { uri: string; style?: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return <VideoView player={player} style={style} nativeControls contentFit="contain" allowsFullscreen />;
}

/** Full-screen reel: plays only while it is the active page, loops, tap to pause. */
export function ReelVideo({ uri, active, paused, style }: { uri: string; active: boolean; paused: boolean; style?: StyleProp<ViewStyle> }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (active && !paused) player.play();
    else player.pause();
  }, [active, paused, player, status]);

  useEffect(() => {
    if (!active) player.currentTime = 0;
  }, [active, player]);

  return <VideoView player={player} style={style} nativeControls={false} contentFit="cover" />;
}
