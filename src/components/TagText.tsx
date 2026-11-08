import { useRouter } from 'expo-router';
import { StyleProp, Text, TextStyle } from 'react-native';

import { splitTags } from '@/lib/social';
import { colors } from '@/theme';

/** Text where #hashtags are tappable and open the tag page. */
export function TagText({
  text,
  style,
  tagColor = colors.primary,
  numberOfLines,
  onPress,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  tagColor?: string;
  numberOfLines?: number;
  onPress?: () => void;
}) {
  const router = useRouter();
  return (
    <Text style={style} numberOfLines={numberOfLines} onPress={onPress}>
      {splitTags(text).map((part, i) =>
        part.tag ? (
          <Text
            key={i}
            style={{ color: tagColor, fontWeight: '700' }}
            onPress={() => router.push({ pathname: '/tag/[tag]', params: { tag: part.tag! } })}
          >
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}
