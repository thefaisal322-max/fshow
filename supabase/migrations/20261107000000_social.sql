-- Faisal Show — phase 2+3: posts, likes, comments, saves, shares, views, follows, notifications
--
-- Rules
--   * Every write needs a finished profile (public.me_ready()).
--   * The app writes only "intent" rows (a like, a follow, a comment). All counters are
--     updated by SECURITY DEFINER triggers, so nobody can fake likes / views / followers.
--   * Views: one per user per post, recorded by record_view() — never trusted from the app.
--   * fainet.org boost: real reach only (ranking), never fake numbers.

-- ───────────────────────── helpers ─────────────────────────
CREATE FUNCTION public.me_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND profile_complete);
$$;
REVOKE EXECUTE ON FUNCTION public.me_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.me_ready() TO authenticated;

-- Server-only settings (e.g. the boost phrase). Not readable by the app.
CREATE TABLE private.settings (key text PRIMARY KEY, value text NOT NULL);
INSERT INTO private.settings (key, value) VALUES
  ('boost_phrase', 'disabled:5f1c9e'),
  ('boost_hours', '24');

-- ───────────────────────── posts ─────────────────────────
CREATE TABLE public.posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  body           text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  image_path     text CHECK (image_path IS NULL OR (image_path LIKE author_id::text || '/%' AND char_length(image_path) < 200)),
  likes_count    integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  saves_count    integer NOT NULL DEFAULT 0,
  shares_count   integer NOT NULL DEFAULT 0,
  views_count    integer NOT NULL DEFAULT 0,
  boost_until    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(trim(body)) > 0 OR image_path IS NOT NULL)
);
CREATE INDEX posts_author_idx ON public.posts (author_id, created_at DESC);
CREATE INDEX posts_created_idx ON public.posts (created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read posts" ON public.posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "create own posts" ON public.posts FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND (SELECT public.me_ready()));
CREATE POLICY "delete own posts" ON public.posts FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()));
REVOKE ALL ON public.posts FROM anon, authenticated;
GRANT SELECT, DELETE ON public.posts TO authenticated;
GRANT INSERT (body, image_path) ON public.posts TO authenticated;

-- ───────────────────────── likes / saves / shares / views ─────────────────────────
CREATE TABLE public.post_likes (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE public.post_saves (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_saves_user_idx ON public.post_saves (user_id, created_at DESC);
CREATE TABLE public.post_shares (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE public.post_views (
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_views_user_idx ON public.post_views (user_id);

ALTER TABLE public.post_likes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_saves  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read likes" ON public.post_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "like as me" ON public.post_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.me_ready()));
CREATE POLICY "unlike mine" ON public.post_likes FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "read own saves" ON public.post_saves FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "save as me" ON public.post_saves FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.me_ready()));
CREATE POLICY "unsave mine" ON public.post_saves FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
-- shares and views: no direct access; only record_share() / record_view().

REVOKE ALL ON public.post_likes, public.post_saves, public.post_shares, public.post_views FROM anon, authenticated;
GRANT SELECT, DELETE ON public.post_likes, public.post_saves TO authenticated;
GRANT INSERT (post_id) ON public.post_likes, public.post_saves TO authenticated;

-- ───────────────────────── comments ─────────────────────────
CREATE TABLE public.comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post_idx ON public.comments (post_id, created_at);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read comments" ON public.comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "comment as me" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND (SELECT public.me_ready()));
CREATE POLICY "delete own comment or on own post" ON public.comments FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid())
         OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = (SELECT auth.uid())));
REVOKE ALL ON public.comments FROM anon, authenticated;
GRANT SELECT, DELETE ON public.comments TO authenticated;
GRANT INSERT (post_id, body) ON public.comments TO authenticated;

-- ───────────────────────── follows ─────────────────────────
CREATE TABLE public.follows (
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee_idx ON public.follows (followee_id);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read follows" ON public.follows FOR SELECT TO authenticated USING (true);
CREATE POLICY "follow as me" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = (SELECT auth.uid()) AND (SELECT public.me_ready()));
CREATE POLICY "unfollow mine" ON public.follows FOR DELETE TO authenticated
  USING (follower_id = (SELECT auth.uid()));
REVOKE ALL ON public.follows FROM anon, authenticated;
GRANT SELECT, DELETE ON public.follows TO authenticated;
GRANT INSERT (followee_id) ON public.follows TO authenticated;

-- ───────────────────────── notifications ─────────────────────────
CREATE TABLE public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,   -- receiver
  actor_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'mention')),
  post_id    uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY "mark own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;

-- ───────────────────────── reports (Play Store requirement) ─────────────────────────
CREATE TABLE public.reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id     uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason      text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (post_id IS NOT NULL OR user_id IS NOT NULL)
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report as me" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()) AND (SELECT public.me_ready()));
REVOKE ALL ON public.reports FROM anon, authenticated;
GRANT INSERT (post_id, user_id, reason) ON public.reports TO authenticated;

-- ───────────────────────── notification helper ─────────────────────────
CREATE FUNCTION private.notify(p_user uuid, p_actor uuid, p_type text, p_post uuid, p_comment uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.notifications (user_id, actor_id, type, post_id, comment_id)
  SELECT p_user, p_actor, p_type, p_post, p_comment
  WHERE p_user IS DISTINCT FROM p_actor;
$$;

-- ───────────────────────── counter triggers ─────────────────────────
CREATE FUNCTION private.on_like() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_author uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id RETURNING author_id INTO v_author;
    UPDATE public.profiles SET likes_count = likes_count + 1 WHERE id = v_author;
    PERFORM private.notify(v_author, NEW.user_id, 'like', NEW.post_id, NULL);
    RETURN NEW;
  ELSE
    UPDATE public.posts SET likes_count = greatest(likes_count - 1, 0) WHERE id = OLD.post_id RETURNING author_id INTO v_author;
    UPDATE public.profiles SET likes_count = greatest(likes_count - 1, 0) WHERE id = v_author;
    DELETE FROM public.notifications WHERE type = 'like' AND post_id = OLD.post_id AND actor_id = OLD.user_id;
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER post_likes_count AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION private.on_like();

CREATE FUNCTION private.on_save() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET saves_count = saves_count + 1 WHERE id = NEW.post_id; RETURN NEW;
  ELSE
    UPDATE public.posts SET saves_count = greatest(saves_count - 1, 0) WHERE id = OLD.post_id; RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER post_saves_count AFTER INSERT OR DELETE ON public.post_saves
  FOR EACH ROW EXECUTE FUNCTION private.on_save();

CREATE FUNCTION private.on_post() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- anti-spam: max 10 posts per 10 minutes
    IF (SELECT count(*) FROM public.posts WHERE author_id = NEW.author_id AND created_at > now() - interval '10 minutes') > 10 THEN
      RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.profiles SET posts_count = posts_count + 1 WHERE id = NEW.author_id; RETURN NEW;
  ELSE
    UPDATE public.profiles
       SET posts_count = greatest(posts_count - 1, 0), likes_count = greatest(likes_count - OLD.likes_count, 0)
     WHERE id = OLD.author_id;
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER posts_count AFTER INSERT OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.on_post();

CREATE FUNCTION private.on_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_author uuid;
  v_name   text;
  v_target uuid;
  v_phrase text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = greatest(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;

  IF (SELECT count(*) FROM public.comments WHERE author_id = NEW.author_id AND created_at > now() - interval '1 minute') > 20 THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id RETURNING author_id INTO v_author;
  PERFORM private.notify(v_author, NEW.author_id, 'comment', NEW.post_id, NEW.id);

  -- @mentions (max 5 per comment)
  FOR v_name IN
    SELECT DISTINCT lower(m[1]) FROM regexp_matches(NEW.body, '@([A-Za-z0-9._]{3,20})', 'g') AS m LIMIT 5
  LOOP
    SELECT id INTO v_target FROM public.profiles WHERE username = v_name;
    IF v_target IS NOT NULL AND v_target <> v_author THEN
      PERFORM private.notify(v_target, NEW.author_id, 'mention', NEW.post_id, NEW.id);
    END IF;
  END LOOP;

  -- fainet.org boost: the secret phrase from a verified @fainet.org account pins the post
  -- to the top of For You for boost_hours. From anyone else it is a normal comment.
  SELECT value INTO v_phrase FROM private.settings WHERE key = 'boost_phrase';
  IF v_phrase IS NOT NULL AND position(v_phrase IN NEW.body) > 0
     AND (SELECT is_fainet FROM public.profiles WHERE id = NEW.author_id) THEN
    UPDATE public.posts
       SET boost_until = now() + make_interval(hours => (SELECT value::int FROM private.settings WHERE key = 'boost_hours'))
     WHERE id = NEW.post_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER comments_count AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION private.on_comment();

CREATE FUNCTION private.on_follow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.followee_id;
    PERFORM private.notify(NEW.followee_id, NEW.follower_id, 'follow', NULL, NULL);
    RETURN NEW;
  ELSE
    UPDATE public.profiles SET following_count = greatest(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = greatest(followers_count - 1, 0) WHERE id = OLD.followee_id;
    DELETE FROM public.notifications WHERE type = 'follow' AND user_id = OLD.followee_id AND actor_id = OLD.follower_id;
    RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER follows_count AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION private.on_follow();

-- ───────────────────────── views & shares (RPC) ─────────────────────────
-- Called by the app when a post was really on screen (≥ 2 s). One view per user per post.
CREATE FUNCTION public.record_view(p_post uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.me_ready() THEN RETURN; END IF;
  INSERT INTO public.post_views (post_id, user_id) VALUES (p_post, auth.uid()) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE public.posts SET views_count = views_count + 1 WHERE id = p_post;
  END IF;
END $$;

CREATE FUNCTION public.record_share(p_post uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.me_ready() THEN RETURN; END IF;
  INSERT INTO public.post_shares (post_id, user_id) VALUES (p_post, auth.uid()) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE public.posts SET shares_count = shares_count + 1 WHERE id = p_post;
  END IF;
END $$;

-- ───────────────────────── read API (one JSON shape for every list) ─────────────────────────
CREATE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'created_at', p.created_at,
    'likes_count', p.likes_count, 'comments_count', p.comments_count, 'saves_count', p.saves_count,
    'shares_count', p.shares_count, 'views_count', p.views_count,
    'boosted', coalesce(p.boost_until > now(), false),
    'liked', EXISTS (SELECT 1 FROM public.post_likes l WHERE l.post_id = p.id AND l.user_id = me),
    'saved', EXISTS (SELECT 1 FROM public.post_saves s WHERE s.post_id = p.id AND s.user_id = me),
    'author', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet)
  )
  FROM public.profiles a WHERE a.id = p.author_id;
$$;

-- For You: boosted first, then a score that favours new posts, fainet accounts,
-- posts in their first 24 h (the "hourly push"), likes, and posts I have not seen yet.
CREATE FUNCTION public.get_feed(p_mode text DEFAULT 'foryou', p_offset int DEFAULT 0, p_limit int DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT auth.uid() AS id)
  SELECT private.post_json(p, me.id)
  FROM public.posts p
  JOIN public.profiles a ON a.id = p.author_id
  CROSS JOIN me
  WHERE me.id IS NOT NULL
    AND (p_mode <> 'following'
         OR p.author_id = me.id
         OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = me.id AND f.followee_id = p.author_id))
  ORDER BY
    CASE WHEN p_mode = 'following' THEN 0 ELSE (CASE WHEN p.boost_until > now() THEN 1 ELSE 0 END) END DESC,
    CASE WHEN p_mode = 'following' THEN extract(epoch FROM p.created_at)
         ELSE extract(epoch FROM p.created_at) / 3600.0
              + CASE WHEN a.is_fainet THEN 12 ELSE 0 END
              + CASE WHEN p.created_at > now() - interval '24 hours' THEN 6 ELSE 0 END
              + ln(1 + p.likes_count) * 2 + ln(1 + p.comments_count)
              - CASE WHEN EXISTS (SELECT 1 FROM public.post_views v WHERE v.post_id = p.id AND v.user_id = me.id) THEN 18 ELSE 0 END
    END DESC,
    p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE FUNCTION public.get_user_posts(p_user uuid, p_offset int DEFAULT 0, p_limit int DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid()) FROM public.posts p
  WHERE auth.uid() IS NOT NULL AND p.author_id = p_user
  ORDER BY p.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE FUNCTION public.get_saved_posts(p_offset int DEFAULT 0, p_limit int DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid()) FROM public.post_saves s JOIN public.posts p ON p.id = s.post_id
  WHERE s.user_id = auth.uid()
  ORDER BY s.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE FUNCTION public.get_post(p_post uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid()) FROM public.posts p WHERE p.id = p_post AND auth.uid() IS NOT NULL;
$$;

CREATE FUNCTION public.get_comments(p_post uuid, p_offset int DEFAULT 0, p_limit int DEFAULT 50)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
           'can_delete', c.author_id = auth.uid() OR p.author_id = auth.uid(),
           'author', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                        'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet))
  FROM public.comments c
  JOIN public.profiles a ON a.id = c.author_id
  JOIN public.posts p ON p.id = c.post_id
  WHERE c.post_id = p_post AND auth.uid() IS NOT NULL
  ORDER BY c.created_at
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 100);
$$;

CREATE FUNCTION public.get_profile(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT to_jsonb(a) || jsonb_build_object(
           'followed_by_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = a.id),
           'follows_me',     EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = a.id AND f.followee_id = auth.uid()))
  FROM public.profiles a WHERE a.id = p_user AND auth.uid() IS NOT NULL;
$$;

CREATE FUNCTION public.search_profiles(p_query text, p_limit int DEFAULT 30)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH r AS (SELECT ltrim(lower(trim(coalesce(p_query, ''))), '@') AS raw),
       q AS (SELECT '%' || replace(replace(replace(r.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat, r.raw FROM r)
  SELECT jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                            'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet,
                            'followers_count', a.followers_count,
                            'followed_by_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = a.id))
  FROM public.profiles a, q
  WHERE auth.uid() IS NOT NULL AND a.profile_complete AND char_length(q.raw) >= 1
    AND (a.username LIKE q.pat OR lower(a.first_name || ' ' || a.last_name) LIKE q.pat)
  ORDER BY (a.username = q.raw) DESC, a.is_fainet DESC, a.followers_count DESC
  LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE FUNCTION public.get_notifications(p_offset int DEFAULT 0, p_limit int DEFAULT 30)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', n.id, 'type', n.type, 'read', n.read, 'created_at', n.created_at,
           'post_id', n.post_id, 'post_body', left(p.body, 80), 'post_image', p.image_path,
           'comment_body', left(c.body, 120),
           'actor', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                       'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet))
  FROM public.notifications n
  JOIN public.profiles a ON a.id = n.actor_id
  LEFT JOIN public.posts p ON p.id = n.post_id
  LEFT JOIN public.comments c ON c.id = n.comment_id
  WHERE n.user_id = auth.uid()
  ORDER BY n.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE FUNCTION public.unread_notifications() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::int FROM public.notifications WHERE user_id = auth.uid() AND NOT read;
$$;

CREATE FUNCTION public.mark_notifications_read() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.notifications SET read = true WHERE user_id = auth.uid() AND NOT read;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.record_view(uuid)', 'public.record_share(uuid)',
    'public.get_feed(text, int, int)', 'public.get_user_posts(uuid, int, int)', 'public.get_saved_posts(int, int)',
    'public.get_post(uuid)', 'public.get_comments(uuid, int, int)', 'public.get_profile(uuid)',
    'public.search_profiles(text, int)', 'public.get_notifications(int, int)',
    'public.unread_notifications()', 'public.mark_notifications_read()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- ───────────────────────── post images bucket ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('posts', 'posts', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "posts: owner can read own folder" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'posts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "posts: owner can upload to own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'posts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.me_ready()));
CREATE POLICY "posts: owner can delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'posts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- Realtime for notifications badge
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
