-- Messages like Messenger:
--   • react with ANY emoji (not only the 6 quick ones)
--   • delete for me (only hides it for me)  ·  delete for everyone (already: delete_message)
--   • forward (the app copies the file and sends a new message marked "forwarded")
--   • copy profile link → a small public preview for https://fshow-media.pages.dev/u/?id=…

-- ───────────── any emoji ─────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.message_reactions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%emoji%'
  LOOP
    EXECUTE format('ALTER TABLE public.message_reactions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
-- one short emoji: no letters, digits, spaces or markup
ALTER TABLE public.message_reactions ADD CONSTRAINT message_reactions_emoji_ok
  CHECK (char_length(emoji) BETWEEN 1 AND 16 AND emoji !~ '[A-Za-z0-9<>&"''\s]');

-- ───────────── forwarded ─────────────
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS forwarded boolean NOT NULL DEFAULT false;
GRANT INSERT (forwarded) ON public.messages TO authenticated;

-- ───────────── delete for me ─────────────
CREATE TABLE IF NOT EXISTS public.message_hidden (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.message_hidden ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_hidden FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.hide_message(p_message uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = auth.uid()
    WHERE m.id = p_message
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.message_hidden (message_id, user_id) VALUES (p_message, auth.uid()) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.hide_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hide_message(uuid) TO authenticated;

-- messages: + forwarded, without the ones I deleted for me
CREATE OR REPLACE FUNCTION public.get_messages(p_conv uuid, p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 40) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'sender_id', m.sender_id, 'body', m.body, 'media_path', m.media_path, 'media_type', m.media_type,
    'view_once', m.view_once, 'opened', m.opened_at IS NOT NULL, 'deleted', m.deleted, 'created_at', m.created_at,
    'forwarded', m.forwarded,
    'once_media', CASE WHEN m.view_once THEN (SELECT s.media_type FROM private.message_secrets s WHERE s.message_id = m.id) END,
    'post', CASE WHEN m.post_id IS NULL THEN NULL ELSE private.post_preview(m.post_id) END,
    'post_id', m.post_id,
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
    AND NOT EXISTS (SELECT 1 FROM public.message_hidden h WHERE h.message_id = m.id AND h.user_id = auth.uid())
  ORDER BY m.created_at DESC
  LIMIT least(greatest(p_limit, 1), 100);
$$;

-- ───────────── profile link preview (public info only) ─────────────
CREATE OR REPLACE FUNCTION public.get_profile_link_preview(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'first_name', a.first_name, 'last_name', a.last_name, 'username', a.username,
    'photo_path', a.photo_path, 'is_fainet', a.is_fainet, 'bio', left(coalesce(a.bio, ''), 300),
    'followers', (SELECT count(*) FROM public.follows f WHERE f.followee_id = a.id) + a.bonus_followers,
    'posts', (SELECT count(*) FROM public.posts p WHERE p.author_id = a.id AND p.visibility = 'public'))
  FROM public.profiles a
  WHERE a.id = p_user AND a.profile_complete AND NOT a.banned;
$$;
REVOKE ALL ON FUNCTION public.get_profile_link_preview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_link_preview(uuid) TO anon, authenticated;
