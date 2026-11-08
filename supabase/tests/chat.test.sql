-- Security + logic tests for media posts, name edits and chats.
-- Runs after rls.test.sql and social.test.sql (A = faisal.khan fainet, B unfinished, C = karim).
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
CREATE TEMP TABLE ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON ids TO authenticated;

-- D: a fourth finished user who is NOT in the chat
INSERT INTO auth.users (id, email) VALUES ('dddddddd-0000-0000-0000-000000000004', 'd@example.com');
INSERT INTO public.profiles (id, first_name, last_name, gender, username, profile_complete)
VALUES ('dddddddd-0000-0000-0000-000000000004', 'Dawood', 'Khan', 'male', 'dawood', true);

SET ROLE authenticated;

-- ───────── video post, location, feeling; name edit ─────────
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.posts (body, video_path, location, feeling) VALUES ('', 'cccccccc-0000-0000-0000-000000000003/v.mp4', 'Kabul', '😊 خوشحاله');
SELECT pg_temp.check((SELECT count(*) FROM public.get_reels()) = 1, 'reels returns video post');
SELECT pg_temp.check((SELECT f->>'location' = 'Kabul' AND f->>'video_path' IS NOT NULL FROM public.get_reels() f), 'reel has location + video');
SELECT pg_temp.must_fail($q$INSERT INTO public.posts (video_path) VALUES ('aaaaaaaa-0000-0000-0000-000000000001/v.mp4')$q$, 'video from other folder');
UPDATE public.profiles SET first_name = 'کریم' WHERE id = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT first_name FROM public.profiles WHERE id = 'cccccccc-0000-0000-0000-000000000003') = 'کریم', 'edit own name');
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET first_name = '<script>' WHERE id = 'cccccccc-0000-0000-0000-000000000003'$q$, 'name with html');
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET is_fainet = true WHERE id = 'cccccccc-0000-0000-0000-000000000003'$q$, 'still cannot self-verify');

-- ───────── 1-to-1 chat A ↔ C ─────────
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
-- C follows A, so A's message goes straight to C's inbox (not to message requests)
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.follows (followee_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO ids VALUES ('dm', public.start_direct_chat('cccccccc-0000-0000-0000-000000000003'));
SELECT pg_temp.check(public.start_direct_chat('cccccccc-0000-0000-0000-000000000003') = (SELECT v FROM ids WHERE k = 'dm'), 'same DM reused');
SELECT pg_temp.must_fail($q$SELECT public.start_direct_chat('aaaaaaaa-0000-0000-0000-000000000001')$q$, 'chat with myself');
SELECT pg_temp.must_fail($q$SELECT public.start_direct_chat('bbbbbbbb-0000-0000-0000-000000000002')$q$, 'chat with unfinished profile');
INSERT INTO public.messages (conversation_id, body) SELECT v, 'سلام کریمه' FROM ids WHERE k = 'dm';
INSERT INTO ids SELECT 'm1', id FROM public.messages WHERE body = 'سلام کریمه';
SELECT pg_temp.must_fail($q$INSERT INTO public.messages (conversation_id, body, sender_id) SELECT v, 'fake', 'cccccccc-0000-0000-0000-000000000003' FROM ids WHERE k = 'dm'$q$, 'send as someone else');
SELECT pg_temp.must_fail($q$INSERT INTO public.messages (conversation_id, body, view_once) SELECT v, 'x', true FROM ids WHERE k = 'dm'$q$, 'view_once via insert');
SELECT pg_temp.must_fail($q$UPDATE public.messages SET body = 'edited'$q$, 'edit message');

-- view once with a photo
INSERT INTO ids SELECT 'once', public.send_view_once(v, 'یوازې یو ځل', v::text || '/once/p.jpg', 'image') FROM ids WHERE k = 'dm';
SELECT pg_temp.check((SELECT body = '' AND view_once FROM public.messages WHERE id = (SELECT v FROM ids WHERE k = 'once')), 'view-once body hidden in row');
SELECT pg_temp.must_fail($q$SELECT public.open_view_once((SELECT v FROM ids WHERE k = 'once'))$q$, 'sender cannot open own view-once');
SELECT pg_temp.must_fail($q$SELECT * FROM private.message_secrets$q$, 'read secrets table');
SELECT pg_temp.must_fail($q$SELECT public.send_view_once((SELECT v FROM ids WHERE k = 'dm'), '', 'aaaaaaaa-0000-0000-0000-000000000001/p.jpg', 'image')$q$, 'view-once media outside once folder');
INSERT INTO storage.objects (bucket_id, name) SELECT 'chats', v::text || '/p.jpg' FROM ids WHERE k = 'dm';
INSERT INTO storage.objects (bucket_id, name) SELECT 'chats', v::text || '/once/p.jpg' FROM ids WHERE k = 'dm';

-- ───────── D is not a member: sees nothing, can do nothing ─────────
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((SELECT count(*) FROM public.messages) = 0, 'outsider sees no messages');
SELECT pg_temp.check((SELECT count(*) FROM public.conversations) = 0, 'outsider sees no conversations');
SELECT pg_temp.check((SELECT count(*) FROM public.get_messages((SELECT v FROM ids WHERE k = 'dm'))) = 0, 'outsider get_messages empty');
SELECT pg_temp.check((SELECT count(*) FROM storage.objects WHERE bucket_id = 'chats') = 0, 'outsider sees no chat files');
SELECT pg_temp.must_fail($q$INSERT INTO public.messages (conversation_id, body) SELECT v, 'hi' FROM ids WHERE k = 'dm'$q$, 'outsider sends');
SELECT pg_temp.must_fail($q$SELECT public.open_view_once((SELECT v FROM ids WHERE k = 'once'))$q$, 'outsider opens view-once');
SELECT pg_temp.must_fail($q$INSERT INTO public.message_reactions (message_id, emoji) SELECT v, '❤️' FROM ids WHERE k = 'm1'$q$, 'outsider reacts');
SELECT pg_temp.must_fail($q$INSERT INTO storage.objects (bucket_id, name) SELECT 'chats', v::text || '/x.jpg' FROM ids WHERE k = 'dm'$q$, 'outsider uploads');

-- ───────── C (member) ─────────
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT (c->>'unread')::int = 2 FROM public.get_conversations() c), 'C has 2 unread');
SELECT pg_temp.check(public.unread_chats() = 1, 'unread_chats = 1');
SELECT pg_temp.check((SELECT count(*) FROM storage.objects WHERE bucket_id = 'chats') = 1, 'C sees normal file, not once file');
DO $$ DECLARE r jsonb; BEGIN
  r := public.open_view_once((SELECT v FROM ids WHERE k = 'once'));
  PERFORM pg_temp.check(r->>'body' = 'یوازې یو ځل' AND r->>'media_type' = 'image', 'C opens view-once');
END $$;
SELECT pg_temp.check((SELECT count(*) FROM storage.objects WHERE bucket_id = 'chats') = 2, 'once file readable for 60 s');
SELECT pg_temp.must_fail($q$SELECT public.open_view_once((SELECT v FROM ids WHERE k = 'once'))$q$, 'open view-once twice');
INSERT INTO public.message_reactions (message_id, emoji) SELECT v, '❤️' FROM ids WHERE k = 'm1';
SELECT pg_temp.must_fail($q$INSERT INTO public.message_reactions (message_id, emoji) SELECT v, '💩' FROM ids WHERE k = 'm1'$q$, 'unknown emoji');
UPDATE public.message_reactions SET emoji = '😂' WHERE user_id = auth.uid();
INSERT INTO public.messages (conversation_id, body, reply_to) SELECT (SELECT v FROM ids WHERE k = 'dm'), 'وعلیکم', (SELECT v FROM ids WHERE k = 'm1');
SELECT pg_temp.check((SELECT m->'reply'->>'body' = 'سلام کریمه' FROM public.get_messages((SELECT v FROM ids WHERE k = 'dm')) m WHERE m->>'body' = 'وعلیکم'), 'reply preview');
SELECT pg_temp.check((SELECT (m->'reactions'->>'😂')::int = 1 FROM public.get_messages((SELECT v FROM ids WHERE k = 'dm')) m WHERE m->>'body' = 'سلام کریمه'), 'reaction counted');
SELECT public.mark_chat_read((SELECT v FROM ids WHERE k = 'dm'));
SELECT pg_temp.check(public.unread_chats() = 0, 'mark read');
SELECT public.set_chat_archived((SELECT v FROM ids WHERE k = 'dm'), true);
SELECT pg_temp.check((SELECT count(*) FROM public.get_conversations(false)) = 0 AND (SELECT count(*) FROM public.get_conversations(true)) = 1, 'archive');
SELECT pg_temp.must_fail($q$SELECT public.delete_message((SELECT v FROM ids WHERE k = 'm1'))$q$, 'delete someone else message');
SELECT pg_temp.must_fail($q$UPDATE public.conversation_members SET role = 'admin'$q$, 'make myself admin');

-- A sends again → C's chat comes back from archive; A deletes for everyone
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO public.messages (conversation_id, body) SELECT v, 'زه یم' FROM ids WHERE k = 'dm';
SELECT public.delete_message((SELECT v FROM ids WHERE k = 'm1'));
SELECT pg_temp.check((SELECT deleted AND body = '' FROM public.messages WHERE id = (SELECT v FROM ids WHERE k = 'm1')), 'deleted for everyone');
SELECT pg_temp.check((SELECT count(*) FROM public.message_reactions) = 0, 'reactions removed with message');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT count(*) FROM public.get_conversations(false)) = 1, 'new message un-archives');

-- ───────── group chat ─────────
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO ids VALUES ('grp', public.create_group_chat('ملګري', ARRAY['cccccccc-0000-0000-0000-000000000003'::uuid, 'bbbbbbbb-0000-0000-0000-000000000002'::uuid]));
SELECT pg_temp.check((SELECT count(*) FROM public.conversation_members WHERE conversation_id = (SELECT v FROM ids WHERE k = 'grp')) = 2, 'group: unfinished B not added');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.add_group_members((SELECT v FROM ids WHERE k = 'grp'), ARRAY['dddddddd-0000-0000-0000-000000000004'::uuid])$q$, 'non-admin adds member');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.add_group_members((SELECT v FROM ids WHERE k = 'grp'), ARRAY['dddddddd-0000-0000-0000-000000000004'::uuid]);
SELECT public.leave_group_chat((SELECT v FROM ids WHERE k = 'grp'));
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((SELECT c->>'my_role' = 'admin' FROM public.get_conversations() c WHERE (c->>'is_group')::boolean), 'admin passed on after leaving');
SELECT pg_temp.must_fail($q$SELECT public.leave_group_chat((SELECT v FROM ids WHERE k = 'dm'))$q$, 'leave a 1-to-1 chat');

RESET ROLE;
SET ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM public.messages', 'anon reads messages');
SELECT pg_temp.must_fail($q$SELECT public.get_conversations()$q$, 'anon conversations');
RESET ROLE;

SELECT 'ALL CHAT TESTS PASSED' AS result;
