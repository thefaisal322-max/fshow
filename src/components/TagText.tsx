import { useRouter } from 'expo-router';
import { Alert, StyleProp, Text, TextStyle } from 'react-native';

import { tr } from '@/i18n';
import { splitTags, userIdByUsername } from '@/lib/social';
import { colors } from '@/theme';

/** Text where #hashtags open the tag page and @mentions open that person's profile. */
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

  async function openMention(username: string) {
    try {
      const id = await userIdByUsername(username);
      if (id) router.push({ pathname: '/user/[id]', params: { id } });
      else Alert.alert('', tr('nobody_found'));
    } catch {
      Alert.alert('', tr('e_network'));
    }
  }

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
        ) : part.mention ? (
          <Text key={i} style={{ color: tagColor, fontWeight: '700' }} onPress={() => openMention(part.mention!)}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}
