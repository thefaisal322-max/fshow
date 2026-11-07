# Faisal Show

ټولنیز اپ: پوسټونه، ریلز، چټ — Android او iPhone لپاره.
**React Native (Expo) + Supabase (وړیا) + Resend (وړیا)** — هېڅ کارت ته اړتیا نشته.

د پړاوونو نقشه: [docs/ROADMAP.md](docs/ROADMAP.md)

---

## د چلولو لارښود (یو ځل، ټول وړیا)

### ۱. Supabase پروژه
1. [supabase.com](https://supabase.com) → **Start your project** → په GitHub ننوځئ
2. **New project** → نوم: `fshow` → یو قوي **Database Password** ولیکئ او **ساتئ یې** → Region: **Frankfurt** یا **Mumbai**
3. **Authentication → Sign In / Providers** → **Allow new users to sign up** → **OFF** ❗
   (حسابونه یوازې زموږ د ۵ عددي کوډ له لارې جوړېږي)
4. **Project Settings → API Keys** (یا **Connect**) → **Project URL** او **Publishable key** کاپي کړئ
   او په [`src/config/supabase.config.ts`](src/config/supabase.config.ts) کې یې ځای پر ځای کړئ.

### ۲. ډیټابېس او Functions پورته کول (د GitHub له لارې، کمپیوټر نه غواړي)
1. په GitHub کې: **Settings → Secrets and variables → Actions → New repository secret**:
   | Secret | له کومه |
   |---|---|
   | `SUPABASE_ACCESS_TOKEN` | supabase.com → ښي پورته عکس → **Account → Access Tokens → Generate** |
   | `SUPABASE_DB_PASSWORD` | هغه پاسورډ چې په ۲ ګام کې مو جوړ کړ |
   | `RESEND_API_KEY` | resend.com → **API Keys** |
2. **Actions → Deploy Supabase → Run workflow**

### ۳. APK
هر ځل چې `main` ته کوډ ولېږل شي، GitHub پخپله APK جوړوي او په Releases کې یې خپروي:
- 64-bit (ډېری تلیفونونه): https://github.com/thefaisal322-max/fshow/releases/latest/download/fshow.apk
- زاړه 32-bit تلیفونونه: https://github.com/thefaisal322-max/fshow/releases/latest/download/fshow-32bit.apk

---

## جوړښت

```
app/                         سکرینونه (expo-router)
  (auth)/                    welcome · login · signup · forgot
  (setup)/                   photo · username
  (tabs)/                    home · reels · chats · search · notifications · profile
src/
  config/supabase.config.ts  د پروژې پته او عامه کیلي
  lib/                       supabase · api · auth-context · validation
  components/                ui · CodeStep · Avatar
supabase/
  migrations/                جدولونه + امنیتي قواعد (RLS)
  functions/                 send-code · signup · reset-password  (Edge Functions)
  tests/                     unit · rls · e2e  (GitHub یې په هر push ازمویي)
```

## ډیټا

| جدول | څه پکې دي | څوک یې بدلولای شي |
|---|---|---|
| `profiles` | نوم، ID Name، بایو، عکس، شمېرې، `is_fainet` | کاروونکی یوازې خپل **بایو او عکس**؛ نور یوازې سرور |
| `profiles_private` | ایمیل، د زېږېدو نېټه | یوازې سرور؛ یوازې خاوند یې لیدلای شي |
| `private.email_codes` | پټ (hash) شوي کوډونه | یوازې سرور (API ته نه ښکاري) |
| `private.rate_limits` | د هڅو شمېر | یوازې سرور |
| `posts` | متن، عکس/ویډیو، ځای، احساس، شمېرې | لیکوال یې جوړوي/ړنګوي؛ شمېرې یوازې سرور |
| `post_likes` / `post_saves` / `comments` / `follows` | لایک، سېو، کمنټ، Follow | هر څوک یوازې د ځان په نوم |
| `notifications` | خبرتیاوې | یوازې سرور جوړوي؛ یوازې ترلاسه کوونکی یې ویني |
| `conversations` / `messages` / `message_reactions` | چټونه | یوازې د چټ غړي |
| `private.message_secrets` | د "یو ځل لیدونکي" پیغامونو منځپانګه | هېڅوک؛ یوازې یو ځل د `open_view_once` له لارې |
| Storage `avatars/`, `posts/` (عامه) · `chats/` (پټ) | عکسونه او ویډیوګانې | هر څوک یوازې په خپل فولډر / خپل چټ کې |

## د وړیا پلان حدونه
- ډیټابېس 500 MB · فایلونه 1 GB · Edge Functions 500,000 په میاشت کې
- Resend: 100 ایمیله په ورځ کې، 3,000 په میاشت کې
- که پروژه ۷ ورځې هېڅ نه وي کارول شوې، Supabase یې ودروي — په dashboard کې **Restore** کلیک کړئ.
