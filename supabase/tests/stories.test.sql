-- Stories, suggestions, thumbnails. Runs after rls/social/chat tests (A fainet, C karim, D dawood).
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'SECURITY HOLE: % succeeded', label;
EXCEPTION
  WHEN raise_exception THEN RAISE;
  WHEN OTHERS THEN RAISE NOTICE 'ok (blocked): % → %', label, SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text) TO anon, authenticated;
CREATE OR REPLACE FUNCTION pg_temp.check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok, false) THEN RAISE EXCEPTION 'FAILED: %', label; END IF; RAISE NOTICE 'ok: %', label; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check(boolean, text) TO anon, authenticated;

SET ROLE authenticated;

-- C posts a story and a video with a thumbnail
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.stories (media_path, media_type, caption) VALUES ('cccccccc-0000-0000-0000-000000000003/stories/s1.jpg', 'image', 'سلام');
INSERT INTO public.posts (video_path, thumb_path) VALUES ('cccccccc-0000-0000-0000-000000000003/v2.mp4', 'cccccccc-0000-0000-0000-000000000003/v2.jpg');
SELECT pg_temp.check((SELECT f->>'thumb_path' IS NOT NULL FROM public.get_reels() f WHERE f->>'video_path' LIKE '%v2.mp4'), 'thumb in post json');
SELECT pg_temp.must_fail($q$INSERT INTO public.stories (media_path, media_type) VALUES ('cccccccc-0000-0000-0000-000000000003/x.jpg', 'image')$q$, 'story outside stories folder');
SELECT pg_temp.must_fail($q$INSERT INTO public.stories (media_path, media_type) VALUES ('aaaaaaaa-0000-0000-0000-000000000001/stories/x.jpg', 'image')$q$, 'story in other folder');
SELECT pg_temp.must_fail($q$INSERT INTO public.stories (media_path, media_type, views_count) VALUES ('cccccccc-0000-0000-0000-000000000003/stories/y.jpg', 'image', 999)$q$, 'fake story views');
SELECT pg_temp.must_fail($q$INSERT INTO public.stories (media_path, media_type, expires_at) VALUES ('cccccccc-0000-0000-0000-000000000003/stories/y.jpg', 'image', now() + interval '1 year')$q$, 'story that never expires');
SELECT public.record_story_view((SELECT id FROM public.stories LIMIT 1));
SELECT pg_temp.check((SELECT views_count FROM public.stories LIMIT 1) = 0, 'own view not counted');

-- A watches it twice → 1 view; sees ring
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT count(*) FROM public.get_stories()) = 1, 'A sees C story ring');
SELECT pg_temp.check((SELECT NOT (s->>'all_seen')::boolean FROM public.get_stories() s), 'unseen before');
SELECT public.record_story_view((SELECT id FROM public.stories LIMIT 1));
SELECT public.record_story_view((SELECT id FROM public.stories LIMIT 1));
SELECT pg_temp.check((SELECT (s->>'all_seen')::boolean FROM public.get_stories() s), 'seen after');
SELECT pg_temp.check((SELECT count(*) FROM public.story_views) = 0, 'A cannot list viewers of C story');
SELECT pg_temp.check((SELECT count(*) FROM public.get_story_viewers((SELECT id FROM public.stories LIMIT 1))) = 0, 'A cannot get viewers via RPC');
SELECT pg_temp.must_fail($q$INSERT INTO public.story_views (story_id, viewer_id) SELECT id, auth.uid() FROM public.stories LIMIT 1$q$, 'insert view directly');
DELETE FROM public.stories;  -- not the author: RLS deletes nothing
SELECT pg_temp.check((SELECT count(*) FROM public.stories) = 1, 'cannot delete other story');

-- suggestions: A follows nobody now; D and C are suggested, never A itself
SELECT pg_temp.check((SELECT count(*) FROM public.suggest_people() s WHERE s->>'id' = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'not suggesting myself');
SELECT pg_temp.check((SELECT count(*) FROM public.suggest_people()) >= 2, 'suggestions present');
INSERT INTO public.follows (followee_id) VALUES ('cccccccc-0000-0000-0000-000000000003');
SELECT pg_temp.check((SELECT count(*) FROM public.suggest_people() s WHERE s->>'id' = 'cccccccc-0000-0000-0000-000000000003') = 0, 'followed person not suggested');

-- C (author) sees the viewer list
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT views_count FROM public.stories LIMIT 1) = 1, 'one view counted');
SELECT pg_temp.check((SELECT count(*) FROM public.get_story_viewers((SELECT id FROM public.stories LIMIT 1))) = 1, 'author sees 1 viewer');
SELECT pg_temp.check((SELECT (s->'stories'->0->>'views_count')::int = 1 FROM public.get_stories() s WHERE s->'author'->>'id' = auth.uid()::text), 'own ring shows views');

-- expired stories disappear for others
RESET ROLE;
UPDATE public.stories SET expires_at = now() - interval '1 minute';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT count(*) FROM public.get_stories()) = 0, 'expired story hidden from ring');
SELECT pg_temp.check((SELECT count(*) FROM public.stories) = 0, 'expired story hidden from table');
RESET ROLE;

SET ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM public.stories', 'anon reads stories');
SELECT pg_temp.must_fail($q$SELECT public.suggest_people()$q$, 'anon suggestions');
RESET ROLE;

SELECT 'ALL STORY TESTS PASSED' AS result;
