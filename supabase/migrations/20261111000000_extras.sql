-- Faisal Show — comment hearts, reposts + send-to-chat, blocking, mute, delete chat for me, read receipts

-- ═════════════════════════ BLOCKS ═════════════════════════
CREATE TABLE public.blocks (
  blocker_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see my blocks" ON public.blocks FOR SELECT TO authenticated USING (blocker_id = (SELECT auth.uid()));
REVOKE ALL ON public.blocks FROM anon, authenticated;
GRANT SELECT ON public.blocks TO authenticated;

-- true when either person blocked the other
CREATE FUNCTION private.blocked_between(a uuid, b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocks WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a));
$$;
GRANT EXECUTE ON FUNCTION private.blocked_between(uuid, uuid) TO authenticated;

CREATE FUNCTION public.block_user(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user = auth.uid() THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.blocks (blocker_id, blocked_id) VALUES (auth.uid(), p_user) ON CONFLICT DO NOTHING;
  DELETE FROM public.follows WHERE (follower_id = auth.uid() AND followee_id = p_user) OR (follower_id = p_user AND followee_id = auth.uid());
END $$;

CREATE FUNCTION public.unblock_user(p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.blocks WHERE blocker_id = auth.uid() AND blocked_id = p_user;
$$;

-- No following someone you blocked / who blocked you.
DROP POLICY "follow as me" ON public.follows;
CREATE POLICY "follow as me" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (follower_id = (SELECT auth.uid()) AND (SELECT public.me_ready()) AND NOT private.blocked_between(follower_id, followee_id));

-- No comments on posts of someone who blocked you (or you blocked).
DROP POLICY "comment as me" ON public.comments;
CREATE POLICY "comment as me" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()) AND (SELECT public.me_ready())
              AND NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND private.blocked_between(p.author_id, (SELECT auth.uid()))));

-- ═════════════════════════ COMMENT HEARTS ═════════════════════════
ALTER TABLE public.comments ADD COLUMN likes_count integer NOT NULL DEFAULT 0;

CREATE TABLE public.comment_likes (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heart as me" ON public.comment_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND (SELECT public.me_ready()));
CREATE POLICY "unheart mine" ON public.comment_likes FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "read hearts" ON public.comment_likes FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.comment_likes FROM anon, authenticated;
GRANT SELECT, DELETE ON public.comment_likes TO authenticated;
GRANT INSERT (comment_id) ON public.comment_likes TO authenticated;

CREATE FUNCTION private.on_comment_like() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id; RETURN NEW;
  ELSE
    UPDATE public.comments SET likes_count = greatest(likes_count - 1, 0) WHERE id = OLD.comment_id; RETURN OLD;
  END IF;
END $$;
CREATE TRIGGER comment_likes_count AFTER INSERT OR DELETE ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION private.on_comment_like();

CREATE OR REPLACE FUNCTION public.get_comments(p_post uuid, p_offset int DEFAULT 0, p_limit int DEFAULT 50)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', c.id, 'body', c.body, 'created_at', c.created_at,
           'likes_count', c.likes_count,
           'liked', EXISTS (SELECT 1 FROM public.comment_likes l WHERE l.comment_id = c.id AND l.user_id = auth.uid()),
           'can_delete', c.author_id = auth.uid() OR p.author_id = auth.uid(),
           'author', private.author_json(a))
  FROM public.comments c
  JOIN public.profiles a ON a.id = c.author_id
  JOIN public.posts p ON p.id = c.post_id
  WHERE c.post_id = p_post AND auth.uid() IS NOT NULL AND NOT private.blocked_between(c.author_id, auth.uid())
  ORDER BY c.likes_count DESC, c.created_at
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 100);
$$;

-- ═════════════════════════ SHARE TO FEED (repost) ═════════════════════════
ALTER TABLE public.posts ADD COLUMN shared_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_has_content;
ALTER TABLE public.posts ADD CONSTRAINT posts_has_content
  CHECK (char_length(trim(body)) > 0 OR image_path IS NOT NULL OR video_path IS NOT NULL OR shared_post_id IS NOT NULL);
GRANT INSERT (shared_post_id) ON public.posts TO authenticated;

-- Reposting counts as a share of the original.
CREATE FUNCTION private.on_repost() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.shared_post_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.posts o WHERE o.id = NEW.shared_post_id AND NOT private.blocked_between(o.author_id, NEW.author_id)) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.post_shares (post_id, user_id) VALUES (NEW.shared_post_id, NEW.author_id) ON CONFLICT DO NOTHING;
    IF FOUND THEN UPDATE public.posts SET shares_count = shares_count + 1 WHERE id = NEW.shared_post_id; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posts_repost AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION private.on_repost();

-- Small preview of a post (for reposts and posts sent in chat).
CREATE FUNCTION private.post_preview(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('id', p.id, 'body', left(p.body, 300), 'image_path', p.image_path, 'video_path', p.video_path,
                            'created_at', p.created_at, 'author', private.author_json(a))
  FROM public.posts p JOIN public.profiles a ON a.id = p.author_id WHERE p.id = p_id;
$$;

CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path, 'thumb_path', p.thumb_path,
    'location', p.location, 'feeling', p.feeling, 'created_at', p.created_at,
    'likes_count', p.likes_count + p.bonus_likes, 'comments_count', p.comments_count, 'saves_count', p.saves_count,
    'shares_count', p.shares_count, 'views_count', p.views_count + p.bonus_views,
    'boosted', coalesce(p.boost_until > now(), false),
    'liked', EXISTS (SELECT 1 FROM public.post_likes l WHERE l.post_id = p.id AND l.user_id = me),
    'saved', EXISTS (SELECT 1 FROM public.post_saves s WHERE s.post_id = p.id AND s.user_id = me),
    'shared', CASE WHEN p.shared_post_id IS NULL THEN NULL ELSE private.post_preview(p.shared_post_id) END,
    'author', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet)
  )
  FROM public.profiles a WHERE a.id = p.author_id;
$$;

-- Feeds hide people you blocked / who blocked you.
CREATE OR REPLACE FUNCTION public.get_feed(p_mode text DEFAULT 'foryou', p_offset int DEFAULT 0, p_limit int DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT auth.uid() AS id)
  SELECT private.post_json(p, me.id)
  FROM public.posts p
  JOIN public.profiles a ON a.id = p.author_id
  CROSS JOIN me
  WHERE me.id IS NOT NULL
    AND NOT private.blocked_between(p.author_id, me.id)
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

CREATE OR REPLACE FUNCTION public.get_reels(p_offset int DEFAULT 0, p_limit int DEFAULT 10)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid())
  FROM public.posts p JOIN public.profiles a ON a.id = p.author_id
  WHERE auth.uid() IS NOT NULL AND p.video_path IS NOT NULL AND NOT private.blocked_between(p.author_id, auth.uid())
  ORDER BY (p.boost_until > now()) IS TRUE DESC,
           extract(epoch FROM p.created_at) / 3600.0
             + CASE WHEN a.is_fainet THEN 12 ELSE 0 END
             + ln(1 + p.likes_count) * 2
             - CASE WHEN EXISTS (SELECT 1 FROM public.post_views v WHERE v.post_id = p.id AND v.user_id = auth.uid()) THEN 18 ELSE 0 END DESC,
           p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 30);
$$;

CREATE OR REPLACE FUNCTION public.search_profiles(p_query text, p_limit int DEFAULT 30)
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
    AND NOT private.blocked_between(a.id, auth.uid())
    AND (a.username LIKE q.pat OR lower(a.first_name || ' ' || a.last_name) LIKE q.pat)
  ORDER BY (a.username = q.raw) DESC, a.is_fainet DESC, a.followers_count DESC
  LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.get_profile(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT to_jsonb(a) || jsonb_build_object(
           'likes_count', a.likes_count + coalesce((SELECT sum(p.bonus_likes) FROM public.posts p WHERE p.author_id = a.id), 0)::bigint,
           'followed_by_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = a.id),
           'follows_me',     EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = a.id AND f.followee_id = auth.uid()),
           'blocked_by_me',  EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = a.id),
           'blocked_me',     EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = a.id AND b.blocked_id = auth.uid()))
  FROM public.profiles a WHERE a.id = p_user AND auth.uid() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.suggest_people(p_limit int DEFAULT 15) RETURNS SETOF jsonb
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
    AND NOT private.blocked_between(p.id, me.id)
    AND NOT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = me.id AND f.followee_id = p.id)
  ORDER BY
    (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.followee_id
      WHERE f1.follower_id = me.id AND f2.followee_id = p.id) DESC,
    EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p.id AND f.followee_id = me.id) DESC,
    p.is_fainet DESC,
    p.created_at DESC
  LIMIT least(greatest(p_limit, 1), 30);
$$;

-- ═════════════════════════ CHATS: send post, mute, delete for me, blocks ═════════════════════════
ALTER TABLE public.messages ADD COLUMN post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_check1;  -- the old "has content" check
ALTER TABLE public.messages ADD CONSTRAINT messages_has_content
  CHECK (deleted OR view_once OR char_length(trim(body)) > 0 OR media_path IS NOT NULL OR post_id IS NOT NULL);
GRANT INSERT (post_id) ON public.messages TO authenticated;

ALTER TABLE public.conversation_members
  ADD COLUMN muted boolean NOT NULL DEFAULT false,
  ADD COLUMN cleared_at timestamptz;
GRANT UPDATE (muted) ON public.conversation_members TO authenticated;

-- Blocked people cannot message each other in a 1-to-1 chat.
CREATE FUNCTION private.direct_blocked(p_conv uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_members o ON o.conversation_id = c.id AND o.user_id <> auth.uid()
    WHERE c.id = p_conv AND NOT c.is_group AND private.blocked_between(o.user_id, auth.uid()));
$$;
GRANT EXECUTE ON FUNCTION private.direct_blocked(uuid) TO authenticated;

DROP POLICY "members send messages" ON public.messages;
CREATE POLICY "members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND private.is_member(conversation_id) AND (SELECT public.me_ready())
              AND view_once = false AND NOT private.direct_blocked(conversation_id));

CREATE OR REPLACE FUNCTION public.start_direct_chat(p_other uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  k text;
  cid uuid;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF p_other = me OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_other AND profile_complete) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF private.blocked_between(me, p_other) THEN RAISE EXCEPTION 'blocked' USING ERRCODE = '42501'; END IF;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  SELECT id INTO cid FROM public.conversations WHERE direct_key = k;
  IF cid IS NULL THEN
    INSERT INTO public.conversations (is_group, created_by, direct_key, last_message_at)
    VALUES (false, me, k, now())
    ON CONFLICT (direct_key) DO NOTHING
    RETURNING id INTO cid;
    IF cid IS NULL THEN SELECT id INTO cid FROM public.conversations WHERE direct_key = k; END IF;
    INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (cid, me), (cid, p_other)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN cid;
END $$;

-- view-once sending also respects blocks
CREATE OR REPLACE FUNCTION public.send_view_once(p_conv uuid, p_body text, p_media_path text, p_media_type text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE mid uuid;
BEGIN
  IF NOT private.is_member(p_conv) OR NOT public.me_ready() OR private.direct_blocked(p_conv) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF char_length(trim(coalesce(p_body, ''))) = 0 AND p_media_path IS NULL THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF char_length(coalesce(p_body, '')) > 4000
     OR (p_media_path IS NOT NULL AND (p_media_path NOT LIKE p_conv::text || '/once/%' OR p_media_type NOT IN ('image', 'video'))) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.messages (conversation_id, sender_id, body, view_once)
  VALUES (p_conv, auth.uid(), '', true) RETURNING id INTO mid;
  INSERT INTO private.message_secrets (message_id, body, media_path, media_type)
  VALUES (mid, coalesce(p_body, ''), p_media_path, CASE WHEN p_media_path IS NULL THEN NULL ELSE p_media_type END);
  RETURN mid;
END $$;

-- preview text for shared posts
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
           WHEN NEW.post_id IS NOT NULL AND char_length(trim(NEW.body)) = 0 THEN '🔗'
           ELSE left(NEW.body, 80) END
   WHERE id = NEW.conversation_id;
  UPDATE public.conversation_members SET archived = false WHERE conversation_id = NEW.conversation_id AND archived;
  UPDATE public.conversation_members SET last_read_at = NEW.created_at
   WHERE conversation_id = NEW.conversation_id AND user_id = NEW.sender_id;
  RETURN NEW;
END $$;

CREATE FUNCTION public.set_chat_muted(p_conv uuid, p_muted boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.conversation_members SET muted = p_muted WHERE conversation_id = p_conv AND user_id = auth.uid();
$$;

-- "Delete chat": hides all current messages for me only; the other person keeps theirs.
CREATE FUNCTION public.delete_chat_for_me(p_conv uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.conversation_members SET cleared_at = now(), last_read_at = now(), archived = false
  WHERE conversation_id = p_conv AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_conversations(p_archived boolean DEFAULT false) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'is_group', c.is_group, 'title', c.title,
    'last_message_at', c.last_message_at, 'last_message_preview', c.last_message_preview,
    'last_sender_id', c.last_sender_id, 'archived', me.archived, 'muted', me.muted,
    'unread', (SELECT count(*) FROM public.messages x WHERE x.conversation_id = c.id
                 AND x.created_at > greatest(me.last_read_at, coalesce(me.cleared_at, '-infinity')) AND x.sender_id <> auth.uid())::int,
    'members', (SELECT jsonb_agg(private.author_json(p) ORDER BY m.joined_at) FROM public.conversation_members m
                  JOIN public.profiles p ON p.id = m.user_id
                 WHERE m.conversation_id = c.id AND m.user_id <> auth.uid()),
    'member_count', (SELECT count(*) FROM public.conversation_members m WHERE m.conversation_id = c.id)::int,
    'my_role', me.role)
  FROM public.conversation_members me
  JOIN public.conversations c ON c.id = me.conversation_id
  WHERE me.user_id = auth.uid() AND me.archived = p_archived
    AND (c.is_group OR c.last_message_preview <> '' OR c.created_by = auth.uid())
    AND (me.cleared_at IS NULL OR c.last_message_at > me.cleared_at)
  ORDER BY c.last_message_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.get_messages(p_conv uuid, p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 40) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'sender_id', m.sender_id, 'body', m.body, 'media_path', m.media_path, 'media_type', m.media_type,
    'view_once', m.view_once, 'opened', m.opened_at IS NOT NULL, 'deleted', m.deleted, 'created_at', m.created_at,
    'once_media', CASE WHEN m.view_once THEN (SELECT s.media_type FROM private.message_secrets s WHERE s.message_id = m.id) END,
    'post', CASE WHEN m.post_id IS NULL THEN NULL ELSE private.post_preview(m.post_id) END,
    'reply', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
               'id', r.id, 'sender_id', r.sender_id, 'deleted', r.deleted,
               'body', CASE WHEN r.view_once THEN '🔒' ELSE left(r.body, 100) END, 'media_type', r.media_type) END,
    'reactions', coalesce((SELECT jsonb_object_agg(e.emoji, e.n) FROM (
                    SELECT emoji, count(*) AS n FROM public.message_reactions WHERE message_id = m.id GROUP BY emoji) e), '{}'::jsonb),
    'my_reaction', (SELECT emoji FROM public.message_reactions WHERE message_id = m.id AND user_id = auth.uid()),
    'sender', private.author_json(s))
  FROM public.messages m
  JOIN public.profiles s ON s.id = m.sender_id
  JOIN public.conversation_members me ON me.conversation_id = m.conversation_id AND me.user_id = auth.uid()
  LEFT JOIN public.messages r ON r.id = m.reply_to
  WHERE m.conversation_id = p_conv
    AND (me.cleared_at IS NULL OR m.created_at > me.cleared_at)
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT least(greatest(p_limit, 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.unread_chats() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::int FROM public.conversation_members me JOIN public.conversations c ON c.id = me.conversation_id
  WHERE me.user_id = auth.uid() AND NOT me.archived AND NOT me.muted
    AND c.last_message_at > greatest(me.last_read_at, coalesce(me.cleared_at, '-infinity'))
    AND c.last_sender_id IS DISTINCT FROM auth.uid() AND c.last_message_preview <> '';
$$;

-- Chat header info: members, my mute state, others' read time (for "Seen"), friendship, block state.
CREATE FUNCTION public.get_chat_info(p_conv uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'is_group', c.is_group, 'title', c.title, 'created_at', c.created_at,
    'muted', me.muted, 'my_role', me.role,
    'members', (SELECT jsonb_agg(private.author_json(p) || jsonb_build_object(
                    'role', m.role, 'last_read_at', m.last_read_at,
                    'followed_by_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = p.id),
                    'follows_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p.id AND f.followee_id = auth.uid()),
                    'blocked_by_me', EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = p.id),
                    'blocked_me', EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = p.id AND b.blocked_id = auth.uid()))
                  ORDER BY m.joined_at)
                FROM public.conversation_members m JOIN public.profiles p ON p.id = m.user_id
                WHERE m.conversation_id = c.id AND m.user_id <> auth.uid()))
  FROM public.conversations c
  JOIN public.conversation_members me ON me.conversation_id = c.id AND me.user_id = auth.uid()
  WHERE c.id = p_conv;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.block_user(uuid)', 'public.unblock_user(uuid)', 'public.set_chat_muted(uuid, boolean)',
    'public.delete_chat_for_me(uuid)', 'public.get_chat_info(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- live read receipts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
  END IF;
END $$;
