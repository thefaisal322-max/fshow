import { useRouter } from 'expo-router';
import { useState } from 'react';

import { CodeStep, useResendTimer } from '@/components/CodeStep';
import { Button, ErrorBox, Field, FormScreen, Title } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { CODE_LENGTH, isValidEmail, normalizeEmail, passwordError } from '@/lib/validation';

/** Forgot password: email → 5-digit code + new password → logged in. */
export default function Forgot() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useResendTimer();
  const cleanEmail = normalizeEmail(email);

  async function sendCode(isResend = false) {
    if (!isValidEmail(cleanEmail)) {
      setError('ایمیل سم ولیکئ');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.sendCode(cleanEmail, 'reset');
      timer.restart();
      if (!isResend) setStep(2);
    } catch (e) {
      if (e instanceof ApiError && e.reason === 'resend-wait') {
        timer.restart(e.details.wait);
        if (!isResend) setStep(2);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const err =
      (code.length !== CODE_LENGTH ? '۵ عددي کوډ ولیکئ' : null) ??
      passwordError(password) ??
      (password !== password2 ? 'دواړه پاسورډونه یو شان نه دي' : null);
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      await signIn(await api.resetPassword(cleanEmail, code, password));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      {step === 1 ? (
        <>
          <Title sub="خپل ایمیل ولیکئ، موږ به تاسو ته کوډ درولېږو">پاسورډ مو هېر دی؟</Title>
          <ErrorBox message={error} />
          <Field
            label="ایمیل"
            ltr
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Button title="کوډ ولېږئ" onPress={() => sendCode()} loading={busy} />
          <Button title="شاته" variant="link" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Title>نوی پاسورډ</Title>
          <ErrorBox message={error} />
          <CodeStep
            email={cleanEmail}
            code={code}
            onChangeCode={setCode}
            onResend={() => sendCode(true)}
            resending={false}
            secondsLeft={timer.left}
          />
          <Field label="نوی پاسورډ" ltr value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
          <Field label="نوی پاسورډ بیا ولیکئ" ltr value={password2} onChangeText={setPassword2} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
          <Button title="پاسورډ بدل کړئ" onPress={reset} loading={busy} />
        </>
      )}
    </FormScreen>
  );
}
