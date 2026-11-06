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

import { colors, radius } from '@/theme';

/** Full-screen form layout: safe area + keyboard handling + scroll. */
export function FormScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.brand}>Faisal Show</Text>
          <View style={s.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.title}>{children}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

type FieldProps =TextInputProps & { label: string; ltr?: boolean; containerStyle?: ViewStyle };

export function Field({ label, ltr, containerStyle, style, ...props }: FieldProps) {
  return (
    <View style={[{ marginBottom: 12 }, containerStyle]}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[s.input, ltr ? s.ltr : s.rtl, style]}
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
  variant?: 'primary' | 'secondary' | 'link';
};

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const off = disabled || loading;
  const base = variant === 'primary' ? s.btnPrimary : variant === 'secondary' ? s.btnSecondary : s.btnLink;
  const textStyle = variant === 'primary' ? s.btnPrimaryText : s.btnSecondaryText;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [s.btn, base, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} />
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </Pressable>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={s.errorBox}>
      <Text style={s.errorText}>{message}</Text>
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
  return (
    <View style={s.choiceRow}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[s.choice, value === o.value && s.choiceOn]}
        >
          <Text style={[s.choiceText, value === o.value && { color: '#fff' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Steps({ current, total }: { current: number; total: number }) {
  return (
    <View style={s.steps}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.step, i < current && { backgroundColor: colors.primary }]} />
      ))}
    </View>
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
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'right' },
  sub: { fontSize: 14, color: colors.muted, textAlign: 'right', marginTop: 6, lineHeight: 22 },
  label: { fontSize: 14, color: colors.text, fontWeight: '600', marginBottom: 6, textAlign: 'right' },
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
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  ltr: { textAlign: 'left', writingDirection: 'ltr' },
  btn: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: '#E7F0FD' },
  btnLink: { backgroundColor: 'transparent', paddingVertical: 10 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  errorBox: { backgroundColor: colors.errorBg, borderRadius: radius.sm, padding: 12, marginBottom: 12 },
  errorText: { color: colors.error, textAlign: 'right', fontSize: 14, lineHeight: 22 },
  choiceRow: { flexDirection: 'row-reverse', gap: 10, marginBottom: 12 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  choiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  steps: { flexDirection: 'row-reverse', gap: 6, marginBottom: 18 },
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  loading: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
