-- Hardening: chat files stay in their chat; no TRUNCATE for app users.
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
CREATE TEMP TABLE hd (k text PRIMARY KEY, v uuid);
GRANT ALL ON hd TO authenticated;

SELECT pg_temp.check(NOT EXISTS (
  SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')), 'no truncate/trigger/references');

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO hd VALUES ('dm', public.start_direct_chat('cccccccc-0000-0000-0000-000000000003'));
-- own chat folder: fine
INSERT INTO public.messages (conversation_id, media_path, media_type)
  SELECT v, v::text || '/pic.jpg', 'image' FROM hd WHERE k = 'dm';
-- a file from another folder: blocked
SELECT pg_temp.must_fail($q$INSERT INTO public.messages (conversation_id, media_path, media_type) SELECT v, '11111111-2222-3333-4444-555555555555/secret.jpg', 'image' FROM hd WHERE k = 'dm'$q$, 'message pointing at another chat''s file');
RESET ROLE;
SELECT 'hardening tests passed';
