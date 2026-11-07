-- Faisal Show — phase 4: video / location / feeling posts, reels, name edits, chats (Messenger-style)

-- ───────────────────────── posts: video, location, feeling ─────────────────────────
ALTER TABLE public.posts
  ADD COLUMN video_path text CHECK (video_path IS NULL OR (video_path LIKE author_id::text || '/%' AND char_length(video_path) < 200)),
  ADD COLUMN location   text CHECK (location IS NULL OR char_length(location) BETWEEN 1 AND 100),
  ADD COLUMN feeling    text CHECK (feeling IS NULL OR char_length(feeling) BETWEEN 1 AND 40);
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_check1;
ALTER TABLE public.posts ADD CONSTRAINT posts_has_content
  CHECK (char_length(trim(body)) > 0 OR image_path IS NOT NULL OR video_path IS NOT NULL);
GRANT INSERT (video_path, location, feeling) ON public.posts TO authenticated;

-- videos up to 25 MB in the posts bucket
UPDATE storage.buckets
   SET file_size_limit = 26214400,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm']
 WHERE id = 'posts';

CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path,
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

-- Reels: video posts, same ranking idea as For You (boosted first, fresh + fainet + unseen first)
CREATE FUNCTION public.get_reels(p_offset int DEFAULT 0, p_limit int DEFAULT 10)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid())
  FROM public.posts p JOIN public.profiles a ON a.id = p.author_id
  WHERE auth.uid() IS NOT NULL AND p.video_path IS NOT NULL
  ORDER BY (p.boost_until > now()) IS TRUE DESC,
           extract(epoch FROM p.created_at) / 3600.0
             + CASE WHEN a.is_fainet THEN 12 ELSE 0 END
             + ln(1 + p.likes_count) * 2
             - CASE WHEN EXISTS (SELECT 1 FROM public.post_views v WHERE v.post_id = p.id AND v.user_id = auth.uid()) THEN 18 ELSE 0 END DESC,
           p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 30);
$$;
REVOKE EXECUTE ON FUNCTION public.get_reels(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reels(int, int) TO authenticated;

-- ───────────────────────── profile: name can be edited by its owner ─────────────────────────
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_first_name_chars CHECK (first_name !~ '[<>{}\[\]\\/@#$%^*=+|~`"0-9]'),
  ADD CONSTRAINT profiles_last_name_chars  CHECK (last_name  !~ '[<>{}\[\]\\/@#$%^*=+|~`"0-9]');
GRANT UPDATE (first_name, last_name) ON public.profiles TO authenticated;

-- ═════════════════════════ CHATS ═════════════════════════
CREATE TABLE public.conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_group             boolean NOT NULL DEFAULT false,
  title                text CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 60),
  created_by           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  direct_key           text UNIQUE,                 -- "<smaller uid>:<bigger uid>" for 1-to-1 chats
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_message_at      timestamptz NOT NULL DEFAULT now(),
  last_message_preview text NOT NULL DEFAULT '',
  last_sender_id       uuid
);

CREATE TABLE public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  archived        boolean NOT NULL DEFAULT false,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user_idx ON public.conversation_members (user_id);

CREATE TABLE public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  body            text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  media_path      text CHECK (media_path IS NULL OR (media_path LIKE conversation_id::text || '/%' AND char_length(media_path) < 200)),
  media_type      text CHECK (media_type IS NULL OR media_type IN ('image', 'video')),
  reply_to        uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  view_once       boolean NOT NULL DEFAULT false,
  opened_at       timestamptz,
  deleted         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (deleted OR view_once OR char_length(trim(body)) > 0 OR media_path IS NOT NULL),
  CHECK ((media_path IS NULL) = (media_type IS NULL))
);
CREATE INDEX messages_conv_idx ON public.messages (conversation_id, created_at DESC);

-- Content of "view once" messages. Nobody can SELECT it; open_view_once() hands it out once.
CREATE TABLE private.message_secrets (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  body       text NOT NULL DEFAULT '',
  media_path text,
  media_type text
);
-- Short-lived permission to download one view-once file (60 s).
CREATE TABLE private.once_grants (
  user_id    uuid NOT NULL,
  object     text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, object)
);

CREATE TABLE public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (emoji IN ('❤️', '😂', '😮', '😢', '😡', '👍')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE FUNCTION private.is_member(p_conv uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv AND user_id = auth.uid());
$$;
-- RLS policies call this, so the app roles need to be able to execute it (not see the schema).
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION private.is_member(uuid) TO authenticated;

ALTER TABLE public.conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read conversation" ON public.conversations FOR SELECT TO authenticated
  USING (private.is_member(id));
CREATE POLICY "members read members" ON public.conversation_members FOR SELECT TO authenticated
  USING (private.is_member(conversation_id));
CREATE POLICY "update own membership" ON public.conversation_members FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "members read messages" ON public.messages FOR SELECT TO authenticated
  USING (private.is_member(conversation_id));
CREATE POLICY "members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = (SELECT auth.uid()) AND private.is_member(conversation_id) AND (SELECT public.me_ready())
              AND view_once = false);
CREATE POLICY "members read reactions" ON public.message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND private.is_member(m.conversation_id)));
CREATE POLICY "react as me" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid())
              AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND NOT m.deleted AND private.is_member(m.conversation_id)));
CREATE POLICY "change my reaction" ON public.message_reactions FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "remove my reaction" ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.conversations, public.conversation_members, public.messages, public.message_reactions FROM anon, authenticated;
GRANT SELECT ON public.conversations, public.conversation_members, public.messages, public.message_reactions TO authenticated;
GRANT UPDATE (archived, last_read_at) ON public.conversation_members TO authenticated;
GRANT INSERT (conversation_id, body, media_path, media_type, reply_to) ON public.messages TO authenticated;
GRANT INSERT (message_id, emoji), UPDATE (emoji), DELETE ON public.message_reactions TO authenticated;

-- New message → update conversation preview, un-archive for everyone, spam limit.
CREATE FUNCTION private.on_message() RETURNS trigger
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
           ELSE left(NEW.body, 80) END
   WHERE id = NEW.conversation_id;
  UPDATE public.conversation_members SET archived = false WHERE conversation_id = NEW.conversation_id AND archived;
  UPDATE public.conversation_members SET last_read_at = NEW.created_at
   WHERE conversation_id = NEW.conversation_id AND user_id = NEW.sender_id;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_after_insert AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.on_message();

-- ───────── chat RPCs ─────────
-- Open (or create) the 1-to-1 chat with another user.
CREATE FUNCTION public.start_direct_chat(p_other uuid) RETURNS uuid
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

CREATE FUNCTION public.create_group_chat(p_title text, p_members uuid[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  cid uuid;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF char_length(trim(coalesce(p_title, ''))) NOT BETWEEN 1 AND 60 OR coalesce(array_length(p_members, 1), 0) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.conversations (is_group, title, created_by, last_message_preview)
  VALUES (true, trim(p_title), me, '') RETURNING id INTO cid;
  INSERT INTO public.conversation_members (conversation_id, user_id, role) VALUES (cid, me, 'admin');
  INSERT INTO public.conversation_members (conversation_id, user_id)
  SELECT cid, p.id FROM public.profiles p WHERE p.id = ANY (p_members) AND p.id <> me AND p.profile_complete
  ON CONFLICT DO NOTHING;
  RETURN cid;
END $$;

CREATE FUNCTION public.add_group_members(p_conv uuid, p_members uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversation_members m JOIN public.conversations c ON c.id = m.conversation_id
                 WHERE m.conversation_id = p_conv AND m.user_id = auth.uid() AND m.role = 'admin' AND c.is_group) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.conversation_members (conversation_id, user_id)
  SELECT p_conv, p.id FROM public.profiles p WHERE p.id = ANY (p_members) AND p.profile_complete
  ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION public.leave_group_chat(p_conv uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conv AND is_group) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.conversation_members WHERE conversation_id = p_conv AND user_id = auth.uid();
  -- keep at least one admin
  IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv AND role = 'admin') THEN
    UPDATE public.conversation_members SET role = 'admin'
     WHERE (conversation_id, user_id) = (SELECT conversation_id, user_id FROM public.conversation_members
                                         WHERE conversation_id = p_conv ORDER BY joined_at LIMIT 1);
  END IF;
  DELETE FROM public.conversations c WHERE c.id = p_conv AND NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conv);
END $$;

-- Send a "view once" message: the content goes to private.message_secrets, the visible row is empty.
CREATE FUNCTION public.send_view_once(p_conv uuid, p_body text, p_media_path text, p_media_type text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE mid uuid;
BEGIN
  IF NOT private.is_member(p_conv) OR NOT public.me_ready() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
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

-- Open a view-once message: only another member, only once. Returns the content and destroys it.
CREATE FUNCTION public.open_view_once(p_message uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.messages;
  s private.message_secrets;
BEGIN
  SELECT * INTO m FROM public.messages WHERE id = p_message FOR UPDATE;
  IF m.id IS NULL OR NOT private.is_member(m.conversation_id) OR NOT m.view_once THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF m.sender_id = auth.uid() OR m.opened_at IS NOT NULL OR m.deleted THEN
    RAISE EXCEPTION 'already-opened' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO s FROM private.message_secrets WHERE message_id = p_message;
  DELETE FROM private.message_secrets WHERE message_id = p_message;
  UPDATE public.messages SET opened_at = now() WHERE id = p_message;
  IF s.media_path IS NOT NULL THEN
    INSERT INTO private.once_grants (user_id, object, expires_at) VALUES (auth.uid(), s.media_path, now() + interval '60 seconds')
    ON CONFLICT (user_id, object) DO UPDATE SET expires_at = EXCLUDED.expires_at;
  END IF;
  RETURN jsonb_build_object('body', s.body, 'media_path', s.media_path, 'media_type', s.media_type);
END $$;

-- Delete for everyone (sender only).
CREATE FUNCTION public.delete_message(p_message uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_path text;
BEGIN
  UPDATE public.messages SET deleted = true, body = '', reply_to = NULL
   WHERE id = p_message AND sender_id = auth.uid() AND NOT deleted
  RETURNING media_path INTO v_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.messages SET media_path = NULL, media_type = NULL WHERE id = p_message;
  DELETE FROM private.message_secrets WHERE message_id = p_message;
  DELETE FROM public.message_reactions WHERE message_id = p_message;
  RETURN v_path;  -- the app deletes the file from storage
END $$;

CREATE FUNCTION public.mark_chat_read(p_conv uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.conversation_members SET last_read_at = now() WHERE conversation_id = p_conv AND user_id = auth.uid();
$$;

CREATE FUNCTION public.set_chat_archived(p_conv uuid, p_archived boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.conversation_members SET archived = p_archived WHERE conversation_id = p_conv AND user_id = auth.uid();
$$;

CREATE FUNCTION private.author_json(a public.profiles) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                            'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet);
$$;

CREATE FUNCTION public.get_conversations(p_archived boolean DEFAULT false) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'is_group', c.is_group, 'title', c.title,
    'last_message_at', c.last_message_at, 'last_message_preview', c.last_message_preview,
    'last_sender_id', c.last_sender_id, 'archived', me.archived,
    'unread', (SELECT count(*) FROM public.messages x WHERE x.conversation_id = c.id AND x.created_at > me.last_read_at AND x.sender_id <> auth.uid())::int,
    'members', (SELECT jsonb_agg(private.author_json(p) ORDER BY m.joined_at) FROM public.conversation_members m
                  JOIN public.profiles p ON p.id = m.user_id
                 WHERE m.conversation_id = c.id AND m.user_id <> auth.uid()),
    'member_count', (SELECT count(*) FROM public.conversation_members m WHERE m.conversation_id = c.id)::int,
    'my_role', me.role)
  FROM public.conversation_members me
  JOIN public.conversations c ON c.id = me.conversation_id
  WHERE me.user_id = auth.uid() AND me.archived = p_archived
    AND (c.is_group OR c.last_message_preview <> '' OR c.created_by = auth.uid())
  ORDER BY c.last_message_at DESC
  LIMIT 200;
$$;

CREATE FUNCTION public.get_messages(p_conv uuid, p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 40) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'sender_id', m.sender_id, 'body', m.body, 'media_path', m.media_path, 'media_type', m.media_type,
    'view_once', m.view_once, 'opened', m.opened_at IS NOT NULL, 'deleted', m.deleted, 'created_at', m.created_at,
    'once_media', CASE WHEN m.view_once THEN (SELECT s.media_type FROM private.message_secrets s WHERE s.message_id = m.id) END,
    'reply', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
               'id', r.id, 'sender_id', r.sender_id, 'deleted', r.deleted,
               'body', CASE WHEN r.view_once THEN '🔒' ELSE left(r.body, 100) END, 'media_type', r.media_type) END,
    'reactions', coalesce((SELECT jsonb_object_agg(e.emoji, e.n) FROM (
                    SELECT emoji, count(*) AS n FROM public.message_reactions WHERE message_id = m.id GROUP BY emoji) e), '{}'::jsonb),
    'my_reaction', (SELECT emoji FROM public.message_reactions WHERE message_id = m.id AND user_id = auth.uid()),
    'sender', private.author_json(s))
  FROM public.messages m
  JOIN public.profiles s ON s.id = m.sender_id
  LEFT JOIN public.messages r ON r.id = m.reply_to
  WHERE m.conversation_id = p_conv AND private.is_member(p_conv)
    AND (p_before IS NULL OR m.created_at < p_before)
  ORDER BY m.created_at DESC
  LIMIT least(greatest(p_limit, 1), 100);
$$;

CREATE FUNCTION public.unread_chats() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::int FROM public.conversation_members me JOIN public.conversations c ON c.id = me.conversation_id
  WHERE me.user_id = auth.uid() AND NOT me.archived AND c.last_message_at > me.last_read_at
    AND c.last_sender_id IS DISTINCT FROM auth.uid() AND c.last_message_preview <> '';
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.start_direct_chat(uuid)', 'public.create_group_chat(text, uuid[])', 'public.add_group_members(uuid, uuid[])',
    'public.leave_group_chat(uuid)', 'public.send_view_once(uuid, text, text, text)', 'public.open_view_once(uuid)',
    'public.delete_message(uuid)', 'public.mark_chat_read(uuid)', 'public.set_chat_archived(uuid, boolean)',
    'public.get_conversations(boolean)', 'public.get_messages(uuid, timestamptz, int)', 'public.unread_chats()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

-- ───────── private chat files ─────────
-- chats/<conversation id>/<file>        → any member can read
-- chats/<conversation id>/once/<file>   → only with a 60-second grant from open_view_once()
CREATE FUNCTION private.can_read_chat_file(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[2] = 'once' THEN
      EXISTS (SELECT 1 FROM private.once_grants g WHERE g.user_id = auth.uid() AND g.object = p_name AND g.expires_at > now())
      OR EXISTS (SELECT 1 FROM private.message_secrets s JOIN public.messages m ON m.id = s.message_id
                  WHERE s.media_path = p_name AND m.sender_id = auth.uid())
    ELSE private.is_member(((storage.foldername(p_name))[1])::uuid)
  END;
$$;
GRANT EXECUTE ON FUNCTION private.can_read_chat_file(text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chats', 'chats', false, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "chats: members read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chats' AND private.can_read_chat_file(name));
CREATE POLICY "chats: members upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chats' AND private.is_member(((storage.foldername(name))[1])::uuid) AND (SELECT public.me_ready()));
CREATE POLICY "chats: uploader deletes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chats' AND owner_id = (SELECT auth.uid())::text);

-- live chat
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages, public.message_reactions, public.conversations;
  END IF;
END $$;
