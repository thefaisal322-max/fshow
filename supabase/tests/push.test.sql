-- Push tokens: only your own; nothing readable; triggers never break sending.
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

-- hook configured (pg_net may be missing here: sending is then skipped, never an error)
SELECT public.set_push_hook('https://example.invalid/functions/v1/push', 'test-secret');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.save_push_token('tokenAAAAAAAAAAAAAAAAAAAAAAAAA', 'android', 'ps');
SELECT pg_temp.must_fail($q$SELECT * FROM public.push_tokens$q$, 'read tokens');
SELECT pg_temp.must_fail($q$SELECT public.set_push_hook('https://evil', 'x')$q$, 'user sets hook');
-- the same phone logs into another account → token moves
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT public.save_push_token('tokenAAAAAAAAAAAAAAAAAAAAAAAAA', 'android', 'en');
RESET ROLE;
SELECT pg_temp.check((SELECT user_id FROM public.push_tokens WHERE token = 'tokenAAAAAAAAAAAAAAAAAAAAAAAAA') = 'cccccccc-0000-0000-0000-000000000003', 'token moved to the new account');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.remove_push_token('tokenAAAAAAAAAAAAAAAAAAAAAAAAA');  -- not A's any more: nothing happens
RESET ROLE;
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.push_tokens WHERE token = 'tokenAAAAAAAAAAAAAAAAAAAAAAAAA'), 'others cannot remove my token');

-- triggers fire without breaking anything
INSERT INTO public.posts (author_id, body) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'push test');
INSERT INTO public.notifications (user_id, actor_id, type, post_id)
  SELECT 'cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'like', id FROM public.posts WHERE body = 'push test';
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.notifications n JOIN public.posts p ON p.id = n.post_id WHERE p.body = 'push test'), 'notification saved with push trigger');
DELETE FROM public.posts WHERE body = 'push test';
DELETE FROM private.push_hook;
DELETE FROM public.push_tokens WHERE token = 'tokenAAAAAAAAAAAAAAAAAAAAAAAAA';
SELECT 'push tests passed';
