// POST {} → { iceServers } for a call. Logged-in users only.
// Uses Cloudflare Realtime TURN (secrets CF_TURN_KEY_ID + CF_TURN_API_TOKEN); the TURN password it returns
// works for 24 h only. Without the secrets it still answers with free STUN servers (calls then only connect
// when both phones can reach each other directly).
import { handler, requireUser } from '../_shared/server.ts';

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

type Ice = { urls: string | string[]; username?: string; credential?: string };

async function cloudflare(): Promise<Ice[] | null> {
  const key = Deno.env.get('CF_TURN_KEY_ID');
  const token = Deno.env.get('CF_TURN_API_TOKEN');
  if (!key || !token) return null;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ ttl: 86400 });
  // newer endpoint: a ready list of ICE servers
  let r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${key}/credentials/generate-ice-servers`, { method: 'POST', headers, body });
  if (r.ok) {
    const j = await r.json();
    if (Array.isArray(j.iceServers)) return j.iceServers as Ice[];
  }
  // older endpoint: one object
  r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${key}/credentials/generate`, { method: 'POST', headers, body });
  if (!r.ok) {
    console.error('turn credentials failed', r.status, await r.text());
    return null;
  }
  const j = await r.json();
  return j.iceServers ? [j.iceServers as Ice] : null;
}

Deno.serve(
  handler(async (_b, req) => {
    await requireUser(req);
    const cf = await cloudflare().catch((e) => {
      console.error(e);
      return null;
    });
    if (!cf) return { iceServers: STUN, turn: false };
    // port 53 is often blocked or broken on phones; keep the rest
    const clean = cf.map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53\b/.test(u)) }));
    return { iceServers: clean, turn: true };
  }),
);
