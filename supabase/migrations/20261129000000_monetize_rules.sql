-- Monetization rules 4 and 5: 5 reels (was 3) and 100 followers (was 30).
UPDATE public.challenges SET target = 5   WHERE id = 4 AND metric = 'reels_count';
UPDATE public.challenges SET target = 100 WHERE id = 5 AND metric = 'followers';
