import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { CodeStep, useResendTimer } from '@/components/CodeStep';
import { Button, Card, ErrorBox, Field, P, Page } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { profileSignal } from '@/lib/signals';
import { CODE_LENGTH, isValidEmail, normalizeEmail } from '@/lib/validation';

/** Change email: new address → 5-digit code to it → done. ✓ follows the @fainet.org domain. */
export default function ChangeEmail() {
  const router = useRouter();
  const { t } = useI18n();
  const { session, refreshProfile } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useResendTimer();
  const clean = normalizeEmail(email);

  async function send(isResend = false) {
    if (!isValidEmail(clean)) return setError(t('v_email'));
    setError(null);
    setBusy(true);
    try {
      await api.sendCode(clean, 'change');
      timer.restart();
      if (!isResend) setStep(2);
    } catch (e) {
      if (e instanceof ApiError && e.reason === 'resend-wait') {
        timer.restart(e.details.wait);
        if (!isResend) setStep(2);
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (code.length !== CODE_LENGTH) return setError(t('v_code5'));
    setBusy(true);
    setError(null);
    try {
      await api.changeEmail(clean, code);
      await refreshProfile();
      profileSignal.dirty = true;
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('change_email') }} />
      <Card>
        <ErrorBox message={error} />
        {step === 1 ? (
          <>
            <P muted>{t('current_email', { e: session?.user.email ?? '' })}</P>
            <P muted style={{ marginBottom: 12 }}>{t('email_change_sub')}</P>
            <Field label={t('new_email')} ltr value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="name@fainet.org" />
            <Button title={t('send_code')} onPress={() => send()} loading={busy} />
          </>
        ) : (
          <>
            <CodeStep email={clean} code={code} onChangeCode={setCode} onResend={() => send(true)} resending={false} secondsLeft={timer.left} />
            <Button title={t('change_email')} onPress={confirm} loading={busy} disabled={code.length !== CODE_LENGTH} />
            <Button title={t('back')} variant="link" onPress={() => setStep(1)} />
          </>
        )}
      </Card>
    </Page>
  );
}
