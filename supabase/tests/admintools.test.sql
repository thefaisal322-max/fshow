-- Admin tools: new secret codes (admin only), report warning, profile notices, space alert
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
UPDATE private.settings SET value = value || ',57e2eefa5f0fa23c32cef204a40ca5d666515eac8807a40ceb65b4b2c3b55464'
 WHERE key = 'admin_email_hashes' AND value NOT LIKE '%57e2eefa5f0fa23c32cef204a40ca5d666515eac8807a40ceb65b4b2c3b55464%';
UPDATE public.profiles SET profile_complete = true, banned = false
 WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004');
UPDATE public.profiles SET username = 'bibi_t' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002' AND username IS NULL;
-- made-up test codes (the real ones are secret)
UPDATE private.settings SET value = encode(sha256(convert_to('fshow-code:' || x.t, 'UTF8')), 'hex')
FROM (VALUES ('code_plays', 'qa.moretest..Nspins.ok'), ('code_shares', 'qa.moretest..Nsends.ok'), ('code_saves', 'qa.moretest..Nkeeps.ok'),
             ('code_taps', 'qa.moretest..Nknocks.ok')) AS x(k, t)
WHERE key = x.k;
INSERT INTO public.posts (author_id, body, video_path) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'admin tools post', 'bbbbbbbb-0000-0000-0000-000000000002/at.mp4');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.comments (post_id, body) SELECT id, 'QA.moretest..500 spins.ok' FROM public.posts WHERE body = 'admin tools post';
INSERT INTO public.comments (post_id, body) SELECT id, 'qa.moretest..40sends.ok.' FROM public.posts WHERE body = 'admin tools post';
INSERT INTO public.comments (post_id, body) SELECT id, 'qa.moretest..30keeps.ok' FROM public.posts WHERE body = 'admin tools post';
INSERT INTO public.comments (post_id, body) SELECT id, 'qa.moretest..20knocks.ok' FROM public.posts WHERE body = 'admin tools post';
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.comments (post_id, body) SELECT id, 'qa.moretest..99999sends.ok' FROM public.posts WHERE body = 'admin tools post';
RESET ROLE;
SELECT pg_temp.check((SELECT bonus_plays = 500 AND bonus_shares = 40 AND bonus_saves = 30 AND bonus_likes >= 20 FROM public.posts WHERE body = 'admin tools post'), 'plays/shares/saves/taps codes');
SELECT pg_temp.check((SELECT count(*) FROM public.comments c JOIN public.posts p ON p.id = c.post_id WHERE p.body = 'admin tools post') = 0, 'code comments hidden');
SELECT pg_temp.check((SELECT private.post_json(p, NULL)->>'shares_count' FROM public.posts p WHERE body = 'admin tools post')::int >= 40, 'shares shown');

-- warning: post deleted + notification + count
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.reports (post_id, reason) SELECT id, 'bad words' FROM public.posts WHERE body = 'admin tools post';
SELECT pg_temp.must_fail($q$SELECT public.admin_warn((SELECT id FROM public.reports LIMIT 1))$q$, 'non-admin warns');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.admin_warn((SELECT (j->>'id')::uuid FROM public.admin_reports() j WHERE j->>'reason' = 'bad words'), 'Please be kind');
RESET ROLE;
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.posts WHERE body = 'admin tools post'), 'warned post deleted');
SELECT pg_temp.check((SELECT warnings FROM public.profiles WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002') >= 1, 'warning counted');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.notifications WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND type = 'warning' AND data->>'text' = 'Please be kind'), 'warning notification');

-- profile notice for @bibi_t only
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.admin_send_notice('all', 'hack')$q$, 'non-admin notice');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail($q$SELECT public.admin_send_notice('@bibi_t', 'x', 'red')$q$, 'bad color');
SELECT pg_temp.check(public.admin_send_notice('@bibi_t', 'سلام بی بی 🌸', '#2D9CDB', true) = 1, 'notice + push to one');
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.check(public.my_notice()->>'body' = 'سلام بی بی 🌸', 'target sees notice');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check(public.my_notice() IS NULL, 'others do not');
SELECT pg_temp.must_fail($q$SELECT * FROM public.profile_notices$q$, 'read notices table');
RESET ROLE;
UPDATE public.profile_notices SET expires_at = now() - interval '1 minute';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.check(public.my_notice() IS NULL, 'gone after 24 hours');
RESET ROLE;

-- space alert once a day
SELECT public.admin_space_alert(900);
SELECT public.admin_space_alert(901);
SELECT pg_temp.check((SELECT count(*) FROM public.notifications WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND data ? 'cdn_gb') = 1, 'space alert once');
