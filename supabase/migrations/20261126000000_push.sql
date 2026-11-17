-- Push notifications (Firebase Cloud Messaging): the phone gets told even when Faisal Show is closed.
--   push_tokens   each phone's FCM token (one person can have several phones)
--   private.push_hook  where to call the "push" Edge Function + a shared secret (set by the deploy workflow)
--   triggers      new notification / new message / new or finished call → pg_net calls the function,
--                 which writes the text (in the receiver's language) and sends it through FCM.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  token      text PRIMARY KEY CHECK (char_length(token) BETWEEN 20 AND 600),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform   text NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  lang       text NOT NULL DEFAULT 'ps' CHECK (lang IN ('ps', 'en', 'fa')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_tokens FROM anon, authenticated;

-- The app saves its token after login (a token moves to the newest account that used the phone).
CREATE OR REPLACE FUNCTION public.save_push_token(p_token text, p_platform text DEFAULT 'android', p_lang text DEFAULT 'ps') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.push_tokens (token, user_id, platform, lang, updated_at)
  VALUES (p_token, auth.uid(), coalesce(p_platform, 'android'),
          CASE WHEN p_lang IN ('ps', 'en', 'fa') THEN p_lang ELSE 'ps' END, now())
  ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, lang = excluded.lang, updated_at = now();
  -- at most 5 phones per person
  DELETE FROM public.push_tokens WHERE user_id = auth.uid() AND token NOT IN (
    SELECT token FROM public.push_tokens WHERE user_id = auth.uid() ORDER BY updated_at DESC LIMIT 5);
END $$;

-- Logging out stops pushes to this phone.
CREATE OR REPLACE FUNCTION public.remove_push_token(p_token text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.push_tokens WHERE token = p_token AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.save_push_token(text, text, text), public.remove_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_token(text, text, text), public.remove_push_token(text) TO authenticated;

-- ───────────── hook settings (filled by the Edge Function itself at deploy time) ─────────────
CREATE TABLE IF NOT EXISTS private.push_hook (
  id     boolean PRIMARY KEY DEFAULT true CHECK (id),
  url    text NOT NULL,
  secret text NOT NULL
);
CREATE OR REPLACE FUNCTION public.set_push_hook(p_url text, p_secret text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO private.push_hook (id, url, secret) VALUES (true, p_url, p_secret)
  ON CONFLICT (id) DO UPDATE SET url = excluded.url, secret = excluded.secret;
$$;
REVOKE ALL ON FUNCTION public.set_push_hook(text, text) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.set_push_hook(text, text) TO service_role;
  END IF;
END $$;

-- pg_net lets the database call the Edge Function (skipped where it is not installed, e.g. local tests)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.push(p_kind text, p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE h private.push_hook;
BEGIN
  SELECT * INTO h FROM private.push_hook WHERE id;
  IF h.url IS NULL OR to_regproc('net.http_post') IS NULL THEN RETURN; END IF;
  -- never block the action that caused it
  BEGIN
    EXECUTE 'SELECT net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 4000)'
      USING h.url, jsonb_build_object('kind', p_kind, 'id', p_id),
            jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', h.secret);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push failed: %', SQLERRM;
  END;
END $$;

CREATE OR REPLACE FUNCTION private.on_notification_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN PERFORM private.push('notification', new.id); RETURN new; END $$;
DROP TRIGGER IF EXISTS notification_push ON public.notifications;
CREATE TRIGGER notification_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION private.on_notification_push();

CREATE OR REPLACE FUNCTION private.on_message_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF new.call_id IS NULL AND NOT new.deleted THEN PERFORM private.push('message', new.id); END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS message_push ON public.messages;
CREATE TRIGGER message_push AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION private.on_message_push();

-- calls: ring when it starts, "missed call" when it stops ringing without an answer
CREATE OR REPLACE FUNCTION private.on_call_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND new.status = 'ringing' THEN
    PERFORM private.push('call', new.id);
  ELSIF TG_OP = 'UPDATE' AND old.status = 'ringing' AND new.status <> 'ringing' THEN
    PERFORM private.push('call_end', new.id);
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS call_push ON public.calls;
CREATE TRIGGER call_push AFTER INSERT OR UPDATE OF status ON public.calls FOR EACH ROW EXECUTE FUNCTION private.on_call_push();
