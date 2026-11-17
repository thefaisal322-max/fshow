-- Calls: only the two people, ringing → accepted → ended, busy, missed, chat line.
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
CREATE TEMP TABLE cl (k text PRIMARY KEY, v uuid);
GRANT ALL ON cl TO authenticated;

SET ROLE authenticated;
-- A ↔ C direct chat (exists from earlier tests; reused)
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO cl VALUES ('dm', public.start_direct_chat('cccccccc-0000-0000-0000-000000000003'));
-- make sure C accepted the chat (no message request)
RESET ROLE;
UPDATE public.conversation_members SET accepted = true WHERE conversation_id = (SELECT v FROM cl WHERE k = 'dm');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

-- 1) A calls C (video), C answers, A hangs up → ended + chat line
INSERT INTO cl SELECT 'c1', (public.start_call((SELECT v FROM cl WHERE k = 'dm'), true)->>'id')::uuid;
SELECT pg_temp.check((SELECT status FROM public.calls WHERE id = (SELECT v FROM cl WHERE k = 'c1')) = 'ringing', 'ringing');
SELECT pg_temp.must_fail($q$SELECT public.answer_call((SELECT v FROM cl WHERE k = 'c1'))$q$, 'caller answers own call');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((public.my_ringing_call()->>'id')::uuid = (SELECT v FROM cl WHERE k = 'c1'), 'C sees it ringing');
SELECT pg_temp.check((public.answer_call((SELECT v FROM cl WHERE k = 'c1'))->>'status') = 'accepted', 'C answers');
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((public.end_call((SELECT v FROM cl WHERE k = 'c1'))->>'status') = 'ended', 'ended');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.get_messages((SELECT v FROM cl WHERE k = 'dm')) j WHERE (j->'call'->>'status') = 'ended' AND (j->'call'->>'video')::boolean), 'call line in chat');

-- 2) A calls, C declines
INSERT INTO cl SELECT 'c2', (public.start_call((SELECT v FROM cl WHERE k = 'dm'), false)->>'id')::uuid;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((public.end_call((SELECT v FROM cl WHERE k = 'c2'))->>'status') = 'declined', 'declined');

-- 3) A calls, cancels before answer → missed
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO cl SELECT 'c3', (public.start_call((SELECT v FROM cl WHERE k = 'dm'), false)->>'id')::uuid;
SELECT pg_temp.check((public.end_call((SELECT v FROM cl WHERE k = 'c3'))->>'status') = 'missed', 'missed');

-- 4) outsider D cannot see / end / answer
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((SELECT count(*) FROM public.calls) = 0, 'outsider sees no calls');
SELECT pg_temp.must_fail($q$SELECT public.end_call((SELECT v FROM cl WHERE k = 'c1'))$q$, 'outsider ends call');
SELECT pg_temp.check(public.get_call((SELECT v FROM cl WHERE k = 'c1')) IS NULL, 'outsider get_call');
SELECT pg_temp.must_fail($q$SELECT public.start_call((SELECT v FROM cl WHERE k = 'dm'), false)$q$, 'outsider calls in others chat');
SELECT pg_temp.must_fail($q$INSERT INTO public.calls (conversation_id, caller_id, callee_id) SELECT v, 'dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001' FROM cl WHERE k = 'dm'$q$, 'insert call row');

-- 5) busy: C is in a call with A; D↔C chat → D calls C → busy
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO cl SELECT 'c4', (public.start_call((SELECT v FROM cl WHERE k = 'dm'), false)->>'id')::uuid;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT public.answer_call((SELECT v FROM cl WHERE k = 'c4'));
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
INSERT INTO cl VALUES ('dm2', public.start_direct_chat('cccccccc-0000-0000-0000-000000000003'));
RESET ROLE;
UPDATE public.conversation_members SET accepted = true WHERE conversation_id = (SELECT v FROM cl WHERE k = 'dm2');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.check((public.start_call((SELECT v FROM cl WHERE k = 'dm2'), false)->>'status') = 'busy', 'busy');

-- 6) stale ringing (60 s) counts as missed and cannot be answered
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.end_call((SELECT v FROM cl WHERE k = 'c4'));
INSERT INTO cl SELECT 'c5', (public.start_call((SELECT v FROM cl WHERE k = 'dm'), false)->>'id')::uuid;
RESET ROLE;
UPDATE public.calls SET created_at = now() - interval '2 minutes' WHERE id = (SELECT v FROM cl WHERE k = 'c5');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.answer_call((SELECT v FROM cl WHERE k = 'c5'))$q$, 'answer an old call');
SELECT pg_temp.check((public.get_call((SELECT v FROM cl WHERE k = 'c5'))->>'status') = 'missed', 'old ringing shows missed');
RESET ROLE;
SELECT 'calls tests passed';
