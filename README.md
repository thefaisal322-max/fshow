# Faisal Show

ټولنیز اپ: پوسټونه، ریلز، چټ — Android او iPhone لپاره.
**React Native (Expo) + Firebase + Resend**

د پړاوونو نقشه: [docs/ROADMAP.md](docs/ROADMAP.md)

---

## د چلولو لارښود (یو ځل)

### ۱. Firebase پروژه
1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → نوم: `fshow`
2. **Upgrade → Blaze plan** (Cloud Functions دې ته اړتیا لري. وړیا اندازه یې ډېره ده، خو کارت غواړي.)
3. **Build → Authentication → Get started → Email/Password → Enable**
4. **Build → Firestore Database → Create database** → Production mode
5. **Build → Storage → Get started**
6. **Project settings → General → Your apps → Web (</>)** → یو نوم ورکړئ → `firebaseConfig` کاپي کړئ
   او په [`src/config/firebase.config.ts`](src/config/firebase.config.ts) کې یې ځای پر ځای کړئ.

### ۲. سرور (Functions) او امنیتي قواعد ځای پر ځای کول
**له کمپیوټر پرته — د GitHub له لارې:**
1. Firebase → Project settings → **Service accounts** → *Manage service account permissions* →
   یو service account جوړ کړئ، رول یې **Editor** کړئ → **Keys → Add key → JSON**
2. په GitHub کې: **Settings → Secrets and variables → Actions → New repository secret**:
   - `FIREBASE_SERVICE_ACCOUNT` = د JSON فایل ټول متن
   - `FIREBASE_PROJECT_ID` = ستاسو د پروژې ID (لکه `fshow-12345`)
   - `RESEND_API_KEY` = له resend.com → API Keys
3. **Actions → Deploy Firebase → Run workflow**

**یا له کمپیوټر څخه:**
```bash
npm i -g firebase-tools
firebase login
firebase use --add            # خپله پروژه وټاکئ
firebase functions:secrets:set RESEND_API_KEY
cd firebase/functions && npm install && cd ../..
firebase deploy --only functions,firestore,storage
```

### ۳. APK
هر ځل چې `main` ته کوډ ولېږل شي، GitHub پخپله APK جوړوي:
**Actions → Android APK → وروستی run → Artifacts → `fshow-apk`**

### ۴. (اختیاري) د زړو کوډونو پاکول
Firestore → **TTL policies** → `emailCodes` او `rateLimits` کې پر `expireAt` فیلډ TTL جوړ کړئ.

---

## جوړښت

```
app/                      سکرینونه (expo-router)
  (auth)/                 welcome · login · signup · forgot
  (setup)/                photo · username
  (tabs)/                 home · reels · chats · search · notifications · profile
src/
  config/firebase.config.ts
  lib/                    firebase · auth-context · api · validation · upload
  components/             ui · CodeStep · Avatar
firebase/
  firestore.rules         څوک څه لوستلای/لیکلای شي
  storage.rules
  functions/src/          sendCode · verifySignup · resetPassword · claimUsername
```

## ډیټا

| Collection | څه پکې دي | څوک یې لیکي |
|---|---|---|
| `users/{uid}` | نوم، ID Name، بایو، عکس، شمېرې، `isFainet` | سرور (کاروونکی یوازې عکس او بایو) |
| `users_private/{uid}` | ایمیل، د زېږېدو نېټه | یوازې سرور، یوازې خاوند یې لوستلای شي |
| `usernames/{name}` | ID Name → uid | یوازې سرور |
| `emailCodes/{hash}` | پټ (hash) شوي کوډونه | یوازې سرور |
| `rateLimits/{hash}` | د هڅو شمېر | یوازې سرور |
