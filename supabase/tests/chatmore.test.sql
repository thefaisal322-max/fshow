-- Any-emoji reactions, delete for me, forwarded flag, profile link preview.
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
CREATE TEMP TABLE cm (k text PRIMARY KEY, v uuid);
GRANT ALL ON cm TO authenticated;

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO cm VALUES ('dm', public.start_direct_chat('cccccccc-0000-0000-0000-000000000003'));
INSERT INTO public.messages (conversation_id, body) SELECT v, 'hide me' FROM cm WHERE k = 'dm';
INSERT INTO public.messages (conversation_id, body, forwarded) SELECT v, 'fwd text', true FROM cm WHERE k = 'dm';
INSERT INTO cm SELECT 'msg', id FROM public.messages WHERE body = 'hide me' ORDER BY created_at DESC LIMIT 1;

-- C reacts with any emoji
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO public.message_reactions (message_id, emoji) SELECT v, '🔥' FROM cm WHERE k = 'msg';
SELECT pg_temp.check((SELECT emoji FROM public.message_reactions WHERE message_id = (SELECT v FROM cm WHERE k = 'msg')) = '🔥', 'any emoji reaction');
SELECT pg_temp.must_fail($q$UPDATE public.message_reactions SET emoji = 'hello' WHERE message_id = (SELECT v FROM cm WHERE k = 'msg')$q$, 'text as reaction');
SELECT pg_temp.must_fail($q$UPDATE public.message_reactions SET emoji = '<b>x</b>' WHERE message_id = (SELECT v FROM cm WHERE k = 'msg')$q$, 'markup as reaction');

-- forwarded shows
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.get_messages((SELECT v FROM cm WHERE k = 'dm')) j WHERE j->>'body' = 'fwd text' AND (j->>'forwarded')::boolean), 'forwarded flag');

-- delete for me (C) → gone for C only
SELECT public.hide_message((SELECT v FROM cm WHERE k = 'msg'));
SELECT pg_temp.check(NOT EXISTS (SELECT 1 FROM public.get_messages((SELECT v FROM cm WHERE k = 'dm')) j WHERE j->>'body' = 'hide me'), 'hidden for me');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.get_messages((SELECT v FROM cm WHERE k = 'dm')) j WHERE j->>'body' = 'hide me'), 'still there for the other person');
SELECT pg_temp.must_fail($q$SELECT * FROM public.message_hidden$q$, 'read hidden table');

-- D (not in the chat) cannot hide it
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.must_fail($q$SELECT public.hide_message((SELECT v FROM cm WHERE k = 'msg'))$q$, 'outsider hides message');
RESET ROLE;

-- profile link preview: public info, works without login
GRANT SELECT ON cm TO anon;
SET ROLE anon;
SELECT pg_temp.check((public.get_profile_link_preview('cccccccc-0000-0000-0000-000000000003')->>'id') IS NOT NULL, 'anon sees profile preview');
SELECT pg_temp.check(public.get_profile_link_preview('bbbbbbbb-0000-0000-0000-000000000002') IS NULL, 'unfinished profile has no preview');
RESET ROLE;
SELECT 'chat more tests passed';
