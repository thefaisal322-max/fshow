// Live video through the Cloudflare Realtime SFU ("Calls"). Nothing is recorded or stored.
// The app never sees the Cloudflare token: it sends its WebRTC offer/answer here.
//   { action: 'publish', live_id, sdp, tracks: [{ mid, kind: 'audio' | 'video' }] }  host → answer sdp
//   { action: 'pull', live_id }                                                      anyone in the room → offer sdp + which mid is whose
//   { action: 'answer', live_id, session_id, sdp }                                   finishes a pull
//   { action: 'stop', live_id }                                                      host stops sending
// Secrets: CF_SFU_APP_ID, CF_SFU_APP_TOKEN (Cloudflare → Realtime → SFU app).
import { fail, handler, rateLimit, MINUTE, requireUser, sql } from '../_shared/server.ts';

const API = 'https://rtc.live.cloudflare.com/v1/apps';

async function cf(path: string, method: string, body?: unknown) {
  const app = Deno.env.get('CF_SFU_APP_ID');
  const token = Deno.env.get('CF_SFU_APP_TOKEN');
  if (!app || !token) fail(503, 'live-off');
  const r = await fetch(`${API}/${app}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j: any = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    // not JSON
  }
  if (!r.ok || j.errorCode) {
    console.error('sfu', path.replace(/sessions\/[^/]+/, 'sessions/…'), r.status, j.errorCode ?? '', j.errorDescription ?? '');
    fail(502, 'sfu-failed');
  }
  return j;
}

const uuid = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) ? v : fail(400, 'invalid-input'));
const sdpOf = (v: unknown) => (typeof v === 'string' && v.startsWith('v=') && v.length < 15_000 ? v : fail(400, 'invalid-input'));

async function role(live: string, user: string): Promise<'host' | 'viewer' | null> {
  const [r] = await sql<{ role: string | null }[]>`SELECT private.sfu_role(${live}, ${user}) AS role`;
  return (r?.role as 'host' | 'viewer' | null) ?? null;
}

Deno.serve(
  handler(async (body, req) => {
    const me = await requireUser(req);
    const action = String(body.action ?? '');
    const live = uuid(body.live_id);
    await rateLimit(`sfu:${me.id}`, 60, MINUTE);
    const who = await role(live, me.id);
    if (!who) fail(403, 'forbidden');

    if (action === 'publish') {
      if (who !== 'host') fail(403, 'forbidden');
      const sdp = sdpOf(body.sdp);
      const tracks = Array.isArray(body.tracks) ? (body.tracks as { mid?: unknown; kind?: unknown }[]).slice(0, 2) : [];
      const local = tracks
        .filter((t) => typeof t.mid === 'string' && (t.kind === 'audio' || t.kind === 'video'))
        .map((t) => ({ location: 'local', mid: String(t.mid), trackName: `${me.id}-${t.kind}` }));
      if (!local.length) fail(400, 'invalid-input');
      const s = await cf('/sessions/new', 'POST');
      const res = await cf(`/sessions/${s.sessionId}/tracks/new`, 'POST', {
        sessionDescription: { type: 'offer', sdp },
        tracks: local,
      });
      await sql`UPDATE public.live_hosts SET sfu_session = ${s.sessionId}, tracks = ${sql.json(local.map((t) => t.trackName))}, seen_at = now()
                WHERE live_id = ${live} AND user_id = ${me.id} AND status = 'joined'`;
      await sql`INSERT INTO public.live_events (live_id, user_id, kind, body) VALUES (${live}, ${me.id}, 'system', 'media')`;
      return { sdp: res.sessionDescription?.sdp, type: res.sessionDescription?.type ?? 'answer' };
    }

    if (action === 'pull') {
      const hosts = await sql<{ user_id: string; sfu_session: string; tracks: string[] }[]>`
        SELECT user_id, sfu_session, tracks FROM public.live_hosts
        WHERE live_id = ${live} AND status = 'joined' AND sfu_session IS NOT NULL AND user_id <> ${me.id}
        ORDER BY side, joined_at LIMIT 4`;
      const remote = hosts.flatMap((h) => (h.tracks ?? []).map((name) => ({ location: 'remote', sessionId: h.sfu_session, trackName: name })));
      if (!remote.length) return { sdp: null, tracks: [] };
      const s = await cf('/sessions/new', 'POST');
      const res = await cf(`/sessions/${s.sessionId}/tracks/new`, 'POST', { tracks: remote });
      if (who === 'viewer') {
        await sql`UPDATE public.live_viewers SET sfu_session = ${s.sessionId}, seen_at = now() WHERE live_id = ${live} AND user_id = ${me.id}`;
      } else {
        await sql`UPDATE public.live_hosts SET pull_session = ${s.sessionId} WHERE live_id = ${live} AND user_id = ${me.id}`;
      }
      const tracks = (res.tracks ?? []).map((t: { mid: string; trackName: string; error?: unknown }) => ({
        mid: t.mid,
        user: String(t.trackName).slice(0, 36),
        kind: String(t.trackName).endsWith('-video') ? 'video' : 'audio',
        ok: !t.error,
      }));
      return {
        session_id: s.sessionId,
        sdp: res.sessionDescription?.sdp ?? null,
        type: res.sessionDescription?.type ?? 'offer',
        renegotiate: !!res.requiresImmediateRenegotiation,
        tracks,
      };
    }

    if (action === 'answer') {
      const sid = typeof body.session_id === 'string' && body.session_id.length < 200 ? body.session_id : fail(400, 'invalid-input');
      // the session must be the one made for me
      const [own] = who === 'viewer'
        ? await sql`SELECT 1 FROM public.live_viewers WHERE live_id = ${live} AND user_id = ${me.id} AND sfu_session = ${sid}`
        : await sql`SELECT 1 FROM public.live_hosts WHERE live_id = ${live} AND user_id = ${me.id} AND pull_session = ${sid}`;
      if (!own) fail(403, 'forbidden');
      await cf(`/sessions/${sid}/renegotiate`, 'PUT', { sessionDescription: { type: 'answer', sdp: sdpOf(body.sdp) } });
      return { ok: true };
    }

    if (action === 'stop') {
      await sql`UPDATE public.live_hosts SET sfu_session = NULL, tracks = '[]' WHERE live_id = ${live} AND user_id = ${me.id}`;
      return { ok: true };
    }

    fail(400, 'invalid-input');
  }),
);
