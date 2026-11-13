-- Friend requests (hold Follow 5 s), friends list, "friends only" messages.
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

-- clean start between A and C
DELETE FROM public.follows WHERE (follower_id, followee_id) IN (('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003'),
                                                               ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001'));
DELETE FROM public.conversations WHERE direct_key = 'aaaaaaaa-0000-0000-0000-000000000001:cccccccc-0000-0000-0000-000000000003';
DELETE FROM public.blocks WHERE blocker_id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003')
                            AND blocked_id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003');

SET ROLE authenticated;
-- C: only friends can message me
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
UPDATE public.profiles SET who_can_message = 'friends' WHERE id = auth.uid();

-- A follows C (one way) → still cannot message
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.follows (followee_id) VALUES ('cccccccc-0000-0000-0000-000000000003');
CREATE TEMP TABLE mr AS SELECT public.start_direct_chat('cccccccc-0000-0000-0000-000000000003') AS id;
SELECT pg_temp.check((SELECT NOT m.accepted FROM public.conversation_members m
                      WHERE m.conversation_id = (SELECT id FROM mr) AND m.user_id = 'cccccccc-0000-0000-0000-000000000003'), 'follower (not friend) → message request');
DROP TABLE mr;
RESET ROLE;
DELETE FROM public.conversations WHERE direct_key = 'aaaaaaaa-0000-0000-0000-000000000001:cccccccc-0000-0000-0000-000000000003';
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

-- A sends a friend request
SELECT pg_temp.check(public.send_friend_request('cccccccc-0000-0000-0000-000000000003') = 'sent', 'request sent');
SELECT pg_temp.check(public.send_friend_request('cccccccc-0000-0000-0000-000000000003') = 'sent', 'sending twice is fine');
SELECT pg_temp.check(public.get_profile('cccccccc-0000-0000-0000-000000000003')->>'friend_status' = 'sent', 'status sent');
SELECT pg_temp.must_fail($q$SELECT public.send_friend_request(auth.uid())$q$, 'request to myself');
SELECT pg_temp.must_fail($q$INSERT INTO public.friend_requests (from_id, to_id) VALUES ('dddddddd-0000-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000003')$q$, 'fake request row');
SELECT pg_temp.check((SELECT count(*) FROM public.get_sent_friend_requests() j WHERE j->>'id' = 'cccccccc-0000-0000-0000-000000000003') = 1, 'in my sent list');

-- C sees it + notification, D cannot answer it
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check(public.respond_friend_request('aaaaaaaa-0000-0000-0000-000000000001', true) = 'none', 'stranger cannot accept');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT count(*) FROM public.get_friend_requests() j WHERE j->>'id' = 'aaaaaaaa-0000-0000-0000-000000000001') = 1, 'incoming request listed');
SELECT pg_temp.check((public.get_friend_counts()->>'requests')::int >= 1, 'request count');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.notifications WHERE user_id = auth.uid() AND type = 'friend_request'), 'request notification');
SELECT pg_temp.check(public.get_profile('aaaaaaaa-0000-0000-0000-000000000001')->>'friend_status' = 'received', 'status received');

-- accept → both follow each other = friends
SELECT pg_temp.check(public.respond_friend_request('aaaaaaaa-0000-0000-0000-000000000001', true) = 'friends', 'accepted');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND followee_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'C follows A now');
SELECT pg_temp.check((SELECT count(*) FROM public.get_friends() j WHERE j->>'id' = 'aaaaaaaa-0000-0000-0000-000000000001') = 1, 'A in my friends');
SELECT pg_temp.check((SELECT count(*) FROM public.get_friend_requests()) = 0 OR NOT EXISTS (SELECT 1 FROM public.get_friend_requests() j WHERE j->>'id' = 'aaaaaaaa-0000-0000-0000-000000000001'), 'request gone');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check(public.get_profile('cccccccc-0000-0000-0000-000000000003')->>'friend_status' = 'friends', 'status friends');
SELECT pg_temp.check((public.get_profile('cccccccc-0000-0000-0000-000000000003')->>'friends_count')::int >= 1, 'friends count');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.notifications WHERE user_id = auth.uid() AND type = 'friend_accept'), 'accept notification');
SELECT pg_temp.check(public.start_direct_chat('cccccccc-0000-0000-0000-000000000003') IS NOT NULL, 'friends can message');

-- unfriend, then both send requests → auto friends
SELECT public.unfriend('cccccccc-0000-0000-0000-000000000003');
SELECT pg_temp.check(public.get_profile('cccccccc-0000-0000-0000-000000000003')->>'friend_status' = 'none', 'unfriended');
SELECT public.send_friend_request('cccccccc-0000-0000-0000-000000000003');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check(public.send_friend_request('aaaaaaaa-0000-0000-0000-000000000001') = 'friends', 'crossing requests = friends');

-- decline + cancel
SELECT public.unfriend('aaaaaaaa-0000-0000-0000-000000000001');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.send_friend_request('cccccccc-0000-0000-0000-000000000003');
SELECT public.cancel_friend_request('cccccccc-0000-0000-0000-000000000003');
SELECT pg_temp.check(public.get_profile('cccccccc-0000-0000-0000-000000000003')->>'friend_status' = 'none', 'cancelled');
SELECT public.send_friend_request('cccccccc-0000-0000-0000-000000000003');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check(public.respond_friend_request('aaaaaaaa-0000-0000-0000-000000000001', false) = 'none', 'declined');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.follows WHERE follower_id = auth.uid() AND followee_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'decline does not follow');

-- block clears requests
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.send_friend_request('cccccccc-0000-0000-0000-000000000003');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT public.block_user('aaaaaaaa-0000-0000-0000-000000000001');
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.get_friend_requests() j WHERE j->>'id' = 'aaaaaaaa-0000-0000-0000-000000000001'), 'block clears request');
SELECT public.unblock_user('aaaaaaaa-0000-0000-0000-000000000001');
UPDATE public.profiles SET who_can_message = 'everyone' WHERE id = auth.uid();
RESET ROLE;

SELECT 'ALL FRIENDS TESTS PASSED' AS result;
