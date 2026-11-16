-- Videos kept in a private Telegram channel (free, no size limit), played through a Cloudflare Worker.
--
--   media_tg   video path (same name as in Storage) → Telegram file_id.
--              The worker reads it with the public key; a file_id is useless without the bot token,
--              which only the worker knows.
--   app_config small public settings the app reads on start (e.g. the worker address).
--
-- The "Telegram videos" GitHub workflow (service key only) moves videos:
--   media_pending() → download, shrink, send to Telegram → media_done() → delete from Storage.

CREATE TABLE IF NOT EXISTS public.media_tg (
  path       text PRIMARY KEY CHECK (char_length(path) < 200),
  file_id    text NOT NULL CHECK (char_length(file_id) < 300),
  size       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_tg ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS media_tg_read ON public.media_tg;
CREATE POLICY media_tg_read ON public.media_tg FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.media_tg FROM anon, authenticated;
GRANT SELECT ON public.media_tg TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.app_config (
  key   text PRIMARY KEY CHECK (key ~ '^[a-z_]{1,40}$'),
  value text NOT NULL CHECK (char_length(value) < 500)
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_config_read ON public.app_config;
CREATE POLICY app_config_read ON public.app_config FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.app_config FROM anon, authenticated;
GRANT SELECT ON public.app_config TO anon, authenticated;

-- Video posts older than p_age whose video is still in Storage (oldest first).
CREATE OR REPLACE FUNCTION public.media_pending(p_limit integer DEFAULT 40, p_age interval DEFAULT interval '20 minutes')
RETURNS TABLE (path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.video_path
  FROM public.posts p
  WHERE p.video_path IS NOT NULL
    AND p.created_at < now() - p_age
    AND NOT EXISTS (SELECT 1 FROM public.media_tg m WHERE m.path = p.video_path)
  ORDER BY p.created_at
  LIMIT least(greatest(p_limit, 1), 200);
$$;

CREATE OR REPLACE FUNCTION public.media_done(p_path text, p_file_id text, p_size integer)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.media_tg (path, file_id, size) VALUES (p_path, p_file_id, coalesce(p_size, 0))
  ON CONFLICT (path) DO UPDATE SET file_id = excluded.file_id, size = excluded.size;
$$;

CREATE OR REPLACE FUNCTION public.set_app_config(p_key text, p_value text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.app_config (key, value) VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value;
$$;

-- only the server (service role) may call these
REVOKE ALL ON FUNCTION public.media_pending(integer, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_done(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_app_config(text, text) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.media_pending(integer, interval) TO service_role;
    GRANT EXECUTE ON FUNCTION public.media_done(text, text, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.set_app_config(text, text) TO service_role;
    GRANT ALL ON public.media_tg, public.app_config TO service_role;
  END IF;
END $$;

-- a deleted post's video stops playing (the link is removed)
CREATE OR REPLACE FUNCTION private.on_post_delete_media() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF old.video_path IS NOT NULL THEN
    DELETE FROM public.media_tg WHERE path = old.video_path;
  END IF;
  RETURN old;
END $$;
DROP TRIGGER IF EXISTS post_delete_media ON public.posts;
CREATE TRIGGER post_delete_media AFTER DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION private.on_post_delete_media();
