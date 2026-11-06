# Faisal Show

ټولنیز اپ: پوسټونه، ریلز، چټ — Android او iPhone لپاره.

| برخه | ټیکنالوژي | ځای |
|---|---|---|
| اپ | React Native (Expo) | `app/`, `src/` |
| سرور (API) | Node.js + Fastify | `server/` |
| ډیټابېس | PostgreSQL 16 | `server/migrations/` |
| ایمیل | Resend (`no-reply@fainet.org`) | `server/src/email.ts` |
| HTTPS | Caddy (وړیا سرټیفیکیټ) | `deploy/` |

هېڅ Google / Firebase نشته — ټول ډیټا ستاسو په خپل سرور کې ده.
د پړاوونو نقشه: [docs/ROADMAP.md](docs/ROADMAP.md)

---

## سرور پورته کول

یو Linux VPS (Ubuntu 22/24، لږ تر لږه 1 GB RAM) او یو ډومین (لکه `api.fainet.org`) ته اړتیا ده.

1. د ډومین **A record** د سرور IP ته واړوئ: `api.fainet.org → 1.2.3.4`
2. په سرور کې:
   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/thefaisal322-max/fshow.git
   cd fshow/deploy
   cp .env.example .env
   nano .env            # API_DOMAIN, POSTGRES_PASSWORD, RESEND_API_KEY
   docker compose up -d --build
   ```
3. وګورئ: `https://api.fainet.org/health` باید `{"ok":true}` وښيي.

Caddy پخپله HTTPS سرټیفیکیټ اخلي. ډیټابېس جدولونه پخپله جوړېږي.

**تازه کول:** `git pull && docker compose up -d --build`
**بیک‌اپ:** `docker compose exec db pg_dump -U fshow fshow > backup.sql`

## APK

1. په [`src/config/app.config.ts`](src/config/app.config.ts) کې د سرور پته (`API_URL`) ولیکئ —
   یا په GitHub کې: **Settings → Secrets and variables → Actions → Variables → `API_URL`**
2. هر ځل چې `main` ته کوډ ولېږل شي، GitHub پخپله APK جوړوي:
   **Actions → Android APK → وروستی run → Artifacts → `fshow-apk`**

## API

| Method | Path | کار |
|---|---|---|
| POST | `/v1/auth/send-code` | `{email, purpose: signup\|reset}` → ایمیل ته ۵ عددي کوډ |
| POST | `/v1/auth/signup` | `{email, code, password, firstName, lastName, gender, birthday}` → `{token, user}` |
| POST | `/v1/auth/login` | `{email, password}` → `{token, user}` |
| POST | `/v1/auth/reset` | `{email, code, newPassword}` → `{token, user}` (نور ټول وسایل باسي) |
| POST | `/v1/auth/logout` | |
| GET | `/v1/me` | |
| PATCH | `/v1/me` | `{bio}` |
| POST | `/v1/me/username` | `{username, bio}` → پروفایل بشپړوي |
| POST | `/v1/me/avatar` | multipart `file` (تر 5MB) |

تېروتنې: `{"error": "<reason>", ...}` — اپ یې په `src/lib/api.ts → errorMessage` کې په پښتو اړوي.

## امنیت

- پاسورډونه: **scrypt** (حافظه-دروند hash)؛ ننوتلو ته د نشته ایمیل لپاره هم ورته وخت.
- سیشن ټوکن: ۳۲ بایټه تصادفي، په ډیټابېس کې یوازې SHA-256 یې؛ په تلیفون کې په **SecureStore** (کوډ شوی keystore)؛ ۶۰ ورځې.
- کوډونه: HMAC hash، ۱۰ دقیقې، ۵ غلطې هڅې، ۶۰ ثانیې انتظار، په ساعت کې ۵ ایمیلونه.
- Rate limit: د IP او ایمیل له مخې (login: ۱۰ هڅې / ۱۵ دقیقې په هر ایمیل).
- عکسونه: هر عکس بیا جوړېږي (sharp) → 512×512 JPEG، EXIF/GPS لرې کېږي، جعلي فایل ردېږي.
- ایمیل او د زېږېدو نېټه یوازې خاوند ته ښکاري.
- شمېرې (likes, views, followers) یوازې سرور بدلوي.

## پراختیا (Development)

```bash
# سرور (PostgreSQL ته اړتیا لري)
cd server && npm install
DATABASE_URL=postgres://user:pass@localhost/fshow npm run build && npm start   # کوډونه په console کې چاپېږي
DATABASE_URL=postgres://user:pass@localhost/fshow_test npm test

# اپ
npm install && npx expo start
```
