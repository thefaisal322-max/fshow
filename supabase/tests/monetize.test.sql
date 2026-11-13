-- Monetization challenges, proofs, admin review, money in AFS, payouts.
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

SELECT pg_temp.check((SELECT count(*) FROM public.challenges WHERE stage = 'qualify') = 5, '5 qualify challenges');
SELECT pg_temp.check((SELECT count(*) FROM public.challenges WHERE stage = 'earn') = 100, '100 earn challenges');

-- D: make the 3 automatic qualify challenges true (as admin of the test DB)
UPDATE public.profiles SET bio = 'سلام', photo_path = 'dddddddd-0000-0000-0000-000000000004/p.jpg', followers_count = 12, bonus_followers = 0
 WHERE id = 'dddddddd-0000-0000-0000-000000000004';
INSERT INTO public.posts (author_id, body, video_path) VALUES ('dddddddd-0000-0000-0000-000000000004', 'my reel', 'dddddddd-0000-0000-0000-000000000004/r.mp4');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check(NOT (public.get_monetization()->>'qualified')::boolean, 'not qualified without proofs');
SELECT pg_temp.check((SELECT count(*) FROM public.challenge_done WHERE user_id = auth.uid() AND status = 'done'
                        AND challenge_id IN (3, 4, 5)) = 3, 'auto qualify challenges done');
SELECT pg_temp.check((public.get_monetization()->>'earn_done')::int = 0, 'earn not counted before qualifying');
SELECT pg_temp.must_fail($q$INSERT INTO public.challenge_done (user_id, challenge_id, status) VALUES (auth.uid(), 1, 'approved')$q$, 'self approve');
SELECT pg_temp.must_fail($q$SELECT public.submit_challenge_proof(3, 'x', NULL)$q$, 'proof for auto challenge');
SELECT pg_temp.must_fail($q$SELECT public.submit_challenge_proof(1, 'x', 'aaaaaaaa-0000-0000-0000-000000000001/x.jpg')$q$, 'someone else''s file');
SELECT public.submit_challenge_proof(1, 'dawood@fainet.org', NULL);
SELECT public.submit_challenge_proof(2, '', 'dddddddd-0000-0000-0000-000000000004/fb.jpg');
SELECT pg_temp.must_fail($q$SELECT public.admin_pending()$q$, 'non-admin sees proofs');
SELECT pg_temp.must_fail($q$SELECT public.admin_review_proof(auth.uid(), 1, true)$q$, 'non-admin approves');

-- A (a@fainet.org) is admin
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check(jsonb_array_length(public.admin_pending()->'proofs') = 2, 'admin sees 2 proofs');
SELECT public.admin_review_proof('dddddddd-0000-0000-0000-000000000004', 1, true);
SELECT public.admin_review_proof('dddddddd-0000-0000-0000-000000000004', 2, false, 'no mention');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check(NOT (public.get_monetization()->>'qualified')::boolean, 'rejected proof → not yet');
SELECT public.submit_challenge_proof(2, 'again', 'dddddddd-0000-0000-0000-000000000004/fb2.jpg');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.admin_review_proof('dddddddd-0000-0000-0000-000000000004', 2, true);

-- qualified; real numbers finish earn challenges, code bonuses do not
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((public.get_monetization()->>'qualified')::boolean, 'qualified');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.applications WHERE user_id = auth.uid() AND kind = 'monetize' AND status = 'approved'), 'monetized');
RESET ROLE;
UPDATE public.posts SET bonus_views = 999999 WHERE body = 'my reel';
SET ROLE authenticated;
SELECT pg_temp.check((SELECT count(*) FROM public.challenge_done d JOIN public.challenges c ON c.id = d.challenge_id
                      WHERE d.user_id = auth.uid() AND c.metric = 'reel_plays') = 0, 'fake views earn nothing');
RESET ROLE;
UPDATE public.posts SET views_count = 260, likes_count = 120, comments_count = 30, shares_count = 12 WHERE body = 'my reel';
UPDATE public.profiles SET followers_count = 60 WHERE id = 'dddddddd-0000-0000-0000-000000000004';
SET ROLE authenticated;
SELECT pg_temp.check((public.get_monetization()->>'earn_done')::int >= 10, 'earn challenges done from real numbers');
SELECT pg_temp.check((public.get_monetization()->>'balance_afs')::int = ((public.get_monetization()->>'earn_done')::int / 5) * 5, '5 AFS per 5 challenges');
SELECT pg_temp.must_fail($q$SELECT public.request_payout(5000, 'HesabPay', '0700000000')$q$, 'payout more than balance');
SELECT pg_temp.must_fail($q$SELECT public.request_payout(5, 'HesabPay', '0700000000')$q$, 'payout under minimum');
RESET ROLE;
-- give D enough challenges for 50 AFS
INSERT INTO public.challenge_done (user_id, challenge_id, status)
SELECT 'dddddddd-0000-0000-0000-000000000004', id, 'done' FROM public.challenges WHERE stage = 'earn' ORDER BY sort LIMIT 50
ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SELECT public.request_payout(50, 'HesabPay', '0700000000');
SELECT pg_temp.must_fail($q$SELECT public.request_payout(50, 'HesabPay', '0700000000')$q$, 'second pending payout');
SELECT pg_temp.check((public.get_monetization()->>'balance_afs')::int = ((public.get_monetization()->>'earn_done')::int / 5) * 5 - 50, 'balance after payout');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.admin_set_payout((public.admin_pending()->'payouts'->0->>'id')::uuid, true);
SELECT pg_temp.check(jsonb_array_length(public.admin_pending()->'payouts') = 0, 'payout paid');
RESET ROLE;

SELECT 'ALL MONETIZE TESTS PASSED' AS result;
