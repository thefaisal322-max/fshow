// Sends push notifications through Firebase Cloud Messaging (HTTP v1).
// Called by the database (pg_net) when a notification / message / call happens:
//   POST { kind: 'notification' | 'message' | 'call' | 'call_end', id }   header x-hook-secret
// and once by the deploy workflow:  POST { kind: 'setup' }  → saves this function's address + secret in the DB.
// Secrets: FCM_SERVICE_ACCOUNT (Firebase service account JSON), PUSH_HOOK_SECRET.
import { handler, sql } from '../_shared/server.ts';

type Lang = 'ps' | 'en' | 'fa';
type Account = { client_email: string; private_key: string; project_id: string };

const T: Record<Lang, Record<string, string>> = {
  ps: {
    like: 'ستاسو پوسټ یې خوښ کړ', comment: 'ستاسو پر پوسټ یې نظر ورکړ', follow: 'تاسو یې فالو کړئ', mention: 'تاسو یې یاد کړئ',
    friend_request: 'د ملګرتیا غوښتنه یې درولېږه', friend_accept: 'ستاسو د ملګرتیا غوښتنه یې ومنله',
    photo: '📷 عکس', video: '🎬 ویډیو', audio: '🎤 غږیز پیغام', once: '🔒 یو ځل کتل', post: '📰 پوسټ', request: 'د پیغام غوښتنه',
    audio_call: '📞 آډیو زنګ راځي…', video_call: '🎥 ویډیو زنګ راځي…', missed: 'ورک شوی زنګ',
    coins: '🪙 ستاسو حساب ته {coins} FC ورزیات شول', coins_rejected: 'ستاسو د {coins} FC غوښتنه ونه منل شوه',
    gift: '🎁 تاسو ته یې ډالۍ درولېږله (+{coins} FC)', payout: '💵 {afs} AFS ستاسو HesabPay ته ولېږل شول',
    payout_rejected: 'ستاسو د {afs} AFS غوښتنه ونه منل شوه (سکې بېرته درکړل شوې)', promo: '📣 ستاسو پوسټ یې پروموټ کړ (+{coins} FC)',
    monetize: '✅ ستاسو اکاونټ مونیټایز شو!', monetize_rejected: 'د مونیټایز غوښتنه ونه منل شوه', warning: '⚠️ خبرداری', notice: '📢', live: '🔴 لایف ته راغی',
    admin_buy: '🧾 رسید یې ولېږه: {coins} FC ({afs} AFS)', admin_payout: '💵 غواړي {afs} AFS واخلي → {phone}',
  },
  en: {
    like: 'liked your post', comment: 'commented on your post', follow: 'started following you', mention: 'mentioned you',
    friend_request: 'sent you a friend request', friend_accept: 'accepted your friend request',
    photo: '📷 Photo', video: '🎬 Video', audio: '🎤 Voice message', once: '🔒 View once', post: '📰 Post', request: 'Message request',
    audio_call: '📞 Incoming audio call…', video_call: '🎥 Incoming video call…', missed: 'Missed call',
    coins: '🪙 {coins} FC were added to your wallet', coins_rejected: 'Your request for {coins} FC was not approved',
    gift: '🎁 sent you a gift (+{coins} FC)', payout: '💵 {afs} AFS were sent to your HesabPay',
    payout_rejected: 'Your {afs} AFS cash-out was not approved (coins returned)', promo: '📣 promoted your post (+{coins} FC)',
    monetize: '✅ Your account is monetized!', monetize_rejected: 'Your monetization request was not approved', warning: '⚠️ Warning', notice: '📢', live: '🔴 is live now',
    admin_buy: '🧾 sent a receipt: {coins} FC ({afs} AFS)', admin_payout: '💵 wants to cash out {afs} AFS → {phone}',
  },
  fa: {
    like: 'پست شما را پسندید', comment: 'روی پست شما نظر داد', follow: 'شما را دنبال کرد', mention: 'از شما نام برد',
    friend_request: 'درخواست دوستی فرستاد', friend_accept: 'درخواست دوستی شما را پذیرفت',
    photo: '📷 عکس', video: '🎬 ویدیو', audio: '🎤 پیام صوتی', once: '🔒 یک‌بار دیدن', post: '📰 پست', request: 'درخواست پیام',
    audio_call: '📞 تماس صوتی ورودی…', video_call: '🎥 تماس تصویری ورودی…', missed: 'تماس از دست رفته',
    coins: '🪙 {coins} FC به حساب شما اضافه شد', coins_rejected: 'درخواست {coins} FC شما پذیرفته نشد',
    gift: '🎁 برای شما هدیه فرستاد (+{coins} FC)', payout: '💵 {afs} AFS به HesabPay شما فرستاده شد',
    payout_rejected: 'برداشت {afs} AFS پذیرفته نشد (سکه‌ها برگشت)', promo: '📣 پست شما را تبلیغ کرد (+{coins} FC)',
    monetize: '✅ حساب شما درآمدزا شد!', monetize_rejected: 'درخواست درآمدزایی پذیرفته نشد', warning: '⚠️ هشدار', notice: '📢', live: '🔴 زنده است',
    admin_buy: '🧾 رسید فرستاد: {coins} FC ({afs} AFS)', admin_payout: '💵 می‌خواهد {afs} AFS برداشت کند → {phone}',
  },
};

// ───────── Google OAuth token for FCM (cached ~50 min) ─────────
let cached: { token: string; until: number; project: string } | null = null;

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function accessToken(): Promise<{ token: string; project: string }> {
  if (cached && cached.until > Date.now()) return cached;
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT missing');
  const acc = JSON.parse(raw) as Account;
  const pem = acc.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: acc.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(sig)}` }),
  });
  if (!r.ok) throw new Error(`google token ${r.status}: ${await r.text()}`);
  const j = await r.json();
  cached = { token: j.access_token, until: Date.now() + 50 * 60_000, project: acc.project_id };
  return cached;
}

type Push = {
  title: string;
  body: string;
  data: Record<string, string>;
  channel: 'messages' | 'social' | 'calls' | 'missed';
  tag?: string;
  /** seconds the message may wait for a phone that is offline */
  ttl?: number;
};

/** the person's "Notification settings": kinds they switched off */
async function wants(userId: string, kind: string): Promise<boolean> {
  const [p] = await sql<{ off: string[] }[]>`SELECT notif_off AS off FROM public.profiles WHERE id = ${userId}`;
  return !p || !p.off.includes(kind);
}

async function sendTo(userId: string, make: (lang: Lang) => Push, kind?: string) {
  if (kind && !(await wants(userId, kind))) return 0;
  const tokens = await sql<{ token: string; lang: Lang }[]>`SELECT token, lang FROM public.push_tokens WHERE user_id = ${userId}`;
  if (!tokens.length) return 0;
  const { token: bearer, project } = await accessToken();
  let sent = 0;
  for (const t of tokens) {
    const p = make(t.lang);
    const msg = {
      message: {
        token: t.token,
        data: { ...p.data, title: p.title, body: p.body },
        notification: { title: p.title, body: p.body },
        android: {
          priority: 'HIGH',
          ttl: `${p.ttl ?? 86400}s`,
          notification: {
            channel_id: p.channel,
            tag: p.tag,
            sound: p.channel === 'calls' ? 'ringtone' : 'default',
            notification_priority: p.channel === 'calls' ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
            visibility: 'PUBLIC',
            default_vibrate_timings: true,
          },
        },
      },
    };
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (r.ok) sent++;
    else {
      const txt = await r.text();
      // the app was removed / token expired → forget it
      if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*token/i.test(txt)) {
        await sql`DELETE FROM public.push_tokens WHERE token = ${t.token}`;
      } else console.error('fcm', r.status, txt.slice(0, 300));
    }
  }
  return sent;
}

const name = (r: { first_name: string | null; last_name: string | null }) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Faisal Show';

const SYSTEM = new Set(['coins', 'coins_rejected', 'payout', 'payout_rejected', 'monetize', 'monetize_rejected', 'warning', 'notice']);

function fill(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => String(data?.[k] ?? ''));
}

async function notification(id: string) {
  const [n] = await sql<{ user_id: string; type: string; post_id: string | null; actor_id: string; first_name: string; last_name: string; data: Record<string, unknown> }[]>`
    SELECT n.user_id, n.type, n.post_id, n.actor_id, a.first_name, a.last_name, n.data
    FROM public.notifications n JOIN public.profiles a ON a.id = n.actor_id WHERE n.id = ${id}`;
  if (!n) return 0;
  const sys = SYSTEM.has(n.type);
  const url = n.type === 'admin_coins' ? '/main'
    : n.type === 'live' && n.data?.live_id ? `/live/${n.data.live_id}`
    : n.type.startsWith('monetize') ? '/settings/monetize'
    : sys && n.type !== 'notice' && n.type !== 'warning' ? '/settings/fc'
    : n.type === 'notice' || n.type === 'warning' ? '/profile'
    : n.post_id ? `/post/${n.post_id}` : n.type === 'friend_request' ? '/settings/friend-requests' : `/user/${n.actor_id}`;
  // which switch in "Notification settings" turns it off (money / admin messages always come)
  const pref = n.type === 'friend_request' || n.type === 'friend_accept' ? 'friends' : ['like', 'comment', 'follow', 'mention'].includes(n.type) ? n.type : undefined;
  return sendTo(n.user_id, (lang) => {
    const key = n.type === 'admin_coins' ? (n.data?.kind === 'payout' ? 'admin_payout' : 'admin_buy') : n.type;
    const base = T[lang][key] ?? T[lang].like;
    const text = (n.type === 'notice' || n.type === 'warning') && n.data?.text ? `${base} ${String(n.data.text).slice(0, 180)}` : fill(base, n.data ?? {});
    return {
      title: sys ? 'Faisal Show' : name(n),
      body: text,
      data: { type: 'notification', url },
      channel: 'social',
      tag: `n-${n.type}-${n.post_id ?? n.actor_id}-${sys ? id : ''}`,
    };
  }, pref);
}

async function message(id: string) {
  const [m] = await sql<
    { conversation_id: string; sender_id: string; body: string; media_type: string | null; view_once: boolean; post_id: string | null; is_group: boolean; title: string | null; first_name: string; last_name: string }[]
  >`
    SELECT m.conversation_id, m.sender_id, m.body, m.media_type, m.view_once, m.post_id, c.is_group, c.title, s.first_name, s.last_name
    FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id JOIN public.profiles s ON s.id = m.sender_id
    WHERE m.id = ${id}`;
  if (!m) return 0;
  const members = await sql<{ user_id: string; accepted: boolean }[]>`
    SELECT cm.user_id, coalesce(cm.accepted, true) AS accepted FROM public.conversation_members cm
    WHERE cm.conversation_id = ${m.conversation_id} AND cm.user_id <> ${m.sender_id} AND NOT coalesce(cm.muted, false)`;
  let sent = 0;
  for (const mem of members) {
    sent += await sendTo(mem.user_id, (lang) => {
      const t = T[lang];
      const what = m.view_once ? t.once : m.body?.trim() ? m.body.slice(0, 180) : m.media_type === 'video' ? t.video : m.media_type === 'audio' ? t.audio : m.media_type ? t.photo : m.post_id ? t.post : '';
      return {
        title: m.is_group ? `${name(m)} · ${m.title ?? ''}`.trim() : name(m),
        body: mem.accepted ? what : `${t.request}: ${what}`,
        data: { type: 'message', url: `/chats/${m.conversation_id}` },
        channel: 'messages',
        tag: `c-${m.conversation_id}`,
      };
    }, 'message');
  }
  return sent;
}

async function call(id: string, ended: boolean) {
  const [c] = await sql<{ callee_id: string; video: boolean; status: string; answered_at: string | null; conversation_id: string; first_name: string; last_name: string }[]>`
    SELECT c.callee_id, c.video, c.status, c.answered_at, c.conversation_id, p.first_name, p.last_name
    FROM public.calls c JOIN public.profiles p ON p.id = c.caller_id WHERE c.id = ${id}`;
  if (!c) return 0;
  if (!ended) {
    return sendTo(c.callee_id, (lang) => ({
      title: name(c),
      body: c.video ? T[lang].video_call : T[lang].audio_call,
      data: { type: 'call', call_id: id, video: String(c.video), url: `/chats/${c.conversation_id}` },
      channel: 'calls',
      tag: `call-${id}`,
      ttl: 45, // an old call is useless
    }), 'call');
  }
  // stopped ringing: the same notification becomes "Missed call" (or disappears quietly if answered)
  if (c.status === 'accepted' || c.answered_at) return 0;
  return sendTo(c.callee_id, (lang) => ({
    title: name(c),
    body: T[lang].missed,
    data: { type: 'missed_call', url: `/chats/${c.conversation_id}` },
    channel: 'missed',
    tag: `call-${id}`,
  }), 'call');
}

Deno.serve(
  handler(async (body, req) => {
    const secret = Deno.env.get('PUSH_HOOK_SECRET');
    if (!secret || req.headers.get('x-hook-secret') !== secret) return { ok: false };
    const kind = String(body.kind ?? '');
    if (kind === 'setup') {
      const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/push`;
      await sql`INSERT INTO private.push_hook (id, url, secret) VALUES (true, ${url}, ${secret})
                ON CONFLICT (id) DO UPDATE SET url = excluded.url, secret = excluded.secret`;
      // prove FCM works too
      await accessToken();
      return { ok: true, setup: true };
    }
    const id = String(body.id ?? '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false };
    let sent = 0;
    if (kind === 'notification') sent = await notification(id);
    else if (kind === 'message') sent = await message(id);
    else if (kind === 'call') sent = await call(id, false);
    else if (kind === 'call_end') sent = await call(id, true);
    return { ok: true, sent };
  }),
);
