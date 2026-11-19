-- Live + Match: rules (50 followers, 15+), viewers, comments, most comment, taps (3 FC per tapper), bought taps, gifts, rounds, end card
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
UPDATE private.settings SET value = value || ',57e2eefa5f0fa23c32cef204a40ca5d666515eac8807a40ceb65b4b2c3b55464'
 WHERE key = 'admin_email_hashes' AND value NOT LIKE '%57e2eefa5f0fa23c32cef204a40ca5d666515eac8807a40ceb65b4b2c3b55464%';
-- five extra viewers
INSERT INTO auth.users (id, email) SELECT ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'e' || i || '@example.com' FROM generate_series(1, 5) i ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, first_name, last_name, gender, profile_complete, username)
SELECT ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'Viewer', (ARRAY['Aa','Bb','Cc','Dd','Ee'])[i], 'male', true, 'viewer_e' || i FROM generate_series(1, 5) i ON CONFLICT DO NOTHING;
INSERT INTO public.profiles_private (id, email, birthday)
SELECT ('eeeeeeee-0000-0000-0000-00000000000' || i)::uuid, 'e' || i || '@example.com', '2000-05-05' FROM generate_series(1, 5) i ON CONFLICT DO NOTHING;
UPDATE public.profiles SET profile_complete = true, banned = false
 WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004');
UPDATE public.profiles SET username = 'bibi_t' WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002' AND username IS NULL;
UPDATE public.profiles SET username = 'cc_live' WHERE id = 'cccccccc-0000-0000-0000-000000000003' AND username IS NULL;
INSERT INTO public.profiles_private (id, email, birthday) VALUES ('cccccccc-0000-0000-0000-000000000003', 'c@example.com', '2001-01-01'),
  ('dddddddd-0000-0000-0000-000000000004', 'd@example.com', '2001-01-01') ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles_private SET birthday = '2001-01-01' WHERE id IN ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003');
UPDATE public.profiles_private SET birthday = (now() - interval '13 years')::date WHERE id = 'dddddddd-0000-0000-0000-000000000004';
UPDATE public.profiles SET bonus_followers = 0, followers_count = 3 WHERE id = 'cccccccc-0000-0000-0000-000000000003';
CREATE TEMP TABLE lv (k text PRIMARY KEY, v uuid);
GRANT ALL ON lv TO authenticated;

SET ROLE authenticated;
-- C has few followers → no live
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.live_start('hi')$q$, 'live under 50 followers');
RESET ROLE;
UPDATE public.profiles SET bonus_followers = 60 WHERE id IN ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
INSERT INTO lv SELECT 'live', public.live_start('Kabul night');
SELECT pg_temp.check((public.live_get((SELECT v FROM lv WHERE k = 'live'))->>'i_host')::boolean, 'host in room');
SELECT pg_temp.must_fail($q$SELECT * FROM public.live_viewers$q$, 'read viewers table');
-- D is 13 → cannot watch
SET request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000004';
SELECT pg_temp.must_fail($q$SELECT public.live_get((SELECT v FROM lv WHERE k = 'live'))$q$, 'under 15 cannot watch');
-- five viewers write the same comment → "most comments"
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000001';
SELECT public.live_get((SELECT v FROM lv WHERE k = 'live'));
SELECT public.live_comment((SELECT v FROM lv WHERE k = 'live'), 'Mashallah 🔥');
SELECT pg_temp.must_fail($q$SELECT public.live_comment((SELECT v FROM lv WHERE k = 'live'), 'again')$q$, 'comment flood');
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000002';
SELECT public.live_comment((SELECT v FROM lv WHERE k = 'live'), 'mashallah 🔥');
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000003';
SELECT public.live_comment((SELECT v FROM lv WHERE k = 'live'), 'Mashallah 🔥 ');
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000004';
SELECT public.live_comment((SELECT v FROM lv WHERE k = 'live'), 'Mashallah 🔥');
SELECT pg_temp.check(public.live_get((SELECT v FROM lv WHERE k = 'live'))->'most_comment' IS NULL OR public.live_get((SELECT v FROM lv WHERE k = 'live'))->'most_comment' = 'null', '4 people: not yet');
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000005';
SELECT public.live_comment((SELECT v FROM lv WHERE k = 'live'), 'MASHALLAH 🔥');
SELECT pg_temp.check((public.live_get((SELECT v FROM lv WHERE k = 'live'))->'most_comment'->>'count')::int = 5, 'most comment ×5');
SELECT pg_temp.check((public.live_get((SELECT v FROM lv WHERE k = 'live'))->>'viewers')::int >= 1, 'viewers counted');
SELECT pg_temp.check(EXISTS (SELECT 1 FROM public.live_events WHERE live_id = (SELECT v FROM lv WHERE k = 'live') AND kind = 'comment'), 'feed readable while live');
SELECT pg_temp.must_fail($q$INSERT INTO public.live_events (live_id, kind, body) VALUES ((SELECT v FROM lv WHERE k = 'live'), 'comment', 'x')$q$, 'write feed directly');
-- co-host: invite B, B accepts; a viewer cannot kick
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT public.live_invite((SELECT v FROM lv WHERE k = 'live'), '@bibi_t');
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT pg_temp.check(public.live_get((SELECT v FROM lv WHERE k = 'live'), false)->>'my_invite' = 'A', 'invite seen');
SELECT public.live_accept((SELECT v FROM lv WHERE k = 'live'));
SELECT pg_temp.check(jsonb_array_length(public.live_get((SELECT v FROM lv WHERE k = 'live'))->'hosts') = 2, '2 hosts');
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000001';
SELECT pg_temp.must_fail($q$SELECT public.live_kick((SELECT v FROM lv WHERE k = 'live'), 'bbbbbbbb-0000-0000-0000-000000000002')$q$, 'viewer kicks');
SELECT pg_temp.must_fail($q$SELECT public.live_tap((SELECT v FROM lv WHERE k = 'live'), 'A', 5)$q$, 'no tap bar in a live');
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT public.live_kick((SELECT v FROM lv WHERE k = 'live'), 'bbbbbbbb-0000-0000-0000-000000000002');
SELECT pg_temp.check(jsonb_array_length(public.live_get((SELECT v FROM lv WHERE k = 'live'))->'hosts') = 1, 'kicked');
-- end → card from the admin account
SELECT public.live_end((SELECT v FROM lv WHERE k = 'live'));
RESET ROLE;
SELECT pg_temp.check((SELECT status = 'ended' AND card_post_id IS NOT NULL FROM public.lives WHERE id = (SELECT v FROM lv WHERE k = 'live')), 'ended with a card');
SELECT pg_temp.check((SELECT p.author_id = 'aaaaaaaa-0000-0000-0000-000000000001' AND p.body LIKE '🔴 Live%' AND p.body LIKE '%Most comments%'
                      FROM public.posts p JOIN public.lives l ON l.card_post_id = p.id WHERE l.id = (SELECT v FROM lv WHERE k = 'live')), 'card posted by admin');

-- MATCH: C (A side) vs B (B side), tier A+ (999 FC to the admin)
INSERT INTO public.wallets (user_id) VALUES ('cccccccc-0000-0000-0000-000000000003'), ('eeeeeeee-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
UPDATE public.wallets SET balance = 0 WHERE user_id IN ('cccccccc-0000-0000-0000-000000000003', 'eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
SELECT private.fc_add('cccccccc-0000-0000-0000-000000000003', 1000, 'admin_grant', 'live-test');
SELECT private.fc_add('eeeeeeee-0000-0000-0000-000000000001', 500, 'admin_grant', 'live-test');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.must_fail($q$SELECT public.match_create('special', 'fuck you', '@bibi_t')$q$, 'bad match name');
SELECT pg_temp.must_fail($q$SELECT public.match_create('afg', NULL, '@bibi_t')$q$, 'not enough coins for AFG');
INSERT INTO lv SELECT 'm', public.match_create('aplus', NULL, '@bibi_t');
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = 1, 'paid 999');
SELECT pg_temp.check(public.live_get((SELECT v FROM lv WHERE k = 'm'))->>'status' = 'waiting', 'waiting for opponent');
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT public.live_accept((SELECT v FROM lv WHERE k = 'm'));
SELECT pg_temp.check(public.live_get((SELECT v FROM lv WHERE k = 'm'))->>'status' = 'live', 'match started');
-- taps: E1 taps A three times (once counted per 0.7 s), E2 taps B; each new tapper = 3 FC to that host
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000001';
SELECT public.live_get((SELECT v FROM lv WHERE k = 'm'));
SELECT public.live_tap((SELECT v FROM lv WHERE k = 'm'), 'A', 10);
SELECT public.live_tap((SELECT v FROM lv WHERE k = 'm'), 'A', 10);
SELECT pg_temp.check((public.live_get((SELECT v FROM lv WHERE k = 'm'))->>'taps_a')::int = 10, 'tap flood limited');
SELECT public.live_buy_taps((SELECT v FROM lv WHERE k = 'm'), 'A', 2);
SELECT pg_temp.check((public.live_get((SELECT v FROM lv WHERE k = 'm'))->>'taps_a')::int = 210, '100 taps = 50 FC × 2');
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = 400, 'paid 100 FC');
SELECT public.send_gift('bbbbbbbb-0000-0000-0000-000000000002', 'bronze_watch', NULL, (SELECT v FROM lv WHERE k = 'm'));
SELECT pg_temp.check((public.live_get((SELECT v FROM lv WHERE k = 'm'))->>'gifts_b')::int > 0, 'gift on side B');
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000002';
SELECT public.live_get((SELECT v FROM lv WHERE k = 'm'));
SELECT public.live_tap((SELECT v FROM lv WHERE k = 'm'), 'B', 5);
RESET ROLE;
SELECT pg_temp.check((SELECT count(*) FROM public.fc_ledger WHERE user_id = 'cccccccc-0000-0000-0000-000000000003' AND kind = 'tap_coins') = 1, '3 FC per tapper (A)');
SELECT pg_temp.check((SELECT count(*) FROM public.fc_ledger WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000002' AND kind = 'tap_coins') = 1, '3 FC per tapper (B)');
-- time passes: 3 rounds over → A wins on taps
UPDATE public.lives SET started_at = now() - interval '10 minutes', ends_at = now() - interval '1 minute' WHERE id = (SELECT v FROM lv WHERE k = 'm');
UPDATE public.live_taps SET round = 1 WHERE live_id = (SELECT v FROM lv WHERE k = 'm');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000003';
SELECT pg_temp.check(public.live_get((SELECT v FROM lv WHERE k = 'm'))->>'status' = 'ended', 'match over by time');
RESET ROLE;
SELECT pg_temp.check((SELECT winner_side = 'A' FROM public.lives WHERE id = (SELECT v FROM lv WHERE k = 'm')), 'A wins');
SELECT pg_temp.check((SELECT p.body LIKE '%Match (A+)%' AND p.body LIKE '%🆚 @bibi_t%' AND p.body LIKE '%Winner: @%' AND p.body NOT LIKE '%Winner: @bibi_t%'
                      FROM public.posts p JOIN public.lives l ON l.card_post_id = p.id WHERE l.id = (SELECT v FROM lv WHERE k = 'm')), 'match card');
SELECT pg_temp.check((SELECT target = 1000 FROM public.promotions x JOIN public.lives l ON l.card_post_id = x.post_id WHERE l.id = (SELECT v FROM lv WHERE k = 'm')), 'A+ reaches 1000 in For You');

-- an invited opponent says no → match ends, coins back
SELECT private.fc_add('cccccccc-0000-0000-0000-000000000003', 250, 'admin_grant', 'live-test-2');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
CREATE TEMP TABLE bal0 AS SELECT (public.get_wallet()->>'balance')::int AS v;
INSERT INTO lv SELECT 'm2', public.match_create('unranked', NULL, '@bibi_t');
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = (SELECT v FROM bal0) - 250, 'unranked 250');
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT public.live_decline((SELECT v FROM lv WHERE k = 'm2'));
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check((public.get_wallet()->>'balance')::int = (SELECT v FROM bal0), 'declined → refund');
-- random: B waits, C joins
RESET ROLE;
SELECT private.fc_add('bbbbbbbb-0000-0000-0000-000000000002', 250, 'admin_grant', 'live-test-3');
SET ROLE authenticated;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
INSERT INTO lv SELECT 'm3', public.match_create('unranked', NULL, NULL, true);
SET request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
SELECT pg_temp.check(public.match_find_random() = (SELECT v FROM lv WHERE k = 'm3'), 'random opponent found');
SELECT pg_temp.check(public.live_get((SELECT v FROM lv WHERE k = 'm3'))->>'status' = 'live', 'random match live');
-- the opponent leaves → the other side wins
SELECT public.live_leave((SELECT v FROM lv WHERE k = 'm3'));
RESET ROLE;
SELECT pg_temp.check((SELECT winner_side = 'A' FROM public.lives WHERE id = (SELECT v FROM lv WHERE k = 'm3')), 'leaver loses');
SELECT pg_temp.check((SELECT private.sfu_role((SELECT v FROM lv WHERE k = 'm3'), 'cccccccc-0000-0000-0000-000000000003')) IS NULL, 'no media after the end');
DROP TABLE lv, bal0;
