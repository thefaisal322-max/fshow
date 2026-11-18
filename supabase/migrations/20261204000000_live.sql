-- Phase 4: LIVE and MATCH (video through the Cloudflare Realtime SFU — nothing is recorded or stored)
--
--   LIVE   25 minutes · 50+ followers · 15+ years · up to 4 hosts (invite, kick, leave) · up to 10,000 viewers
--   MATCH  same room + the tap bar · 3 rounds × 3 minutes · best of 3 (a tied round goes to the side with more gifts)
--          the host pays the tier (coins go to the admin): unranked 250 · special challenge 750 · A+ 999 · AFG 1499
--          opponent: invited by @username, or random
--   taps   free taps count for the score; every person who taps (once per match) gives that side's host 3 FC;
--          bought taps: 100 taps = 50 FC
--   "most comments": the same comment written by 5+ different people
--   when it ends: a card is posted from the admin account (winner, taps, viewers, coins, most comments, big gifter);
--   a match card is shown in For You to: unranked 99 · special = followers + their followers + 100 · A+ 1000 · AFG 5000

-- ───────────────────────── tables ─────────────────────────
CREATE TABLE IF NOT EXISTS public.lives (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('live', 'match')),
  status       text NOT NULL DEFAULT 'live' CHECK (status IN ('waiting', 'live', 'ended')),
  title        text NOT NULL DEFAULT '' CHECK (char_length(title) <= 60),
  tier         text CHECK (tier IS NULL OR tier IN ('unranked', 'special', 'aplus', 'afg')),
  match_name   text CHECK (match_name IS NULL OR char_length(match_name) BETWEEN 1 AND 30),
  tier_price   int NOT NULL DEFAULT 0,
  opponent_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  random       boolean NOT NULL DEFAULT false,
  started_at   timestamptz,
  ends_at      timestamptz,
  ended_at     timestamptz,
  viewers_peak int NOT NULL DEFAULT 0,
  winner_side  text,
  result       jsonb,
  card_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lives_status_idx ON public.lives (status, created_at DESC);
CREATE INDEX IF NOT EXISTS lives_host_idx ON public.lives (host_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.live_hosts (
  live_id     uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side        text NOT NULL DEFAULT 'A' CHECK (side IN ('A', 'B')),
  invited_by  uuid,
  status      text NOT NULL DEFAULT 'joined' CHECK (status IN ('invited', 'joined', 'left', 'kicked', 'declined')),
  sfu_session text CHECK (sfu_session IS NULL OR char_length(sfu_session) < 200),   -- what this host sends
  pull_session text CHECK (pull_session IS NULL OR char_length(pull_session) < 200), -- what this host receives
  tracks      jsonb NOT NULL DEFAULT '[]'::jsonb,
  mic_off     boolean NOT NULL DEFAULT false,
  cam_off     boolean NOT NULL DEFAULT false,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.live_viewers (
  live_id     uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sfu_session text CHECK (sfu_session IS NULL OR char_length(sfu_session) < 200),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_id, user_id)
);
CREATE INDEX IF NOT EXISTS live_viewers_seen_idx ON public.live_viewers (live_id, seen_at DESC);

-- the room's feed: comments, gifts, joins, system messages (the app listens to new rows)
CREATE TABLE IF NOT EXISTS public.live_events (
  id         bigserial PRIMARY KEY,
  live_id    uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind       text NOT NULL CHECK (kind IN ('comment', 'gift', 'join', 'system', 'taps')),
  body       text NOT NULL DEFAULT '' CHECK (char_length(body) <= 200),
  gift       text,
  amount     int NOT NULL DEFAULT 0,
  side       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_events_live_idx ON public.live_events (live_id, id DESC);

CREATE TABLE IF NOT EXISTS public.live_taps (
  live_id   uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  round     int NOT NULL,
  side      text NOT NULL CHECK (side IN ('A', 'B')),
  free      int NOT NULL DEFAULT 0,
  bought    int NOT NULL DEFAULT 0,
  last_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_id, user_id, round, side)
);
-- one tapper = 3 FC to that side's host, once per match
CREATE TABLE IF NOT EXISTS public.live_tappers (
  live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  side    text NOT NULL,
  PRIMARY KEY (live_id, user_id)
);

ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_viewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_taps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_tappers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lives, public.live_hosts, public.live_viewers, public.live_events, public.live_taps, public.live_tappers FROM anon, authenticated;
-- the app reads the feed rows through Realtime (no writes; everything else goes through the functions below)
GRANT SELECT ON public.live_events TO authenticated;
CREATE OR REPLACE FUNCTION private.live_open(p_live uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.lives l WHERE l.id = p_live AND l.status <> 'ended');
$$;
GRANT EXECUTE ON FUNCTION private.live_open(uuid) TO authenticated;
DROP POLICY IF EXISTS "read live feed" ON public.live_events;
CREATE POLICY "read live feed" ON public.live_events FOR SELECT TO authenticated
  USING ((SELECT private.live_open(live_id)));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'live_events') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.live_events;
    END IF;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.lives, public.live_hosts, public.live_viewers, public.live_events TO service_role;
  END IF;
END $$;

-- ───────────────────────── helpers ─────────────────────────
CREATE OR REPLACE FUNCTION private.age_years(u uuid) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT extract(year FROM age((now() AT TIME ZONE 'Asia/Kabul')::date, birthday))::int FROM public.profiles_private WHERE id = u;
$$;

CREATE OR REPLACE FUNCTION private.tier_price(t text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE t WHEN 'unranked' THEN 250 WHEN 'special' THEN 750 WHEN 'aplus' THEN 999 WHEN 'afg' THEN 1499 END;
$$;

-- a little bad-words filter for special challenge names (Pashto / Dari / English)
CREATE OR REPLACE FUNCTION private.is_clean(t text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT NOT (lower(coalesce(t, '')) ~ '(fuck|shit|bitch|sex|porn|dick|pussy|asshole|bastard|whore|کوس|کیر|جنده|کونی|غول|حرامزاده|سپی|خنزیر|گاو)');
$$;

CREATE OR REPLACE FUNCTION private.live_round(l public.lives) RETURNS int
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE WHEN l.kind <> 'match' OR l.started_at IS NULL THEN 0
              ELSE least(3, greatest(1, floor(extract(epoch FROM (now() - l.started_at)) / 180)::int + 1)) END;
$$;

CREATE OR REPLACE FUNCTION private.live_active_viewers(p_live uuid) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::int FROM public.live_viewers WHERE live_id = p_live AND seen_at > now() - interval '40 seconds';
$$;

-- per round: taps and gift coins of each side, and who won it
CREATE OR REPLACE FUNCTION private.match_rounds(l public.lives) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('round', r, 'a', ta, 'b', tb, 'ga', ga, 'gb', gb,
                    'winner', CASE WHEN ta > tb THEN 'A' WHEN tb > ta THEN 'B' WHEN ga > gb THEN 'A' WHEN gb > ga THEN 'B' ELSE 'draw' END,
                    'done', l.started_at + r * interval '3 minutes' <= now() OR l.status = 'ended') ORDER BY r), '[]'::jsonb)
  FROM (
    SELECT r,
      coalesce((SELECT sum(free + bought) FROM public.live_taps t WHERE t.live_id = l.id AND t.round = r AND t.side = 'A'), 0)::bigint AS ta,
      coalesce((SELECT sum(free + bought) FROM public.live_taps t WHERE t.live_id = l.id AND t.round = r AND t.side = 'B'), 0)::bigint AS tb,
      coalesce((SELECT sum(amount) FROM public.live_events e WHERE e.live_id = l.id AND e.kind = 'gift' AND e.side = 'A'
                  AND e.created_at >= l.started_at + (r - 1) * interval '3 minutes' AND e.created_at < l.started_at + r * interval '3 minutes'), 0)::bigint AS ga,
      coalesce((SELECT sum(amount) FROM public.live_events e WHERE e.live_id = l.id AND e.kind = 'gift' AND e.side = 'B'
                  AND e.created_at >= l.started_at + (r - 1) * interval '3 minutes' AND e.created_at < l.started_at + r * interval '3 minutes'), 0)::bigint AS gb
    FROM generate_series(1, greatest(1, private.live_round(l))) r
  ) x;
$$;

-- ───────────────────────── the room state ─────────────────────────
CREATE OR REPLACE FUNCTION private.live_json(l public.lives, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', l.id, 'kind', l.kind, 'status', l.status, 'title', l.title, 'tier', l.tier, 'match_name', l.match_name,
    'random', l.random, 'started_at', l.started_at, 'ends_at', l.ends_at, 'ended_at', l.ended_at, 'now', now(),
    'winner_side', l.winner_side, 'card_post_id', l.card_post_id,
    'host', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = l.host_id),
    'opponent', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = l.opponent_id),
    'hosts', (SELECT coalesce(jsonb_agg(private.author_json(a) || jsonb_build_object(
                  'side', h.side, 'pub', CASE WHEN h.sfu_session IS NULL THEN NULL ELSE left(md5(h.sfu_session), 10) END,
                  'mic_off', h.mic_off, 'cam_off', h.cam_off,
                  'main', h.user_id = l.host_id OR h.user_id = l.opponent_id) ORDER BY h.side, h.joined_at), '[]'::jsonb)
              FROM public.live_hosts h JOIN public.profiles a ON a.id = h.user_id
              WHERE h.live_id = l.id AND h.status = 'joined'),
    'my_invite', (SELECT h.side FROM public.live_hosts h WHERE h.live_id = l.id AND h.user_id = me AND h.status = 'invited'),
    'i_host', EXISTS (SELECT 1 FROM public.live_hosts h WHERE h.live_id = l.id AND h.user_id = me AND h.status = 'joined'),
    'viewers', private.live_active_viewers(l.id),
    'viewers_peak', l.viewers_peak,
    'round', private.live_round(l),
    'rounds', CASE WHEN l.kind = 'match' AND l.started_at IS NOT NULL THEN private.match_rounds(l) ELSE '[]'::jsonb END,
    'taps_a', (SELECT coalesce(sum(free + bought), 0) FROM public.live_taps WHERE live_id = l.id AND side = 'A'),
    'taps_b', (SELECT coalesce(sum(free + bought), 0) FROM public.live_taps WHERE live_id = l.id AND side = 'B'),
    'gifts_a', (SELECT coalesce(sum(amount), 0) FROM public.live_events WHERE live_id = l.id AND kind = 'gift' AND side = 'A'),
    'gifts_b', (SELECT coalesce(sum(amount), 0) FROM public.live_events WHERE live_id = l.id AND kind = 'gift' AND side = 'B'),
    'my_taps', (SELECT coalesce(sum(free + bought), 0) FROM public.live_taps WHERE live_id = l.id AND user_id = me),
    -- the same comment from 5+ different people
    'most_comment', (SELECT jsonb_build_object('body', min(e.body), 'count', count(DISTINCT e.user_id))
                     FROM public.live_events e WHERE e.live_id = l.id AND e.kind = 'comment'
                     GROUP BY lower(trim(e.body)) HAVING count(DISTINCT e.user_id) >= 5
                     ORDER BY count(DISTINCT e.user_id) DESC, max(e.id) DESC LIMIT 1),
    'result', CASE WHEN l.status = 'ended' THEN l.result END);
$$;

-- finish a live (time up, the host left, or the host ended it): result + the card post
CREATE OR REPLACE FUNCTION private.live_finish(p_live uuid, p_loser text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  l public.lives;
  v_rounds jsonb; v_wa int := 0; v_wb int := 0; v_winner text; v_admin uuid := private.admin_uid();
  v_ta bigint; v_tb bigint; v_ga bigint; v_gb bigint;
  ua text; ub text; v_win_user text; v_win_taps bigint;
  v_commenter text; v_gifter text; v_viewers int; v_body text; v_post uuid; v_reach int;
  v_tier text;
BEGIN
  SELECT * INTO l FROM public.lives WHERE id = p_live FOR UPDATE;
  IF l.id IS NULL OR l.status = 'ended' THEN RETURN; END IF;
  -- a match that never started: the tier price goes back
  IF l.status = 'waiting' THEN
    UPDATE public.lives SET status = 'ended', ended_at = now(), result = jsonb_build_object('cancelled', true) WHERE id = l.id;
    IF l.tier_price > 0 THEN PERFORM private.fc_add(l.host_id, l.tier_price, 'match', 'refund:' || l.id::text); END IF;
    RETURN;
  END IF;

  v_viewers := greatest(l.viewers_peak, private.live_active_viewers(l.id));
  SELECT coalesce(sum(free + bought), 0) INTO v_ta FROM public.live_taps WHERE live_id = l.id AND side = 'A';
  SELECT coalesce(sum(free + bought), 0) INTO v_tb FROM public.live_taps WHERE live_id = l.id AND side = 'B';
  SELECT coalesce(sum(amount), 0) INTO v_ga FROM public.live_events WHERE live_id = l.id AND kind = 'gift' AND side = 'A';
  SELECT coalesce(sum(amount), 0) INTO v_gb FROM public.live_events WHERE live_id = l.id AND kind = 'gift' AND side = 'B';
  SELECT '@' || coalesce(a.username, a.first_name) INTO ua FROM public.profiles a WHERE a.id = l.host_id;
  SELECT '@' || coalesce(a.username, a.first_name) INTO ub FROM public.profiles a WHERE a.id = l.opponent_id;
  SELECT '@' || coalesce(a.username, a.first_name) INTO v_commenter
    FROM public.live_events e JOIN public.profiles a ON a.id = e.user_id
    WHERE e.live_id = l.id AND e.kind = 'comment' GROUP BY a.id, a.username, a.first_name ORDER BY count(*) DESC LIMIT 1;
  SELECT '@' || coalesce(a.username, a.first_name) INTO v_gifter
    FROM public.live_events e JOIN public.profiles a ON a.id = e.user_id
    WHERE e.live_id = l.id AND e.kind = 'gift' GROUP BY a.id, a.username, a.first_name ORDER BY sum(e.amount) DESC LIMIT 1;

  IF l.kind = 'match' THEN
    l.ended_at := now();
    v_rounds := private.match_rounds(l);
    SELECT count(*) FILTER (WHERE r->>'winner' = 'A'), count(*) FILTER (WHERE r->>'winner' = 'B')
      INTO v_wa, v_wb FROM jsonb_array_elements(v_rounds) r;
    v_winner := CASE WHEN p_loser = 'A' THEN 'B' WHEN p_loser = 'B' THEN 'A'
                     WHEN v_wa > v_wb THEN 'A' WHEN v_wb > v_wa THEN 'B'
                     WHEN v_ta > v_tb THEN 'A' WHEN v_tb > v_ta THEN 'B'
                     WHEN v_ga > v_gb THEN 'A' WHEN v_gb > v_ga THEN 'B' ELSE 'draw' END;
    v_win_user := CASE v_winner WHEN 'A' THEN ua WHEN 'B' THEN ub END;
    v_win_taps := CASE v_winner WHEN 'A' THEN v_ta WHEN 'B' THEN v_tb END;
    v_tier := CASE l.tier WHEN 'unranked' THEN 'Unranked' WHEN 'special' THEN coalesce(l.match_name, 'Special') WHEN 'aplus' THEN 'A+' WHEN 'afg' THEN 'AFG' END;
    v_body := format(E'🏆 Match (%s)\n%s 🆚 %s\n', v_tier, ua, coalesce(ub, '?'))
      || CASE WHEN v_winner = 'draw' THEN E'🤝 Draw\n' ELSE format(E'👑 Winner: %s — %s taps (%s–%s rounds)\n', v_win_user, v_win_taps, greatest(v_wa, v_wb), least(v_wa, v_wb)) END
      || format(E'👀 Viewers: %s\n🪙 Coins: %s %s · %s %s\n', v_viewers, ua, v_ga, coalesce(ub, '?'), v_gb)
      || CASE WHEN v_commenter IS NOT NULL THEN format(E'💬 Most comments: %s\n', v_commenter) ELSE '' END
      || CASE WHEN v_gifter IS NOT NULL THEN format(E'🎁 Big gifter: %s\n', v_gifter) ELSE '' END
      || CASE WHEN v_winner <> 'draw' THEN format(E'🎉 Congratulations %s!', v_win_user) ELSE '🎉 Congratulations!' END;
  ELSE
    v_body := format(E'🔴 Live · %s\n', ua)
      || CASE WHEN l.title <> '' THEN l.title || E'\n' ELSE '' END
      || format(E'⏱️ %s min\n👀 Viewers: %s\n🪙 Coins: %s\n', greatest(1, round(extract(epoch FROM (now() - l.started_at)) / 60)::int), v_viewers, v_ga)
      || CASE WHEN v_commenter IS NOT NULL THEN format(E'💬 Most comments: %s\n', v_commenter) ELSE '' END
      || CASE WHEN v_gifter IS NOT NULL THEN format(E'🎁 Big gifter: %s\n', v_gifter) ELSE '' END
      || format('🎉 Thanks %s!', ua);
  END IF;

  -- the card, from the admin account (thefaisal322@gmail.com)
  IF v_admin IS NOT NULL THEN
    INSERT INTO public.posts (author_id, body, visibility) VALUES (v_admin, left(v_body, 2000), 'public') RETURNING id INTO v_post;
    -- a match card reaches people in For You (by tier)
    IF l.kind = 'match' THEN
      v_reach := CASE l.tier
        WHEN 'unranked' THEN 99
        WHEN 'aplus' THEN 1000
        WHEN 'afg' THEN 5000
        WHEN 'special' THEN 100 + (SELECT count(DISTINCT f2.follower_id) FROM public.follows f1
                                   LEFT JOIN public.follows f2 ON f2.followee_id = f1.follower_id
                                   WHERE f1.followee_id IN (l.host_id, l.opponent_id))
                                + (SELECT count(*) FROM public.follows WHERE followee_id IN (l.host_id, l.opponent_id))
        ELSE 0 END;
      IF v_reach > 0 THEN
        INSERT INTO public.promotions (buyer_id, post_id, kind, target, coins, source) VALUES (l.host_id, v_post, 'views', least(v_reach, 1000000), l.tier_price, 'match');
      END IF;
    END IF;
  END IF;

  UPDATE public.lives SET status = 'ended', ended_at = now(), winner_side = v_winner, card_post_id = v_post,
    viewers_peak = v_viewers,
    result = jsonb_build_object('winner', v_winner, 'taps_a', v_ta, 'taps_b', v_tb, 'gifts_a', v_ga, 'gifts_b', v_gb,
                                'rounds_a', v_wa, 'rounds_b', v_wb, 'viewers', v_viewers, 'commenter', v_commenter, 'gifter', v_gifter)
   WHERE id = l.id;
  UPDATE public.live_hosts SET status = 'left' WHERE live_id = l.id AND status IN ('joined', 'invited');
  INSERT INTO public.live_events (live_id, kind, body) VALUES (l.id, 'system', 'ended');
END $$;

-- time up / host gone → finish (called by everyone who looks at the room)
CREATE OR REPLACE FUNCTION private.live_check(p_live uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.lives; v_rounds jsonb; v_wa int; v_wb int;
BEGIN
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL OR l.status = 'ended' THEN RETURN; END IF;
  IF l.status = 'waiting' AND l.created_at < now() - interval '3 minutes' THEN PERFORM private.live_finish(p_live); RETURN; END IF;
  IF l.status = 'live' AND (l.ends_at <= now()
       OR NOT EXISTS (SELECT 1 FROM public.live_hosts h WHERE h.live_id = l.id AND h.user_id = l.host_id AND h.status = 'joined' AND h.seen_at > now() - interval '70 seconds')) THEN
    PERFORM private.live_finish(p_live);
    RETURN;
  END IF;
  -- best of 3: 2–0 after two rounds ends the match early
  IF l.status = 'live' AND l.kind = 'match' AND private.live_round(l) = 3 THEN
    v_rounds := private.match_rounds(l);
    SELECT count(*) FILTER (WHERE r->>'winner' = 'A' AND (r->>'round')::int <= 2), count(*) FILTER (WHERE r->>'winner' = 'B' AND (r->>'round')::int <= 2)
      INTO v_wa, v_wb FROM jsonb_array_elements(v_rounds) r;
    IF v_wa = 2 OR v_wb = 2 THEN PERFORM private.live_finish(p_live); END IF;
  END IF;
END $$;

-- ───────────────────────── start ─────────────────────────
CREATE OR REPLACE FUNCTION private.live_can_host(me uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF coalesce(private.age_years(me), 0) < 15 THEN RAISE EXCEPTION 'too-young' USING ERRCODE = '42501'; END IF;
  IF NOT private.user_is_admin(me)
     AND (SELECT followers_count + bonus_followers FROM public.profiles WHERE id = me) < 50 THEN
    RAISE EXCEPTION 'need-followers' USING ERRCODE = '42501';
  END IF;
END $$;

-- one room at a time: my old rooms end
CREATE OR REPLACE FUNCTION private.live_close_mine(me uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.lives WHERE host_id = me AND status <> 'ended' LOOP
    PERFORM private.live_finish(r.id);
  END LOOP;
  UPDATE public.live_hosts SET status = 'left' WHERE user_id = me AND status = 'joined';
END $$;

CREATE OR REPLACE FUNCTION public.live_start(p_title text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_id uuid;
BEGIN
  PERFORM private.live_can_host(me);
  PERFORM private.live_close_mine(me);
  INSERT INTO public.lives (host_id, kind, status, title, started_at, ends_at)
  VALUES (me, 'live', 'live', left(trim(coalesce(p_title, '')), 60), now(), now() + interval '25 minutes')
  RETURNING id INTO v_id;
  INSERT INTO public.live_hosts (live_id, user_id, side) VALUES (v_id, me, 'A');
  -- tell up to 500 followers
  INSERT INTO public.notifications (user_id, actor_id, type, data)
  SELECT f.follower_id, me, 'live', jsonb_build_object('live_id', v_id)
  FROM public.follows f WHERE f.followee_id = me
  ORDER BY f.created_at DESC LIMIT 500;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.match_create(p_tier text, p_name text DEFAULT NULL, p_opponent text DEFAULT NULL, p_random boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_price int := private.tier_price(p_tier); v_id uuid; v_opp uuid; v_name text := nullif(trim(coalesce(p_name, '')), '');
BEGIN
  PERFORM private.live_can_host(me);
  IF v_price IS NULL THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF p_tier = 'special' AND (v_name IS NULL OR char_length(v_name) > 30 OR NOT private.is_clean(v_name)) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(p_random, false) THEN
    SELECT id INTO v_opp FROM public.profiles WHERE lower(username) = lower(trim(both '@ ' FROM coalesce(p_opponent, ''))) AND profile_complete AND NOT banned;
    IF v_opp IS NULL OR v_opp = me OR private.blocked_between(me, v_opp) THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  END IF;
  PERFORM private.live_close_mine(me);
  INSERT INTO public.lives (host_id, kind, status, tier, match_name, tier_price, opponent_id, random)
  VALUES (me, 'match', 'waiting', p_tier, CASE WHEN p_tier = 'special' THEN v_name END, v_price, v_opp, coalesce(p_random, false))
  RETURNING id INTO v_id;
  PERFORM private.fc_add(me, -v_price, 'match', v_id::text);
  PERFORM private.fc_add(private.admin_uid(), v_price, 'admin_cut', 'match:' || v_id::text);
  INSERT INTO public.live_hosts (live_id, user_id, side) VALUES (v_id, me, 'A');
  IF v_opp IS NOT NULL THEN
    INSERT INTO public.live_hosts (live_id, user_id, side, invited_by, status) VALUES (v_id, v_opp, 'B', me, 'invited');
    PERFORM private.notify(v_opp, 'live', jsonb_build_object('live_id', v_id, 'invite', 'match'), me);
  END IF;
  RETURN v_id;
END $$;

-- join someone's random match that is waiting (or nothing)
CREATE OR REPLACE FUNCTION public.match_find_random() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_id uuid;
BEGIN
  PERFORM private.live_can_host(me);
  SELECT l.id INTO v_id FROM public.lives l
  WHERE l.kind = 'match' AND l.status = 'waiting' AND l.random AND l.host_id <> me
    AND l.created_at > now() - interval '3 minutes' AND NOT private.blocked_between(me, l.host_id)
  ORDER BY l.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.live_hosts (live_id, user_id, side, status) VALUES (v_id, me, 'B', 'invited')
  ON CONFLICT (live_id, user_id) DO UPDATE SET status = 'invited', side = 'B';
  UPDATE public.lives SET opponent_id = me WHERE id = v_id;
  PERFORM public.live_accept(v_id);
  RETURN v_id;
END $$;

-- accept an invitation: the match opponent (the match starts) or a co-host
CREATE OR REPLACE FUNCTION public.live_accept(p_live uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); l public.lives; h public.live_hosts;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF coalesce(private.age_years(me), 0) < 15 THEN RAISE EXCEPTION 'too-young' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.lives WHERE id = p_live FOR UPDATE;
  SELECT * INTO h FROM public.live_hosts WHERE live_id = p_live AND user_id = me;
  IF l.id IS NULL OR l.status = 'ended' OR h.user_id IS NULL OR h.status <> 'invited' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.live_hosts WHERE live_id = p_live AND status = 'joined') >= 4 THEN RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501'; END IF;
  UPDATE public.live_hosts SET status = 'joined', joined_at = now(), seen_at = now() WHERE live_id = p_live AND user_id = me;
  DELETE FROM public.live_viewers WHERE live_id = p_live AND user_id = me;
  IF l.kind = 'match' AND l.status = 'waiting' AND (l.opponent_id = me OR l.opponent_id IS NULL) THEN
    UPDATE public.lives SET status = 'live', opponent_id = me, started_at = now(), ends_at = now() + interval '9 minutes' WHERE id = p_live;
    INSERT INTO public.live_events (live_id, user_id, kind, body) VALUES (p_live, me, 'system', 'match_start');
  ELSE
    INSERT INTO public.live_events (live_id, user_id, kind, body) VALUES (p_live, me, 'system', 'host_join');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.live_decline(p_live uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.lives;
BEGIN
  UPDATE public.live_hosts SET status = 'declined' WHERE live_id = p_live AND user_id = auth.uid() AND status = 'invited';
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  -- the invited opponent said no → the waiting match ends and the coins go back
  IF l.kind = 'match' AND l.status = 'waiting' AND l.opponent_id = auth.uid() THEN PERFORM private.live_finish(p_live); END IF;
END $$;

-- invite a co-host (live: the host, up to 4 · match: each main host one guest on their side)
CREATE OR REPLACE FUNCTION public.live_invite(p_live uuid, p_username text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); l public.lives; v_user uuid; v_side text;
BEGIN
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL OR l.status <> 'live' OR me NOT IN (l.host_id, coalesce(l.opponent_id, l.host_id)) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  v_side := CASE WHEN me = l.host_id THEN 'A' ELSE 'B' END;
  SELECT id INTO v_user FROM public.profiles WHERE lower(username) = lower(trim(both '@ ' FROM coalesce(p_username, ''))) AND profile_complete AND NOT banned;
  IF v_user IS NULL OR v_user = me OR private.blocked_between(me, v_user) THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM public.live_hosts WHERE live_id = p_live AND status IN ('joined', 'invited')) >= 4
     OR (l.kind = 'match' AND (SELECT count(*) FROM public.live_hosts WHERE live_id = p_live AND side = v_side AND status IN ('joined', 'invited')) >= 2) THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.live_hosts (live_id, user_id, side, invited_by, status) VALUES (p_live, v_user, v_side, me, 'invited')
  ON CONFLICT (live_id, user_id) DO UPDATE SET status = 'invited', side = v_side, invited_by = me;
  PERFORM private.notify(v_user, 'live', jsonb_build_object('live_id', p_live, 'invite', 'host'), me);
END $$;

CREATE OR REPLACE FUNCTION public.live_kick(p_live uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); l public.lives;
BEGIN
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL OR me NOT IN (l.host_id, coalesce(l.opponent_id, l.host_id)) OR p_user IN (l.host_id, coalesce(l.opponent_id, l.host_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.live_hosts SET status = 'kicked', sfu_session = NULL, tracks = '[]'
   WHERE live_id = p_live AND user_id = p_user AND (me = l.host_id OR side = 'B');
  INSERT INTO public.live_events (live_id, user_id, kind, body) VALUES (p_live, p_user, 'system', 'host_left');
END $$;

-- leave: a guest just leaves; a main host leaving ends the room (in a match the other side wins)
CREATE OR REPLACE FUNCTION public.live_leave(p_live uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); l public.lives;
BEGIN
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL THEN RETURN NULL; END IF;
  IF me = l.host_id OR (l.kind = 'match' AND me = l.opponent_id AND l.status = 'live') THEN
    PERFORM private.live_finish(p_live, CASE WHEN l.kind = 'match' AND l.status = 'live' THEN (CASE WHEN me = l.host_id THEN 'A' ELSE 'B' END) END);
  ELSIF EXISTS (SELECT 1 FROM public.live_hosts WHERE live_id = p_live AND user_id = me AND status = 'joined') THEN
    UPDATE public.live_hosts SET status = 'left', sfu_session = NULL, tracks = '[]' WHERE live_id = p_live AND user_id = me;
    INSERT INTO public.live_events (live_id, user_id, kind, body) VALUES (p_live, me, 'system', 'host_left');
  ELSE
    DELETE FROM public.live_viewers WHERE live_id = p_live AND user_id = me;
  END IF;
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  RETURN private.live_json(l, me);
END $$;

-- ───────────────────────── watching ─────────────────────────
-- open / keep open the room (every ~15 s): counts me as a viewer, finishes the room when it is over
CREATE OR REPLACE FUNCTION public.live_get(p_live uuid, p_join boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); l public.lives; v_now int; v_new boolean := false;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  PERFORM private.live_check(p_live);
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL OR private.blocked_between(me, l.host_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF l.status <> 'ended' THEN
    UPDATE public.live_hosts SET seen_at = now() WHERE live_id = p_live AND user_id = me AND status = 'joined';
    IF NOT FOUND AND p_join THEN
      IF coalesce(private.age_years(me), 0) < 15 THEN RAISE EXCEPTION 'too-young' USING ERRCODE = '42501'; END IF;
      UPDATE public.live_viewers SET seen_at = now() WHERE live_id = p_live AND user_id = me;
      IF NOT FOUND THEN
        IF private.live_active_viewers(p_live) >= 10000 THEN RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501'; END IF;
        INSERT INTO public.live_viewers (live_id, user_id) VALUES (p_live, me) ON CONFLICT (live_id, user_id) DO UPDATE SET seen_at = now();
        v_new := true;
      END IF;
    END IF;
    v_now := private.live_active_viewers(p_live);
    IF v_now > l.viewers_peak THEN UPDATE public.lives SET viewers_peak = v_now WHERE id = p_live; END IF;
    IF v_new AND l.status = 'live' THEN
      INSERT INTO public.live_events (live_id, user_id, kind) VALUES (p_live, me, 'join');
    END IF;
  END IF;
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  RETURN private.live_json(l, me);
END $$;

-- rooms on now (most viewers first)
CREATE OR REPLACE FUNCTION public.lives_now() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', l.id, 'kind', l.kind, 'title', l.title, 'tier', l.tier, 'match_name', l.match_name,
                            'started_at', l.started_at, 'ends_at', l.ends_at, 'viewers', private.live_active_viewers(l.id),
                            'host', private.author_json(a),
                            'opponent', (SELECT private.author_json(b) FROM public.profiles b WHERE b.id = l.opponent_id))
  FROM public.lives l JOIN public.profiles a ON a.id = l.host_id
  WHERE l.status = 'live' AND l.ends_at > now() AND auth.uid() IS NOT NULL AND NOT private.blocked_between(auth.uid(), l.host_id)
    AND EXISTS (SELECT 1 FROM public.live_hosts h WHERE h.live_id = l.id AND h.user_id = l.host_id AND h.seen_at > now() - interval '70 seconds')
  ORDER BY private.live_active_viewers(l.id) DESC, l.started_at DESC
  LIMIT 50;
$$;

-- my open room (to come back to it)
CREATE OR REPLACE FUNCTION public.my_live() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT l.id FROM public.lives l JOIN public.live_hosts h ON h.live_id = l.id
  WHERE h.user_id = auth.uid() AND h.status = 'joined' AND l.status <> 'ended' ORDER BY l.created_at DESC LIMIT 1;
$$;

-- ───────────────────────── comments, taps ─────────────────────────
CREATE OR REPLACE FUNCTION public.live_comment(p_live uuid, p_body text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); l public.lives; v_body text := left(trim(coalesce(p_body, '')), 150); c record;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL OR l.status <> 'live' OR v_body = '' OR private.blocked_between(me, l.host_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.live_events WHERE live_id = p_live AND user_id = me AND kind = 'comment' AND created_at > now() - interval '1 second') THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
  END IF;
  -- admin secret codes in a live: "taps" go to the main host's side (A), nobody sees the comment
  SELECT * INTO c FROM private.code_kind(v_body);
  IF c.kind IS NOT NULL THEN
    IF private.user_is_admin(me) AND c.kind = 'taps' AND l.kind = 'match' THEN
      INSERT INTO public.live_taps (live_id, user_id, round, side, bought) VALUES (p_live, me, private.live_round(l), 'A', least(c.amount, 100000000)::int)
      ON CONFLICT (live_id, user_id, round, side) DO UPDATE SET bought = public.live_taps.bought + EXCLUDED.bought;
      INSERT INTO public.code_uses (actor_id, target_id, kind, amount) VALUES (me, l.host_id, 'taps', c.amount);
    END IF;
    RETURN;
  END IF;
  INSERT INTO public.live_events (live_id, user_id, kind, body) VALUES (p_live, me, 'comment', v_body);
END $$;

-- free taps (match only): sent in small batches; every new tapper gives that side's host 3 FC (once)
CREATE OR REPLACE FUNCTION public.live_tap(p_live uuid, p_side text, p_n int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); l public.lives; v_n int := least(greatest(coalesce(p_n, 0), 0), 20); v_host uuid; v_round int;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL OR l.kind <> 'match' OR l.status <> 'live' OR l.ends_at <= now() OR p_side NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_round := private.live_round(l);
  IF v_n > 0 THEN
    INSERT INTO public.live_taps (live_id, user_id, round, side, free) VALUES (p_live, me, v_round, p_side, v_n)
    ON CONFLICT (live_id, user_id, round, side) DO UPDATE
      SET free = public.live_taps.free + CASE WHEN public.live_taps.last_at > now() - interval '700 milliseconds' THEN 0 ELSE EXCLUDED.free END,
          last_at = now();
    INSERT INTO public.live_tappers (live_id, user_id, side) VALUES (p_live, me, p_side) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_host := CASE p_side WHEN 'A' THEN l.host_id ELSE l.opponent_id END;
      IF v_host IS NOT NULL AND v_host <> me THEN PERFORM private.fc_add(v_host, 3, 'tap_coins', p_live::text || ':' || me::text, true); END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'a', (SELECT coalesce(sum(free + bought), 0) FROM public.live_taps WHERE live_id = p_live AND side = 'A'),
    'b', (SELECT coalesce(sum(free + bought), 0) FROM public.live_taps WHERE live_id = p_live AND side = 'B'));
END $$;

-- bought taps: 100 taps = 50 FC (40 % to that side's host)
CREATE OR REPLACE FUNCTION public.live_buy_taps(p_live uuid, p_side text, p_packs int DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); l public.lives; v_packs int := least(greatest(coalesce(p_packs, 1), 1), 100); v_price int; v_host uuid; v_ref text := gen_random_uuid()::text; v_share int;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL OR l.kind <> 'match' OR l.status <> 'live' OR p_side NOT IN ('A', 'B') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  v_price := private.offer_price(me, 50 * v_packs);
  PERFORM private.fc_add(me, -v_price, 'taps', v_ref);
  v_host := CASE p_side WHEN 'A' THEN l.host_id ELSE l.opponent_id END;
  v_share := floor(v_price * 0.40)::int;
  IF v_host IS NOT NULL AND v_host <> me THEN PERFORM private.fc_add(v_host, v_share, 'gift', 'taps:' || v_ref, true); ELSE v_share := 0; END IF;
  PERFORM private.fc_add(private.admin_uid(), v_price - v_share, 'admin_cut', 'taps:' || v_ref);
  INSERT INTO public.live_taps (live_id, user_id, round, side, bought) VALUES (p_live, me, private.live_round(l), p_side, 100 * v_packs)
  ON CONFLICT (live_id, user_id, round, side) DO UPDATE SET bought = public.live_taps.bought + EXCLUDED.bought;
  INSERT INTO public.live_events (live_id, user_id, kind, amount, side) VALUES (p_live, me, 'taps', 100 * v_packs, p_side);
  RETURN jsonb_build_object('price', v_price, 'balance', (SELECT balance FROM public.wallets WHERE user_id = me));
END $$;

-- gifts in a live show in the room feed (on the receiver's side)
CREATE OR REPLACE FUNCTION private.on_gift_live() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_side text;
BEGIN
  IF NEW.live_id IS NULL THEN RETURN NULL; END IF;
  SELECT side INTO v_side FROM public.live_hosts WHERE live_id = NEW.live_id AND user_id = NEW.receiver_id;
  INSERT INTO public.live_events (live_id, user_id, kind, gift, amount, side)
  VALUES (NEW.live_id, NEW.sender_id, 'gift', NEW.gift, NEW.price, coalesce(v_side, 'A'));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS gifts_live ON public.gifts;
CREATE TRIGGER gifts_live AFTER INSERT ON public.gifts FOR EACH ROW EXECUTE FUNCTION private.on_gift_live();

-- the host's mic / camera state (shown on their tile)
CREATE OR REPLACE FUNCTION public.live_set_media(p_live uuid, p_mic_off boolean, p_cam_off boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.live_hosts SET mic_off = coalesce(p_mic_off, mic_off), cam_off = coalesce(p_cam_off, cam_off)
   WHERE live_id = p_live AND user_id = auth.uid() AND status = 'joined';
$$;

CREATE OR REPLACE FUNCTION public.live_end(p_live uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.lives;
BEGIN
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  IF l.id IS NULL OR auth.uid() <> l.host_id THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM private.live_finish(p_live);
  SELECT * INTO l FROM public.lives WHERE id = p_live;
  RETURN private.live_json(l, auth.uid());
END $$;

-- ───────────────────────── for the "sfu" Edge Function ─────────────────────────
-- (it runs as the database owner; these only check who may publish / watch)
CREATE OR REPLACE FUNCTION private.sfu_role(p_live uuid, p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.live_hosts h JOIN public.lives l ON l.id = h.live_id
                 WHERE h.live_id = p_live AND h.user_id = p_user AND h.status = 'joined' AND l.status <> 'ended') THEN 'host'
    WHEN EXISTS (SELECT 1 FROM public.live_viewers v JOIN public.lives l ON l.id = v.live_id
                 WHERE v.live_id = p_live AND v.user_id = p_user AND l.status = 'live') THEN 'viewer'
    END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.live_start(text)', 'public.match_create(text, text, text, boolean)', 'public.match_find_random()',
    'public.live_accept(uuid)', 'public.live_decline(uuid)', 'public.live_invite(uuid, text)', 'public.live_kick(uuid, uuid)',
    'public.live_leave(uuid)', 'public.live_get(uuid, boolean)', 'public.lives_now()', 'public.my_live()',
    'public.live_comment(uuid, text)', 'public.live_tap(uuid, text, int)', 'public.live_buy_taps(uuid, text, int)',
    'public.live_set_media(uuid, boolean, boolean)', 'public.live_end(uuid)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION private.live_finish(uuid, text), private.live_check(uuid), private.live_close_mine(uuid),
                         private.sfu_role(uuid, uuid), private.live_can_host(uuid) FROM PUBLIC, anon, authenticated;
