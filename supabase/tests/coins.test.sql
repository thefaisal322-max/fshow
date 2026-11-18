-- Fshow Coins: buying, gifts (40/60), F+, promote (60/40), offers, admin unlimited, monetize with 2500 FC
\set ON_ERROR_STOP 1
CREATE OR REPLACE FUNCTION pg_temp.check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok, false) THEN RAISE EXCEPTION 'FAILED: %', label; END IF; RAISE NOTICE 'ok: %', label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check(boolean, text) TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'SECURITY HOLE: % succeeded', label;
EXCEPTION
  WHEN raise_exception THEN RAISE;
  WHEN OTHERS THEN RAISE NOTICE 'ok (blocked): % → %', label, SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text) TO anon, authenticated;
-- A (a@fainet.org) is the admin in tests; B, C normal
UPDATE private.settings SET value = value || ',57e2eefa5f0fa23c32cef204a40ca5d666515eac8807a40ceb65b4b2c3b55464'
 WHERE key = 'admin_email_hashes' AND value NOT LIKE '%57e2eefa5f0fa23c32cef204a40ca5d666515eac8807a40ceb65b4b2c3b55464%';
UPDATE public.profiles SET profile_complete = true, banned = false
 WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004');
DELETE FROM public.blocks;
INSERT INTO public.posts (author_id, body) VALUES ('cccccccc-0000-0000-0000-000000000003', 'coin post');
CREATE TEMP TABLE cp AS SELECT id AS v FROM public.posts WHERE body = 'coin post';
GRANT ALL ON cp TO authenticated;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = 0, 'new wallet empty');
SELECT pg_temp.must_fail($q$SELECT * FROM public.wallets$q$, 'read wallets directly');
SELECT pg_temp.must_fail($q$UPDATE public.wallets SET balance = 999999$q$, 'write wallet directly');
SELECT pg_temp.must_fail($q$SELECT public.send_gift('cccccccc-0000-0000-0000-000000000003', 'rose')$q$, 'gift without coins');
SELECT pg_temp.must_fail($q$SELECT public.request_coins(10, 'bbbbbbbb-0000-0000-0000-000000000002/r.jpg')$q$, 'buy under 50');
SELECT pg_temp.must_fail($q$SELECT public.request_coins(60000, 'bbbbbbbb-0000-0000-0000-000000000002/r.jpg')$q$, 'buy over 50000');
SELECT pg_temp.must_fail($q$SELECT public.request_coins(1000, 'cccccccc-0000-0000-0000-000000000003/r.jpg')$q$, 'someone else''s receipt');
SELECT public.request_coins(5000, 'bbbbbbbb-0000-0000-0000-000000000002/r.jpg');
SELECT pg_temp.must_fail($q$SELECT public.admin_decide_coins((SELECT (j->>'id')::uuid FROM jsonb_array_elements(public.get_wallet()->'purchases') j LIMIT 1), true)$q$, 'non-admin approves own purchase');
SELECT pg_temp.check((public.get_wallet()->'purchases'->0->>'afs')::numeric = 500, '5000 FC = 500 AFS');

SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((public.get_wallet()->>'unlimited')::boolean, 'admin unlimited');
SELECT public.admin_decide_coins((SELECT (j->>'id')::uuid FROM public.admin_coin_requests() j WHERE j->>'kind' = 'buy' AND j->'user'->>'id' = 'bbbbbbbb-0000-0000-0000-000000000002'), true);
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = 5000, 'coins credited');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.get_notifications() j WHERE j->>'type' = 'coins' AND (j->'data'->>'coins')::int = 5000), 'coins notification');

-- gift: rose 500 (maybe 20 % off if it is the gift of the day) → C gets 40 %, admin 60 %
RESET ROLE;
CREATE TEMP TABLE price AS SELECT CASE WHEN private.daily_gift() = 'rose' THEN 400 ELSE 500 END AS v;
GRANT ALL ON price TO authenticated;
SET ROLE authenticated;
SELECT pg_temp.must_fail($q$SELECT public.send_gift('bbbbbbbb-0000-0000-0000-000000000002', 'rose')$q$, 'gift to myself');
SELECT pg_temp.must_fail($q$SELECT public.send_gift('cccccccc-0000-0000-0000-000000000003', 'diamond')$q$, 'unknown gift');
SELECT public.send_gift('cccccccc-0000-0000-0000-000000000003', 'rose', (SELECT v FROM cp));
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = 5000 - (SELECT v FROM price), 'sender paid');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = floor((SELECT v FROM price) * 0.4), 'creator got 40%');
SELECT pg_temp.check((public.get_wallet()->>'foru_left')::int = (SELECT v FROM price), 'receiver 4u');
RESET ROLE;
SELECT pg_temp.check((SELECT balance FROM public.wallets WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001') >= (SELECT v FROM price) - floor((SELECT v FROM price) * 0.4), 'admin got 60%');
SELECT pg_temp.check((SELECT foru_left FROM public.wallets WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = (SELECT v FROM price), 'sender 4u');
SELECT pg_temp.check((SELECT private.prioritized(p) FROM public.posts p WHERE body = 'coin post'), 'C is in For You priority');

-- F+ → verified mark for a week
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT public.send_gift('cccccccc-0000-0000-0000-000000000003', 'fplus');
RESET ROLE;
SELECT pg_temp.check((SELECT private.author_json(a)->>'is_fainet' FROM public.profiles a WHERE id = 'cccccccc-0000-0000-0000-000000000003')::boolean, 'F+ verified mark');
SELECT pg_temp.check((SELECT fplus_until > now() + interval '6 days' FROM public.wallets WHERE user_id = 'cccccccc-0000-0000-0000-000000000003'), 'F+ one week');

-- promote: 2 units of views = 600 views; owner 60 %
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail($q$SELECT public.promote_post((SELECT v FROM cp), 'plays', 1)$q$, 'plays only for videos');
SELECT pg_temp.must_fail($q$SELECT public.promote_post((SELECT v FROM cp), 'views', 0)$q$, 'zero units');
SELECT public.promote_post((SELECT v FROM cp), 'views', 2);
SELECT pg_temp.check((public.my_promotions()->0->>'target')::int = 600, '2 × 300 views');
-- spent > 1000 now → 9 % off
SELECT pg_temp.check((public.get_wallet()->>'discount9')::boolean, '9% offer after 1000 spent');
SELECT public.promote_post((SELECT v FROM cp), 'likes', 1);
SELECT pg_temp.check((public.my_promotions()->0->>'coins')::int = 91, '9% off');
-- real views count
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT public.record_view((SELECT v FROM cp));
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.check((SELECT (j->>'done')::int FROM jsonb_array_elements(public.my_promotions()) j WHERE j->>'kind' = 'views') = 1, 'real view counted');

-- not enough coins
SELECT pg_temp.must_fail($q$SELECT public.promote_post((SELECT v FROM cp), 'views', 100)$q$, 'promote more than balance');

-- admin spends without limit
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.send_gift('cccccccc-0000-0000-0000-000000000003', 'tiger');
SELECT public.send_gift('cccccccc-0000-0000-0000-000000000003', 'tiger');

-- monetize by paying 2500 FC; a "no" gives them back
RESET ROLE;
SELECT private.fc_add('bbbbbbbb-0000-0000-0000-000000000002', 3000, 'admin_grant', 'test');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
CREATE TEMP TABLE bal AS SELECT (public.get_wallet()->>'balance')::int AS v;
SELECT pg_temp.check(public.monetize_with_coins('0791111111') = 'pending', 'paid monetize pending');
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = (SELECT v FROM bal) - 2500, '2500 taken');
SELECT pg_temp.check((public.get_monetization()->>'application') = 'pending', 'application visible');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.admin_set_monetize('bbbbbbbb-0000-0000-0000-000000000002', false);
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = (SELECT v FROM bal), 'refund after no');
SELECT public.monetize_with_coins('0791111111');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.admin_set_monetize('bbbbbbbb-0000-0000-0000-000000000002', true);
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.check((public.get_monetization()->>'qualified')::boolean, 'monetized by coins');
-- bought coins cannot be cashed out (only earned ones)
SELECT pg_temp.check((public.get_wallet()->>'cashable')::int = 0, 'bought coins not cashable');
SELECT pg_temp.must_fail($q$SELECT public.request_fc_payout(25, '0791111111')$q$, 'cash out bought coins');
RESET ROLE;
DROP TABLE cp, price, bal;
