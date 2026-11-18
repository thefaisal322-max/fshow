-- Sounds + download copies
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
-- Sounds: a video makes its sound; others use it; it stays after the first reel is deleted. Download copies.

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.posts (body, video_path) VALUES ('snd first', 'aaaaaaaa-0000-0000-0000-000000000001/s1.mp4');
INSERT INTO public.posts (body) VALUES ('snd text only');
SELECT pg_temp.must_fail($q$SELECT * FROM public.sounds$q$, 'read sounds table directly');
RESET ROLE;
SELECT pg_temp.check((SELECT sound_id IS NOT NULL FROM public.posts WHERE body = 'snd first'), 'video got a sound');
SELECT pg_temp.check((SELECT sound_id IS NULL FROM public.posts WHERE body = 'snd text only'), 'text post has no sound');
SELECT pg_temp.check((SELECT s.owner_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND s.source_post_id = p.id
                      FROM public.posts p JOIN public.sounds s ON s.id = p.sound_id WHERE p.body = 'snd first'), 'owner + source');

-- C uses the sound
CREATE TEMP TABLE sn AS SELECT sound_id AS v FROM public.posts WHERE body = 'snd first';
GRANT ALL ON sn TO authenticated;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.posts (body, video_path, sound_id)
SELECT 'snd user', 'cccccccc-0000-0000-0000-000000000003/s2.mp4', (SELECT v FROM sn);
RESET ROLE;
SELECT pg_temp.check((SELECT a.sound_id = b.sound_id FROM public.posts a, public.posts b WHERE a.body = 'snd first' AND b.body = 'snd user'), 'same sound');
SELECT pg_temp.check((SELECT uses_count FROM public.sounds s JOIN public.posts p ON p.sound_id = s.id WHERE p.body = 'snd first') = 2, 'uses 2');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check(jsonb_array_length(public.get_sound((SELECT v FROM sn))->'reels') = 2, 'sound page lists 2 reels');
SELECT pg_temp.check((public.get_sound((SELECT v FROM sn))->'reels'->0->>'body') = 'snd first', 'first reel first');
RESET ROLE;

-- workflow: download copy + the other sound goes into C's copy
SELECT pg_temp.check((SELECT audio IS NULL FROM public.media_pending(50, interval '0') WHERE path LIKE '%/s1.mp4'), 'own sound → no extra audio');
SELECT public.media_done('aaaaaaaa-0000-0000-0000-000000000001/s1.mp4', 'https://abc.fshow-media.pages.dev/v/a/s1.mp4', 100, 'https://abc.fshow-media.pages.dev/d/a/s1.mp4');
SELECT pg_temp.check((SELECT audio = 'https://abc.fshow-media.pages.dev/v/a/s1.mp4' FROM public.media_pending(50, interval '0') WHERE path LIKE '%/s2.mp4'), 'used sound → audio from first reel');
SELECT pg_temp.check((SELECT count(*) FROM public.sounds_pending()) = 1, 'sound audio pending');
SELECT public.sound_audio_done((SELECT sound_id FROM public.posts WHERE body = 'snd first'), 'https://abc.fshow-media.pages.dev/a/x.m4a');
SELECT pg_temp.check((SELECT count(*) FROM public.sounds_pending()) = 0, 'sound audio saved');
SELECT public.media_done('cccccccc-0000-0000-0000-000000000003/s2.mp4', 'https://abc.fshow-media.pages.dev/v/c/s2.mp4', 100);
SELECT pg_temp.check((SELECT count(*) FROM public.media_dl_pending() WHERE path LIKE '%/s2.mp4') = 1, 'missing download copy listed');
SELECT public.media_dl_done('cccccccc-0000-0000-0000-000000000003/s2.mp4', 'https://abc.fshow-media.pages.dev/d/c/s2.mp4');
SELECT pg_temp.check((SELECT private.post_json(p, 'cccccccc-0000-0000-0000-000000000003')->>'dl_url' FROM public.posts p WHERE body = 'snd user') LIKE '%/d/c/s2.mp4', 'post has dl_url');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.media_dl_done('x', 'https://a.pages.dev/x')$q$, 'app user cannot set dl url');
RESET ROLE;

-- first reel deleted → sound stays (with its audio)
DELETE FROM public.posts WHERE body = 'snd first';
SELECT pg_temp.check((SELECT s.source_post_id IS NULL AND s.audio_url IS NOT NULL AND s.uses_count = 1
                      FROM public.posts p JOIN public.sounds s ON s.id = p.sound_id WHERE p.body = 'snd user'), 'sound survives');
DELETE FROM public.posts WHERE body IN ('snd user', 'snd text only');
