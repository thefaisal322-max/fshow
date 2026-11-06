-- Security tests for the accounts migration. Runs as a superuser, switching roles
-- to act like the app. Every block raises an error if a rule is broken.
\set ON_ERROR_STOP 1

-- Two users: A and B
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@fainet.org'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com');
INSERT INTO public.profiles (id, first_name, last_name, gender, is_fainet) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'احمد', 'خان', 'male', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Bibi', 'Khan', 'female', false);
INSERT INTO public.profiles_private (id, email, birthday) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@fainet.org', '2000-01-01'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com', '1999-01-01');

-- helper: expect a statement to fail
CREATE FUNCTION pg_temp.must_fail(stmt text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'SECURITY HOLE: % succeeded', label;
EXCEPTION
  WHEN raise_exception THEN RAISE;
  WHEN OTHERS THEN RAISE NOTICE 'ok (blocked): % → %', label, SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.must_fail(text, text) TO anon, authenticated;

-- ───────── anon (not logged in) ─────────
SET ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM public.profiles', 'anon reads profiles');
SELECT pg_temp.must_fail('SELECT * FROM public.profiles_private', 'anon reads private');
SELECT pg_temp.must_fail('SELECT public.claim_username(''x123'')', 'anon claims username');
RESET ROLE;

-- ───────── user A ─────────
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 2 THEN RAISE EXCEPTION 'A should see both profiles'; END IF;
  IF (SELECT count(*) FROM public.profiles_private) <> 1 THEN RAISE EXCEPTION 'A must see only own private row'; END IF;
END $$;

-- allowed: own bio + photo in own folder
UPDATE public.profiles SET bio = 'سلام' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.profiles SET photo_path = 'aaaaaaaa-0000-0000-0000-000000000001/avatar.jpg' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- blocked
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET is_fainet = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 'set is_fainet');
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET likes_count = 10000 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 'fake likes');
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET username = 'hacker' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 'username without claim');
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET photo_path = 'bbbbbbbb-0000-0000-0000-000000000002/x.jpg' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$q$, 'photo from other folder');
SELECT pg_temp.must_fail($q$INSERT INTO public.profiles (id, first_name, last_name, gender) VALUES (gen_random_uuid(), 'x', 'y', 'male')$q$, 'create profile');
SELECT pg_temp.must_fail($q$DELETE FROM public.profiles WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$, 'delete profile');
SELECT pg_temp.must_fail('SELECT * FROM private.email_codes', 'read codes');
SELECT pg_temp.must_fail('SELECT * FROM private.rate_limits', 'read rate limits');
SELECT pg_temp.must_fail($q$UPDATE public.profiles_private SET email = 'x@y.z'$q$, 'change own email directly');

-- updating someone else's row silently affects 0 rows (RLS)
DO $$ DECLARE n int; BEGIN
  UPDATE public.profiles SET bio = 'hacked' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A changed B''s bio'; END IF;
END $$;

-- claim_username
SELECT pg_temp.must_fail($q$SELECT public.claim_username('.bad')$q$, 'invalid username');
SELECT pg_temp.must_fail($q$SELECT public.claim_username('admin')$q$, 'reserved username');
DO $$ DECLARE r public.profiles; BEGIN
  r := public.claim_username('@Faisal.Khan', 'bio');
  IF r.username <> 'faisal.khan' OR NOT r.profile_complete THEN RAISE EXCEPTION 'claim failed: %', r; END IF;
END $$;

-- storage: own folder ok, other folder blocked
INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/avatar.jpg');
SELECT pg_temp.must_fail($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'bbbbbbbb-0000-0000-0000-000000000002/avatar.jpg')$q$, 'upload to other folder');
SELECT pg_temp.must_fail($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'avatar.jpg')$q$, 'upload to bucket root');

-- ───────── user B ─────────
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.must_fail($q$SELECT public.claim_username('faisal.khan')$q$, 'taken username');
DO $$ BEGIN
  IF (SELECT bio FROM public.profiles WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002') <> '' THEN RAISE EXCEPTION 'B bio changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles_private WHERE email = 'a@fainet.org') THEN RAISE EXCEPTION 'B sees A email'; END IF;
END $$;
RESET ROLE;

SELECT 'ALL RLS TESTS PASSED' AS result;
