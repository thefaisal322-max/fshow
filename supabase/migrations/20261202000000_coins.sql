-- Phase 3: Fshow Coins (FC)
--   1000 FC = 100 AFS (buying and cashing out).
--   • buy 50–50,000 FC: pay with HesabPay to 0711940975, send the receipt, an admin approves → coins + notification
--   • cash out 25–10,000 AFS (monetized accounts, only coins that were earned)
--   • F Shopping gifts (creator 40 %, admin 60 %), F+ (1 week For You + verified mark)
--   • Promote a post: 100 FC = 150 likes, or 100 plays, or 300 views from real people (admin 40 %, post owner 60 %)
--   • 4u: every FC sent or received as a gift = 1 more person in For You
--   • offers: 9 % off after 1,000 FC spent, a daily gift 20 % off, 50 FC on your birthday
--   • monetization: 30 FC for every finished challenge; or monetize by paying 2,500 FC (still approved by an admin)
--   • admins have unlimited FC

-- extra counts from the admin's secret codes (plays, shares, saves)
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bonus_plays  int NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bonus_shares int NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bonus_saves  int NOT NULL DEFAULT 0;

-- ───────────────────────── helpers ─────────────────────────
CREATE OR REPLACE FUNCTION private.user_is_admin(u uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((
    SELECT encode(sha256(convert_to(lower(x.email), 'UTF8')), 'hex') = ANY (string_to_array(s.value, ','))
    FROM auth.users x, private.settings s
    WHERE x.id = u AND s.key = 'admin_email_hashes'), false);
$$;

-- the account that receives the admin's share (the first admin email, else any admin)
CREATE OR REPLACE FUNCTION private.admin_uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT x.id
  FROM auth.users x
  JOIN public.profiles p ON p.id = x.id,
       private.settings s,
       LATERAL (SELECT array_position(string_to_array(s.value, ','), encode(sha256(convert_to(lower(x.email), 'UTF8')), 'hex')) AS pos) k
  WHERE s.key = 'admin_email_hashes' AND k.pos IS NOT NULL
  ORDER BY k.pos
  LIMIT 1;
$$;

-- ───────────────────────── notifications: new kinds + details ─────────────────────────
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'mention', 'friend_request', 'friend_accept',
                  'coins', 'coins_rejected', 'gift', 'payout', 'payout_rejected', 'promo', 'monetize', 'monetize_rejected',
                  'warning', 'notice', 'live'));

CREATE OR REPLACE FUNCTION private.notify(p_user uuid, p_type text, p_data jsonb DEFAULT '{}'::jsonb, p_actor uuid DEFAULT NULL, p_post uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, actor_id, type, post_id, data)
  SELECT p_user, coalesce(p_actor, private.admin_uid(), p_user), p_type, p_post, coalesce(p_data, '{}'::jsonb)
  WHERE p_user IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_notifications(p_offset int DEFAULT 0, p_limit int DEFAULT 30)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', n.id, 'type', n.type, 'read', n.read, 'created_at', n.created_at,
           'post_id', n.post_id, 'post_body', left(p.body, 80), 'post_image', p.image_path,
           'comment_body', left(c.body, 120), 'data', n.data,
           'actor', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                       'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet))
  FROM public.notifications n
  JOIN public.profiles a ON a.id = n.actor_id
  LEFT JOIN public.posts p ON p.id = n.post_id
  LEFT JOIN public.comments c ON c.id = n.comment_id
  WHERE n.user_id = auth.uid()
  ORDER BY n.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;

-- ───────────────────────── wallet ─────────────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id    uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance    bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  spent      bigint NOT NULL DEFAULT 0,   -- all FC ever spent (offers)
  earned     bigint NOT NULL DEFAULT 0,   -- FC from gifts, promotions, challenges, live (can be cashed out)
  cashed     bigint NOT NULL DEFAULT 0,   -- FC sent to cash-out requests
  foru_left  bigint NOT NULL DEFAULT 0,   -- "4u": more people who will see this person in For You
  fplus_until timestamptz,                -- F+ : For You + verified mark until then
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fc_ledger (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta      bigint NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('purchase', 'challenge', 'birthday', 'gift_sent', 'gift', 'promote', 'promo_share',
                                           'admin_cut', 'payout', 'payout_back', 'monetize', 'monetize_back', 'match', 'taps', 'tap_coins',
                                           'admin_grant')),
  ref        text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fc_ledger_user_idx ON public.fc_ledger (user_id, created_at DESC);
-- once only: one reward per challenge, one birthday gift per year, one credit per purchase
CREATE UNIQUE INDEX IF NOT EXISTS fc_ledger_once ON public.fc_ledger (user_id, kind, ref) WHERE kind IN ('challenge', 'birthday', 'purchase');
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fc_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallets, public.fc_ledger FROM anon, authenticated;

/**
 * Adds (or with a minus, takes) coins. Every change is written in the ledger.
 * Taking more than the balance fails with "not-enough-coins" — except for admins (unlimited).
 * p_earned: the coins count as earnings (can be cashed out). Returns false when p_once and it already happened.
 */
CREATE OR REPLACE FUNCTION private.fc_add(p_user uuid, p_delta bigint, p_kind text, p_ref text DEFAULT '', p_earned boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_admin boolean := private.user_is_admin(p_user);
BEGIN
  IF p_user IS NULL OR p_delta = 0 THEN RETURN false; END IF;
  INSERT INTO public.fc_ledger (user_id, delta, kind, ref) VALUES (p_user, p_delta, p_kind, coalesce(p_ref, ''))
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  IF p_delta < 0 THEN
    IF v_admin THEN
      UPDATE public.wallets SET spent = spent - p_delta, updated_at = now() WHERE user_id = p_user;
    ELSE
      UPDATE public.wallets SET balance = balance + p_delta, spent = spent - p_delta, updated_at = now()
       WHERE user_id = p_user AND balance >= -p_delta;
      IF NOT FOUND THEN RAISE EXCEPTION 'not-enough-coins' USING ERRCODE = '53400'; END IF;
    END IF;
  ELSE
    UPDATE public.wallets SET balance = balance + p_delta,
                              earned = earned + CASE WHEN p_earned THEN p_delta ELSE 0 END,
                              updated_at = now()
     WHERE user_id = p_user;
  END IF;
  RETURN true;
END $$;

-- ───────────────────────── prices & offers ─────────────────────────
CREATE OR REPLACE FUNCTION private.gift_price(p_gift text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_gift
    WHEN 'bronze_watch' THEN 100 WHEN 'yellow_flower' THEN 200 WHEN 'gold_watch' THEN 300
    WHEN 'bird' THEN 500 WHEN 'rose' THEN 500 WHEN 'smart_gift' THEN 1000 WHEN 'tiger' THEN 1000
    WHEN 'fplus' THEN 1290 END;
$$;

-- the gift of the day (20 % off), the same for everyone, changes at midnight Kabul time
CREATE OR REPLACE FUNCTION private.daily_gift() RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (ARRAY['bronze_watch', 'yellow_flower', 'gold_watch', 'bird', 'rose', 'smart_gift', 'tiger', 'fplus'])
         [1 + ((now() AT TIME ZONE 'Asia/Kabul')::date - date '2026-01-01') % 8];
$$;

-- price after the best offer: 20 % for the gift of the day, else 9 % after 1,000 FC spent
CREATE OR REPLACE FUNCTION private.offer_price(p_user uuid, p_base int, p_gift text DEFAULT NULL) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_gift IS NOT NULL AND p_gift = private.daily_gift() THEN ceil(p_base * 0.80)::int
    WHEN coalesce((SELECT spent FROM public.wallets WHERE user_id = p_user), 0) >= 1000 THEN ceil(p_base * 0.91)::int
    ELSE p_base END;
$$;

-- ───────────────────────── my wallet ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_wallet() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); w public.wallets; v_bday date; v_today date := (now() AT TIME ZONE 'Asia/Kabul')::date;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.wallets (user_id) VALUES (me) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO w FROM public.wallets WHERE user_id = me;
  SELECT birthday INTO v_bday FROM public.profiles_private WHERE id = me;
  RETURN jsonb_build_object(
    'balance', w.balance,
    'unlimited', private.user_is_admin(me),
    'spent', w.spent, 'earned', w.earned,
    'cashable', greatest(0, least(w.balance, w.earned - w.cashed)),
    'foru_left', w.foru_left,
    'fplus_until', CASE WHEN w.fplus_until > now() THEN w.fplus_until END,
    'discount9', w.spent >= 1000,
    'daily_gift', private.daily_gift(),
    'birthday_ready', v_bday IS NOT NULL
        AND extract(month FROM v_bday) = extract(month FROM v_today) AND extract(day FROM v_bday) = extract(day FROM v_today)
        AND NOT EXISTS (SELECT 1 FROM public.fc_ledger WHERE user_id = me AND kind = 'birthday' AND ref = extract(year FROM v_today)::text),
    'monetized', EXISTS (SELECT 1 FROM public.applications WHERE user_id = me AND kind = 'monetize' AND status = 'approved'),
    'purchases', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'afs', afs, 'status', status, 'created_at', created_at)
                  ORDER BY created_at DESC), '[]'::jsonb)
                  FROM (SELECT * FROM public.fc_purchases WHERE user_id = me ORDER BY created_at DESC LIMIT 10) x),
    'payouts', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'coins', coins, 'afs', afs, 'phone', phone, 'status', status, 'created_at', created_at)
                  ORDER BY created_at DESC), '[]'::jsonb)
                FROM (SELECT * FROM public.fc_payouts WHERE user_id = me ORDER BY created_at DESC LIMIT 10) x),
    'history', (SELECT coalesce(jsonb_agg(jsonb_build_object('delta', delta, 'kind', kind, 'created_at', created_at) ORDER BY id DESC), '[]'::jsonb)
                FROM (SELECT * FROM public.fc_ledger WHERE user_id = me ORDER BY id DESC LIMIT 30) x));
END $$;

-- 50 FC on my birthday (once a year)
CREATE OR REPLACE FUNCTION public.claim_birthday_coins() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_bday date; v_today date := (now() AT TIME ZONE 'Asia/Kabul')::date;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT birthday INTO v_bday FROM public.profiles_private WHERE id = me;
  IF v_bday IS NULL OR extract(month FROM v_bday) <> extract(month FROM v_today) OR extract(day FROM v_bday) <> extract(day FROM v_today) THEN
    RAISE EXCEPTION 'not-eligible' USING ERRCODE = '42501';
  END IF;
  RETURN private.fc_add(me, 50, 'birthday', extract(year FROM v_today)::text);
END $$;

-- ───────────────────────── buying coins ─────────────────────────
CREATE TABLE IF NOT EXISTS public.fc_purchases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coins        int NOT NULL CHECK (coins BETWEEN 50 AND 50000),
  afs          numeric(10, 1) NOT NULL,
  receipt_path text NOT NULL CHECK (char_length(receipt_path) < 200),
  note         text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz
);
CREATE INDEX IF NOT EXISTS fc_purchases_status_idx ON public.fc_purchases (status, created_at);
ALTER TABLE public.fc_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fc_purchases FROM anon, authenticated;

-- receipts: private bucket receipts/<user id>/…  (the owner and the admins can see them)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "receipts upload own" ON storage.objects;
CREATE POLICY "receipts upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "receipts read own or admin" ON storage.objects;
CREATE POLICY "receipts read own or admin" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR (SELECT private.is_admin())));

CREATE OR REPLACE FUNCTION public.request_coins(p_coins int, p_receipt text, p_note text DEFAULT '') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_id uuid;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_coins IS NULL OR p_coins < 50 OR p_coins > 50000 THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF p_receipt IS NULL OR split_part(p_receipt, '/', 1) <> me::text OR p_receipt LIKE '%..%' THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.fc_purchases WHERE user_id = me AND status = 'pending') >= 3 THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.fc_purchases (user_id, coins, afs, receipt_path, note)
  VALUES (me, p_coins, round(p_coins / 10.0, 1), p_receipt, left(coalesce(p_note, ''), 200))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ───────────────────────── cashing out ─────────────────────────
CREATE TABLE IF NOT EXISTS public.fc_payouts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  afs        int NOT NULL CHECK (afs BETWEEN 25 AND 10000),
  coins      int NOT NULL,
  phone      text NOT NULL CHECK (phone ~ '^(\+93|0)7[0-9]{8}$'),
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
ALTER TABLE public.fc_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fc_payouts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_fc_payout(p_afs int, p_phone text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'); v_coins int; w public.wallets; v_id uuid;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applications WHERE user_id = me AND kind = 'monetize' AND status = 'approved') THEN
    RAISE EXCEPTION 'not-eligible' USING ERRCODE = '42501';
  END IF;
  IF p_afs IS NULL OR p_afs < 25 OR p_afs > 10000 OR v_phone !~ '^(\+93|0)7[0-9]{8}$' THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fc_payouts WHERE user_id = me AND status = 'pending') THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
  END IF;
  v_coins := p_afs * 10;
  SELECT * INTO w FROM public.wallets WHERE user_id = me FOR UPDATE;
  IF w.user_id IS NULL OR v_coins > least(w.balance, w.earned - w.cashed) THEN
    RAISE EXCEPTION 'not-enough-coins' USING ERRCODE = '53400';
  END IF;
  INSERT INTO public.fc_payouts (user_id, afs, coins, phone) VALUES (me, p_afs, v_coins, v_phone) RETURNING id INTO v_id;
  PERFORM private.fc_add(me, -v_coins, 'payout', v_id::text);
  UPDATE public.wallets SET cashed = cashed + v_coins, spent = spent - v_coins WHERE user_id = me;  -- cashing out is not "spending"
END $$;

-- ───────────────────────── gifts ─────────────────────────
CREATE TABLE IF NOT EXISTS public.gifts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gift       text NOT NULL CHECK (private.gift_price(gift) IS NOT NULL),
  price      int NOT NULL,
  post_id    uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  live_id    uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gifts_receiver_idx ON public.gifts (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gifts_live_idx ON public.gifts (live_id) WHERE live_id IS NOT NULL;
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gifts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_gift(p_to uuid, p_gift text, p_post uuid DEFAULT NULL, p_live uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_base int := private.gift_price(p_gift); v_price int; v_id uuid; v_creator int; v_admin uuid := private.admin_uid();
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF v_base IS NULL OR p_to IS NULL OR p_to = me THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_to AND profile_complete AND NOT banned) OR private.blocked_between(me, p_to) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_post IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.posts WHERE id = p_post AND author_id = p_to) THEN p_post := NULL; END IF;
  IF (SELECT count(*) FROM public.gifts WHERE sender_id = me AND created_at > now() - interval '1 minute') >= 30 THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
  END IF;
  v_price := private.offer_price(me, v_base, p_gift);
  INSERT INTO public.gifts (sender_id, receiver_id, gift, price, post_id, live_id) VALUES (me, p_to, p_gift, v_price, p_post, p_live) RETURNING id INTO v_id;
  PERFORM private.fc_add(me, -v_price, 'gift_sent', v_id::text);
  v_creator := floor(v_price * 0.40)::int;
  PERFORM private.fc_add(p_to, v_creator, 'gift', v_id::text, true);
  IF v_admin IS NOT NULL AND v_admin <> me THEN PERFORM private.fc_add(v_admin, v_price - v_creator, 'admin_cut', v_id::text); END IF;
  -- 4u for both: every FC = one more person in For You
  INSERT INTO public.wallets (user_id) VALUES (p_to) ON CONFLICT DO NOTHING;
  UPDATE public.wallets SET foru_left = foru_left + v_price WHERE user_id IN (me, p_to);
  IF p_gift = 'fplus' THEN
    UPDATE public.wallets SET fplus_until = greatest(coalesce(fplus_until, now()), now()) + interval '7 days' WHERE user_id = p_to;
  END IF;
  IF p_live IS NULL THEN
    PERFORM private.notify(p_to, 'gift', jsonb_build_object('gift', p_gift, 'coins', v_creator), me, p_post);
  END IF;
  RETURN jsonb_build_object('id', v_id, 'price', v_price, 'balance', (SELECT balance FROM public.wallets WHERE user_id = me));
END $$;

-- ───────────────────────── promote ─────────────────────────
CREATE TABLE IF NOT EXISTS public.promotions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('likes', 'plays', 'views')),
  target     int NOT NULL CHECK (target > 0),
  done       int NOT NULL DEFAULT 0,
  coins      int NOT NULL DEFAULT 0,
  source     text NOT NULL DEFAULT 'promote' CHECK (source IN ('promote', 'match', 'live')),
  until      timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promotions_active_idx ON public.promotions (post_id) WHERE done < target;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promotions FROM anon, authenticated;

-- 100 FC per unit: 150 likes, or 100 plays (videos), or 300 views
CREATE OR REPLACE FUNCTION public.promote_post(p_post uuid, p_kind text, p_units int DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); p public.posts; v_price int; v_id uuid; v_owner int; v_admin uuid := private.admin_uid(); v_target int;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('likes', 'plays', 'views') OR p_units IS NULL OR p_units < 1 OR p_units > 100 THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM public.posts WHERE id = p_post;
  IF p.id IS NULL OR NOT private.can_see(p, me) OR p.visibility <> 'public' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_kind = 'plays' AND p.video_path IS NULL THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  v_target := p_units * CASE p_kind WHEN 'likes' THEN 150 WHEN 'plays' THEN 100 ELSE 300 END;
  v_price := private.offer_price(me, 100 * p_units);
  INSERT INTO public.promotions (buyer_id, post_id, kind, target, coins) VALUES (me, p_post, p_kind, v_target, v_price) RETURNING id INTO v_id;
  PERFORM private.fc_add(me, -v_price, 'promote', v_id::text);
  v_owner := floor(v_price * 0.60)::int;
  PERFORM private.fc_add(p.author_id, v_owner, 'promo_share', v_id::text, true);
  IF v_admin IS NOT NULL AND v_admin <> me THEN PERFORM private.fc_add(v_admin, v_price - v_owner, 'admin_cut', v_id::text); END IF;
  IF p.author_id <> me THEN
    PERFORM private.notify(p.author_id, 'promo', jsonb_build_object('kind', p_kind, 'n', v_target, 'coins', v_owner), me, p_post);
  END IF;
  RETURN jsonb_build_object('id', v_id, 'price', v_price, 'target', v_target, 'balance', (SELECT balance FROM public.wallets WHERE user_id = me));
END $$;

-- my promotions (progress)
CREATE OR REPLACE FUNCTION public.my_promotions() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'post_id', x.post_id, 'kind', x.kind, 'target', x.target, 'done', x.done,
                                               'coins', x.coins, 'until', x.until, 'created_at', x.created_at,
                                               'body', left(p.body, 80), 'thumb_path', p.thumb_path, 'image_path', p.image_path)
                            ORDER BY x.created_at DESC), '[]'::jsonb)
  FROM (SELECT * FROM public.promotions WHERE buyer_id = auth.uid() ORDER BY created_at DESC LIMIT 30) x
  JOIN public.posts p ON p.id = x.post_id;
$$;

-- For You priority: boosted, promoted, F+ or 4u authors come first (to people who have not seen the post yet)
CREATE OR REPLACE FUNCTION private.prioritized(p public.posts) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(p.boost_until > now(), false)
      OR EXISTS (SELECT 1 FROM public.promotions x WHERE x.post_id = p.id AND x.done < x.target AND x.until > now())
      OR EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = p.author_id AND (w.fplus_until > now() OR w.foru_left > 0));
$$;

-- a real view: counts for promotions and uses up 4u
CREATE OR REPLACE FUNCTION public.record_view(p_post uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_author uuid; v_video boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.me_ready() THEN RETURN; END IF;
  INSERT INTO public.post_views (post_id, user_id) VALUES (p_post, auth.uid()) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE public.posts SET views_count = views_count + 1 WHERE id = p_post RETURNING author_id, video_path IS NOT NULL INTO v_author, v_video;
    IF v_author IS NOT NULL AND v_author <> auth.uid() THEN
      UPDATE public.promotions SET done = done + 1
       WHERE post_id = p_post AND done < target AND (kind = 'views' OR (kind = 'plays' AND v_video));
      UPDATE public.wallets SET foru_left = foru_left - 1 WHERE user_id = v_author AND foru_left > 0;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.on_like_promo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.promotions SET done = done + 1 WHERE post_id = NEW.post_id AND kind = 'likes' AND done < target;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS post_likes_promo ON public.post_likes;
CREATE TRIGGER post_likes_promo AFTER INSERT ON public.post_likes FOR EACH ROW EXECUTE FUNCTION private.on_like_promo();

-- Feeds use the new priority
CREATE OR REPLACE FUNCTION public.get_reels(p_offset int DEFAULT 0, p_limit int DEFAULT 10, p_mode text DEFAULT 'foryou')
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid())
  FROM public.posts p JOIN public.profiles a ON a.id = p.author_id
  WHERE p.video_path IS NOT NULL
    AND private.can_see(p, auth.uid())
    AND NOT private.hidden_for(p.id, auth.uid())
    AND (p_mode <> 'following'
         OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = p.author_id))
  ORDER BY CASE WHEN p_mode = 'following' THEN false
                ELSE private.prioritized(p) AND NOT EXISTS (SELECT 1 FROM public.post_views v WHERE v.post_id = p.id AND v.user_id = auth.uid()) END DESC,
           CASE WHEN p_mode = 'following' THEN extract(epoch FROM p.created_at)
                ELSE extract(epoch FROM p.created_at) / 3600.0
                  + CASE WHEN a.is_fainet THEN 12 ELSE 0 END
                  + ln(1 + p.likes_count) * 2
                  + private.taste(p.author_id, auth.uid())
                  - CASE WHEN EXISTS (SELECT 1 FROM public.post_views v WHERE v.post_id = p.id AND v.user_id = auth.uid()) THEN 18 ELSE 0 END
           END DESC,
           p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 30);
$$;

-- F+ shows the verified mark for a week
CREATE OR REPLACE FUNCTION private.author_json(a public.profiles) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                            'username', a.username, 'photo_path', a.photo_path,
                            'is_fainet', a.is_fainet OR EXISTS (SELECT 1 FROM public.wallets w WHERE w.user_id = a.id AND w.fplus_until > now()));
$$;

CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path, 'thumb_path', p.thumb_path,
    'video_url', m.url, 'dl_url', m.dl_url,
    'location', p.location, 'feeling', p.feeling, 'created_at', p.created_at,
    'visibility', p.visibility, 'edited', p.edited_at IS NOT NULL,
    'likes_count', p.likes_count + p.bonus_likes, 'comments_count', p.comments_count, 'saves_count', p.saves_count + p.bonus_saves,
    'shares_count', p.shares_count + p.bonus_shares, 'views_count', p.views_count + p.bonus_views + private.auto_views(p.created_at),
    'plays_count', p.views_count + p.bonus_views + p.bonus_plays + private.auto_views(p.created_at),
    'boosted', coalesce(p.boost_until > now(), false),
    'liked', EXISTS (SELECT 1 FROM public.post_likes l WHERE l.post_id = p.id AND l.user_id = me),
    'saved', EXISTS (SELECT 1 FROM public.post_saves s WHERE s.post_id = p.id AND s.user_id = me),
    'following', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = me AND f.followee_id = p.author_id),
    'feedback', (SELECT f.kind FROM public.post_feedback f WHERE f.user_id = me AND f.post_id = p.id),
    'shared', CASE WHEN p.shared_post_id IS NULL THEN NULL ELSE private.post_preview(p.shared_post_id) END,
    'sound', (SELECT private.sound_json(s) FROM public.sounds s WHERE s.id = p.sound_id),
    'gifts', (SELECT coalesce(sum(g.price), 0) FROM public.gifts g WHERE g.post_id = p.id),
    'author', private.author_json(a)
  )
  FROM public.profiles a
  LEFT JOIN public.media_cdn m ON m.path = p.video_path
  WHERE a.id = p.author_id;
$$;

-- ───────────────────────── monetization with coins ─────────────────────────
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS paid_fc int NOT NULL DEFAULT 0;

-- every finished challenge = 30 FC, right away (once)
CREATE OR REPLACE FUNCTION private.on_challenge_done() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('done', 'approved') AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('done', 'approved')) THEN
    PERFORM private.fc_add(NEW.user_id, 30, 'challenge', NEW.challenge_id::text, true);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS challenge_done_coins ON public.challenge_done;
CREATE TRIGGER challenge_done_coins AFTER INSERT OR UPDATE OF status ON public.challenge_done
  FOR EACH ROW EXECUTE FUNCTION private.on_challenge_done();
-- challenges finished before today get their coins too
SELECT private.fc_add(d.user_id, 30, 'challenge', d.challenge_id::text, true)
FROM public.challenge_done d WHERE d.status IN ('done', 'approved');

-- the other way: pay 2,500 FC (an admin still approves; a "no" gives the coins back)
CREATE OR REPLACE FUNCTION public.monetize_with_coins(p_phone text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'); a public.applications;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF v_phone !~ '^(\+93|0)7[0-9]{8}$' THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM public.applications WHERE user_id = me AND kind = 'monetize';
  IF a.status = 'approved' THEN RETURN 'approved'; END IF;
  IF a.status = 'pending' AND a.paid_fc > 0 THEN RETURN 'pending'; END IF;
  PERFORM private.fc_add(me, -2500, 'monetize', gen_random_uuid()::text);
  PERFORM private.fc_add(private.admin_uid(), 2500, 'admin_cut', 'monetize:' || me::text || ':' || now()::text);
  INSERT INTO public.applications (user_id, kind, status, phone, paid_fc) VALUES (me, 'monetize', 'pending', v_phone, 2500)
  ON CONFLICT (user_id, kind) DO UPDATE SET phone = EXCLUDED.phone, status = 'pending', paid_fc = 2500, created_at = now();
  RETURN 'pending';
END $$;

-- approved = (all 5 rules OR paid) AND an admin said yes
CREATE OR REPLACE FUNCTION public.get_monetization() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  v_all_done boolean;
  v_status text;
  v_phone text;
  v_paid int;
  v_approved boolean;
  v_earned int;
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
  SELECT status, phone, paid_fc INTO v_status, v_phone, v_paid FROM public.applications WHERE user_id = me AND kind = 'monetize';
  v_approved := (v_all_done OR coalesce(v_paid, 0) > 0) AND v_status = 'approved';

  IF v_approved THEN
    INSERT INTO public.challenge_done (user_id, challenge_id, status)
    SELECT me, c.id, 'done' FROM public.challenges c
    WHERE c.stage = 'earn' AND (v_metrics->>c.metric)::bigint >= c.target
    ON CONFLICT (user_id, challenge_id) DO NOTHING;
  END IF;

  v_earned := (SELECT count(*) FROM public.challenge_done d JOIN public.challenges c ON c.id = d.challenge_id
               WHERE d.user_id = me AND c.stage = 'earn' AND d.status = 'done')::int;

  RETURN jsonb_build_object(
    'all_done', v_all_done,
    'qualified', v_approved,
    'application', CASE WHEN v_all_done OR coalesce(v_paid, 0) > 0 THEN v_status END,
    'paid_fc', coalesce(v_paid, 0),
    'phone', v_phone,
    'is_admin', private.is_admin(),
    'fc_per_challenge', 30,
    'monetize_price', 2500,
    'earn_done', v_earned,
    'coins', (SELECT balance FROM public.wallets WHERE user_id = me),
    'metrics', v_metrics,
    'challenges', (SELECT jsonb_agg(jsonb_build_object(
                      'id', c.id, 'stage', c.stage, 'kind', c.kind, 'metric', c.metric, 'target', c.target,
                      'status', d.status, 'note', d.note, 'proof_text', d.proof_text)
                    ORDER BY c.sort)
                   FROM public.challenges c LEFT JOIN public.challenge_done d ON d.challenge_id = c.id AND d.user_id = me),
    'payouts', '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_monetize(p_user uuid, p_approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.applications;
BEGIN
  PERFORM private.require_admin();
  SELECT * INTO a FROM public.applications WHERE user_id = p_user AND kind = 'monetize' FOR UPDATE;
  IF a.user_id IS NULL THEN RETURN; END IF;
  UPDATE public.applications SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
                                 paid_fc = CASE WHEN p_approve THEN paid_fc ELSE 0 END
   WHERE user_id = p_user AND kind = 'monetize';
  IF NOT p_approve AND a.paid_fc > 0 THEN
    PERFORM private.fc_add(p_user, a.paid_fc, 'monetize_back', gen_random_uuid()::text);
  END IF;
  IF a.status IS DISTINCT FROM (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END) THEN
    PERFORM private.notify(p_user, CASE WHEN p_approve THEN 'monetize' ELSE 'monetize_rejected' END, jsonb_build_object('coins', a.paid_fc));
  END IF;
END $$;

-- ───────────────────────── admin: coins ─────────────────────────
CREATE OR REPLACE FUNCTION public.admin_coin_requests() RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_admin();
  RETURN QUERY
  SELECT jsonb_build_object('id', x.id, 'kind', 'buy', 'coins', x.coins, 'afs', x.afs, 'receipt_path', x.receipt_path, 'note', x.note,
                            'status', x.status, 'created_at', x.created_at,
                            'user', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = x.user_id))
  FROM public.fc_purchases x WHERE x.status = 'pending'
  UNION ALL
  SELECT jsonb_build_object('id', y.id, 'kind', 'payout', 'coins', y.coins, 'afs', y.afs, 'phone', y.phone,
                            'status', y.status, 'created_at', y.created_at,
                            'user', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = y.user_id))
  FROM public.fc_payouts y WHERE y.status = 'pending';
END $$;

CREATE OR REPLACE FUNCTION public.admin_decide_coins(p_id uuid, p_approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE x public.fc_purchases;
BEGIN
  PERFORM private.require_admin();
  UPDATE public.fc_purchases SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, decided_at = now()
   WHERE id = p_id AND status = 'pending' RETURNING * INTO x;
  IF x.id IS NULL THEN RETURN; END IF;
  IF p_approve THEN
    PERFORM private.fc_add(x.user_id, x.coins, 'purchase', x.id::text);
    PERFORM private.notify(x.user_id, 'coins', jsonb_build_object('coins', x.coins));
  ELSE
    PERFORM private.notify(x.user_id, 'coins_rejected', jsonb_build_object('coins', x.coins));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_decide_payout(p_id uuid, p_paid boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE y public.fc_payouts;
BEGIN
  PERFORM private.require_admin();
  UPDATE public.fc_payouts SET status = CASE WHEN p_paid THEN 'paid' ELSE 'rejected' END, decided_at = now()
   WHERE id = p_id AND status = 'pending' RETURNING * INTO y;
  IF y.id IS NULL THEN RETURN; END IF;
  IF p_paid THEN
    PERFORM private.notify(y.user_id, 'payout', jsonb_build_object('afs', y.afs));
  ELSE
    PERFORM private.fc_add(y.user_id, y.coins, 'payout_back', y.id::text, true);
    UPDATE public.wallets SET cashed = greatest(0, cashed - y.coins), earned = earned - y.coins WHERE user_id = y.user_id;
    PERFORM private.notify(y.user_id, 'payout_rejected', jsonb_build_object('afs', y.afs));
  END IF;
END $$;

-- ───────────────────────── grants ─────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_wallet()', 'public.claim_birthday_coins()', 'public.request_coins(int, text, text)',
    'public.request_fc_payout(int, text)', 'public.send_gift(uuid, text, uuid, uuid)', 'public.promote_post(uuid, text, int)',
    'public.my_promotions()', 'public.monetize_with_coins(text)', 'public.admin_coin_requests()',
    'public.admin_decide_coins(uuid, boolean)', 'public.admin_decide_payout(uuid, boolean)', 'public.record_view(uuid)',
    'public.get_notifications(int, int)', 'public.get_monetization()', 'public.admin_set_monetize(uuid, boolean)',
    'public.get_reels(int, int, text)']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION private.fc_add(uuid, bigint, text, text, boolean), private.notify(uuid, text, jsonb, uuid, uuid),
                         private.user_is_admin(uuid), private.admin_uid() FROM PUBLIC, anon, authenticated;
