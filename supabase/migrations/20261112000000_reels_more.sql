-- Reels menu + demo features:
--   • post privacy: public / friends (both follow each other) / private (only me)
--   • edit own post (text + privacy)
--   • "Interested" / "Not interested" / "Hide" feedback that changes what you see
--   • hashtags: trending list + posts for one tag
--   • online status (last seen)
--   • voice messages in chat

-- ───────────────────────── privacy ─────────────────────────
ALTER TABLE public.posts
  ADD COLUMN visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'friends', 'private')),
  ADD COLUMN edited_at timestamptz;
GRANT INSERT (visibility) ON public.posts TO authenticated;

-- "Friends" = we follow each other.
CREATE FUNCTION private.are_friends(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = a AND f.followee_id = b)
     AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = b AND f.followee_id = a);
$$;

-- Can `me` see post `p`?
CREATE FUNCTION private.can_see(p public.posts, me uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT me IS NOT NULL AND (
    p.author_id = me
    OR (NOT private.blocked_between(p.author_id, me)
        AND (p.visibility = 'public' OR (p.visibility = 'friends' AND private.are_friends(p.author_id, me)))));
$$;
GRANT EXECUTE ON FUNCTION private.can_see(public.posts, uuid) TO authenticated;

DROP POLICY "read posts" ON public.posts;
CREATE POLICY "read visible posts" ON public.posts FOR SELECT TO authenticated
  USING (private.can_see(posts, (SELECT auth.uid())));

-- Like / save / comment only on posts you can see (this also covers blocks).
DROP POLICY "comment as me" ON public.comments;
CREATE POLICY "comment as me" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND (SELECT public.me_ready())
              AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND private.can_see(p, (SELECT auth.uid()))));
DROP POLICY "like as me" ON public.post_likes;
CREATE POLICY "like as me" ON public.post_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.me_ready())
              AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND private.can_see(p, (SELECT auth.uid()))));
DROP POLICY "save as me" ON public.post_saves;
CREATE POLICY "save as me" ON public.post_saves FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.me_ready())
              AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND private.can_see(p, (SELECT auth.uid()))));

-- ───────────────────────── feedback ─────────────────────────
CREATE TABLE public.post_feedback (
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('interested', 'not_interested', 'hide')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX post_feedback_user_idx ON public.post_feedback (user_id, kind);
ALTER TABLE public.post_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_feedback FROM anon, authenticated;
CREATE POLICY "read own feedback" ON public.post_feedback FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.post_feedback TO authenticated;

CREATE FUNCTION public.set_post_feedback(p_post uuid, p_kind text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_kind IS NULL THEN
    DELETE FROM public.post_feedback WHERE user_id = auth.uid() AND post_id = p_post;
    RETURN;
  END IF;
  IF p_kind NOT IN ('interested', 'not_interested', 'hide') THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = p_post AND private.can_see(p, auth.uid())) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.post_feedback (user_id, post_id, kind) VALUES (auth.uid(), p_post, p_kind)
  ON CONFLICT (user_id, post_id) DO UPDATE SET kind = EXCLUDED.kind, created_at = now();
END $$;
REVOKE EXECUTE ON FUNCTION public.set_post_feedback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_post_feedback(uuid, text) TO authenticated;

-- +8 for authors I said "interested" to, −24 for authors I said "not interested" to.
CREATE FUNCTION private.taste(author uuid, me uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(CASE f.kind WHEN 'interested' THEN 8 WHEN 'not_interested' THEN -24 ELSE 0 END), 0)
  FROM public.post_feedback f JOIN public.posts p ON p.id = f.post_id
  WHERE f.user_id = me AND p.author_id = author;
$$;

CREATE FUNCTION private.hidden_for(post uuid, me uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.post_feedback f WHERE f.user_id = me AND f.post_id = post AND f.kind IN ('not_interested', 'hide'));
$$;

-- ───────────────────────── edit own post ─────────────────────────
CREATE FUNCTION public.update_post(p_post uuid, p_body text DEFAULT NULL, p_visibility text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_visibility IS NOT NULL AND p_visibility NOT IN ('public', 'friends', 'private') THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF p_body IS NOT NULL AND char_length(p_body) > 2000 THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  UPDATE public.posts
     SET body = coalesce(trim(p_body), body),
         visibility = coalesce(p_visibility, visibility),
         edited_at = CASE WHEN p_body IS NOT NULL AND trim(p_body) IS DISTINCT FROM body THEN now() ELSE edited_at END
   WHERE id = p_post AND author_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.update_post(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_post(uuid, text, text) TO authenticated;

-- ───────────────────────── post JSON + lists (now respect privacy + feedback) ─────────────────────────
CREATE OR REPLACE FUNCTION private.post_preview(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'body', left(p.body, 300), 'image_path', p.image_path, 'video_path', p.video_path,
                            'created_at', p.created_at, 'author', private.author_json(a))
  FROM public.posts p JOIN public.profiles a ON a.id = p.author_id
  WHERE p.id = p_id AND private.can_see(p, auth.uid());
$$;

CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path, 'thumb_path', p.thumb_path,
    'location', p.location, 'feeling', p.feeling, 'created_at', p.created_at,
    'visibility', p.visibility, 'edited', p.edited_at IS NOT NULL,
    'likes_count', p.likes_count + p.bonus_likes, 'comments_count', p.comments_count, 'saves_count', p.saves_count,
    'shares_count', p.shares_count, 'views_count', p.views_count + p.bonus_views,
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

CREATE OR REPLACE FUNCTION public.get_feed(p_mode text DEFAULT 'foryou', p_offset int DEFAULT 0, p_limit int DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT auth.uid() AS id)
  SELECT private.post_json(p, me.id)
  FROM public.posts p
  JOIN public.profiles a ON a.id = p.author_id
  CROSS JOIN me
  WHERE private.can_see(p, me.id)
    AND NOT private.hidden_for(p.id, me.id)
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
              + private.taste(p.author_id, me.id)
              - CASE WHEN EXISTS (SELECT 1 FROM public.post_views v WHERE v.post_id = p.id AND v.user_id = me.id) THEN 18 ELSE 0 END
    END DESC,
    p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;

-- Reels now have two tabs: "foryou" and "following".
DROP FUNCTION public.get_reels(int, int);
CREATE FUNCTION public.get_reels(p_offset int DEFAULT 0, p_limit int DEFAULT 10, p_mode text DEFAULT 'foryou')
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid())
  FROM public.posts p JOIN public.profiles a ON a.id = p.author_id
  WHERE p.video_path IS NOT NULL
    AND private.can_see(p, auth.uid())
    AND NOT private.hidden_for(p.id, auth.uid())
    AND (p_mode <> 'following'
         OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = p.author_id))
  ORDER BY CASE WHEN p_mode = 'following' THEN false ELSE (p.boost_until > now()) IS TRUE END DESC,
           CASE WHEN p_mode = 'following' THEN extract(epoch FROM p.created_at)
                ELSE extract(epoch FROM p.created_at) / 3600.0
                  + CASE WHEN a.is_fainet THEN 12 ELSE 0 END
                  + ln(1 + p.likes_count) * 2
                  + private.taste(p.author_id, auth.uid())
                  - CASE WHEN EXISTS (SELECT 1 FROM public.post_views v WHERE v.post_id = p.id AND v.user_id = auth.uid()) THEN 18 ELSE 0 END
           END DESC,
           p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 30);
$$;
REVOKE EXECUTE ON FUNCTION public.get_reels(int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reels(int, int, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_posts(p_user uuid, p_offset int DEFAULT 0, p_limit int DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid()) FROM public.posts p
  WHERE p.author_id = p_user AND private.can_see(p, auth.uid())
  ORDER BY p.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.get_saved_posts(p_offset int DEFAULT 0, p_limit int DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid()) FROM public.post_saves s JOIN public.posts p ON p.id = s.post_id
  WHERE s.user_id = auth.uid() AND private.can_see(p, auth.uid())
  ORDER BY s.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.get_post(p_post uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid()) FROM public.posts p WHERE p.id = p_post AND private.can_see(p, auth.uid());
$$;

-- ───────────────────────── hashtags ─────────────────────────
-- Letters: English, digits, _ and Arabic script (Pashto / Dari).
CREATE FUNCTION public.get_trending_tags(p_limit int DEFAULT 15) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('tag', t.tag, 'count', count(*))
  FROM (SELECT DISTINCT p.id, lower(m[1]) AS tag
        FROM public.posts p, regexp_matches(p.body, '#([0-9A-Za-z_؀-ۿ]{1,50})', 'g') AS m
        WHERE auth.uid() IS NOT NULL AND p.visibility = 'public' AND p.created_at > now() - interval '30 days'
          AND NOT private.blocked_between(p.author_id, auth.uid())) t
  GROUP BY t.tag
  ORDER BY count(*) DESC, t.tag
  LIMIT least(greatest(p_limit, 1), 50);
$$;
REVOKE EXECUTE ON FUNCTION public.get_trending_tags(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trending_tags(int) TO authenticated;

CREATE FUNCTION public.get_tag_posts(p_tag text, p_offset int DEFAULT 0, p_limit int DEFAULT 20) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH t AS (SELECT lower(ltrim(trim(coalesce(p_tag, '')), '#')) AS tag)
  SELECT private.post_json(p, auth.uid())
  FROM public.posts p, t
  WHERE t.tag ~ '^[0-9a-z_؀-ۿ]{1,50}$'
    AND lower(p.body) ~ ('#' || t.tag || '([^0-9a-z_؀-ۿ]|$)')
    AND private.can_see(p, auth.uid())
    AND NOT private.hidden_for(p.id, auth.uid())
  ORDER BY ln(1 + p.likes_count + p.bonus_likes) + extract(epoch FROM p.created_at) / 86400.0 DESC, p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;
REVOKE EXECUTE ON FUNCTION public.get_tag_posts(text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tag_posts(text, int, int) TO authenticated;

-- ───────────────────────── online status ─────────────────────────
ALTER TABLE public.profiles ADD COLUMN last_seen_at timestamptz;

-- The app calls this every minute while it is open.
CREATE FUNCTION public.touch_presence() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.profiles SET last_seen_at = now()
   WHERE id = auth.uid() AND (last_seen_at IS NULL OR last_seen_at < now() - interval '20 seconds');
$$;
REVOKE EXECUTE ON FUNCTION public.touch_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_presence() TO authenticated;

-- Last seen time of up to 100 people (hidden if blocked either way).
CREATE FUNCTION public.get_presence(p_users uuid[]) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', a.id, 'last_seen_at', a.last_seen_at)
  FROM public.profiles a
  WHERE auth.uid() IS NOT NULL AND a.id = ANY (p_users[1:100]) AND NOT private.blocked_between(a.id, auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.get_presence(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_presence(uuid[]) TO authenticated;

-- ───────────────────────── voice messages ─────────────────────────
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_media_type_check
  CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'audio'));

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm',
                                  'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/3gpp', 'audio/webm', 'audio/ogg']
 WHERE id = 'chats';

CREATE OR REPLACE FUNCTION private.on_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT count(*) FROM public.messages WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute') > 60 THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.reply_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.messages r WHERE r.id = NEW.reply_to AND r.conversation_id = NEW.conversation_id) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conversations
     SET last_message_at = NEW.created_at,
         last_sender_id = NEW.sender_id,
         last_message_preview = CASE
           WHEN NEW.view_once THEN '🔒'
           WHEN NEW.media_type = 'image' THEN '📷'
           WHEN NEW.media_type = 'video' THEN '🎬'
           WHEN NEW.media_type = 'audio' THEN '🎤'
           WHEN NEW.post_id IS NOT NULL AND char_length(trim(NEW.body)) = 0 THEN '🔗'
           ELSE left(NEW.body, 80) END
   WHERE id = NEW.conversation_id;
  UPDATE public.conversation_members SET archived = false WHERE conversation_id = NEW.conversation_id AND archived;
  UPDATE public.conversation_members SET last_read_at = NEW.created_at
   WHERE conversation_id = NEW.conversation_id AND user_id = NEW.sender_id;
  RETURN NEW;
END $$;
