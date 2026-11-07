import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CodeStep, useResendTimer } from '@/components/CodeStep';
import { Button, Choice, ErrorBox, Field, FormScreen, Label, Steps, Title } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError, errorMessage, Gender } from '@/lib/api';
import {
  ageFrom,
  buildBirthday,
  CODE_LENGTH,
  isValidEmail,
  MIN_AGE,
  nameError,
  normalizeEmail,
  passwordError,
} from '@/lib/validation';

/**
 * Sign up in 3 steps:
 *   1. name, last name, gender, birthday
 *   2. email + password  → server emails a 5-digit code (Resend)
 *   3. code              → server checks it and creates the account
 * After that the Gate sends the user to "add your picture".
 */
export default function Signup() {
  const router = useRouter();
  const { t, d } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  // step 2
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  // step 3
  const [code, setCode] = useState('');
  const timer = useResendTimer();

  const birthday = buildBirthday(day, month, year);
  const cleanEmail = normalizeEmail(email);

  function nextFromInfo() {
    const err =
      nameError(firstName) ??
      nameError(lastName) ??
      (!gender ? t('v_gender') : null) ??
      (!birthday ? t('v_birthday') : null) ??
      (birthday && ageFrom(birthday) < MIN_AGE ? t('v_too_young') : null) ??
      (birthday && ageFrom(birthday) > 120 ? t('v_year') : null);
    setError(err);
    if (!err) setStep(2);
  }

  async function sendCode(isResend = false) {
    setError(null);
    setBusy(true);
    try {
      await api.sendCode(cleanEmail, 'signup');
      timer.restart();
      if (!isResend) setStep(3);
    } catch (e) {
      if (e instanceof ApiError && e.reason === 'resend-wait') {
        timer.restart(e.details.wait);
        if (!isResend) setStep(3); // a code was already sent recently — let them use it
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function nextFromEmail() {
    const err =
      (!isValidEmail(cleanEmail) ? t('v_email') : null) ??
      passwordError(password) ??
      (password !== password2 ? t('v_passwords_match') : null);
    setError(err);
    if (!err) sendCode();
  }

  async function verify() {
    if (code.length !== CODE_LENGTH) {
      setError(t('v_code5'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.signup({
        email: cleanEmail,
        code,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender: gender!,
        birthday: birthday!,
      });
      await api.login(cleanEmail, password);
      // Gate now redirects to /photo
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Steps current={step} total={4} />

      {step === 1 && (
        <>
          <Title sub={t('real_name_hint')}>{t('new_account')}</Title>
          <ErrorBox message={error} />
          <View style={{ flexDirection: d.row, gap: 10 }}>
            <Field label={t('first_name')} value={firstName} onChangeText={setFirstName} containerStyle={{ flex: 1 }} maxLength={40} />
            <Field label={t('last_name')} value={lastName} onChangeText={setLastName} containerStyle={{ flex: 1 }} maxLength={40} />
          </View>
          <Label>{t('gender')}</Label>
          <Choice
            options={[
              { value: 'male', label: t('male') },
              { value: 'female', label: t('female') },
            ]}
            value={gender}
            onChange={setGender}
          />
          <Label>{t('birthday')}</Label>
          <View style={{ flexDirection: d.row, gap: 10 }}>
            <Field label={t('day')} ltr value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} placeholder="DD" containerStyle={{ flex: 1 }} />
            <Field label={t('month')} ltr value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} placeholder="MM" containerStyle={{ flex: 1 }} />
            <Field label={t('year')} ltr value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} placeholder="YYYY" containerStyle={{ flex: 1.4 }} />
          </View>
          <Button title={t('next')} onPress={nextFromInfo} />
          <Button title={t('have_account')} variant="link" onPress={() => router.replace('/login')} />
        </>
      )}

      {step === 2 && (
        <>
          <Title sub={t('email_password_sub')}>{t('email_password_title')}</Title>
          <ErrorBox message={error} />
          <Field
            label={t('email')}
            ltr
            value={email}
            onChangeText={setEmail}
            placeholder="thefaisal322@fainet.org"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            label={t('password')}
            ltr
            value={password}
            onChangeText={setPassword}
            placeholder="fai123@afg"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <Field
            label={t('password_again')}
            ltr
            value={password2}
            onChangeText={setPassword2}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <Button title={t('send_code')} onPress={nextFromEmail} loading={busy} />
          <Button title={t('back')} variant="link" onPress={() => { setError(null); setStep(1); }} />
        </>
      )}

      {step === 3 && (
        <>
          <Title>{t('verify_title')}</Title>
          <ErrorBox message={error} />
          <CodeStep
            email={cleanEmail}
            code={code}
            onChangeCode={setCode}
            onResend={() => sendCode(true)}
            resending={busy && code.length === 0}
            secondsLeft={timer.left}
          />
          <Button title={t('verify_create')} onPress={verify} loading={busy} disabled={code.length !== CODE_LENGTH} />
          <Button title={t('change_email_btn')} variant="link" onPress={() => { setError(null); setCode(''); setStep(2); }} />
        </>
      )}
    </FormScreen>
  );
}
