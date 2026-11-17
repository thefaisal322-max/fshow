-- Audio / video calls between two people (direct chats).
--   calls        one row per call: ringing → accepted → ended  (or declined / missed / busy)
--   The sound and video go phone-to-phone (WebRTC); the phones exchange their connection
--   details over a Realtime broadcast channel named after the call id.
--   When a call finishes a small "📞 call" line is added to the chat.

CREATE TABLE IF NOT EXISTS public.calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callee_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  video           boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'ended', 'busy')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  answered_at     timestamptz,
  ended_at        timestamptz
);
CREATE INDEX IF NOT EXISTS calls_callee_idx ON public.calls (callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_caller_idx ON public.calls (caller_id, created_at DESC);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calls: the two people" ON public.calls;
CREATE POLICY "calls: the two people" ON public.calls FOR SELECT TO authenticated
  USING (caller_id = (SELECT auth.uid()) OR callee_id = (SELECT auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.calls FROM anon, authenticated;
GRANT SELECT ON public.calls TO authenticated;

-- the chat line for a finished call
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_has_content;
ALTER TABLE public.messages ADD CONSTRAINT messages_has_content
  CHECK (deleted OR view_once OR char_length(trim(body)) > 0 OR media_path IS NOT NULL OR post_id IS NOT NULL OR call_id IS NOT NULL);

-- A call that rang for more than 50 s without an answer counts as missed.
CREATE OR REPLACE FUNCTION private.call_live(c public.calls) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (c.status = 'ringing' AND c.created_at > now() - interval '50 seconds')
      OR (c.status = 'accepted' AND c.answered_at > now() - interval '6 hours');
$$;

CREATE OR REPLACE FUNCTION private.call_json(c public.calls) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'conversation_id', c.conversation_id, 'video', c.video,
    'status', CASE WHEN c.status = 'ringing' AND NOT private.call_live(c) THEN 'missed' ELSE c.status END,
    'caller_id', c.caller_id, 'callee_id', c.callee_id,
    'created_at', c.created_at, 'answered_at', c.answered_at, 'ended_at', c.ended_at,
    'caller', (SELECT private.author_json(p) FROM public.profiles p WHERE p.id = c.caller_id),
    'callee', (SELECT private.author_json(p) FROM public.profiles p WHERE p.id = c.callee_id));
$$;

-- Adds the "📞" line to the chat and moves the chat to the top.
CREATE OR REPLACE FUNCTION private.log_call(c public.calls) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.messages WHERE call_id = c.id) THEN RETURN; END IF;
  INSERT INTO public.messages (conversation_id, sender_id, body, call_id)
  VALUES (c.conversation_id, c.caller_id, '', c.id);
  UPDATE public.conversations
     SET last_message_preview = CASE WHEN c.status IN ('missed', 'declined', 'busy') THEN '📞 ✕' ELSE '📞' END
   WHERE id = c.conversation_id;
END $$;

-- Start a call in a direct chat. Returns the call (status 'busy' if the other person is already in a call).
CREATE OR REPLACE FUNCTION public.start_call(p_conv uuid, p_video boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  v_other uuid;
  v_accepted boolean;
  v_call public.calls;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations c
                 JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = me
                 WHERE c.id = p_conv AND NOT c.is_group) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT cm.user_id, cm.accepted INTO v_other, v_accepted
    FROM public.conversation_members cm WHERE cm.conversation_id = p_conv AND cm.user_id <> me LIMIT 1;
  IF v_other IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF private.blocked_between(me, v_other) THEN RAISE EXCEPTION 'blocked' USING ERRCODE = '42501'; END IF;
  -- a message request that was not accepted yet: no calls
  IF NOT coalesce(v_accepted, true) THEN RAISE EXCEPTION 'no-messages' USING ERRCODE = '42501'; END IF;
  IF (SELECT count(*) FROM public.calls WHERE caller_id = me AND created_at > now() - interval '10 minutes') >= 20 THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
  END IF;

  -- my own old calls that are still "live" are finished first
  UPDATE public.calls c SET status = CASE WHEN c.status = 'ringing' THEN 'missed' ELSE 'ended' END, ended_at = now()
   WHERE (c.caller_id = me OR c.callee_id = me) AND c.status IN ('ringing', 'accepted');

  INSERT INTO public.calls (conversation_id, caller_id, callee_id, video,
                            status, ended_at)
  SELECT p_conv, me, v_other, coalesce(p_video, false),
         CASE WHEN busy THEN 'busy' ELSE 'ringing' END, CASE WHEN busy THEN now() END
    FROM (SELECT EXISTS (SELECT 1 FROM public.calls c WHERE (c.caller_id = v_other OR c.callee_id = v_other) AND private.call_live(c)) AS busy) b
  RETURNING * INTO v_call;
  IF v_call.status = 'busy' THEN PERFORM private.log_call(v_call); END IF;
  RETURN private.call_json(v_call);
END $$;

CREATE OR REPLACE FUNCTION public.answer_call(p_call uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_call public.calls;
BEGIN
  UPDATE public.calls c SET status = 'accepted', answered_at = now()
   WHERE c.id = p_call AND c.callee_id = auth.uid() AND private.call_live(c) AND c.status = 'ringing'
  RETURNING * INTO v_call;
  IF v_call.id IS NULL THEN RAISE EXCEPTION 'call-ended' USING ERRCODE = '55000'; END IF;
  RETURN private.call_json(v_call);
END $$;

-- Hang up / decline / cancel. Works for both people; returns the final call.
CREATE OR REPLACE FUNCTION public.end_call(p_call uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_call public.calls;
BEGIN
  SELECT * INTO v_call FROM public.calls WHERE id = p_call AND (caller_id = auth.uid() OR callee_id = auth.uid());
  IF v_call.id IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_call.status IN ('ringing', 'accepted') THEN
    UPDATE public.calls SET
      status = CASE
        WHEN status = 'accepted' THEN 'ended'
        WHEN auth.uid() = callee_id AND private.call_live(v_call) THEN 'declined'
        ELSE 'missed' END,
      ended_at = now()
    WHERE id = p_call
    RETURNING * INTO v_call;
  END IF;
  PERFORM private.log_call(v_call);
  RETURN private.call_json(v_call);
END $$;

CREATE OR REPLACE FUNCTION public.get_call(p_call uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.call_json(c) FROM public.calls c
  WHERE c.id = p_call AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid());
$$;

-- A call ringing for me right now (when the app opens).
CREATE OR REPLACE FUNCTION public.my_ringing_call() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.call_json(c) FROM public.calls c
  WHERE c.callee_id = auth.uid() AND c.status = 'ringing' AND private.call_live(c)
  ORDER BY c.created_at DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.start_call(uuid, boolean), public.answer_call(uuid), public.end_call(uuid),
                       public.get_call(uuid), public.my_ringing_call() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_call(uuid, boolean), public.answer_call(uuid), public.end_call(uuid),
                          public.get_call(uuid), public.my_ringing_call() TO authenticated;

-- the app hears new calls and status changes instantly
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'calls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;

-- messages: + the call line
CREATE OR REPLACE FUNCTION public.get_messages(p_conv uuid, p_before timestamptz DEFAULT NULL, p_limit int DEFAULT 40) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', m.id, 'sender_id', m.sender_id, 'body', m.body, 'media_path', m.media_path, 'media_type', m.media_type,
    'view_once', m.view_once, 'opened', m.opened_at IS NOT NULL, 'deleted', m.deleted, 'created_at', m.created_at,
    'forwarded', m.forwarded,
    'call', CASE WHEN m.call_id IS NULL THEN NULL ELSE (
              SELECT jsonb_build_object('video', c.video, 'status', c.status, 'caller_id', c.caller_id,
                       'seconds', CASE WHEN c.answered_at IS NULL THEN 0 ELSE extract(epoch FROM (coalesce(c.ended_at, now()) - c.answered_at))::int END)
              FROM public.calls c WHERE c.id = m.call_id) END,
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
