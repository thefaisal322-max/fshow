-- Telegram video map: everyone can read, nobody but the server can write.
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
VALUES ('dddddddd-0000-0000-0000-000000000004', 'tg test', 'dddddddd-0000-0000-0000-000000000004/tgtest.mp4', now() - interval '2 hours');

SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.media_pending(200) WHERE path = 'dddddddd-0000-0000-0000-000000000004/tgtest.mp4'), 'pending lists the old video');
SELECT public.media_done('dddddddd-0000-0000-0000-000000000004/tgtest.mp4', 'FILEID123', 1234);
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.media_pending(200) WHERE path = 'dddddddd-0000-0000-0000-000000000004/tgtest.mp4'), 'done → not pending');
SELECT public.set_app_config('media_base', 'https://example.workers.dev');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT file_id FROM public.media_tg WHERE path = 'dddddddd-0000-0000-0000-000000000004/tgtest.mp4') = 'FILEID123', 'user can read the map');
SELECT pg_temp.check((SELECT value FROM public.app_config WHERE key = 'media_base') = 'https://example.workers.dev', 'user can read config');
SELECT pg_temp.must_fail($q$INSERT INTO public.media_tg (path, file_id) VALUES ('x/y.mp4', 'evil')$q$, 'user writes map');
SELECT pg_temp.must_fail($q$UPDATE public.media_tg SET file_id = 'evil'$q$, 'user changes map');
SELECT pg_temp.must_fail($q$INSERT INTO public.app_config VALUES ('media_base', 'https://evil')$q$, 'user writes config');
SELECT pg_temp.must_fail($q$SELECT public.media_done('x', 'y', 1)$q$, 'user calls media_done');
SELECT pg_temp.must_fail($q$SELECT public.set_app_config('media_base', 'https://evil')$q$, 'user calls set_app_config');
SELECT pg_temp.must_fail($q$SELECT * FROM public.media_pending()$q$, 'user calls media_pending');
SET ROLE anon;
SELECT pg_temp.check((SELECT count(*) FROM public.media_tg) >= 1, 'anon (the worker) can read the map');
RESET ROLE;

-- deleting the post removes the link
DELETE FROM public.posts WHERE video_path = 'dddddddd-0000-0000-0000-000000000004/tgtest.mp4';
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.media_tg WHERE path = 'dddddddd-0000-0000-0000-000000000004/tgtest.mp4'), 'post deleted → link gone');
DELETE FROM public.app_config WHERE key = 'media_base';
SELECT 'media tests passed';
