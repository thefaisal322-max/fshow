-- Monetization with challenges, money in Afghani (AFS / ؋).
--   Stage 1 "qualify": 5 challenges. Two need proof (screenshot / email) that an admin checks,
--                      three are checked automatically. All 5 done → the account is monetized.
--   Stage 2 "earn":    100 challenges, checked automatically from REAL numbers (code bonuses do not count).
--                      Every 5 finished challenges = 5 AFS. Money can be requested (min 50 AFS).
-- Admins = accounts whose login email ends with @fainet.org.

CREATE TABLE public.challenges (
  id     int PRIMARY KEY,
  stage  text NOT NULL CHECK (stage IN ('qualify', 'earn')),
  kind   text NOT NULL CHECK (kind IN ('proof', 'auto')),
  metric text NOT NULL,
  target int NOT NULL DEFAULT 1 CHECK (target > 0),
  sort   int NOT NULL
);
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.challenges FROM anon, authenticated;
CREATE POLICY "read challenges" ON public.challenges FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.challenges TO authenticated;

INSERT INTO public.challenges (id, stage, kind, metric, target, sort) VALUES
  (1, 'qualify', 'proof', 'fainet_account', 1, 1),
  (2, 'qualify', 'proof', 'facebook_mention', 1, 2),
  (3, 'qualify', 'auto', 'profile_ready', 1, 3),
  (4, 'qualify', 'auto', 'reels_count', 1, 4),
  (5, 'qualify', 'auto', 'followers', 10, 5),
  (101, 'earn', 'auto', 'post_views', 100, 101),
  (102, 'earn', 'auto', 'reel_plays', 50, 102),
  (103, 'earn', 'auto', 'followers', 25, 103),
  (104, 'earn', 'auto', 'likes_total', 50, 104),
  (105, 'earn', 'auto', 'posts_count', 3, 105),
  (106, 'earn', 'auto', 'reels_count', 2, 106),
  (107, 'earn', 'auto', 'comments_received', 10, 107),
  (108, 'earn', 'auto', 'shares_total', 5, 108),
  (109, 'earn', 'auto', 'post_views', 250, 109),
  (110, 'earn', 'auto', 'reel_plays', 100, 110),
  (111, 'earn', 'auto', 'followers', 50, 111),
  (112, 'earn', 'auto', 'likes_total', 100, 112),
  (113, 'earn', 'auto', 'posts_count', 5, 113),
  (114, 'earn', 'auto', 'reels_count', 3, 114),
  (115, 'earn', 'auto', 'comments_received', 25, 115),
  (116, 'earn', 'auto', 'shares_total', 10, 116),
  (117, 'earn', 'auto', 'post_views', 500, 117),
  (118, 'earn', 'auto', 'reel_plays', 250, 118),
  (119, 'earn', 'auto', 'followers', 100, 119),
  (120, 'earn', 'auto', 'likes_total', 250, 120),
  (121, 'earn', 'auto', 'post_views', 1000, 121),
  (122, 'earn', 'auto', 'reel_plays', 500, 122),
  (123, 'earn', 'auto', 'posts_count', 10, 123),
  (124, 'earn', 'auto', 'reels_count', 5, 124),
  (125, 'earn', 'auto', 'comments_received', 50, 125),
  (126, 'earn', 'auto', 'shares_total', 25, 126),
  (127, 'earn', 'auto', 'followers', 200, 127),
  (128, 'earn', 'auto', 'likes_total', 500, 128),
  (129, 'earn', 'auto', 'post_views', 2000, 129),
  (130, 'earn', 'auto', 'reel_plays', 1000, 130),
  (131, 'earn', 'auto', 'followers', 300, 131),
  (132, 'earn', 'auto', 'likes_total', 1000, 132),
  (133, 'earn', 'auto', 'posts_count', 20, 133),
  (134, 'earn', 'auto', 'reels_count', 10, 134),
  (135, 'earn', 'auto', 'comments_received', 100, 135),
  (136, 'earn', 'auto', 'shares_total', 50, 136),
  (137, 'earn', 'auto', 'post_views', 3500, 137),
  (138, 'earn', 'auto', 'reel_plays', 2000, 138),
  (139, 'earn', 'auto', 'followers', 500, 139),
  (140, 'earn', 'auto', 'likes_total', 2000, 140),
  (141, 'earn', 'auto', 'post_views', 5000, 141),
  (142, 'earn', 'auto', 'reel_plays', 3500, 142),
  (143, 'earn', 'auto', 'posts_count', 30, 143),
  (144, 'earn', 'auto', 'reels_count', 15, 144),
  (145, 'earn', 'auto', 'comments_received', 250, 145),
  (146, 'earn', 'auto', 'shares_total', 100, 146),
  (147, 'earn', 'auto', 'followers', 750, 147),
  (148, 'earn', 'auto', 'likes_total', 3500, 148),
  (149, 'earn', 'auto', 'post_views', 7500, 149),
  (150, 'earn', 'auto', 'reel_plays', 5000, 150),
  (151, 'earn', 'auto', 'post_views', 10000, 151),
  (152, 'earn', 'auto', 'reel_plays', 7500, 152),
  (153, 'earn', 'auto', 'followers', 1000, 153),
  (154, 'earn', 'auto', 'likes_total', 5000, 154),
  (155, 'earn', 'auto', 'posts_count', 50, 155),
  (156, 'earn', 'auto', 'reels_count', 20, 156),
  (157, 'earn', 'auto', 'comments_received', 500, 157),
  (158, 'earn', 'auto', 'shares_total', 250, 158),
  (159, 'earn', 'auto', 'post_views', 15000, 159),
  (160, 'earn', 'auto', 'reel_plays', 10000, 160),
  (161, 'earn', 'auto', 'followers', 1500, 161),
  (162, 'earn', 'auto', 'likes_total', 7500, 162),
  (163, 'earn', 'auto', 'posts_count', 75, 163),
  (164, 'earn', 'auto', 'reels_count', 30, 164),
  (165, 'earn', 'auto', 'comments_received', 1000, 165),
  (166, 'earn', 'auto', 'shares_total', 500, 166),
  (167, 'earn', 'auto', 'post_views', 20000, 167),
  (168, 'earn', 'auto', 'reel_plays', 15000, 168),
  (169, 'earn', 'auto', 'followers', 2000, 169),
  (170, 'earn', 'auto', 'likes_total', 10000, 170),
  (171, 'earn', 'auto', 'post_views', 30000, 171),
  (172, 'earn', 'auto', 'reel_plays', 25000, 172),
  (173, 'earn', 'auto', 'posts_count', 100, 173),
  (174, 'earn', 'auto', 'reels_count', 50, 174),
  (175, 'earn', 'auto', 'comments_received', 2500, 175),
  (176, 'earn', 'auto', 'shares_total', 1000, 176),
  (177, 'earn', 'auto', 'followers', 3000, 177),
  (178, 'earn', 'auto', 'likes_total', 20000, 178),
  (179, 'earn', 'auto', 'post_views', 50000, 179),
  (180, 'earn', 'auto', 'reel_plays', 40000, 180),
  (181, 'earn', 'auto', 'followers', 5000, 181),
  (182, 'earn', 'auto', 'likes_total', 35000, 182),
  (183, 'earn', 'auto', 'posts_count', 150, 183),
  (184, 'earn', 'auto', 'reels_count', 75, 184),
  (185, 'earn', 'auto', 'comments_received', 5000, 185),
  (186, 'earn', 'auto', 'shares_total', 2500, 186),
  (187, 'earn', 'auto', 'post_views', 75000, 187),
  (188, 'earn', 'auto', 'reel_plays', 60000, 188),
  (189, 'earn', 'auto', 'followers', 7500, 189),
  (190, 'earn', 'auto', 'likes_total', 50000, 190),
  (191, 'earn', 'auto', 'post_views', 100000, 191),
  (192, 'earn', 'auto', 'reel_plays', 100000, 192),
  (193, 'earn', 'auto', 'posts_count', 200, 193),
  (194, 'earn', 'auto', 'reels_count', 100, 194),
  (195, 'earn', 'auto', 'comments_received', 10000, 195),
  (196, 'earn', 'auto', 'shares_total', 5000, 196),
  (197, 'earn', 'auto', 'followers', 10000, 197),
  (198, 'earn', 'auto', 'likes_total', 100000, 198),
  (199, 'earn', 'auto', 'post_views', 150000, 199),
  (200, 'earn', 'auto', 'reel_plays', 150000, 200);

CREATE TABLE public.challenge_done (
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id int  NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'done')),
  proof_text   text NOT NULL DEFAULT '' CHECK (char_length(proof_text) <= 500),
  proof_path   text,
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  reviewed_at  timestamptz,
  PRIMARY KEY (user_id, challenge_id)
);
CREATE INDEX challenge_done_pending_idx ON public.challenge_done (status) WHERE status = 'pending';
ALTER TABLE public.challenge_done ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.challenge_done FROM anon, authenticated;
CREATE POLICY "read own challenges" ON public.challenge_done FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.challenge_done TO authenticated;

CREATE TABLE public.payout_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount     int NOT NULL CHECK (amount > 0),
  method     text NOT NULL CHECK (char_length(method) BETWEEN 1 AND 40),
  account    text NOT NULL CHECK (char_length(account) BETWEEN 3 AND 80),
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payout_requests FROM anon, authenticated;
CREATE POLICY "read own payouts" ON public.payout_requests FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.payout_requests TO authenticated;

-- Screenshots for proof challenges: private bucket proofs/<user id>/…
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('proofs', 'proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION private.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT lower(email) LIKE '%@fainet.org' FROM auth.users WHERE id = auth.uid()), false);
$$;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

CREATE POLICY "proofs: own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proofs' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "proofs: own or admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'proofs' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT private.is_admin())));

-- Real numbers only (secret-comment bonuses are not counted, so money cannot be faked).
CREATE FUNCTION private.user_metric(u uuid, m text) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE m
    WHEN 'post_views'        THEN (SELECT coalesce(max(views_count), 0) FROM public.posts WHERE author_id = u AND video_path IS NULL)
    WHEN 'reel_plays'        THEN (SELECT coalesce(max(views_count), 0) FROM public.posts WHERE author_id = u AND video_path IS NOT NULL)
    WHEN 'followers'         THEN (SELECT followers_count FROM public.profiles WHERE id = u)
    WHEN 'likes_total'       THEN (SELECT coalesce(sum(likes_count), 0) FROM public.posts WHERE author_id = u)
    WHEN 'posts_count'       THEN (SELECT count(*) FROM public.posts WHERE author_id = u)
    WHEN 'reels_count'       THEN (SELECT count(*) FROM public.posts WHERE author_id = u AND video_path IS NOT NULL)
    WHEN 'comments_received' THEN (SELECT coalesce(sum(comments_count), 0) FROM public.posts WHERE author_id = u)
    WHEN 'shares_total'      THEN (SELECT coalesce(sum(shares_count), 0) FROM public.posts WHERE author_id = u)
    WHEN 'profile_ready'     THEN (SELECT (photo_path IS NOT NULL AND char_length(trim(bio)) > 0)::int FROM public.profiles WHERE id = u)
    ELSE 0 END;
$$;

CREATE FUNCTION private.is_qualified(u uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.challenges c
    WHERE c.stage = 'qualify'
      AND NOT EXISTS (SELECT 1 FROM public.challenge_done d WHERE d.user_id = u AND d.challenge_id = c.id AND d.status IN ('approved', 'done')));
$$;

/**
 * Everything the Monetize page needs. Also records newly finished automatic challenges
 * (so it is not STABLE), and marks the account monetized when stage 1 is complete.
 */
CREATE FUNCTION public.get_monetization() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  v_qualified boolean;
  v_earned int;
  v_paid int;
  v_metrics jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;

  SELECT jsonb_object_agg(m, private.user_metric(me, m)) INTO v_metrics
  FROM (SELECT DISTINCT metric AS m FROM public.challenges WHERE kind = 'auto') x;

  -- stage 1 automatic ones
  INSERT INTO public.challenge_done (user_id, challenge_id, status)
  SELECT me, c.id, 'done' FROM public.challenges c
  WHERE c.stage = 'qualify' AND c.kind = 'auto' AND (v_metrics->>c.metric)::bigint >= c.target
  ON CONFLICT (user_id, challenge_id) DO NOTHING;

  v_qualified := private.is_qualified(me);
  IF v_qualified THEN
    INSERT INTO public.applications (user_id, kind, status) VALUES (me, 'monetize', 'approved')
    ON CONFLICT (user_id, kind) DO UPDATE SET status = 'approved';
    -- stage 2 counts only after the account is monetized
    INSERT INTO public.challenge_done (user_id, challenge_id, status)
    SELECT me, c.id, 'done' FROM public.challenges c
    WHERE c.stage = 'earn' AND (v_metrics->>c.metric)::bigint >= c.target
    ON CONFLICT (user_id, challenge_id) DO NOTHING;
  END IF;

  v_earned := (SELECT count(*) FROM public.challenge_done d JOIN public.challenges c ON c.id = d.challenge_id
               WHERE d.user_id = me AND c.stage = 'earn' AND d.status = 'done')::int;
  v_paid := (SELECT coalesce(sum(amount), 0) FROM public.payout_requests WHERE user_id = me AND status <> 'rejected')::int;

  RETURN jsonb_build_object(
    'qualified', v_qualified,
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

-- Send proof for a "proof" challenge (text and/or a screenshot path in the proofs bucket).
CREATE FUNCTION public.submit_challenge_proof(p_challenge int, p_text text, p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.challenges WHERE id = p_challenge AND kind = 'proof') THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(coalesce(p_text, ''))) = 0 AND p_path IS NULL THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF p_path IS NOT NULL AND split_part(p_path, '/', 1) <> me::text THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.challenge_done WHERE user_id = me AND challenge_id = p_challenge AND status = 'approved') THEN
    RETURN;
  END IF;
  INSERT INTO public.challenge_done (user_id, challenge_id, status, proof_text, proof_path)
  VALUES (me, p_challenge, 'pending', left(trim(coalesce(p_text, '')), 500), p_path)
  ON CONFLICT (user_id, challenge_id) DO UPDATE
    SET status = 'pending', proof_text = EXCLUDED.proof_text, proof_path = EXCLUDED.proof_path, note = '', created_at = now(), reviewed_at = NULL;
END $$;

-- Ask for money (HesabPay / M-Paisa / bank …). Min 50 AFS, not more than the balance.
CREATE FUNCTION public.request_payout(p_amount int, p_method text, p_account text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_balance int;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  v_balance := ((SELECT count(*) FROM public.challenge_done d JOIN public.challenges c ON c.id = d.challenge_id
                 WHERE d.user_id = me AND c.stage = 'earn' AND d.status = 'done')::int / 5) * 5
               - (SELECT coalesce(sum(amount), 0) FROM public.payout_requests WHERE user_id = me AND status <> 'rejected')::int;
  IF p_amount IS NULL OR p_amount < 50 OR p_amount > v_balance THEN RAISE EXCEPTION 'not-eligible' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = me AND status = 'pending') THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.payout_requests (user_id, amount, method, account) VALUES (me, p_amount, trim(p_method), trim(p_account));
END $$;

-- ───────────────────────── admin ─────────────────────────
CREATE FUNCTION public.admin_pending() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'proofs', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'user', private.author_json(p), 'challenge_id', d.challenge_id, 'metric', c.metric,
                  'proof_text', d.proof_text, 'proof_path', d.proof_path, 'created_at', d.created_at) ORDER BY d.created_at), '[]'::jsonb)
               FROM public.challenge_done d JOIN public.challenges c ON c.id = d.challenge_id JOIN public.profiles p ON p.id = d.user_id
               WHERE d.status = 'pending'),
    'payouts', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'id', r.id, 'user', private.author_json(p), 'amount', r.amount, 'method', r.method, 'account', r.account,
                  'created_at', r.created_at) ORDER BY r.created_at), '[]'::jsonb)
                FROM public.payout_requests r JOIN public.profiles p ON p.id = r.user_id
                WHERE r.status = 'pending'));
END $$;

CREATE FUNCTION public.admin_review_proof(p_user uuid, p_challenge int, p_approve boolean, p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.challenge_done
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, note = left(coalesce(p_note, ''), 200), reviewed_at = now()
   WHERE user_id = p_user AND challenge_id = p_challenge AND status = 'pending';
END $$;

CREATE FUNCTION public.admin_set_payout(p_id uuid, p_paid boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.payout_requests SET status = CASE WHEN p_paid THEN 'paid' ELSE 'rejected' END WHERE id = p_id AND status = 'pending';
END $$;

-- ───────────────────────── messages: request instead of "no" ─────────────────────────
-- If someone only accepts messages from friends / people they follow, others can still write:
-- it lands in that person's Message requests. "No one" still means no new chats.
CREATE OR REPLACE FUNCTION public.start_direct_chat(p_other uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  k text;
  cid uuid;
  v_rule text;
  v_direct boolean;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT who_can_message INTO v_rule FROM public.profiles WHERE id = p_other AND profile_complete;
  IF p_other = me OR v_rule IS NULL THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF private.blocked_between(me, p_other) THEN RAISE EXCEPTION 'blocked' USING ERRCODE = '42501'; END IF;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  SELECT id INTO cid FROM public.conversations WHERE direct_key = k;
  IF cid IS NULL THEN
    IF v_rule = 'nobody' THEN RAISE EXCEPTION 'no-messages' USING ERRCODE = '42501'; END IF;
    -- straight to the inbox only if allowed; otherwise it is a message request
    v_direct := CASE v_rule
                  WHEN 'friends' THEN private.are_friends(me, p_other)
                  ELSE EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p_other AND f.followee_id = me)
                END;
    INSERT INTO public.conversations (is_group, created_by, direct_key, last_message_at)
    VALUES (false, me, k, now())
    ON CONFLICT (direct_key) DO NOTHING
    RETURNING id INTO cid;
    IF cid IS NULL THEN SELECT id INTO cid FROM public.conversations WHERE direct_key = k; END IF;
    INSERT INTO public.conversation_members (conversation_id, user_id, accepted) VALUES (cid, me, true), (cid, p_other, v_direct)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN cid;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_monetization()', 'public.submit_challenge_proof(int, text, text)', 'public.request_payout(int, text, text)',
    'public.admin_pending()', 'public.admin_review_proof(uuid, int, boolean, text)', 'public.admin_set_payout(uuid, boolean)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
