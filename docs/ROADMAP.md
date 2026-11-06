# Faisal Show — Roadmap

| # | Phase | Status |
|---|-------|--------|
| 1 | Sign up (info → email + password → 5-digit code via Resend) · Login · Forgot password · Photo · ID Name · Profile | ✅ built |
| 2 | Posts: create (text + image), feed, like, comment, save, share | ⏳ next |
| 3 | Follow · Search · Notifications (mention, invite, push) | |
| 4 | Views + For You ranking + **fainet.org boost** (below) · Report / Block · Delete account | |
| 5 | Chats (1-to-1, then groups) | |
| 6 | Reels (video upload, compression, vertical player) | |
| 7 | Play Store release (privacy policy, signing key) | |

## Security principles (apply to every phase)

Backend: own server — Node.js (Fastify) + PostgreSQL, no Firebase (decision Nov 2026).

1. The app never writes counters. Likes, views, followers and boosts are changed only by server logic.
2. Every input is validated on the server; the app's checks are only for UX.
3. Private data (email, birthday) is returned only to its owner (`meUser` vs `publicUser`).
4. Codes are hashed (HMAC-SHA256 + salt), expire in 10 min, die after 5 wrong tries, one email per minute, max 5 per hour, plus per-IP limits.
5. Passwords: scrypt. Sessions: random token, only its SHA-256 stored, revoked on password reset.
6. Every uploaded image is re-encoded server-side (sharp), EXIF stripped.

## fainet.org boost (phase 4) — real reach, not fake numbers

Decision (Nov 2026): boosted posts are **shown to more real people**. Like and view counts are never inflated; they only count real actions.

- `users.is_fainet` is set by the server at signup when the verified email ends with `@fainet.org`. The app can not change it.
- **Account boost:** posts by `isFainet` accounts get a higher ranking score in For You.
- **Top-of-For-You boost:** when a verified `@fainet.org` account comments the trigger phrase on a post, a function checks the commenter's `is_fainet` flag on the server and, if valid, pins that post to the first slot of For You for a limited time. From anyone else the phrase is just a normal comment. The phrase lives in server config, not in the app.
- **Hourly push (24 h):** a scheduled job runs every hour for each new post during its first 24 h and inserts it into ~19 more users' For You feeds. A view is counted only when a real user actually sees it (≥ 2 s on screen, once per user per post).
