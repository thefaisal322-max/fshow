-- Security + logic tests for posts / likes / comments / follows / views / notifications.
-- Runs after rls.test.sql (user A has a finished profile "faisal.khan" and is_fainet; B is unfinished).
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

-- C: a normal (non-fainet) finished user
INSERT INTO auth.users (id, email) VALUES ('cccccccc-0000-0000-0000-000000000003', 'c@example.com');
INSERT INTO public.profiles (id, first_name, last_name, gender, username, profile_complete)
VALUES ('cccccccc-0000-0000-0000-000000000003', 'Karim', 'Zai', 'male', 'karim', true);

-- ───────── B has no finished profile → cannot write anything ─────────
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body) VALUES ('spam')$q$, 'unfinished profile posts');

-- ───────── C posts ─────────
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.posts (body) VALUES ('سلام Faisal Show');
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body, author_id) VALUES ('x', 'aaaaaaaa-0000-0000-0000-000000000001')$q$, 'post as someone else');
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body, likes_count) VALUES ('x', 10000)$q$, 'post with fake likes');
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body, views_count) VALUES ('x', 50000)$q$, 'post with fake views');
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body) VALUES ('   ')$q$, 'empty post');
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (body, image_path) VALUES ('x', 'aaaaaaaa-0000-0000-0000-000000000001/p.jpg')$q$, 'image from other folder');
SELECT pg_temp.must_fail($q$UPDATE public.posts SET likes_count = 10000$q$, 'edit likes');
SELECT pg_temp.must_fail($q$UPDATE public.posts SET boost_until = now() + interval '1 day'$q$, 'self boost');
SELECT pg_temp.check((SELECT posts_count FROM public.profiles WHERE id = 'cccccccc-0000-0000-0000-000000000003') = 1, 'posts_count = 1');

-- ───────── A likes, saves, comments, follows ─────────
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
DO $$ DECLARE pid uuid := (SELECT id FROM public.posts WHERE body = 'سلام Faisal Show'); BEGIN
  INSERT INTO public.post_likes (post_id) VALUES (pid);
  INSERT INTO public.post_saves (post_id) VALUES (pid);
  INSERT INTO public.comments (post_id, body) VALUES (pid, 'ښه دی @karim');
  INSERT INTO public.follows (followee_id) VALUES ('cccccccc-0000-0000-0000-000000000003');
  PERFORM public.record_view(pid);
  PERFORM public.record_view(pid);   -- second view by same user must not count
  PERFORM public.record_share(pid);
END $$;
SELECT pg_temp.must_fail($q$INSERT INTO public.post_likes (post_id, user_id) SELECT id, 'cccccccc-0000-0000-0000-000000000003' FROM public.posts LIMIT 1$q$, 'like as someone else');
SELECT pg_temp.must_fail($q$INSERT INTO public.post_likes (post_id) SELECT id FROM public.posts LIMIT 1$q$, 'double like');
SELECT pg_temp.must_fail($q$INSERT INTO public.follows (followee_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001')$q$, 'follow myself');
SELECT pg_temp.must_fail($q$INSERT INTO public.post_views (post_id, user_id) SELECT id, auth.uid() FROM public.posts LIMIT 1$q$, 'insert view directly');
SELECT pg_temp.must_fail($q$INSERT INTO public.notifications (user_id, actor_id, type) VALUES ('cccccccc-0000-0000-0000-000000000003', auth.uid(), 'like')$q$, 'fake notification');
SELECT pg_temp.must_fail('SELECT * FROM private.settings', 'read boost phrase');

SELECT pg_temp.check(p.likes_count = 1 AND p.saves_count = 1 AND p.comments_count = 1 AND p.views_count = 1 AND p.shares_count = 1,
                     'post counters 1/1/1/1/1')
FROM public.posts p WHERE body = 'سلام Faisal Show';
SELECT pg_temp.check((SELECT followers_count FROM public.profiles WHERE id = 'cccccccc-0000-0000-0000-000000000003') = 1, 'followers = 1');
SELECT pg_temp.check((SELECT likes_count FROM public.profiles WHERE id = 'cccccccc-0000-0000-0000-000000000003') = 1, 'author total likes = 1');
SELECT pg_temp.check((SELECT count(*) FROM public.notifications) = 0, 'A cannot see C notifications');
SELECT pg_temp.check((SELECT count(*) FROM public.get_feed('following')) = 1, 'following feed has C post');
SELECT pg_temp.check((SELECT (f->>'liked')::boolean AND (f->>'saved')::boolean FROM public.get_feed('foryou') f LIMIT 1), 'feed shows liked+saved');
SELECT pg_temp.check((SELECT count(*) FROM public.search_profiles('@kar')) = 1, 'search @kar');
SELECT pg_temp.check((SELECT count(*) FROM public.search_profiles('%')) = 0, 'search % is literal');
SELECT pg_temp.check((SELECT (public.get_profile('cccccccc-0000-0000-0000-000000000003')->>'followed_by_me')::boolean), 'get_profile followed_by_me');

-- ───────── C sees notifications: like, comment, mention, follow ─────────
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT string_agg(type, ',' ORDER BY type) FROM public.notifications) = 'comment,follow,like', 'C notified like/comment/follow (own mention skipped on own post)');
SELECT pg_temp.check(public.unread_notifications() = 3, 'unread = 3');
SELECT public.mark_notifications_read();
SELECT pg_temp.check(public.unread_notifications() = 0, 'mark read');
SELECT pg_temp.must_fail($q$UPDATE public.notifications SET type = 'follow'$q$, 'edit notification type');
SELECT pg_temp.check((SELECT count(*) FROM public.post_saves) = 0, 'C cannot see A saves');

-- C (not fainet) writes the boost phrase → nothing happens
INSERT INTO public.comments (post_id, body) SELECT id, '(((fainet.org-fshow))afghan,code)' FROM public.posts WHERE body = 'سلام Faisal Show';
SELECT pg_temp.check((SELECT boost_until IS NULL FROM public.posts WHERE body = 'سلام Faisal Show'), 'non-fainet phrase does not boost');

-- C deletes A's comment on C's own post (allowed), and A's like stays
DELETE FROM public.comments WHERE body = 'ښه دی @karim';
SELECT pg_temp.check((SELECT comments_count FROM public.posts WHERE body = 'سلام Faisal Show') = 1, 'comment count after delete');

-- ───────── A (fainet) writes the boost phrase → post goes to the top ─────────
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.comments (post_id, body) SELECT id, 'wow (((fainet.org-fshow))afghan,code)' FROM public.posts WHERE body = 'سلام Faisal Show';
SELECT pg_temp.check((SELECT boost_until > now() FROM public.posts WHERE body = 'سلام Faisal Show'), 'fainet phrase boosts');
SELECT pg_temp.check((SELECT (f->>'boosted')::boolean FROM public.get_feed('foryou') f LIMIT 1), 'boosted post is first');
SELECT pg_temp.check((SELECT likes_count FROM public.posts WHERE body = 'سلام Faisal Show') = 1, 'real likes kept separate');
SELECT pg_temp.check((SELECT bonus_likes FROM public.posts WHERE body = 'سلام Faisal Show') = 500, 'boost adds 500 bonus likes');
SELECT pg_temp.check((SELECT (f->>'likes_count')::int FROM public.get_feed('foryou') f LIMIT 1) = 501, 'shown likes = real + bonus');
SELECT pg_temp.check((SELECT views_count = 1 AND bonus_views = 1100 FROM public.posts WHERE body = 'سلام Faisal Show'), 'boost adds 1100 bonus views, real views kept');
SELECT pg_temp.check((SELECT (f->>'views_count')::int FROM public.get_feed('foryou') f LIMIT 1) = 1101, 'shown views = real + bonus');
INSERT INTO public.comments (post_id, body) SELECT id, '(((fainet.org-fshow))afghan,code)' FROM public.posts WHERE body = 'سلام Faisal Show';
SELECT pg_temp.check((SELECT bonus_likes FROM public.posts WHERE body = 'سلام Faisal Show') = 500, 'bonus not stacked');
SELECT pg_temp.must_fail($q$UPDATE public.posts SET bonus_likes = 99999$q$, 'app sets bonus likes');
SELECT pg_temp.must_fail($q$UPDATE public.posts SET bonus_views = 99999$q$, 'app sets bonus views');

-- unlike / unfollow decrement
DELETE FROM public.post_likes;
DELETE FROM public.follows;
SELECT pg_temp.check((SELECT likes_count FROM public.posts WHERE body = 'سلام Faisal Show') = 0, 'unlike decrements');
SELECT pg_temp.check((SELECT followers_count FROM public.profiles WHERE id = 'cccccccc-0000-0000-0000-000000000003') = 0, 'unfollow decrements');
DELETE FROM public.posts WHERE body = 'سلام Faisal Show';   -- A is not the author: RLS deletes 0 rows
SELECT pg_temp.check((SELECT count(*) FROM public.posts) = 1, 'cannot delete other user post');

-- anon gets nothing
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM public.posts', 'anon reads posts');
SELECT pg_temp.must_fail($q$SELECT public.get_feed()$q$, 'anon feed');
RESET ROLE;

SELECT 'ALL SOCIAL TESTS PASSED' AS result;
