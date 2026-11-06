import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { colors } from '@/theme';

import { Button, Field } from './ui';
import { CODE_LENGTH, RESEND_WAIT_SECONDS } from '@/lib/validation';

/** Countdown for the "resend code" button. Call restart() after every send. */
export function useResendTimer() {
  const [left, setLeft] = useState(RESEND_WAIT_SECONDS);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, restart: (seconds = RESEND_WAIT_SECONDS) => setLeft(seconds) };
}

type Props = {
  email: string;
  code: string;
  onChangeCode: (c: string) => void;
  onResend: () => void;
  resending: boolean;
  secondsLeft: number;
};

/** The 5-digit code field + resend button. */
export function CodeStep({ email, code, onChangeCode, onResend, resending, secondsLeft }: Props) {
  return (
    <>
      <Text style={{ textAlign: 'right', color: colors.muted, marginBottom: 12, lineHeight: 22 }}>
        موږ ۵ عددي کوډ دې ایمیل ته ولېږه:{'\n'}
        <Text style={{ color: colors.text, fontWeight: '700' }}>{email}</Text>
        {'\n'}که نه وي راغلی، Spam هم وګورئ.
      </Text>
      <Field
        label="کوډ"
        ltr
        value={code}
        onChangeText={(t) => onChangeCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        placeholder="•••••"
        style={{ fontSize: 28, letterSpacing: 12, textAlign: 'center' }}
      />
      <Button
        title={secondsLeft > 0 ? `کوډ بیا ولېږئ (${secondsLeft})` : 'کوډ بیا ولېږئ'}
        variant="link"
        disabled={secondsLeft > 0}
        loading={resending}
        onPress={onResend}
      />
    </>
  );
}
