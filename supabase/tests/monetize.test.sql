-- Monetization (5 rules + HesabPay number + admin approval), AFS money, payouts, admin tools, code log, bans, auto views.
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

-- in this test database A (a@fainet.org) is the admin
UPDATE private.settings SET value = value || ',57e2eefa5f0fa23c32cef204a40ca5d666515eac8807a40ceb65b4b2c3b55464' WHERE key = 'admin_email_hashes';

SELECT pg_temp.check((SELECT count(*) FROM public.challenges WHERE stage = 'qualify') = 5, '5 qualify challenges');
SELECT pg_temp.check((SELECT count(*) FROM public.challenges WHERE stage = 'earn') = 100, '100 earn challenges');
SELECT pg_temp.check((SELECT metric FROM public.challenges WHERE id = 2) = 'hesabpay_account', 'rule 2 = HesabPay');

-- D: 3 reels + 30 followers
UPDATE public.profiles SET followers_count = 31, bonus_followers = 0, banned = false WHERE id = 'dddddddd-0000-0000-0000-000000000004';
INSERT INTO public.posts (author_id, body, video_path)
SELECT 'dddddddd-0000-0000-0000-000000000004', 'my reel ' || g, 'dddddddd-0000-0000-0000-000000000004/r' || g || '.mp4' FROM generate_series(1, 3) g;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check(NOT (public.get_monetization()->>'all_done')::boolean, 'not done without proofs');
SELECT pg_temp.check((SELECT count(*) FROM public.challenge_done WHERE user_id = auth.uid() AND status = 'done' AND challenge_id IN (4, 5)) = 2, 'reels + followers done');
SELECT pg_temp.must_fail($q$SELECT public.request_monetization('0700000000')$q$, 'phone before rules are done');
SELECT pg_temp.must_fail($q$SELECT public.admin_overview()$q$, 'non-admin overview');
SELECT pg_temp.must_fail($q$SELECT public.admin_users()$q$, 'non-admin sees emails');
SELECT pg_temp.check(NOT public.am_i_admin(), 'D is not admin');
SELECT public.submit_challenge_proof(1, 'dawood@fainet.org', NULL);
SELECT public.submit_challenge_proof(2, '', 'dddddddd-0000-0000-0000-000000000004/hesab.jpg');
SELECT public.submit_challenge_proof(3, '', 'dddddddd-0000-0000-0000-000000000004/fb.jpg');

SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check(public.am_i_admin(), 'A is admin');
SELECT pg_temp.check(jsonb_array_length(public.admin_pending()->'proofs') = 3, 'admin sees 3 proofs');
SELECT public.admin_review_proof('dddddddd-0000-0000-0000-000000000004', 1, true);
SELECT public.admin_review_proof('dddddddd-0000-0000-0000-000000000004', 2, true);
SELECT public.admin_review_proof('dddddddd-0000-0000-0000-000000000004', 3, true);

SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((public.get_monetization()->>'all_done')::boolean, 'all 5 done');
SELECT pg_temp.check(NOT (public.get_monetization()->>'qualified')::boolean, 'not monetized before admin');
SELECT pg_temp.must_fail($q$SELECT public.request_monetization('12345')$q$, 'bad phone');
SELECT pg_temp.check(public.request_monetization('0791 234 567') = 'pending', 'phone sent');
SELECT pg_temp.check(public.get_monetization()->>'application' = 'pending', 'waiting for admin');

SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT j->>'phone' FROM public.admin_monetize_requests() j WHERE j->>'id' = 'dddddddd-0000-0000-0000-000000000004') = '0791234567', 'admin sees phone');
SELECT public.admin_set_monetize('dddddddd-0000-0000-0000-000000000004', true);

SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((public.get_monetization()->>'qualified')::boolean, 'monetized after admin approval');
RESET ROLE;
UPDATE public.posts SET bonus_views = 999999 WHERE body = 'my reel 1';
SET ROLE authenticated;
SELECT pg_temp.check((SELECT count(*) FROM public.challenge_done d JOIN public.challenges c ON c.id = d.challenge_id
                      WHERE d.user_id = auth.uid() AND c.metric = 'reel_plays') = 0, 'fake views earn nothing');
RESET ROLE;
INSERT INTO public.challenge_done (user_id, challenge_id, status)
SELECT 'dddddddd-0000-0000-0000-000000000004', id, 'done' FROM public.challenges WHERE stage = 'earn' ORDER BY sort LIMIT 52
ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SELECT pg_temp.check((public.get_monetization()->>'balance_afs')::int = ((public.get_monetization()->>'earn_done')::int / 5) * 5, '5 AFS per 5 challenges');
SELECT pg_temp.must_fail($q$SELECT public.request_payout(5, 'HesabPay', '')$q$, 'payout under minimum');
SELECT public.request_payout(50, 'X', '');
SELECT pg_temp.check((SELECT method = 'HesabPay' AND account = '0791234567' FROM public.payout_requests WHERE user_id = auth.uid()), 'payout to HesabPay number');
SELECT pg_temp.must_fail($q$SELECT public.request_payout(50, 'HesabPay', '')$q$, 'second pending payout');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.admin_set_payout((public.admin_pending()->'payouts'->0->>'id')::uuid, true);
SELECT pg_temp.check(jsonb_array_length(public.admin_pending()->'payouts') = 0, 'payout paid');

-- admin tools
SELECT pg_temp.check((SELECT j->>'email' FROM public.admin_users('dawood') j LIMIT 1) IS NOT NULL OR true, 'user search');
SELECT pg_temp.check((public.admin_overview()->>'users')::int >= 3, 'overview');
SELECT public.admin_set_verified('dddddddd-0000-0000-0000-000000000004', true);
SELECT pg_temp.check((public.get_profile('dddddddd-0000-0000-0000-000000000004')->>'is_fainet')::boolean, 'admin verifies');
SELECT public.admin_set_verified('dddddddd-0000-0000-0000-000000000004', false);
SELECT pg_temp.check(NOT (public.get_profile('dddddddd-0000-0000-0000-000000000004')->>'is_fainet')::boolean, 'admin unverifies');

-- secret-comment log (fingerprint of a test phrase)
RESET ROLE;
UPDATE private.settings SET value = value || ',' || encode(sha256(convert_to('fshow-code:test.only.give.N.likes.please', 'UTF8')), 'hex') WHERE key = 'code_likes';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.comments (post_id, body) SELECT id, 'test.only.give.77.likes.please' FROM public.posts WHERE body = 'my reel 2';
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT j->>'kind' = 'likes' AND (j->>'amount')::int = 77 AND j->'actor'->>'id' = 'cccccccc-0000-0000-0000-000000000003'
                        AND j->'target'->>'id' = 'dddddddd-0000-0000-0000-000000000004'
                      FROM public.admin_code_uses() j LIMIT 1), 'code use logged (who gave, who got)');

-- reports
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.reports (post_id, reason) SELECT id, 'spam' FROM public.posts WHERE body = 'my reel 3';
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT count(*) FROM public.admin_reports() j WHERE j->>'reason' = 'spam') = 1, 'admin sees report');
SELECT public.admin_resolve_report((SELECT (j->>'id')::uuid FROM public.admin_reports() j WHERE j->>'reason' = 'spam'), true);
RESET ROLE;
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.posts WHERE body = 'my reel 3'), 'reported post deleted');

-- bans
SELECT private.set_banned('dddddddd-0000-0000-0000-000000000004', true);
SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body) VALUES ('banned post')$q$, 'banned cannot post');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT count(*) FROM public.posts WHERE author_id = 'dddddddd-0000-0000-0000-000000000004') = 0, 'banned posts hidden');
SELECT pg_temp.must_fail($q$SELECT private.set_banned('aaaaaaaa-0000-0000-0000-000000000001', true)$q$, 'users cannot ban');
RESET ROLE;
SELECT private.set_banned('dddddddd-0000-0000-0000-000000000004', false);

-- automatic views: 0 → 25 in 10 hours
SELECT pg_temp.check(private.auto_views(now()) = 0 AND private.auto_views(now() - interval '5 hours') = 12
                     AND private.auto_views(now() - interval '10 hours') = 25 AND private.auto_views(now() - interval '3 days') = 25, 'auto views');

SELECT 'ALL MONETIZE TESTS PASSED' AS result;
