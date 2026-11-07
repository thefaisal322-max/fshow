# Faisal Show — Roadmap

| # | Phase | Status |
|---|-------|--------|
| 1 | Sign up with 5-digit email code (Resend) · Login · Forgot password · Photo · ID Name | ✅ |
| 2 | Posts (text, photo, **video ≤ 60 s**, **location**, **feeling**) · feed · like · comment · save · share · views | ✅ |
| 3 | Follow · Search · Notifications (like, comment, mention, follow) with live badge | ✅ |
| 4 | For You ranking + fainet.org boost · Report · Delete account · ✓ only for @fainet.org | ✅ |
| 5 | **Reels** (full-screen vertical videos) | ✅ |
| 6 | **Chats** like Messenger: 1-to-1 + groups, photos/videos, replies, reactions, delete for everyone, view-once, archive, live | ✅ |
| 7 | **Settings**: languages (English · پښتو · دری), personal info, change email (with code) / password, privacy policy, about | ✅ |
| 8 | **Voice & video calls** (WebRTC + TURN server) | ⏳ next |
| 9 | Push notifications when the app is closed (Expo push) · block users · Play Store release | |

## Security principles (apply to every phase)

Backend: **Supabase free plan** (no card) — Postgres + Auth + Storage + Edge Functions (decision Nov 2026; Firebase needs a paid plan for Functions/Storage).

1. Row Level Security on every table. The app may only change harmless columns of its own rows (column-level GRANTs).
2. Counters (likes, views, followers), `is_fainet`, boosts are written only by Edge Functions / triggers / SECURITY DEFINER functions.
3. Public Supabase sign-up is OFF; accounts are created only by the `signup` Edge Function after the 5-digit code.
4. Codes: HMAC-SHA256 + salt, 10 min, 5 wrong tries, 60 s resend wait, 5 per hour, per-IP limits — in schema `private` (not exposed by the API).
5. Every new feature must require `profile_complete = true` in its RLS policies (accounts without a profile can do nothing).
6. Avatars: resized to 512×512 JPEG on the phone (strips EXIF/GPS); bucket only accepts images ≤ 5 MB in the owner's own folder.

## fainet.org boost (phase 4) — real reach, not fake numbers

Decision (Nov 2026): boosted posts are **shown to more real people**. Like and view counts are never inflated; they only count real actions.

- `profiles.is_fainet` is set by the server at signup when the verified email ends with `@fainet.org`. The app can not change it.
- **Account boost:** posts by `is_fainet` accounts get a higher ranking score in For You.
- **Top-of-For-You boost:** when a verified `@fainet.org` account comments the trigger phrase on a post, a trigger checks the commenter's `is_fainet` flag on the server and, if valid, pins that post to the first slot of For You for a limited time. From anyone else the phrase is just a normal comment. The phrase lives in server config, not in the app.
- **Hourly push (24 h):** a scheduled job (pg_cron) runs every hour for each new post during its first 24 h and inserts it into ~19 more users' For You feeds. A view is counted only when a real user actually sees it (≥ 2 s on screen, once per user per post).
