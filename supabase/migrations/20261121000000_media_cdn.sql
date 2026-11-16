-- Videos move from Supabase Storage to Cloudflare Pages (free, no card, unlimited views).
-- (Replaces the Telegram plan from 20261120000000 — Telegram asked for a paid signup.)
--
--   media_cdn  video path (as in Storage) → its Cloudflare address.
--              Posts return it as "video_url"; the app plays that instead of Storage.
--   The "Videos to Cloudflare" GitHub workflow (service key only):
--     media_pending() → shrink → deploy to Pages → media_done(path, url)
--     media_to_delete() → 2 days later the Storage copy is removed (old app versions keep working
--     until people update) → media_deleted(path)

DROP TRIGGER IF EXISTS post_delete_media ON public.posts;
DROP FUNCTION IF EXISTS public.media_done(text, text, integer);
DROP FUNCTION IF EXISTS public.media_pending(integer, interval);
DROP TABLE IF EXISTS public.media_tg;

CREATE TABLE IF NOT EXISTS public.media_cdn (
  path       text PRIMARY KEY CHECK (char_length(path) < 200),
  url        text NOT NULL CHECK (url ~ '^https://[A-Za-z0-9.-]+\.pages\.dev/' AND char_length(url) < 400),
  size       integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz          -- when the Storage copy was removed
);
ALTER TABLE public.media_cdn ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_cdn FROM anon, authenticated;   -- read through posts only

CREATE OR REPLACE FUNCTION public.media_pending(p_limit integer DEFAULT 60, p_age interval DEFAULT interval '15 minutes')
RETURNS TABLE (path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.video_path
  FROM public.posts p
  WHERE p.video_path IS NOT NULL
    AND p.created_at < now() - p_age
    AND NOT EXISTS (SELECT 1 FROM public.media_cdn m WHERE m.path = p.video_path)
  ORDER BY p.created_at
  LIMIT least(greatest(p_limit, 1), 300);
$$;

CREATE OR REPLACE FUNCTION public.media_done(p_path text, p_url text, p_size integer)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.media_cdn (path, url, size) VALUES (p_path, p_url, coalesce(p_size, 0))
  ON CONFLICT (path) DO UPDATE SET url = excluded.url, size = excluded.size;
$$;

CREATE OR REPLACE FUNCTION public.media_to_delete(p_after interval DEFAULT interval '2 days')
RETURNS TABLE (path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.path FROM public.media_cdn m
  WHERE m.deleted_at IS NULL AND m.created_at < now() - p_after
  ORDER BY m.created_at LIMIT 300;
$$;

CREATE OR REPLACE FUNCTION public.media_deleted(p_path text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.media_cdn SET deleted_at = now() WHERE path = p_path;
$$;

REVOKE ALL ON FUNCTION public.media_pending(integer, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_done(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_to_delete(interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.media_deleted(text) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.media_pending(integer, interval) TO service_role;
    GRANT EXECUTE ON FUNCTION public.media_done(text, text, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION public.media_to_delete(interval) TO service_role;
    GRANT EXECUTE ON FUNCTION public.media_deleted(text) TO service_role;
    GRANT ALL ON public.media_cdn TO service_role;
  END IF;
END $$;

-- a deleted post's video address is forgotten
CREATE OR REPLACE FUNCTION private.on_post_delete_media() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF old.video_path IS NOT NULL THEN
    DELETE FROM public.media_cdn WHERE path = old.video_path;
  END IF;
  RETURN old;
END $$;
DROP TRIGGER IF EXISTS post_delete_media ON public.posts;
CREATE TRIGGER post_delete_media AFTER DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION private.on_post_delete_media();

-- posts now also carry "video_url" (null while the video is still only in Storage)
CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path, 'thumb_path', p.thumb_path,
    'video_url', (SELECT m.url FROM public.media_cdn m WHERE m.path = p.video_path),
    'location', p.location, 'feeling', p.feeling, 'created_at', p.created_at,
    'visibility', p.visibility, 'edited', p.edited_at IS NOT NULL,
    'likes_count', p.likes_count + p.bonus_likes, 'comments_count', p.comments_count, 'saves_count', p.saves_count,
    'shares_count', p.shares_count, 'views_count', p.views_count + p.bonus_views + private.auto_views(p.created_at),
    'boosted', coalesce(p.boost_until > now(), false),
    'liked', EXISTS (SELECT 1 FROM public.post_likes l WHERE l.post_id = p.id AND l.user_id = me),
    'saved', EXISTS (SELECT 1 FROM public.post_saves s WHERE s.post_id = p.id AND s.user_id = me),
    'following', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = me AND f.followee_id = p.author_id),
    'feedback', (SELECT f.kind FROM public.post_feedback f WHERE f.user_id = me AND f.post_id = p.id),
    'shared', CASE WHEN p.shared_post_id IS NULL THEN NULL ELSE private.post_preview(p.shared_post_id) END,
    'author', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet)
  )
  FROM public.profiles a WHERE a.id = p.author_id;
$$;
