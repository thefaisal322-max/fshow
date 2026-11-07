-- Faisal Show — stories (24 h), people suggestions, video thumbnails

-- ───────────────────────── video thumbnails ─────────────────────────
ALTER TABLE public.posts
  ADD COLUMN thumb_path text CHECK (thumb_path IS NULL OR (thumb_path LIKE author_id::text || '/%' AND char_length(thumb_path) < 200));
GRANT INSERT (thumb_path) ON public.posts TO authenticated;

CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path, 'thumb_path', p.thumb_path,
    'location', p.location, 'feeling', p.feeling, 'created_at', p.created_at,
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

-- ───────────────────────── stories ─────────────────────────
CREATE TABLE public.stories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  media_path text NOT NULL CHECK (media_path LIKE author_id::text || '/stories/%' AND char_length(media_path) < 200),
  media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
  caption    text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 200),
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX stories_author_idx ON public.stories (author_id, created_at);
CREATE INDEX stories_expires_idx ON public.stories (expires_at);

CREATE TABLE public.story_views (
  story_id   uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read live stories" ON public.stories FOR SELECT TO authenticated
  USING (expires_at > now() OR author_id = (SELECT auth.uid()));
CREATE POLICY "post own story" ON public.stories FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND (SELECT public.me_ready()));
CREATE POLICY "delete own story" ON public.stories FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()));
-- who saw my story: only the author can read the viewer list
CREATE POLICY "author reads story viewers" ON public.story_views FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.author_id = (SELECT auth.uid())));

REVOKE ALL ON public.stories, public.story_views FROM anon, authenticated;
GRANT SELECT, DELETE ON public.stories TO authenticated;
GRANT INSERT (media_path, media_type, caption) ON public.stories TO authenticated;
GRANT SELECT ON public.story_views TO authenticated;

-- anti-spam: max 30 stories per day
CREATE FUNCTION private.on_story() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT count(*) FROM public.stories WHERE author_id = NEW.author_id AND created_at > now() - interval '24 hours') > 30 THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stories_limit AFTER INSERT ON public.stories FOR EACH ROW EXECUTE FUNCTION private.on_story();

-- One view per person per story; the author's own views do not count.
CREATE FUNCTION public.record_story_view(p_story uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.me_ready() THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_story AND expires_at > now() AND author_id <> auth.uid()) THEN RETURN; END IF;
  INSERT INTO public.story_views (story_id, viewer_id) VALUES (p_story, auth.uid()) ON CONFLICT DO NOTHING;
  IF FOUND THEN UPDATE public.stories SET views_count = views_count + 1 WHERE id = p_story; END IF;
END $$;

-- Story rings for the home screen: me first, then people I follow, then everyone else; unseen first.
CREATE FUNCTION public.get_stories() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT auth.uid() AS id),
  live AS (
    SELECT s.*, EXISTS (SELECT 1 FROM public.story_views v WHERE v.story_id = s.id AND v.viewer_id = me.id) AS seen
    FROM public.stories s, me WHERE s.expires_at > now() AND me.id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'author', private.author_json(a),
    'all_seen', bool_and(l.seen) OR a.id = me.id,
    'stories', jsonb_agg(jsonb_build_object('id', l.id, 'media_path', l.media_path, 'media_type', l.media_type,
                                            'caption', l.caption, 'created_at', l.created_at, 'seen', l.seen,
                                            'views_count', CASE WHEN a.id = me.id THEN l.views_count END)
                         ORDER BY l.created_at))
  FROM live l JOIN public.profiles a ON a.id = l.author_id CROSS JOIN me
  GROUP BY a.id, me.id
  ORDER BY (a.id = me.id) DESC,
           bool_and(l.seen) ASC,
           EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = me.id AND f.followee_id = a.id) DESC,
           max(l.created_at) DESC
  LIMIT 60;
$$;

CREATE FUNCTION public.get_story_viewers(p_story uuid) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.author_json(p) || jsonb_build_object('viewed_at', v.created_at)
  FROM public.story_views v JOIN public.profiles p ON p.id = v.viewer_id
  JOIN public.stories s ON s.id = v.story_id
  WHERE v.story_id = p_story AND s.author_id = auth.uid()
  ORDER BY v.created_at DESC LIMIT 200;
$$;

-- ───────────────────────── people you may know ─────────────────────────
-- Friends of friends first, then verified @fainet.org accounts, then the newest accounts.
CREATE FUNCTION public.suggest_people(p_limit int DEFAULT 15) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT auth.uid() AS id)
  SELECT private.author_json(p) || jsonb_build_object(
           'followers_count', p.followers_count,
           'mutual', (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.followee_id
                       WHERE f1.follower_id = me.id AND f2.followee_id = p.id)::int,
           'follows_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p.id AND f.followee_id = me.id),
           'is_new', p.created_at > now() - interval '7 days')
  FROM public.profiles p CROSS JOIN me
  WHERE me.id IS NOT NULL AND p.id <> me.id AND p.profile_complete
    AND NOT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = me.id AND f.followee_id = p.id)
  ORDER BY
    (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.followee_id
      WHERE f1.follower_id = me.id AND f2.followee_id = p.id) DESC,
    EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p.id AND f.followee_id = me.id) DESC,
    p.is_fainet DESC,
    p.created_at DESC
  LIMIT least(greatest(p_limit, 1), 30);
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.record_story_view(uuid)', 'public.get_stories()', 'public.get_story_viewers(uuid)', 'public.suggest_people(int)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
