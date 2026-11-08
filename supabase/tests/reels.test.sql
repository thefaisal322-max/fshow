-- Post privacy, edit, feedback, hashtags, presence, voice messages.
-- Runs after the other test files (A fainet, D dawood).
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

-- start clean: A and D do not follow each other
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM public.follows WHERE follower_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND followee_id = 'dddddddd-0000-0000-0000-000000000004';
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
DELETE FROM public.follows WHERE follower_id = 'dddddddd-0000-0000-0000-000000000004' AND followee_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- D posts: public with hashtags, friends-only, only-me
INSERT INTO public.posts (body) VALUES ('ښکلی افغانستان #Kabul #پښتو');
INSERT INTO public.posts (body, visibility) VALUES ('یوازې دوستانو ته', 'friends');
INSERT INTO public.posts (body, visibility) VALUES ('یوازې زه', 'private');
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body, visibility) VALUES ('x', 'everyone')$q$, 'bad visibility');
SELECT pg_temp.check((SELECT count(*) FROM public.get_user_posts('dddddddd-0000-0000-0000-000000000004') j
                      WHERE j->>'body' IN ('یوازې دوستانو ته', 'یوازې زه')) = 2, 'owner sees all own posts');

SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT count(*) FROM public.posts WHERE body IN ('یوازې دوستانو ته', 'یوازې زه')) = 0, 'stranger: table hides friends/private');
SELECT pg_temp.check((SELECT count(*) FROM public.get_feed('foryou', 0, 50) j WHERE j->>'body' IN ('یوازې دوستانو ته', 'یوازې زه')) = 0, 'stranger: feed hides them');
SELECT pg_temp.check((SELECT count(*) FROM public.get_user_posts('dddddddd-0000-0000-0000-000000000004') j WHERE j->>'body' = 'یوازې زه') = 0, 'stranger: profile hides private');
SELECT pg_temp.check(public.get_post((SELECT id FROM public.posts WHERE body = 'ښکلی افغانستان #Kabul #پښتو')) IS NOT NULL, 'public post visible');

-- follow each other → friends post visible, private still hidden
INSERT INTO public.follows (followee_id) VALUES ('dddddddd-0000-0000-0000-000000000004');
SELECT pg_temp.check((SELECT count(*) FROM public.posts WHERE body = 'یوازې دوستانو ته') = 0, 'one-way follow is not friends');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
INSERT INTO public.follows (followee_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((SELECT count(*) FROM public.posts WHERE body = 'یوازې دوستانو ته') = 1, 'friends see friends post');
SELECT pg_temp.check((SELECT count(*) FROM public.posts WHERE body = 'یوازې زه') = 0, 'friends do not see private post');
SELECT pg_temp.check((SELECT (j->>'following')::boolean FROM public.get_feed('foryou', 0, 50) j WHERE j->>'body' = 'یوازې دوستانو ته'), 'post says I follow author');

-- profile tabs
INSERT INTO public.posts (body, video_path) VALUES ('ریل', 'aaaaaaaa-0000-0000-0000-000000000001/r.mp4');
SELECT pg_temp.check((SELECT count(*) FROM public.get_user_posts('aaaaaaaa-0000-0000-0000-000000000001', 0, 60, 'reels') j WHERE j->>'video_path' IS NULL) = 0, 'reels tab = only videos');
SELECT pg_temp.check((SELECT count(*) FROM public.get_user_posts('aaaaaaaa-0000-0000-0000-000000000001', 0, 60, 'reels')) >= 1, 'reels tab has the reel');
SELECT pg_temp.check((SELECT count(*) FROM public.get_user_posts('aaaaaaaa-0000-0000-0000-000000000001', 0, 60, 'posts') j WHERE j->>'video_path' IS NOT NULL) = 0, 'posts tab = no videos');
SELECT pg_temp.check((SELECT count(*) FROM public.get_user_posts('aaaaaaaa-0000-0000-0000-000000000001', 0, 60))
                   = (SELECT count(*) FROM public.get_user_posts('aaaaaaaa-0000-0000-0000-000000000001', 0, 60, 'posts'))
                   + (SELECT count(*) FROM public.get_user_posts('aaaaaaaa-0000-0000-0000-000000000001', 0, 60, 'reels')), 'all = posts + reels');

-- edit: only the author
SELECT pg_temp.must_fail($q$SELECT public.update_post((SELECT id FROM public.posts WHERE body = 'یوازې دوستانو ته'), 'hacked', NULL)$q$, 'edit someone else''s post');
SELECT pg_temp.must_fail($q$UPDATE public.posts SET body = 'hacked' WHERE body = 'یوازې دوستانو ته'$q$, 'direct update');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT public.update_post((SELECT id FROM public.posts WHERE body = 'یوازې زه'), 'اوس د ټولو لپاره', 'public');
SELECT pg_temp.check((SELECT visibility = 'public' AND edited_at IS NOT NULL FROM public.posts WHERE body = 'اوس د ټولو لپاره'), 'author edits text + privacy');
SELECT public.update_post((SELECT id FROM public.posts WHERE body = 'اوس د ټولو لپاره'), NULL, 'private');

-- feedback: hide removes it from A's feed only
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.set_post_feedback((SELECT id FROM public.posts WHERE body = 'یوازې دوستانو ته'), 'not_interested');
SELECT pg_temp.check((SELECT count(*) FROM public.get_feed('foryou', 0, 50) j WHERE j->>'body' = 'یوازې دوستانو ته') = 0, 'not interested hides post');
SELECT pg_temp.must_fail($q$SELECT public.set_post_feedback((SELECT id FROM public.posts LIMIT 1), 'love')$q$, 'bad feedback kind');
SELECT pg_temp.must_fail($q$SELECT public.set_post_feedback((SELECT id FROM public.posts WHERE body = 'اوس د ټولو لپاره'), 'hide')$q$, 'feedback on invisible post');
SELECT public.set_post_feedback((SELECT id FROM public.posts WHERE body = 'یوازې دوستانو ته'), NULL);
SELECT pg_temp.check((SELECT count(*) FROM public.get_feed('foryou', 0, 50) j WHERE j->>'body' = 'یوازې دوستانو ته') = 1, 'undo feedback');

-- hashtags
SELECT pg_temp.check((SELECT count(*) FROM public.get_trending_tags(50) j WHERE j->>'tag' IN ('kabul', 'پښتو')) = 2, 'trending tags (English + Pashto)');
SELECT pg_temp.check((SELECT count(*) FROM public.get_tag_posts('#KABUL') j WHERE j->>'body' LIKE 'ښکلی%') = 1, 'tag posts (case-insensitive)');
SELECT pg_temp.check((SELECT count(*) FROM public.get_tag_posts('پښتو') ) = 1, 'Pashto tag posts');
SELECT pg_temp.check((SELECT count(*) FROM public.get_tag_posts('kab')) = 0, 'partial tag does not match');
SELECT pg_temp.check((SELECT count(*) FROM public.get_tag_posts('a.*')) = 0, 'regex in tag rejected');

-- presence
SELECT public.touch_presence();
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET last_seen_at = now() + interval '1 year' WHERE id = auth.uid()$q$, 'fake last seen');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((SELECT (j->>'last_seen_at')::timestamptz > now() - interval '1 minute'
                      FROM public.get_presence(ARRAY['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]) j), 'presence visible');

-- voice message
CREATE TEMP TABLE dm AS SELECT public.start_direct_chat('aaaaaaaa-0000-0000-0000-000000000001') AS id;
INSERT INTO public.messages (conversation_id, media_path, media_type) SELECT id, id::text || '/voice.m4a', 'audio' FROM dm;
SELECT pg_temp.check((SELECT last_message_preview = '🎤' FROM public.conversations WHERE id = (SELECT id FROM dm)), 'voice message preview');
SELECT pg_temp.must_fail($q$INSERT INTO public.messages (conversation_id, media_path, media_type) SELECT id, id::text || '/x.exe', 'file' FROM dm$q$, 'unknown media type');
RESET ROLE;

SELECT 'ALL REELS TESTS PASSED' AS result;
