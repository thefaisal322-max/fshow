-- Phase 2
--   1. Sounds: every new video makes an "original sound" owned by its uploader. Others can "Use this sound":
--      their reel then plays with that sound. The sound stays when the first reel is deleted
--      (its audio is copied to Cloudflare by the "Videos to Cloudflare" workflow).
--   2. Downloads: the workflow also makes a download copy of every reel with the moving
--      logo + @username and the 2-second Faisal Show end clip ("dl_url"). Inside the app there is no watermark.

-- 1 ───────────────────────── sounds ─────────────────────────
CREATE TABLE IF NOT EXISTS public.sounds (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  source_path    text NOT NULL CHECK (char_length(source_path) < 200),
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  audio_url      text CHECK (audio_url IS NULL OR (audio_url ~ '^https://[A-Za-z0-9.-]+\.pages\.dev/' AND char_length(audio_url) < 400)),
  uses_count     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sounds_owner_idx ON public.sounds (owner_id, created_at DESC);
ALTER TABLE public.sounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sounds FROM anon, authenticated;

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS sound_id uuid REFERENCES public.sounds(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS posts_sound_idx ON public.posts (sound_id, created_at DESC) WHERE sound_id IS NOT NULL;
GRANT INSERT (sound_id) ON public.posts TO authenticated;

-- a new video: its own sound, or the sound it chose (only a video may use a sound)
CREATE OR REPLACE FUNCTION private.on_post_sound() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user text;
BEGIN
  IF NEW.video_path IS NULL THEN
    NEW.sound_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.sound_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sounds WHERE id = NEW.sound_id) THEN NEW.sound_id := NULL; END IF;
  END IF;
  IF NEW.sound_id IS NULL THEN
    SELECT coalesce(nullif(username, ''), trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) INTO v_user
      FROM public.profiles WHERE id = NEW.author_id;
    INSERT INTO public.sounds (owner_id, source_post_id, source_path, title)
    VALUES (NEW.author_id, NEW.id, NEW.video_path, left('original sound - ' || coalesce(nullif(v_user, ''), 'fshow'), 80))
    RETURNING id INTO NEW.sound_id;
  END IF;
  UPDATE public.sounds SET uses_count = uses_count + 1 WHERE id = NEW.sound_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS posts_sound ON public.posts;
CREATE TRIGGER posts_sound BEFORE INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION private.on_post_sound();

CREATE OR REPLACE FUNCTION private.on_post_sound_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF old.sound_id IS NOT NULL THEN
    UPDATE public.sounds SET uses_count = greatest(uses_count - 1, 0) WHERE id = old.sound_id;
  END IF;
  RETURN old;
END $$;
DROP TRIGGER IF EXISTS posts_sound_delete ON public.posts;
CREATE TRIGGER posts_sound_delete AFTER DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION private.on_post_sound_delete();

-- source_post_id is set right after the post row exists (the BEFORE trigger runs before the FK can see it)
ALTER TABLE public.sounds DROP CONSTRAINT IF EXISTS sounds_source_post_id_fkey;
ALTER TABLE public.sounds ADD CONSTRAINT sounds_source_post_id_fkey
  FOREIGN KEY (source_post_id) REFERENCES public.posts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- older videos get their sound too
DO $$
DECLARE r record; v_id uuid;
BEGIN
  FOR r IN SELECT p.id, p.author_id, p.video_path, coalesce(nullif(a.username, ''), a.first_name, 'fshow') AS who
           FROM public.posts p JOIN public.profiles a ON a.id = p.author_id
           WHERE p.video_path IS NOT NULL AND p.sound_id IS NULL
  LOOP
    INSERT INTO public.sounds (owner_id, source_post_id, source_path, title, uses_count)
    VALUES (r.author_id, r.id, r.video_path, left('original sound - ' || r.who, 80), 1) RETURNING id INTO v_id;
    UPDATE public.posts SET sound_id = v_id WHERE id = r.id;
  END LOOP;
END $$;

-- where the sound can be heard: its own audio file, else the first reel's video
CREATE OR REPLACE FUNCTION private.sound_json(s public.sounds) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', s.id, 'title', s.title, 'uses_count', s.uses_count, 'source_post_id', s.source_post_id,
    'audio_url', s.audio_url, 'src_path', s.source_path,
    'src_url', (SELECT m.url FROM public.media_cdn m WHERE m.path = s.source_path),
    'owner', (SELECT private.author_json(a) FROM public.profiles a WHERE a.id = s.owner_id));
$$;

-- 2 ───────────────────────── download copies ─────────────────────────
ALTER TABLE public.media_cdn ADD COLUMN IF NOT EXISTS dl_url text
  CHECK (dl_url IS NULL OR (dl_url ~ '^https://[A-Za-z0-9.-]+\.pages\.dev/' AND char_length(dl_url) < 400));

-- posts now also carry "dl_url" and "sound"
CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path, 'thumb_path', p.thumb_path,
    'video_url', m.url, 'dl_url', m.dl_url,
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
    'sound', (SELECT private.sound_json(s) FROM public.sounds s WHERE s.id = p.sound_id),
    'author', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet)
  )
  FROM public.profiles a
  LEFT JOIN public.media_cdn m ON m.path = p.video_path
  WHERE a.id = p.author_id;
$$;

-- A sound and the reels that use it (first reel first, then newest)
CREATE OR REPLACE FUNCTION public.get_sound(p_sound uuid, p_offset int DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'sound', private.sound_json(s),
    'reels', (SELECT coalesce(jsonb_agg(private.post_json(p, auth.uid()) ORDER BY (p.id = s.source_post_id) DESC, p.created_at DESC), '[]'::jsonb)
              FROM (SELECT p.* FROM public.posts p
                    WHERE p.sound_id = s.id AND private.can_see(p, auth.uid())
                    ORDER BY (p.id = s.source_post_id) DESC, p.created_at DESC
                    OFFSET greatest(p_offset, 0) LIMIT 30) p))
  FROM public.sounds s
  WHERE s.id = p_sound AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_sound(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sound(uuid, int) TO authenticated;

-- ───────────────── for the workflow (service key only) ─────────────────
-- new videos to move: + the uploader's @username (for the watermark) + the sound to put in the download copy
DROP FUNCTION IF EXISTS public.media_pending(integer, interval);
CREATE FUNCTION public.media_pending(p_limit integer DEFAULT 60, p_age interval DEFAULT interval '15 minutes')
RETURNS TABLE (path text, username text, audio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.video_path,
         coalesce(nullif(a.username, ''), 'fshow'),
         CASE WHEN s.source_post_id IS DISTINCT FROM p.id
              THEN coalesce(s.audio_url, (SELECT m.url FROM public.media_cdn m WHERE m.path = s.source_path)) END
  FROM public.posts p
  JOIN public.profiles a ON a.id = p.author_id
  LEFT JOIN public.sounds s ON s.id = p.sound_id
  WHERE p.video_path IS NOT NULL
    AND p.created_at < now() - p_age
    AND NOT EXISTS (SELECT 1 FROM public.media_cdn m WHERE m.path = p.video_path)
  ORDER BY p.created_at
  LIMIT least(greatest(p_limit, 1), 300);
$$;

-- videos already on Cloudflare that have no download copy yet
CREATE OR REPLACE FUNCTION public.media_dl_pending(p_limit integer DEFAULT 60)
RETURNS TABLE (path text, url text, username text, audio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.path, m.url, coalesce(nullif(a.username, ''), 'fshow'),
         CASE WHEN s.source_post_id IS DISTINCT FROM p.id
              THEN coalesce(s.audio_url, (SELECT m2.url FROM public.media_cdn m2 WHERE m2.path = s.source_path)) END
  FROM public.media_cdn m
  JOIN public.posts p ON p.video_path = m.path
  JOIN public.profiles a ON a.id = p.author_id
  LEFT JOIN public.sounds s ON s.id = p.sound_id
  WHERE m.dl_url IS NULL
  ORDER BY m.created_at DESC
  LIMIT least(greatest(p_limit, 1), 300);
$$;

-- sounds whose audio is not saved yet (and whose first video is still somewhere)
CREATE OR REPLACE FUNCTION public.sounds_pending(p_limit integer DEFAULT 100)
RETURNS TABLE (id uuid, src text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, m.url
  FROM public.sounds s JOIN public.media_cdn m ON m.path = s.source_path
  WHERE s.audio_url IS NULL AND s.uses_count > 0
  ORDER BY s.created_at
  LIMIT least(greatest(p_limit, 1), 300);
$$;

DROP FUNCTION IF EXISTS public.media_done(text, text, integer);
CREATE FUNCTION public.media_done(p_path text, p_url text, p_size integer, p_dl text DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.media_cdn (path, url, size, dl_url) VALUES (p_path, p_url, coalesce(p_size, 0), p_dl)
  ON CONFLICT (path) DO UPDATE SET url = excluded.url, size = excluded.size, dl_url = coalesce(excluded.dl_url, public.media_cdn.dl_url);
$$;

CREATE OR REPLACE FUNCTION public.media_dl_done(p_path text, p_dl text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.media_cdn SET dl_url = p_dl WHERE path = p_path;
$$;

CREATE OR REPLACE FUNCTION public.sound_audio_done(p_sound uuid, p_url text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.sounds SET audio_url = p_url WHERE id = p_sound;
$$;

-- Cloudflare free space: the workflow reports the total size; near the limit the admins get a notice
CREATE OR REPLACE FUNCTION public.media_total_bytes() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(size), 0)::bigint FROM public.media_cdn;
$$;

REVOKE ALL ON FUNCTION public.media_pending(integer, interval), public.media_dl_pending(integer), public.sounds_pending(integer),
                       public.media_done(text, text, integer, text), public.media_dl_done(text, text),
                       public.sound_audio_done(uuid, text), public.media_total_bytes() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.media_pending(integer, interval), public.media_dl_pending(integer), public.sounds_pending(integer),
                              public.media_done(text, text, integer, text), public.media_dl_done(text, text),
                              public.sound_audio_done(uuid, text), public.media_total_bytes() TO service_role;
    GRANT ALL ON public.sounds TO service_role;
  END IF;
END $$;
