import { useRouter } from 'expo-router';
import { useState } from 'react';

import { CodeStep, useResendTimer } from '@/components/CodeStep';
import { Button, ErrorBox, Field, FormScreen, Title } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { CODE_LENGTH, isValidEmail, normalizeEmail, passwordError } from '@/lib/validation';
import { useI18n } from '@/i18n';

/** Forgot password: email → 5-digit code + new password → logged in. */
export default function Forgot() {
  const { t } = useI18n();
  const router = useRouter();
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
      setError(t('v_email'));
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
      (code.length !== CODE_LENGTH ? t('v_code5') : null) ??
      passwordError(password) ??
      (password !== password2 ? t('v_passwords_match') : null);
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      await api.resetPassword(cleanEmail, code, password);
      await api.login(cleanEmail, password);
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
          <Title sub={t('forgot_sub')}>{t('forgot_title')}</Title>
          <ErrorBox message={error} />
          <Field
            label={t('email')}
            ltr
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Button title={t('send_code')} onPress={() => sendCode()} loading={busy} />
          <Button title={t('back')} variant="link" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Title>{t('new_password')}</Title>
          <ErrorBox message={error} />
          <CodeStep
            email={cleanEmail}
            code={code}
            onChangeCode={setCode}
            onResend={() => sendCode(true)}
            resending={false}
            secondsLeft={timer.left}
          />
          <Field label={t('new_password')} ltr value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
          <Field label={t('new_password_again')} ltr value={password2} onChangeText={setPassword2} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
          <Button title={t('change_password_btn')} onPress={reset} loading={busy} />
        </>
      )}
    </FormScreen>
  );
}
