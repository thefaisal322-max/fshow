import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/theme';

/** Blue ✓ — only accounts with a verified @fainet.org email get it (set by the server). */
export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return <Ionicons name="checkmark-circle" size={size} color={colors.primary} style={{ marginHorizontal: 3 }} />;
}
