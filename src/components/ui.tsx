import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';

/** Full-screen form layout: safe area + keyboard handling + scroll. */
export function FormScreen({ children, brand = true }: { children: ReactNode; brand?: boolean }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {brand ? <Text style={s.brand}>Faisal Show</Text> : null}
          <View style={s.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Scrollable page used by settings screens (has a header from the Stack). */
export function Page({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, { padding: 16, marginBottom: 12 }, style]}>{children}</View>;
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  const { d } = useI18n();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[s.title, { textAlign: d.align }]}>{children}</Text>
      {sub ? <Text style={[s.sub, { textAlign: d.align }]}>{sub}</Text> : null}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const { d } = useI18n();
  return <Text style={[s.label, { textAlign: d.align }]}>{children}</Text>;
}

/** Plain paragraph that follows the reading direction. */
export function P({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const { d } = useI18n();
  return <Text style={[s.p, muted && { color: colors.muted }, { textAlign: d.align, writingDirection: d.writing }, style]}>{children}</Text>;
}

type FieldProps = TextInputProps & { label: string; ltr?: boolean; containerStyle?: ViewStyle };

export function Field({ label, ltr, containerStyle, style, ...props }: FieldProps) {
  const { d } = useI18n();
  return (
    <View style={[{ marginBottom: 12 }, containerStyle]}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[s.input, ltr ? s.ltr : { textAlign: d.align, writingDirection: d.writing }, style]}
        {...props}
      />
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'link' | 'danger';
};

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const off = disabled || loading;
  const base =
    variant === 'primary' ? s.btnPrimary : variant === 'secondary' ? s.btnSecondary : variant === 'danger' ? s.btnDanger : s.btnLink;
  const textStyle = variant === 'primary' || variant === 'danger' ? s.btnPrimaryText : s.btnSecondaryText;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [s.btn, base, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.primary} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  const { d } = useI18n();
  if (!message) return null;
  return (
    <View style={s.errorBox}>
      <Text style={[s.errorText, { textAlign: d.align }]}>{message}</Text>
    </View>
  );
}

export function OkBox({ message }: { message: string | null }) {
  const { d } = useI18n();
  if (!message) return null;
  return (
    <View style={[s.errorBox, { backgroundColor: '#E6F4EA' }]}>
      <Text style={[s.errorText, { color: colors.success, textAlign: d.align }]}>{message}</Text>
    </View>
  );
}

export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const { d } = useI18n();
  return (
    <View style={[s.choiceRow, { flexDirection: d.row }]}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.choice, value === o.value && s.choiceOn]}>
          <Text style={[s.choiceText, value === o.value && { color: '#fff' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Steps({ current, total }: { current: number; total: number }) {
  const { d } = useI18n();
  return (
    <View style={[s.steps, { flexDirection: d.row }]}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.step, i < current && { backgroundColor: colors.primary }]} />
      ))}
    </View>
  );
}

/** A tappable settings row: icon, label, optional value, chevron. */
export function Row({
  icon,
  label,
  value,
  onPress,
  color = colors.text,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  color?: string;
  last?: boolean;
}) {
  const { d } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, { flexDirection: d.row }, !last && s.rowBorder, pressed && { backgroundColor: colors.bg }]}
    >
      <View style={[s.rowIcon, { backgroundColor: color === colors.text ? '#E7F0FD' : '#FDECEE' }]}>
        <Ionicons name={icon} size={18} color={color === colors.text ? colors.primary : color} />
      </View>
      <Text style={[s.rowLabel, { color, textAlign: d.align }]}>{label}</Text>
      {value ? <Text style={s.rowValue}>{value}</Text> : null}
      {onPress ? <Ionicons name={d.rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} /> : null}
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={[StyleSheet.absoluteFill, s.loading]}>
      <Text style={s.brand}>Faisal Show</Text>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  brand: { fontSize: 30, fontWeight: '800', color: colors.primary, textAlign: 'center', marginBottom: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.muted, marginTop: 6, lineHeight: 22 },
  p: { fontSize: 15, color: colors.text, lineHeight: 25 },
  label: { fontSize: 14, color: colors.text, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FAFBFC',
  },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  btn: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: '#E7F0FD' },
  btnDanger: { backgroundColor: colors.error },
  btnLink: { backgroundColor: 'transparent', paddingVertical: 10 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  errorBox: { backgroundColor: colors.errorBg, borderRadius: radius.sm, padding: 12, marginBottom: 12 },
  errorText: { color: colors.error, fontSize: 14, lineHeight: 22 },
  choiceRow: { gap: 10, marginBottom: 12 },
  choice: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  choiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  steps: { gap: 6, marginBottom: 18 },
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  row: { alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '500' },
  rowValue: { fontSize: 14, color: colors.muted },
  loading: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
