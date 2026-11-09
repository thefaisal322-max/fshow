-- Friends (like Facebook), next to Follow:
--   • tap Follow → follow (one way)
--   • hold Follow for 5 s → friend request; when accepted you follow each other = friends
--   • "Who can message you" gets "Friends only"
-- Friends = people who follow each other.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'mention', 'friend_request', 'friend_accept'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_who_can_message_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_who_can_message_check
  CHECK (who_can_message IN ('everyone', 'followers', 'friends', 'nobody'));

CREATE TABLE public.friend_requests (
  from_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (from_id, to_id),
  CHECK (from_id <> to_id)
);
CREATE INDEX friend_requests_to_idx ON public.friend_requests (to_id, created_at DESC);
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_requests FROM anon, authenticated;
CREATE POLICY "see my requests" ON public.friend_requests FOR SELECT TO authenticated
  USING (from_id = (SELECT auth.uid()) OR to_id = (SELECT auth.uid()));
GRANT SELECT ON public.friend_requests TO authenticated;

-- 'friends' | 'sent' | 'received' | 'none'
CREATE FUNCTION private.friend_status(me uuid, other uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN private.are_friends(me, other) THEN 'friends'
    WHEN EXISTS (SELECT 1 FROM public.friend_requests r WHERE r.from_id = me AND r.to_id = other) THEN 'sent'
    WHEN EXISTS (SELECT 1 FROM public.friend_requests r WHERE r.from_id = other AND r.to_id = me) THEN 'received'
    ELSE 'none' END;
$$;

-- Make two people friends (both follow each other) and clear requests between them.
CREATE FUNCTION private.make_friends(a uuid, b uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.follows (follower_id, followee_id) VALUES (a, b), (b, a) ON CONFLICT DO NOTHING;
  DELETE FROM public.friend_requests WHERE (from_id = a AND to_id = b) OR (from_id = b AND to_id = a);
$$;

CREATE FUNCTION public.send_friend_request(p_to uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_to = me OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_to AND profile_complete) THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF private.blocked_between(me, p_to) THEN RAISE EXCEPTION 'blocked' USING ERRCODE = '42501'; END IF;
  IF private.are_friends(me, p_to) THEN RETURN 'friends'; END IF;
  IF (SELECT count(*) FROM public.friend_requests WHERE from_id = me AND created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
  END IF;
  -- they already asked me → we are friends now
  IF EXISTS (SELECT 1 FROM public.friend_requests WHERE from_id = p_to AND to_id = me) THEN
    PERFORM private.make_friends(me, p_to);
    PERFORM private.notify(p_to, me, 'friend_accept', NULL, NULL);
    RETURN 'friends';
  END IF;
  INSERT INTO public.friend_requests (from_id, to_id) VALUES (me, p_to) ON CONFLICT DO NOTHING;
  IF FOUND THEN PERFORM private.notify(p_to, me, 'friend_request', NULL, NULL); END IF;
  RETURN 'sent';
END $$;

CREATE FUNCTION public.cancel_friend_request(p_to uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.friend_requests WHERE from_id = auth.uid() AND to_id = p_to;
  DELETE FROM public.notifications WHERE user_id = p_to AND actor_id = auth.uid() AND type = 'friend_request';
$$;

-- Confirm → friends (both follow each other). Delete → request removed.
CREATE FUNCTION public.respond_friend_request(p_from uuid, p_accept boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.friend_requests WHERE from_id = p_from AND to_id = me) THEN
    RETURN private.friend_status(me, p_from);
  END IF;
  IF p_accept AND NOT private.blocked_between(me, p_from) THEN
    PERFORM private.make_friends(me, p_from);
    PERFORM private.notify(p_from, me, 'friend_accept', NULL, NULL);
    RETURN 'friends';
  END IF;
  DELETE FROM public.friend_requests WHERE from_id = p_from AND to_id = me;
  RETURN 'none';
END $$;

-- Unfriend = stop following each other.
CREATE FUNCTION public.unfriend(p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.follows WHERE (follower_id = auth.uid() AND followee_id = p_user) OR (follower_id = p_user AND followee_id = auth.uid());
$$;

-- Incoming friend requests (the old "followers you did not follow back" list is replaced by real requests).
CREATE OR REPLACE FUNCTION public.get_friend_requests() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.author_json(p) || jsonb_build_object(
           'requested_at', r.created_at,
           'followers_count', p.followers_count + p.bonus_followers,
           'mutual', (SELECT count(*) FROM public.follows a1 JOIN public.follows a2 ON a2.follower_id = a1.followee_id AND a2.followee_id = a1.follower_id
                       JOIN public.follows b1 ON b1.follower_id = p.id AND b1.followee_id = a1.followee_id
                       JOIN public.follows b2 ON b2.follower_id = a1.followee_id AND b2.followee_id = p.id
                       WHERE a1.follower_id = auth.uid())::int)
  FROM public.friend_requests r JOIN public.profiles p ON p.id = r.from_id
  WHERE r.to_id = auth.uid() AND NOT private.blocked_between(p.id, auth.uid())
  ORDER BY r.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_friend_request(p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.friend_requests WHERE from_id = p_user AND to_id = auth.uid();
$$;

-- Requests I sent.
CREATE FUNCTION public.get_sent_friend_requests() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.author_json(p) || jsonb_build_object('requested_at', r.created_at)
  FROM public.friend_requests r JOIN public.profiles p ON p.id = r.to_id
  WHERE r.from_id = auth.uid()
  ORDER BY r.created_at DESC LIMIT 200;
$$;

-- My friends (or another person's), online first.
CREATE FUNCTION public.get_friends(p_user uuid DEFAULT NULL, p_offset int DEFAULT 0, p_limit int DEFAULT 50) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH u AS (SELECT coalesce(p_user, auth.uid()) AS id)
  SELECT private.author_json(p) || jsonb_build_object(
           'last_seen_at', p.last_seen_at,
           'online', coalesce(p.last_seen_at > now() - interval '2 minutes', false),
           'friends_since', greatest(f1.created_at, f2.created_at))
  FROM u
  JOIN public.follows f1 ON f1.follower_id = u.id
  JOIN public.follows f2 ON f2.follower_id = f1.followee_id AND f2.followee_id = u.id
  JOIN public.profiles p ON p.id = f1.followee_id
  WHERE auth.uid() IS NOT NULL AND NOT private.blocked_between(p.id, auth.uid())
  ORDER BY coalesce(p.last_seen_at > now() - interval '2 minutes', false) DESC, p.first_name, p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 100);
$$;

CREATE FUNCTION public.get_friend_counts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'friends', (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.followee_id AND f2.followee_id = f1.follower_id
                 WHERE f1.follower_id = auth.uid())::int,
    'online', (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.followee_id AND f2.followee_id = f1.follower_id
                 JOIN public.profiles p ON p.id = f1.followee_id
                WHERE f1.follower_id = auth.uid() AND p.last_seen_at > now() - interval '2 minutes')::int,
    'requests', (SELECT count(*) FROM public.friend_requests r WHERE r.to_id = auth.uid())::int)
  WHERE auth.uid() IS NOT NULL;
$$;

-- Profile knows the friend state + number of friends.
CREATE OR REPLACE FUNCTION public.get_profile(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (to_jsonb(a) - 'bonus_followers' - 'last_seen_at') || jsonb_build_object(
           'followers_count', a.followers_count + a.bonus_followers,
           'likes_count', a.likes_count + coalesce((SELECT sum(p.bonus_likes) FROM public.posts p WHERE p.author_id = a.id), 0)::bigint,
           'friends_count', (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.followee_id AND f2.followee_id = f1.follower_id
                              WHERE f1.follower_id = a.id)::int,
           'friend_status', private.friend_status(auth.uid(), a.id),
           'followed_by_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = a.id),
           'follows_me',     EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = a.id AND f.followee_id = auth.uid()),
           'blocked_by_me',  EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = a.id),
           'blocked_me',     EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = a.id AND b.blocked_id = auth.uid()))
  FROM public.profiles a WHERE a.id = p_user AND auth.uid() IS NOT NULL;
$$;

-- Badge numbers: real friend requests now.
CREATE OR REPLACE FUNCTION public.request_counts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'messages', (SELECT count(*) FROM public.get_message_requests())::int,
    'friends', (SELECT count(*) FROM public.friend_requests r WHERE r.to_id = auth.uid())::int)
  WHERE auth.uid() IS NOT NULL;
$$;

-- "Who can message you": Friends only.
CREATE OR REPLACE FUNCTION public.start_direct_chat(p_other uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  k text;
  cid uuid;
  v_rule text;
  v_follows_me boolean;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  SELECT who_can_message INTO v_rule FROM public.profiles WHERE id = p_other AND profile_complete;
  IF p_other = me OR v_rule IS NULL THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF private.blocked_between(me, p_other) THEN RAISE EXCEPTION 'blocked' USING ERRCODE = '42501'; END IF;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  SELECT id INTO cid FROM public.conversations WHERE direct_key = k;
  IF cid IS NULL THEN
    v_follows_me := EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p_other AND f.followee_id = me);
    IF v_rule = 'nobody'
       OR (v_rule = 'followers' AND NOT v_follows_me)
       OR (v_rule = 'friends' AND NOT private.are_friends(me, p_other)) THEN
      RAISE EXCEPTION 'no-messages' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.conversations (is_group, created_by, direct_key, last_message_at)
    VALUES (false, me, k, now())
    ON CONFLICT (direct_key) DO NOTHING
    RETURNING id INTO cid;
    IF cid IS NULL THEN SELECT id INTO cid FROM public.conversations WHERE direct_key = k; END IF;
    INSERT INTO public.conversation_members (conversation_id, user_id, accepted) VALUES (cid, me, true), (cid, p_other, v_follows_me)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN cid;
END $$;

-- Blocking someone also removes friend requests between you.
CREATE FUNCTION private.on_block_requests() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.friend_requests
   WHERE (from_id = NEW.blocker_id AND to_id = NEW.blocked_id) OR (from_id = NEW.blocked_id AND to_id = NEW.blocker_id);
  RETURN NEW;
END $$;
CREATE TRIGGER blocks_clear_requests AFTER INSERT ON public.blocks FOR EACH ROW EXECUTE FUNCTION private.on_block_requests();

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.send_friend_request(uuid)', 'public.cancel_friend_request(uuid)', 'public.respond_friend_request(uuid, boolean)',
    'public.unfriend(uuid)', 'public.get_sent_friend_requests()', 'public.get_friends(uuid, int, int)', 'public.get_friend_counts()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
