import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CodeStep, useResendTimer } from '@/components/CodeStep';
import { Button, Choice, ErrorBox, Field, FormScreen, Label, Steps, Title } from '@/components/ui';
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
      (!gender ? 'جنسیت وټاکئ' : null) ??
      (!birthday ? 'د زېږېدو نېټه سمه ولیکئ (ورځ / میاشت / کال)' : null) ??
      (birthday && ageFrom(birthday) < MIN_AGE ? 'د حساب جوړولو لپاره باید لږ تر لږه ۱۳ کلن یاست' : null) ??
      (birthday && ageFrom(birthday) > 120 ? 'د زېږېدو کال سم نه دی' : null);
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
      (!isValidEmail(cleanEmail) ? 'ایمیل سم ولیکئ، لکه name@fainet.org' : null) ??
      passwordError(password) ??
      (password !== password2 ? 'دواړه پاسورډونه یو شان نه دي' : null);
    setError(err);
    if (!err) sendCode();
  }

  async function verify() {
    if (code.length !== CODE_LENGTH) {
      setError('۵ عددي کوډ ولیکئ');
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
          <Title sub="خپل ریښتینی نوم ولیکئ">نوی حساب</Title>
          <ErrorBox message={error} />
          <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
            <Field label="نوم" value={firstName} onChangeText={setFirstName} containerStyle={{ flex: 1 }} maxLength={40} />
            <Field label="تخلص" value={lastName} onChangeText={setLastName} containerStyle={{ flex: 1 }} maxLength={40} />
          </View>
          <Label>جنسیت</Label>
          <Choice
            options={[
              { value: 'male', label: 'نارینه' },
              { value: 'female', label: 'ښځینه' },
            ]}
            value={gender}
            onChange={setGender}
          />
          <Label>د زېږېدو نېټه</Label>
          <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
            <Field label="ورځ" ltr value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} placeholder="DD" containerStyle={{ flex: 1 }} />
            <Field label="میاشت" ltr value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} placeholder="MM" containerStyle={{ flex: 1 }} />
            <Field label="کال" ltr value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} placeholder="YYYY" containerStyle={{ flex: 1.4 }} />
          </View>
          <Button title="مخته" onPress={nextFromInfo} />
          <Button title="حساب لرئ؟ Login" variant="link" onPress={() => router.replace('/login')} />
        </>
      )}

      {step === 2 && (
        <>
          <Title sub="دا ایمیل او پاسورډ به د Faisal Show لپاره وي">ایمیل او پاسورډ</Title>
          <ErrorBox message={error} />
          <Field
            label="ایمیل"
            ltr
            value={email}
            onChangeText={setEmail}
            placeholder="thefaisal322@fainet.org"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <Field
            label="پاسورډ"
            ltr
            value={password}
            onChangeText={setPassword}
            placeholder="fai123@afg"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <Field
            label="پاسورډ بیا ولیکئ"
            ltr
            value={password2}
            onChangeText={setPassword2}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <Button title="کوډ ولېږئ" onPress={nextFromEmail} loading={busy} />
          <Button title="شاته" variant="link" onPress={() => { setError(null); setStep(1); }} />
        </>
      )}

      {step === 3 && (
        <>
          <Title>ایمیل تایید کړئ</Title>
          <ErrorBox message={error} />
          <CodeStep
            email={cleanEmail}
            code={code}
            onChangeCode={setCode}
            onResend={() => sendCode(true)}
            resending={busy && code.length === 0}
            secondsLeft={timer.left}
          />
          <Button title="تایید او حساب جوړول" onPress={verify} loading={busy} disabled={code.length !== CODE_LENGTH} />
          <Button title="ایمیل بدلول" variant="link" onPress={() => { setError(null); setCode(''); setStep(2); }} />
        </>
      )}
    </FormScreen>
  );
}
