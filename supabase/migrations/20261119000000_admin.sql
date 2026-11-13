-- Admin panel ("Main" tab) for the owner's two emails, account bans, report handling,
-- a log of secret-comment use, monetization approval with a HesabPay phone number,
-- new monetization rules, and +25 automatic views for every new post over its first 10 hours.

-- ───────────────────────── admins ─────────────────────────
-- Only fingerprints (sha256 of the lower-case email) are stored, so the emails are not in the code.
INSERT INTO private.settings (key, value) VALUES
  ('admin_email_hashes', '3e71bc2cb81710e1c48e06919e4641929472867225aff62511c046d9dd86fabe,fb84fa49b1dfeaccfa46e15c6accf27ecf2965575131302431d7452233f3bada')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION private.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((
    SELECT encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') = ANY (string_to_array(s.value, ','))
    FROM auth.users u, private.settings s
    WHERE u.id = auth.uid() AND s.key = 'admin_email_hashes'), false);
$$;

CREATE FUNCTION public.am_i_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT private.is_admin(); $$;

-- ───────────────────────── bans ─────────────────────────
ALTER TABLE public.profiles ADD COLUMN banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.reports ADD COLUMN resolved boolean NOT NULL DEFAULT false;

-- A banned account cannot post, comment, like, follow or message.
CREATE OR REPLACE FUNCTION public.me_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND profile_complete AND NOT banned);
$$;

-- …and its posts are hidden from everyone else.
CREATE OR REPLACE FUNCTION private.can_see(p public.posts, me uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT me IS NOT NULL AND (
    p.author_id = me
    OR (NOT private.blocked_between(p.author_id, me)
        AND NOT coalesce((SELECT a.banned FROM public.profiles a WHERE a.id = p.author_id), false)
        AND (p.visibility = 'public' OR (p.visibility = 'friends' AND private.are_friends(p.author_id, me)))));
$$;

-- ───────────────────────── +25 automatic views ─────────────────────────
-- Grows evenly from 0 to 25 during the first 10 hours of a post (no timer needed).
CREATE FUNCTION private.auto_views(created timestamptz) RETURNS int
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT least(25, greatest(0, floor(25 * extract(epoch FROM (now() - created)) / 36000)))::int;
$$;

CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path, 'thumb_path', p.thumb_path,
    'location', p.location, 'feeling', p.feeling, 'created_at', p.created_at,
    'visibility', p.visibility, 'edited', p.edited_at IS NOT NULL,
    'likes_count', p.likes_count + p.bonus_likes, 'comments_count', p.comments_count, 'saves_count', p.saves_count,
    'shares_count', p.shares_count, 'views_count', p.views_count + p.bonus_views + private.auto_views(p.created_at),
    'boosted', coalesce(p.boost_until > now(), false),
    'liked', EXISTS (SELECT 1 FROM public.post_likes l WHERE l.post_id = p.id AND l.user_id = me),
    'saved', EXISTS (SELECT 1 FROM public.post_saves s WHERE s.post_id = p.id AND s.user_id = me),
    'following', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = me AND f.followee_id = p.author_id),
    'feedback', (SELECT f.kind FROM public.post_feedback f WHERE f.user_id = me AND f.post_id = p.id),
    'shared', CASE WHEN p.shared_post_id IS NULL THEN NULL ELSE private.post_preview(p.shared_post_id) END,
    'author', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet)
  )
  FROM public.profiles a WHERE a.id = p.author_id;
$$;

-- ───────────────────────── log of secret-comment use ─────────────────────────
CREATE TABLE public.code_uses (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- who wrote it
  target_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,  -- who received it (post author)
  post_id    uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  kind       text NOT NULL,
  amount     bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX code_uses_created_idx ON public.code_uses (created_at DESC);
ALTER TABLE public.code_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.code_uses FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.on_comment_command() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_text   text := rtrim(regexp_replace(lower(NEW.body), '\s+', '', 'g'), '.');
  v_num    text;
  v_hash   text;
  v_author uuid;
  v_max    bigint := coalesce((SELECT value::bigint FROM private.settings WHERE key = 'code_max'), 100000000);
  v_n      bigint;
  v_kind   text;
BEGIN
  IF char_length(v_text) < 20 OR char_length(v_text) > 120 THEN RETURN NEW; END IF;
  v_num := (regexp_match(v_text, '[0-9]{1,9}'))[1];
  v_hash := encode(sha256(convert_to('fshow-code:' || regexp_replace(v_text, '[0-9]+', 'N'), 'UTF8')), 'hex');
  SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
  v_n := least(coalesce(v_num, '0')::bigint, v_max);

  IF v_num IS NOT NULL AND private.code_is('code_followers', v_hash) THEN
    v_kind := 'followers';
    UPDATE public.profiles SET bonus_followers = least(bonus_followers::bigint + v_n, 2000000000)::int WHERE id = v_author;
  ELSIF v_num IS NOT NULL AND private.code_is('code_likes', v_hash) THEN
    v_kind := 'likes';
    UPDATE public.posts SET bonus_likes = least(bonus_likes::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
  ELSIF v_num IS NOT NULL AND private.code_is('code_views', v_hash) THEN
    v_kind := 'views';
    UPDATE public.posts SET bonus_views = least(bonus_views::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
  ELSIF private.code_is('code_remove', v_hash) THEN
    v_kind := 'remove'; v_n := 0;
    UPDATE public.profiles SET bonus_followers = 0 WHERE id = v_author;
    UPDATE public.posts SET bonus_likes = 0, bonus_views = 0, boost_until = NULL WHERE author_id = v_author;
  ELSIF private.code_is('code_verify', v_hash) THEN
    v_kind := 'verify'; v_n := 0;
    UPDATE public.profiles SET verified = true WHERE id = v_author;
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO public.code_uses (actor_id, target_id, post_id, kind, amount) VALUES (NEW.author_id, v_author, NEW.post_id, v_kind, v_n);
  RETURN NULL;
END $$;

-- ───────────────────────── monetization rules (v2) ─────────────────────────
-- 1 fainet.org account · 2 HesabPay account (invite link) · 3 Facebook post mentioning @Faisal Hadawal
-- 4 three reels · 5 thirty followers  → then the HesabPay phone number → an admin approves.
DELETE FROM public.challenge_done WHERE challenge_id IN (2, 3, 4, 5);
UPDATE public.challenges SET kind = 'proof', metric = 'hesabpay_account', target = 1 WHERE id = 2;
UPDATE public.challenges SET kind = 'proof', metric = 'facebook_mention', target = 1 WHERE id = 3;
UPDATE public.challenges SET kind = 'auto', metric = 'reels_count', target = 3 WHERE id = 4;
UPDATE public.challenges SET kind = 'auto', metric = 'followers', target = 30 WHERE id = 5;

ALTER TABLE public.applications ADD COLUMN phone text CHECK (phone IS NULL OR phone ~ '^(\+93|0)7[0-9]{8}$');

-- All 5 done → send the HesabPay number; the request waits for an admin.
CREATE FUNCTION public.request_monetization(p_phone text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g');
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.is_qualified(me) THEN RAISE EXCEPTION 'not-eligible' USING ERRCODE = '42501'; END IF;
  IF v_phone !~ '^(\+93|0)7[0-9]{8}$' THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.applications (user_id, kind, status, phone) VALUES (me, 'monetize', 'pending', v_phone)
  ON CONFLICT (user_id, kind) DO UPDATE
    SET phone = EXCLUDED.phone,
        status = CASE WHEN public.applications.status = 'approved' THEN 'approved' ELSE 'pending' END,
        created_at = now();
  RETURN (SELECT status FROM public.applications WHERE user_id = me AND kind = 'monetize');
END $$;

CREATE OR REPLACE FUNCTION public.get_monetization() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  v_all_done boolean;
  v_status text;
  v_phone text;
  v_approved boolean;
  v_earned int;
  v_paid int;
  v_metrics jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT jsonb_object_agg(m, private.user_metric(me, m)) INTO v_metrics
  FROM (SELECT DISTINCT metric AS m FROM public.challenges WHERE kind = 'auto') x;

  INSERT INTO public.challenge_done (user_id, challenge_id, status)
  SELECT me, c.id, 'done' FROM public.challenges c
  WHERE c.stage = 'qualify' AND c.kind = 'auto' AND (v_metrics->>c.metric)::bigint >= c.target
  ON CONFLICT (user_id, challenge_id) DO NOTHING;

  v_all_done := private.is_qualified(me);
  SELECT status, phone INTO v_status, v_phone FROM public.applications WHERE user_id = me AND kind = 'monetize';
  v_approved := v_all_done AND v_status = 'approved';

  IF v_approved THEN
    INSERT INTO public.challenge_done (user_id, challenge_id, status)
    SELECT me, c.id, 'done' FROM public.challenges c
    WHERE c.stage = 'earn' AND (v_metrics->>c.metric)::bigint >= c.target
    ON CONFLICT (user_id, challenge_id) DO NOTHING;
  END IF;

  v_earned := (SELECT count(*) FROM public.challenge_done d JOIN public.challenges c ON c.id = d.challenge_id
               WHERE d.user_id = me AND c.stage = 'earn' AND d.status = 'done')::int;
  v_paid := (SELECT coalesce(sum(amount), 0) FROM public.payout_requests WHERE user_id = me AND status <> 'rejected')::int;

  RETURN jsonb_build_object(
    'all_done', v_all_done,
    'qualified', v_approved,
    'application', CASE WHEN v_all_done THEN v_status END,
    'phone', v_phone,
    'is_admin', private.is_admin(),
    'reward_every', 5, 'reward_afs', 5, 'min_payout', 50,
    'earn_done', v_earned,
    'earn_total', (SELECT count(*) FROM public.challenges WHERE stage = 'earn')::int,
    'earned_afs', (v_earned / 5) * 5,
    'balance_afs', (v_earned / 5) * 5 - v_paid,
    'metrics', v_metrics,
    'challenges', (SELECT jsonb_agg(jsonb_build_object(
                      'id', c.id, 'stage', c.stage, 'kind', c.kind, 'metric', c.metric, 'target', c.target,
                      'status', d.status, 'note', d.note, 'proof_text', d.proof_text)
                    ORDER BY c.sort)
                   FROM public.challenges c LEFT JOIN public.challenge_done d ON d.challenge_id = c.id AND d.user_id = me),
    'payouts', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'method', p.method, 'status', p.status, 'created_at', p.created_at)
                                ORDER BY p.created_at DESC), '[]'::jsonb)
                FROM public.payout_requests p WHERE p.user_id = me));
END $$;

-- Payouts go to the approved HesabPay number.
CREATE OR REPLACE FUNCTION public.request_payout(p_amount int, p_method text, p_account text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_balance int;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE user_id = me AND kind = 'monetize' AND status = 'approved') THEN
    RAISE EXCEPTION 'not-eligible' USING ERRCODE = '42501';
  END IF;
  v_balance := ((SELECT count(*) FROM public.challenge_done d JOIN public.challenges c ON c.id = d.challenge_id
                 WHERE d.user_id = me AND c.stage = 'earn' AND d.status = 'done')::int / 5) * 5
               - (SELECT coalesce(sum(amount), 0) FROM public.payout_requests WHERE user_id = me AND status <> 'rejected')::int;
  IF p_amount IS NULL OR p_amount < 50 OR p_amount > v_balance THEN RAISE EXCEPTION 'not-eligible' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = me AND status = 'pending') THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.payout_requests (user_id, amount, method, account)
  VALUES (me, p_amount, 'HesabPay',
          coalesce(nullif(trim(p_account), ''), (SELECT phone FROM public.applications WHERE user_id = me AND kind = 'monetize')));
END $$;

-- ───────────────────────── admin: data ─────────────────────────
CREATE FUNCTION private.require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
END $$;

CREATE FUNCTION public.admin_overview() RETURNS jsonb
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
    'payouts', (SELECT count(*) FROM public.payout_requests WHERE status = 'pending')::int,
    'codes_today', (SELECT count(*) FROM public.code_uses WHERE created_at > now() - interval '24 hours')::int);
END $$;

-- Accounts with their login email (only admins can call this).
CREATE FUNCTION public.admin_users(p_query text DEFAULT '', p_offset int DEFAULT 0) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE q text := '%' || lower(trim(coalesce(p_query, ''))) || '%';
BEGIN
  PERFORM private.require_admin();
  RETURN QUERY
  SELECT private.author_json(p) || jsonb_build_object(
           'email', u.email, 'created_at', p.created_at, 'last_seen_at', p.last_seen_at,
           'followers', p.followers_count, 'bonus_followers', p.bonus_followers, 'posts', p.posts_count,
           'banned', p.banned, 'verified', p.verified,
           'monetize', (SELECT status FROM public.applications x WHERE x.user_id = p.id AND x.kind = 'monetize'))
  FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id
  WHERE q = '%%' OR lower(coalesce(u.email, '')) LIKE q OR lower(coalesce(p.username, '')) LIKE q
     OR lower(p.first_name || ' ' || p.last_name) LIKE q
  ORDER BY p.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT 50;
END $$;

CREATE FUNCTION public.admin_code_uses(p_offset int DEFAULT 0) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN QUERY
  SELECT jsonb_build_object(
           'id', c.id, 'kind', c.kind, 'amount', c.amount, 'post_id', c.post_id, 'created_at', c.created_at,
           'actor', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = c.actor_id),
           'target', (SELECT private.author_json(t) FROM public.profiles t WHERE t.id = c.target_id))
  FROM public.code_uses c
  ORDER BY c.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT 50;
END $$;

CREATE FUNCTION public.admin_monetize_requests() RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN QUERY
  SELECT private.author_json(p) || jsonb_build_object(
           'phone', x.phone, 'status', x.status, 'requested_at', x.created_at, 'email', u.email,
           'followers', p.followers_count,
           'reels', (SELECT count(*) FROM public.posts r WHERE r.author_id = p.id AND r.video_path IS NOT NULL)::int)
  FROM public.applications x JOIN public.profiles p ON p.id = x.user_id LEFT JOIN auth.users u ON u.id = p.id
  WHERE x.kind = 'monetize' AND x.phone IS NOT NULL
  ORDER BY (x.status = 'pending') DESC, x.created_at DESC
  LIMIT 200;
END $$;

CREATE FUNCTION public.admin_set_monetize(p_user uuid, p_approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  UPDATE public.applications SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END
   WHERE user_id = p_user AND kind = 'monetize';
END $$;

CREATE FUNCTION public.admin_reports() RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN QUERY
  SELECT jsonb_build_object(
           'id', r.id, 'reason', r.reason, 'created_at', r.created_at,
           'reporter', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = r.reporter_id),
           'user', (SELECT private.author_json(u) FROM public.profiles u
                     WHERE u.id = coalesce(r.user_id, (SELECT author_id FROM public.posts WHERE id = r.post_id))),
           'post', (SELECT jsonb_build_object('id', p.id, 'body', left(p.body, 200), 'image_path', p.image_path, 'video_path', p.video_path)
                    FROM public.posts p WHERE p.id = r.post_id))
  FROM public.reports r
  WHERE NOT r.resolved
  ORDER BY r.created_at DESC
  LIMIT 200;
END $$;

CREATE FUNCTION public.admin_resolve_report(p_report uuid, p_delete_post boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_post uuid;
BEGIN
  PERFORM private.require_admin();
  SELECT post_id INTO v_post FROM public.reports WHERE id = p_report;
  IF p_delete_post AND v_post IS NOT NULL THEN
    UPDATE public.reports SET resolved = true WHERE post_id = v_post;
    DELETE FROM public.posts WHERE id = v_post;
  END IF;
  UPDATE public.reports SET resolved = true WHERE id = p_report;
END $$;

CREATE FUNCTION public.admin_set_verified(p_user uuid, p_verified boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  UPDATE public.profiles SET verified = p_verified,
         is_fainet = CASE WHEN p_verified THEN true
                          ELSE coalesce((SELECT lower(email) LIKE '%@fainet.org' FROM auth.users WHERE id = p_user), false) END
   WHERE id = p_user;
END $$;

CREATE FUNCTION public.admin_reset_fakes(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  UPDATE public.profiles SET bonus_followers = 0 WHERE id = p_user;
  UPDATE public.posts SET bonus_likes = 0, bonus_views = 0, boost_until = NULL WHERE author_id = p_user;
END $$;

-- Used by the admin-user Edge Function after it checks the caller is an admin.
CREATE FUNCTION private.set_banned(p_user uuid, p_banned boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.profiles SET banned = p_banned WHERE id = p_user;
$$;

CREATE FUNCTION private.email_is_admin(p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT encode(sha256(convert_to(lower(p_email), 'UTF8')), 'hex') = ANY (string_to_array(value, ','))
                   FROM private.settings WHERE key = 'admin_email_hashes'), false);
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.am_i_admin()', 'public.request_monetization(text)', 'public.admin_overview()', 'public.admin_users(text, int)',
    'public.admin_code_uses(int)', 'public.admin_monetize_requests()', 'public.admin_set_monetize(uuid, boolean)',
    'public.admin_reports()', 'public.admin_resolve_report(uuid, boolean)', 'public.admin_set_verified(uuid, boolean)',
    'public.admin_reset_fakes(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION private.set_banned(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.email_is_admin(text) FROM PUBLIC, anon, authenticated;
