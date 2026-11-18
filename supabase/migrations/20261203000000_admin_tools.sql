-- Admin tools
--   1. Secret codes work only for the admin accounts (anyone else: the comment just disappears, nothing happens).
--      New codes: plays, taps (= likes on a post; live taps in a live), shares, saves — same pattern, any number.
--   2. Reports: Dismiss · Warning (the person is told, the post is deleted) · Ban account (app → admin-user function)
--   3. Profile notice: the admin writes a short coloured message for everyone or one @username;
--      for 24 hours it shows in that person's own profile cover (only they see it); optional push.
--   4. Cloudflare space alert for the admins (from the "Videos to Cloudflare" workflow).

-- 1 ───────────────────────── codes ─────────────────────────
INSERT INTO private.settings (key, value) VALUES
  ('code_plays',  '993c6389f964ceab491b3f78d89099ebf432f0dde695a3c9b9b81c39488a4a56,6ad5e46a71ce56fd68aa191b3259a08e3ccc9ffc927a914f2c9f99d201283c91'),
  ('code_taps',   '5f9185e814303e87546af0a09cc3eac6f96bd68871e07a0dafcb01071b0348f3,9dd4ae7d0d394f8aa0aa64b3a2e30344fc597f7ddd5664842f82392664bdc84b'),
  ('code_shares', 'eeaefd0f8f750ec3a1874eb2998007b330c067c056a0796c11836dd38570b5c1,01ece4fa1ec4b2bce8f2b259d26f315468c37b1c14eb9bb4a3abbdd62ba2cb70'),
  ('code_saves',  '5ae176c3b5cf19836da285c4df1c98598b7834701e58c927b943c32167a3fbf9,0b16f3455e31e11f709b16b75e948edade13904afacfde398dad97dea5e948f7')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

/** which secret code a text is (NULL = none) and its number */
CREATE OR REPLACE FUNCTION private.code_kind(p_body text, OUT kind text, OUT amount bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_text text := rtrim(regexp_replace(lower(coalesce(p_body, '')), '\s+', '', 'g'), '.');
  v_num  text;
  v_hash text;
  v_max  bigint := coalesce((SELECT value::bigint FROM private.settings WHERE key = 'code_max'), 100000000);
BEGIN
  kind := NULL; amount := 0;
  IF char_length(v_text) < 20 OR char_length(v_text) > 120 THEN RETURN; END IF;
  v_num := (regexp_match(v_text, '[0-9]{1,9}'))[1];
  v_hash := encode(sha256(convert_to('fshow-code:' || regexp_replace(v_text, '[0-9]+', 'N'), 'UTF8')), 'hex');
  amount := least(coalesce(v_num, '0')::bigint, v_max);
  IF v_num IS NOT NULL THEN
    kind := CASE
      WHEN private.code_is('code_followers', v_hash) THEN 'followers'
      WHEN private.code_is('code_likes', v_hash) THEN 'likes'
      WHEN private.code_is('code_views', v_hash) THEN 'views'
      WHEN private.code_is('code_plays', v_hash) THEN 'plays'
      WHEN private.code_is('code_taps', v_hash) THEN 'taps'
      WHEN private.code_is('code_shares', v_hash) THEN 'shares'
      WHEN private.code_is('code_saves', v_hash) THEN 'saves' END;
  END IF;
  IF kind IS NULL THEN
    amount := 0;
    kind := CASE WHEN private.code_is('code_remove', v_hash) THEN 'remove'
                 WHEN private.code_is('code_verify', v_hash) THEN 'verify' END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.on_comment_command() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c record;
  v_author uuid;
  v_n bigint;
BEGIN
  SELECT * INTO c FROM private.code_kind(NEW.body);
  IF c.kind IS NULL THEN RETURN NEW; END IF;
  -- only the admins: for anyone else the code does nothing (and is not shown to people)
  IF NOT private.user_is_admin(NEW.author_id) THEN RETURN NULL; END IF;
  SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
  v_n := c.amount;
  CASE c.kind
    WHEN 'followers' THEN UPDATE public.profiles SET bonus_followers = least(bonus_followers::bigint + v_n, 2000000000)::int WHERE id = v_author;
    WHEN 'likes', 'taps' THEN UPDATE public.posts SET bonus_likes = least(bonus_likes::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    WHEN 'views' THEN UPDATE public.posts SET bonus_views = least(bonus_views::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    WHEN 'plays' THEN UPDATE public.posts SET bonus_plays = least(bonus_plays::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    WHEN 'shares' THEN UPDATE public.posts SET bonus_shares = least(bonus_shares::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    WHEN 'saves' THEN UPDATE public.posts SET bonus_saves = least(bonus_saves::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    WHEN 'remove' THEN
      UPDATE public.profiles SET bonus_followers = 0 WHERE id = v_author;
      UPDATE public.posts SET bonus_likes = 0, bonus_views = 0, bonus_plays = 0, bonus_shares = 0, bonus_saves = 0, boost_until = NULL WHERE author_id = v_author;
    WHEN 'verify' THEN UPDATE public.profiles SET verified = true WHERE id = v_author;
  END CASE;
  INSERT INTO public.code_uses (actor_id, target_id, post_id, kind, amount) VALUES (NEW.author_id, v_author, NEW.post_id, c.kind, v_n);
  RETURN NULL;
END $$;

-- "plays" also count in the monetization challenge for reel plays
CREATE OR REPLACE FUNCTION public.admin_reset_fakes(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  UPDATE public.profiles SET bonus_followers = 0 WHERE id = p_user;
  UPDATE public.posts SET bonus_likes = 0, bonus_views = 0, bonus_plays = 0, bonus_shares = 0, bonus_saves = 0, boost_until = NULL WHERE author_id = p_user;
END $$;

-- 2 ───────────────────────── reports: warning ─────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS warnings int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.admin_reports() RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN QUERY
  SELECT jsonb_build_object(
           'id', r.id, 'reason', r.reason, 'created_at', r.created_at,
           'reporter', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = r.reporter_id),
           'user', (SELECT private.author_json(u) || jsonb_build_object('warnings', u.warnings, 'banned', u.banned) FROM public.profiles u
                     WHERE u.id = coalesce(r.user_id, (SELECT author_id FROM public.posts WHERE id = r.post_id))),
           'post', (SELECT jsonb_build_object('id', p.id, 'body', left(p.body, 200), 'image_path', p.image_path, 'video_path', p.video_path)
                    FROM public.posts p WHERE p.id = r.post_id))
  FROM public.reports r
  WHERE NOT r.resolved
  ORDER BY r.created_at DESC
  LIMIT 200;
END $$;

-- Warning: the person gets a notification with the reason, the reported post is deleted
CREATE OR REPLACE FUNCTION public.admin_warn(p_report uuid, p_text text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.reports; v_user uuid; v_body text;
BEGIN
  PERFORM private.require_admin();
  SELECT * INTO r FROM public.reports WHERE id = p_report;
  IF r.id IS NULL THEN RETURN; END IF;
  v_user := coalesce(r.user_id, (SELECT author_id FROM public.posts WHERE id = r.post_id));
  SELECT left(body, 80) INTO v_body FROM public.posts WHERE id = r.post_id;
  UPDATE public.reports SET resolved = true WHERE id = p_report OR (r.post_id IS NOT NULL AND post_id = r.post_id);
  IF r.post_id IS NOT NULL THEN DELETE FROM public.posts WHERE id = r.post_id; END IF;
  IF v_user IS NOT NULL THEN
    UPDATE public.profiles SET warnings = warnings + 1 WHERE id = v_user;
    PERFORM private.notify(v_user, 'warning',
      jsonb_build_object('text', left(coalesce(nullif(trim(p_text), ''), r.reason), 300), 'post', v_body));
  END IF;
END $$;

-- 3 ───────────────────────── profile notices ─────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_notices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,   -- NULL = everyone
  body       text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 300),
  color      text NOT NULL DEFAULT '#E0218A' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS profile_notices_target_idx ON public.profile_notices (target_id, expires_at DESC);
ALTER TABLE public.profile_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_notices FROM anon, authenticated;

-- p_to: '' / 'all' = everyone, else a @username
CREATE OR REPLACE FUNCTION public.admin_send_notice(p_to text, p_body text, p_color text DEFAULT '#E0218A', p_notify boolean DEFAULT false) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_target uuid; v_to text := lower(trim(both '@ ' FROM coalesce(p_to, ''))); v_n int := 0; v_body text := trim(coalesce(p_body, ''));
BEGIN
  PERFORM private.require_admin();
  IF char_length(v_body) < 1 OR char_length(v_body) > 300 OR coalesce(p_color, '') !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF v_to NOT IN ('', 'all') THEN
    SELECT id INTO v_target FROM public.profiles WHERE lower(username) = v_to;
    IF v_target IS NULL THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO public.profile_notices (target_id, body, color, created_by) VALUES (v_target, v_body, p_color, auth.uid());
  IF p_notify THEN
    INSERT INTO public.notifications (user_id, actor_id, type, data)
    SELECT p.id, coalesce(private.admin_uid(), auth.uid()), 'notice', jsonb_build_object('text', left(v_body, 300))
    FROM public.profiles p
    WHERE p.profile_complete AND NOT p.banned AND (v_target IS NULL OR p.id = v_target);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  RETURN v_n;
END $$;

-- the newest notice for me in the last 24 hours (shown only on my own profile)
CREATE OR REPLACE FUNCTION public.my_notice() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', n.id, 'body', n.body, 'color', n.color, 'created_at', n.created_at, 'expires_at', n.expires_at)
  FROM public.profile_notices n
  WHERE (n.target_id = auth.uid() OR n.target_id IS NULL) AND n.expires_at > now() AND auth.uid() IS NOT NULL
  ORDER BY n.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.admin_notices() RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN QUERY
  SELECT jsonb_build_object('id', n.id, 'body', n.body, 'color', n.color, 'created_at', n.created_at, 'expires_at', n.expires_at,
                            'to', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = n.target_id))
  FROM public.profile_notices n WHERE n.expires_at > now() ORDER BY n.created_at DESC LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION public.admin_delete_notice(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  DELETE FROM public.profile_notices WHERE id = p_id;
END $$;

-- 4 ───────────────────────── overview + Cloudflare space ─────────────────────────
CREATE OR REPLACE FUNCTION public.admin_overview() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN jsonb_build_object(
    'users', (SELECT count(*) FROM public.profiles)::int,
    'users_today', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '24 hours')::int,
    'online', (SELECT count(*) FROM public.profiles WHERE last_seen_at > now() - interval '2 minutes')::int,
    'posts', (SELECT count(*) FROM public.posts WHERE video_path IS NULL)::int,
    'reels', (SELECT count(*) FROM public.posts WHERE video_path IS NOT NULL)::int,
    'banned', (SELECT count(*) FROM public.profiles WHERE banned)::int,
    'reports', (SELECT count(*) FROM public.reports WHERE NOT resolved)::int,
    'proofs', (SELECT count(*) FROM public.challenge_done WHERE status = 'pending')::int,
    'monetize', (SELECT count(*) FROM public.applications WHERE kind = 'monetize' AND status = 'pending' AND phone IS NOT NULL)::int,
    'payouts', (SELECT count(*) FROM public.fc_payouts WHERE status = 'pending')::int
               + (SELECT count(*) FROM public.payout_requests WHERE status = 'pending')::int,
    'coins', (SELECT count(*) FROM public.fc_purchases WHERE status = 'pending')::int,
    'codes_today', (SELECT count(*) FROM public.code_uses WHERE created_at > now() - interval '24 hours')::int,
    'cdn_gb', round((SELECT coalesce(sum(size), 0) FROM public.media_cdn) * 2.2 / 1e9, 1));
END $$;

-- the workflow calls this near the 1000 GB free limit (once a day at most); the app keeps working
CREATE OR REPLACE FUNCTION public.admin_space_alert(p_gb int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT x.id FROM auth.users x JOIN public.profiles p ON p.id = x.id WHERE private.user_is_admin(x.id) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = r.id AND type = 'notice' AND data ? 'cdn_gb' AND created_at > now() - interval '24 hours') THEN
      PERFORM private.notify(r.id, 'notice', jsonb_build_object('text', format('☁️ Cloudflare: ~%s GB of 1000 GB used', p_gb), 'cdn_gb', p_gb), r.id);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.admin_space_alert(int) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.admin_space_alert(int) TO service_role;
  END IF;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_reports()', 'public.admin_warn(uuid, text)', 'public.admin_send_notice(text, text, text, boolean)',
    'public.my_notice()', 'public.admin_notices()', 'public.admin_delete_notice(uuid)', 'public.admin_overview()',
    'public.admin_reset_fakes(uuid)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION private.code_kind(text) FROM PUBLIC, anon, authenticated;
