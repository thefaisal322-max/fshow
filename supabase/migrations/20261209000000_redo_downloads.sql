-- New download style (TikTok-like corner mark that is always fully inside the picture + the new intro with its sound):
-- every reel gets a new download copy (the workflow makes 40 per run).
UPDATE public.media_cdn SET dl_url = NULL;
