-- Security hardening (audit 2026-11-17)
--   1. no TRUNCATE / TRIGGER / REFERENCES for app users on any table (TRUNCATE would skip row security)
--   2. a message's file must live in that chat's own folder
--   3. call signalling channels are private: only the two people in the call can listen or send

-- 1 ─────────────────────────────────────────────
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', t.relname);
  END LOOP;
END $$;
REVOKE ALL ON public.calls FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.calls, public.app_config FROM anon, authenticated;
-- and the same for tables made later
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

-- 2 ─────────────────────────────────────────────
DROP POLICY IF EXISTS "members send messages" ON public.messages;
CREATE POLICY "members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND private.is_member(conversation_id)
    AND (SELECT public.me_ready())
    AND view_once = false
    AND NOT private.direct_blocked(conversation_id)
    AND (media_path IS NULL OR (storage.foldername(media_path))[1] = conversation_id::text)
  );

-- 3 ─────────────────────────────────────────────
-- Realtime Authorization: "call:<id>" channels opened with { private: true } only work for the caller and callee.
DO $$ BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE $p$DROP POLICY IF EXISTS "call peers listen" ON realtime.messages$p$;
    EXECUTE $p$DROP POLICY IF EXISTS "call peers send" ON realtime.messages$p$;
    EXECUTE $p$
      CREATE POLICY "call peers listen" ON realtime.messages FOR SELECT TO authenticated
      USING (
        realtime.messages.extension = 'broadcast'
        AND EXISTS (SELECT 1 FROM public.calls c
                    WHERE 'call:' || c.id::text = (SELECT realtime.topic())
                      AND (c.caller_id = (SELECT auth.uid()) OR c.callee_id = (SELECT auth.uid())))
      )$p$;
    EXECUTE $p$
      CREATE POLICY "call peers send" ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (
        realtime.messages.extension = 'broadcast'
        AND EXISTS (SELECT 1 FROM public.calls c
                    WHERE 'call:' || c.id::text = (SELECT realtime.topic())
                      AND (c.caller_id = (SELECT auth.uid()) OR c.callee_id = (SELECT auth.uid())))
      )$p$;
  END IF;
END $$;
