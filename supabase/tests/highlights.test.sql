-- Highlights: only my own stories; others can see them; blocked people cannot. Notification prefs.
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
CREATE TEMP TABLE hl (k text PRIMARY KEY, v uuid);
GRANT ALL ON hl TO authenticated;

-- an old (expired) story of A and a story of C
INSERT INTO public.stories (author_id, media_path, media_type, created_at, expires_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001/stories/old.jpg', 'image', now() - interval '3 days', now() - interval '2 days'),
       ('cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003/stories/c.jpg', 'image', now(), now() + interval '1 day');
INSERT INTO hl SELECT 'sa', id FROM public.stories WHERE media_path LIKE '%/old.jpg';
INSERT INTO hl SELECT 'sc', id FROM public.stories WHERE media_path LIKE '%/c.jpg';

SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
INSERT INTO hl SELECT 'h', public.add_to_highlight((SELECT v FROM hl WHERE k = 'sa'), NULL, 'Kabul 2026');
SELECT pg_temp.must_fail($q$SELECT public.add_to_highlight((SELECT v FROM hl WHERE k = 'sc'), NULL, 'steal')$q$, 'add someone else''s story');
SELECT pg_temp.must_fail($q$SELECT * FROM public.story_highlights$q$, 'read highlight table directly');
SELECT pg_temp.check(jsonb_array_length(public.my_highlights()) = 1, 'my highlights');

-- C sees A's highlight (story expired, still in the highlight)
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((public.get_highlights('aaaaaaaa-0000-0000-0000-000000000001')->0->>'title') = 'Kabul 2026', 'others see the highlight');
SELECT pg_temp.check(jsonb_array_length(public.get_highlights('aaaaaaaa-0000-0000-0000-000000000001')->0->'stories') = 1, 'expired story kept in highlight');
SELECT public.rename_highlight((SELECT v FROM hl WHERE k = 'h'), 'hacked');
SELECT public.delete_highlight((SELECT v FROM hl WHERE k = 'h'));
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT pg_temp.check((public.my_highlights()->0->>'title') = 'Kabul 2026', 'others cannot rename/delete');

-- blocked → hidden
RESET ROLE;
INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003') ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check(jsonb_array_length(public.get_highlights('aaaaaaaa-0000-0000-0000-000000000001')) = 0, 'blocked user sees nothing');
RESET ROLE;
DELETE FROM public.blocks WHERE blocker_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND blocked_id = 'cccccccc-0000-0000-0000-000000000003';

-- remove last story → highlight gone
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.remove_from_highlight((SELECT v FROM hl WHERE k = 'h'), (SELECT v FROM hl WHERE k = 'sa'));
SELECT pg_temp.check(jsonb_array_length(public.my_highlights()) = 0, 'empty highlight removed');

-- notification prefs: only known kinds
UPDATE public.profiles SET notif_off = ARRAY['like', 'message'] WHERE id = auth.uid();
SELECT pg_temp.must_fail($q$UPDATE public.profiles SET notif_off = ARRAY['banana'] WHERE id = auth.uid()$q$, 'unknown kind');
RESET ROLE;
SELECT pg_temp.check((SELECT notif_off FROM public.profiles WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001') = ARRAY['like', 'message'], 'prefs saved');
UPDATE public.profiles SET notif_off = '{}' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
DELETE FROM public.stories WHERE media_path LIKE '%/old.jpg' OR media_path LIKE '%/c.jpg';
SELECT 'highlights tests passed';
