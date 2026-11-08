-- fainet boost: +500 likes (+1100 views) once, real likes untouched, phrase comment removed, others get nothing.
-- Runs after the other test files.
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

SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
INSERT INTO public.posts (body) VALUES ('boost me');
SELECT pg_temp.must_fail($q$UPDATE public.posts SET bonus_likes = 5000$q$, 'self bonus likes');
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body, bonus_likes) VALUES ('x', 5000)$q$, 'post with bonus likes');
-- D is not fainet: the phrase does nothing and stays a normal comment
INSERT INTO public.comments (post_id, body) SELECT id, '(((fainet.org-fshow))afghan,code)' FROM public.posts WHERE body = 'boost me';
SELECT pg_temp.check((SELECT bonus_likes = 0 AND boost_until IS NULL FROM public.posts WHERE body = 'boost me'), 'non-fainet: no bonus');
SELECT pg_temp.check((SELECT count(*) FROM public.comments WHERE post_id = (SELECT id FROM public.posts WHERE body = 'boost me')) = 1, 'non-fainet comment stays');
DELETE FROM public.comments WHERE post_id = (SELECT id FROM public.posts WHERE body = 'boost me');

-- A is fainet
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.post_likes (post_id) SELECT id FROM public.posts WHERE body = 'boost me';
INSERT INTO public.comments (post_id, body) SELECT id, 'ok (((fainet.org-fshow))afghan,code)' FROM public.posts WHERE body = 'boost me';
SELECT pg_temp.check((SELECT likes_count = 1 AND bonus_likes = 500 AND boost_until > now() FROM public.posts WHERE body = 'boost me'), 'real 1 + bonus 500');
SELECT pg_temp.check((SELECT (f->>'likes_count')::int = 501 FROM public.get_feed('foryou') f WHERE f->>'body' = 'boost me'), 'feed shows 501');
SELECT pg_temp.check((SELECT count(*) FROM public.comments WHERE post_id = (SELECT id FROM public.posts WHERE body = 'boost me')) = 0, 'phrase comment removed');
SELECT pg_temp.check((SELECT comments_count = 0 FROM public.posts WHERE body = 'boost me'), 'comment count back to 0');
INSERT INTO public.comments (post_id, body) SELECT id, '(((fainet.org-fshow))afghan,code)' FROM public.posts WHERE body = 'boost me';
SELECT pg_temp.check((SELECT bonus_likes = 500 FROM public.posts WHERE body = 'boost me'), 'boost twice does not stack');
DELETE FROM public.post_likes WHERE post_id = (SELECT id FROM public.posts WHERE body = 'boost me');
SELECT pg_temp.check((SELECT likes_count = 0 AND bonus_likes = 500 FROM public.posts WHERE body = 'boost me'), 'unlike only touches real likes');
RESET ROLE;
SELECT 'ALL BOOST TESTS PASSED' AS result;
