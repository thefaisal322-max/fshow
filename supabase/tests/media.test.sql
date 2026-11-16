-- Cloudflare video map: only the server writes it; posts show video_url.
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

-- a video post by D, made "old"
INSERT INTO public.posts (author_id, body, video_path, created_at)
VALUES ('dddddddd-0000-0000-0000-000000000004', 'cdn test', 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4', now() - interval '2 hours');
CREATE TEMP TABLE tp AS SELECT id FROM public.posts WHERE video_path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4';
GRANT SELECT ON tp TO authenticated;

SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.media_pending(300) WHERE path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4'), 'pending lists the old video');
SELECT pg_temp.must_fail($q$SELECT public.media_done('dddddddd-0000-0000-0000-000000000004/cdntest.mp4', 'https://evil.example.com/x.mp4', 1)$q$, 'non-Cloudflare url');
SELECT public.media_done('dddddddd-0000-0000-0000-000000000004/cdntest.mp4', 'https://abc123.fshow-media.pages.dev/v/dddddddd-0000-0000-0000-000000000004/cdntest.mp4', 1234);
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.media_pending(300) WHERE path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4'), 'done → not pending');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.media_to_delete() WHERE path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4'), 'Storage copy kept for 2 days');
UPDATE public.media_cdn SET created_at = now() - interval '3 days' WHERE path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4';
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.media_to_delete() WHERE path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4'), 'after 2 days → delete');
SELECT public.media_deleted('dddddddd-0000-0000-0000-000000000004/cdntest.mp4');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.media_to_delete() WHERE path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4'), 'deleted once');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((SELECT public.get_post((SELECT id FROM tp))->>'video_url') LIKE 'https://abc123.fshow-media.pages.dev/%', 'post has video_url');
SELECT pg_temp.must_fail($q$SELECT * FROM public.media_cdn$q$, 'user reads map table');
SELECT pg_temp.must_fail($q$INSERT INTO public.media_cdn (path, url) VALUES ('x/y.mp4', 'https://a.pages.dev/x')$q$, 'user writes map');
SELECT pg_temp.must_fail($q$SELECT public.media_done('x', 'https://a.pages.dev/x', 1)$q$, 'user calls media_done');
SELECT pg_temp.must_fail($q$SELECT * FROM public.media_pending()$q$, 'user calls media_pending');
SELECT pg_temp.must_fail($q$SELECT public.media_deleted('x')$q$, 'user calls media_deleted');
RESET ROLE;

-- deleting the post removes the address
DELETE FROM public.posts WHERE video_path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.media_cdn WHERE path = 'dddddddd-0000-0000-0000-000000000004/cdntest.mp4'), 'post deleted → address gone');
SELECT 'media tests passed';
