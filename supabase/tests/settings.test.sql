-- Secret codes (anyone, hidden as fingerprints), privacy, message requests, friend requests, monetization.
-- Runs after the other test files (C karim, D dawood).
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

-- clean start between C and D
DELETE FROM public.conversations WHERE direct_key = 'cccccccc-0000-0000-0000-000000000003:dddddddd-0000-0000-0000-000000000004';
DELETE FROM public.follows WHERE (follower_id, followee_id) IN (('cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004'),
                                                               ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003'));
DELETE FROM public.blocks WHERE blocker_id IN ('cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004')
                            AND blocked_id IN ('cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004');
UPDATE public.profiles SET verified = false, is_fainet = false, bonus_followers = 0 WHERE id = 'dddddddd-0000-0000-0000-000000000004';

-- The real codes are secret (only fingerprints in the database). Tests use their own made-up codes.
UPDATE private.settings SET value = encode(sha256(convert_to('fshow-code:' || x.t, 'UTF8')), 'hex')
FROM (VALUES ('code_followers', 'qa.test..Nfans.please'), ('code_likes', 'qa.test..Nhearts.please'),
             ('code_views', 'qa.test..Neyes.please'), ('code_remove', 'qa.test.clean.my.numbers'),
             ('code_verify', 'qa.test.blue.tick.please')) AS x(k, t)
WHERE key = x.k;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
INSERT INTO public.posts (body) VALUES ('codes test');
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET bonus_followers = 999 WHERE id = auth.uid()$q$, 'self fake followers');
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET verified = true WHERE id = auth.uid()$q$, 'self verify');

-- C (not fainet) uses the codes on D's post
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.comments (post_id, body) SELECT id, 'QA.test..1000 fans.please..' FROM public.posts WHERE body = 'codes test';
INSERT INTO public.comments (post_id, body) SELECT id, 'qa.test..250hearts.please' FROM public.posts WHERE body = 'codes test';
INSERT INTO public.comments (post_id, body) SELECT id, 'qa.test..12000eyes.please' FROM public.posts WHERE body = 'codes test';
SELECT pg_temp.check((public.get_profile('dddddddd-0000-0000-0000-000000000004')->>'followers_count')::int >= 1000, '+1000 followers');
SELECT pg_temp.check((SELECT (j->>'likes_count')::int >= 250 AND (j->>'views_count')::int >= 12000 FROM public.get_post((SELECT id FROM public.posts WHERE body = 'codes test')) j), '+likes +views');
SELECT pg_temp.check((SELECT count(*) FROM public.comments WHERE post_id = (SELECT id FROM public.posts WHERE body = 'codes test')) = 0, 'code comments not saved');
INSERT INTO public.comments (post_id, body) SELECT id, 'QA.Test.Blue.Tick.Please' FROM public.posts WHERE body = 'codes test';
SELECT pg_temp.check((public.get_profile('dddddddd-0000-0000-0000-000000000004')->>'is_fainet')::boolean, 'verify code gives ✓');
INSERT INTO public.comments (post_id, body) SELECT id, 'just a normal comment' FROM public.posts WHERE body = 'codes test';
SELECT pg_temp.check((SELECT count(*) FROM public.comments WHERE post_id = (SELECT id FROM public.posts WHERE body = 'codes test')) = 1, 'normal comment saved');

-- monetization: D now has 1000+ followers and 12000 views
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check(public.apply_for('monetize') = 'pending', 'eligible → applied');
SELECT pg_temp.check(public.get_creator_stats()->>'monetize' = 'pending', 'application status');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.comments (post_id, body) SELECT id, 'qa.test.clean.my.numbers.' FROM public.posts WHERE body = 'codes test';
SELECT pg_temp.check((public.get_profile('dddddddd-0000-0000-0000-000000000004')->>'followers_count')::int < 1000, 'fakes removed');
SELECT pg_temp.check((SELECT (j->>'likes_count')::int < 250 FROM public.get_post((SELECT id FROM public.posts WHERE body = 'codes test')) j), 'fake likes removed');
SELECT pg_temp.must_fail($q$SELECT public.apply_for('monetize')$q$, 'not eligible');
SELECT pg_temp.check(public.apply_for('verify') = 'pending', 'verification request');

-- privacy: who can message me
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
UPDATE public.profiles SET who_can_message = 'nobody' WHERE id = auth.uid();
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.start_direct_chat('dddddddd-0000-0000-0000-000000000004')$q$, 'nobody can message');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
UPDATE public.profiles SET who_can_message = 'followers' WHERE id = auth.uid();
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.start_direct_chat('dddddddd-0000-0000-0000-000000000004')$q$, 'only people D follows');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
UPDATE public.profiles SET who_can_message = 'everyone' WHERE id = auth.uid();

-- message request: C → D (D does not follow C)
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
CREATE TEMP TABLE req AS SELECT public.start_direct_chat('dddddddd-0000-0000-0000-000000000004') AS id;
INSERT INTO public.messages (conversation_id, body) SELECT id, 'سلام' FROM req;
SELECT pg_temp.check((SELECT count(*) FROM public.get_conversations() j WHERE (j->>'id')::uuid = (SELECT id FROM req)) = 1, 'sender sees the chat');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((SELECT count(*) FROM public.get_conversations() j WHERE (j->>'id')::uuid = (SELECT id FROM req)) = 0, 'not in D inbox');
SELECT pg_temp.check((SELECT count(*) FROM public.get_message_requests() j WHERE (j->>'id')::uuid = (SELECT id FROM req)) = 1, 'in D message requests');
SELECT pg_temp.check((public.request_counts()->>'messages')::int >= 1, 'request count');
SELECT public.accept_message_request((SELECT id FROM req));
SELECT pg_temp.check((SELECT count(*) FROM public.get_conversations() j WHERE (j->>'id')::uuid = (SELECT id FROM req)) = 1, 'accepted → inbox');

-- friend request: C follows D, D has not followed back
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.follows (followee_id) VALUES ('dddddddd-0000-0000-0000-000000000004');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((SELECT count(*) FROM public.get_friend_requests() j WHERE j->>'id' = 'cccccccc-0000-0000-0000-000000000003') = 1, 'friend request listed');
SELECT public.dismiss_friend_request('cccccccc-0000-0000-0000-000000000003');
SELECT pg_temp.check((SELECT count(*) FROM public.get_friend_requests() j WHERE j->>'id' = 'cccccccc-0000-0000-0000-000000000003') = 0, 'friend request removed');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.follows WHERE follower_id = 'cccccccc-0000-0000-0000-000000000003' AND followee_id = auth.uid()), 'C still follows D');

-- how people find you
UPDATE public.profiles SET searchable = false, city = 'Kabul', website = 'https://fainet.org' WHERE id = auth.uid();
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET website = 'javascript:alert(1)' WHERE id = auth.uid()$q$, 'bad website');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM public.follows WHERE followee_id = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((SELECT count(*) FROM public.search_profiles('dawood k') j WHERE j->>'id' = 'dddddddd-0000-0000-0000-000000000004') = 0, 'hidden from search');
SELECT pg_temp.check((SELECT count(*) FROM public.search_profiles('dawood') j WHERE j->>'id' = 'dddddddd-0000-0000-0000-000000000004') = 1, 'exact @username still finds');
SELECT pg_temp.check((SELECT count(*) FROM public.suggest_people(30) j WHERE j->>'id' = 'dddddddd-0000-0000-0000-000000000004') = 0, 'not suggested');
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check(public.set_all_posts_visibility('friends') >= 1, 'all my posts → friends');
SELECT pg_temp.must_fail($q$SELECT public.set_all_posts_visibility('world')$q$, 'bad visibility');
RESET ROLE;

SELECT 'ALL SETTINGS TESTS PASSED' AS result;
