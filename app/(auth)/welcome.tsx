import { useRouter } from 'expo-router';

import { Button, FormScreen, Title } from '@/components/ui';

export default function Welcome() {
  const router = useRouter();
  return (
    <FormScreen>
      <Title sub="د ملګرو سره پوسټونه، ریلز او چټ — په خپله ژبه">Faisal Show ته ښه راغلاست</Title>
      <Button title="نوی حساب جوړ کړئ (Sign up)" onPress={() => router.push('/signup')} />
      <Button title="ننوتل (Login)" variant="secondary" onPress={() => router.push('/login')} />
    </FormScreen>
  );
}
