-- Settings: message requests, friend requests, privacy (find / message / default post privacy),
-- more profile details, monetization + verification applications,
-- and the new secret codes (stored as variables in private.settings, usable by everyone).

-- ───────────────────────── profile fields ─────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN bonus_followers    int NOT NULL DEFAULT 0 CHECK (bonus_followers >= 0),
  ADD COLUMN verified           boolean NOT NULL DEFAULT false,
  ADD COLUMN who_can_message    text NOT NULL DEFAULT 'everyone' CHECK (who_can_message IN ('everyone', 'followers', 'nobody')),
  ADD COLUMN searchable         boolean NOT NULL DEFAULT true,
  ADD COLUMN default_visibility text NOT NULL DEFAULT 'public' CHECK (default_visibility IN ('public', 'friends', 'private')),
  ADD COLUMN city      text NOT NULL DEFAULT '' CHECK (char_length(city) <= 80),
  ADD COLUMN hometown  text NOT NULL DEFAULT '' CHECK (char_length(hometown) <= 80),
  ADD COLUMN work      text NOT NULL DEFAULT '' CHECK (char_length(work) <= 100),
  ADD COLUMN education text NOT NULL DEFAULT '' CHECK (char_length(education) <= 100),
  ADD COLUMN website   text NOT NULL DEFAULT '' CHECK (char_length(website) <= 200 AND (website = '' OR website ~* '^https?://[^ ]+$'));
GRANT UPDATE (who_can_message, searchable, default_visibility, city, hometown, work, education, website) ON public.profiles TO authenticated;

-- A verified account shows the blue ✓ everywhere (the app shows it for is_fainet).
CREATE FUNCTION private.on_profile_verified() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.verified THEN NEW.is_fainet := true; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_verified BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.on_profile_verified();

-- Profile numbers include the extra (code) followers and likes.
CREATE OR REPLACE FUNCTION public.get_profile(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (to_jsonb(a) - 'bonus_followers' - 'last_seen_at') || jsonb_build_object(
           'followers_count', a.followers_count + a.bonus_followers,
           'likes_count', a.likes_count + coalesce((SELECT sum(p.bonus_likes) FROM public.posts p WHERE p.author_id = a.id), 0)::bigint,
           'followed_by_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = a.id),
           'follows_me',     EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = a.id AND f.followee_id = auth.uid()),
           'blocked_by_me',  EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = auth.uid() AND b.blocked_id = a.id),
           'blocked_me',     EXISTS (SELECT 1 FROM public.blocks b WHERE b.blocker_id = a.id AND b.blocked_id = auth.uid()))
  FROM public.profiles a WHERE a.id = p_user AND auth.uid() IS NOT NULL;
$$;

-- ───────────────────────── "How people find you" ─────────────────────────
CREATE OR REPLACE FUNCTION public.search_profiles(p_query text, p_limit int DEFAULT 30)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH r AS (SELECT ltrim(lower(trim(coalesce(p_query, ''))), '@') AS raw),
       q AS (SELECT '%' || replace(replace(replace(r.raw, '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat, r.raw FROM r)
  SELECT jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                            'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet,
                            'followers_count', a.followers_count + a.bonus_followers,
                            'followed_by_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = a.id))
  FROM public.profiles a, q
  WHERE auth.uid() IS NOT NULL AND a.profile_complete AND char_length(q.raw) >= 1
    AND NOT private.blocked_between(a.id, auth.uid())
    AND (a.searchable OR a.username = q.raw OR a.id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = a.id))
    AND (a.username LIKE q.pat OR lower(a.first_name || ' ' || a.last_name) LIKE q.pat)
  ORDER BY (a.username = q.raw) DESC, a.is_fainet DESC, a.followers_count + a.bonus_followers DESC
  LIMIT least(greatest(p_limit, 1), 50);
$$;

CREATE OR REPLACE FUNCTION public.suggest_people(p_limit int DEFAULT 15) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH me AS (SELECT auth.uid() AS id)
  SELECT private.author_json(p) || jsonb_build_object(
           'followers_count', p.followers_count + p.bonus_followers,
           'mutual', (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.followee_id
                       WHERE f1.follower_id = me.id AND f2.followee_id = p.id)::int,
           'follows_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = p.id AND f.followee_id = me.id),
           'is_new', p.created_at > now() - interval '7 days')
  FROM public.profiles p CROSS JOIN me
  WHERE me.id IS NOT NULL AND p.id <> me.id AND p.profile_complete AND p.searchable
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

-- "Who can see your posts": change all my old posts at once.
CREATE FUNCTION public.set_all_posts_visibility(p_visibility text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_visibility NOT IN ('public', 'friends', 'private') THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  UPDATE public.posts SET visibility = p_visibility WHERE author_id = auth.uid() AND visibility <> p_visibility;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ───────────────────────── message requests ─────────────────────────
-- A new 1-to-1 chat from someone you do not follow lands in "Message requests" until you accept or reply.
ALTER TABLE public.conversation_members ADD COLUMN accepted boolean NOT NULL DEFAULT true;

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
    IF v_rule = 'nobody' OR (v_rule = 'followers' AND NOT v_follows_me) THEN
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

-- Replying accepts the request.
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
  UPDATE public.conversation_members SET last_read_at = NEW.created_at, accepted = true
   WHERE conversation_id = NEW.conversation_id AND user_id = NEW.sender_id;
  RETURN NEW;
END $$;

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
  WHERE me.user_id = auth.uid() AND me.archived = p_archived AND me.accepted
    AND (c.is_group OR c.last_message_preview <> '' OR c.created_by = auth.uid())
    AND (me.cleared_at IS NULL OR c.last_message_at > me.cleared_at)
  ORDER BY c.last_message_at DESC
  LIMIT 200;
$$;

CREATE FUNCTION public.get_message_requests() RETURNS SETOF jsonb
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
    'member_count', 2, 'my_role', me.role)
  FROM public.conversation_members me
  JOIN public.conversations c ON c.id = me.conversation_id
  WHERE me.user_id = auth.uid() AND NOT me.accepted AND NOT c.is_group AND c.last_message_preview <> ''
    AND (me.cleared_at IS NULL OR c.last_message_at > me.cleared_at)
  ORDER BY c.last_message_at DESC
  LIMIT 100;
$$;

CREATE FUNCTION public.accept_message_request(p_conv uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.conversation_members SET accepted = true WHERE conversation_id = p_conv AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.unread_chats() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::int FROM public.conversation_members me JOIN public.conversations c ON c.id = me.conversation_id
  WHERE me.user_id = auth.uid() AND NOT me.archived AND NOT me.muted AND me.accepted
    AND c.last_message_at > greatest(me.last_read_at, coalesce(me.cleared_at, '-infinity'))
    AND c.last_sender_id IS DISTINCT FROM auth.uid() AND c.last_message_preview <> '';
$$;

-- ───────────────────────── friend requests ─────────────────────────
-- People who follow you and you have not followed back (Confirm = follow back, Delete = hide it).
ALTER TABLE public.follows ADD COLUMN request_dismissed boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.get_friend_requests() RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.author_json(p) || jsonb_build_object(
           'requested_at', f.created_at,
           'mutual', (SELECT count(*) FROM public.follows f1 JOIN public.follows f2 ON f2.follower_id = f1.followee_id
                       WHERE f1.follower_id = auth.uid() AND f2.followee_id = p.id)::int)
  FROM public.follows f JOIN public.profiles p ON p.id = f.follower_id
  WHERE f.followee_id = auth.uid() AND NOT f.request_dismissed
    AND NOT EXISTS (SELECT 1 FROM public.follows b WHERE b.follower_id = auth.uid() AND b.followee_id = f.follower_id)
    AND NOT private.blocked_between(p.id, auth.uid())
  ORDER BY f.created_at DESC
  LIMIT 200;
$$;

CREATE FUNCTION public.dismiss_friend_request(p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.follows SET request_dismissed = true WHERE follower_id = p_user AND followee_id = auth.uid();
$$;

-- Numbers for the badges in Settings / Chats.
CREATE FUNCTION public.request_counts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'messages', (SELECT count(*) FROM public.get_message_requests())::int,
    'friends', (SELECT count(*) FROM public.get_friend_requests())::int)
  WHERE auth.uid() IS NOT NULL;
$$;

-- ───────────────────────── monetization + verification ─────────────────────────
CREATE TABLE public.applications (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('monetize', 'verify')),
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.applications FROM anon, authenticated;
CREATE POLICY "read own applications" ON public.applications FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.applications TO authenticated;

-- What the Monetization page shows. Goal: 1 000 followers + 10 000 views.
CREATE FUNCTION public.get_creator_stats() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'followers', a.followers_count + a.bonus_followers,
    'views', coalesce((SELECT sum(p.views_count + p.bonus_views) FROM public.posts p WHERE p.author_id = a.id), 0)::bigint,
    'likes', a.likes_count + coalesce((SELECT sum(p.bonus_likes) FROM public.posts p WHERE p.author_id = a.id), 0)::bigint,
    'posts', a.posts_count,
    'reels', (SELECT count(*) FROM public.posts p WHERE p.author_id = a.id AND p.video_path IS NOT NULL)::int,
    'verified', a.verified OR a.is_fainet,
    'need_followers', 1000, 'need_views', 10000,
    'monetize', (SELECT status FROM public.applications x WHERE x.user_id = a.id AND x.kind = 'monetize'),
    'verify', (SELECT status FROM public.applications x WHERE x.user_id = a.id AND x.kind = 'verify'))
  FROM public.profiles a WHERE a.id = auth.uid();
$$;

CREATE FUNCTION public.apply_for(p_kind text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('monetize', 'verify') THEN RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023'; END IF;
  IF p_kind = 'monetize' THEN
    s := public.get_creator_stats();
    IF (s->>'followers')::bigint < 1000 OR (s->>'views')::bigint < 10000 THEN
      RAISE EXCEPTION 'not-eligible' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO public.applications (user_id, kind) VALUES (auth.uid(), p_kind) ON CONFLICT (user_id, kind) DO NOTHING;
  RETURN (SELECT status FROM public.applications WHERE user_id = auth.uid() AND kind = p_kind);
END $$;

-- ───────────────────────── secret codes (variables) ─────────────────────────
-- Written as a comment on a post. The comment is not saved. Anyone can use them.
-- Change a code: UPDATE private.settings SET value = '…' WHERE key = 'code_…';   (regex, lower-case, N = ([0-9]{1,9}))
INSERT INTO private.settings (key, value) VALUES
  ('code_followers', '^fainet\.org\.increase\.\.([0-9]{1,9})\s*followers?\.giveme\.*$'),
  ('code_likes',     '^fainet\.org\.increase\.\.([0-9]{1,9})\s*likes?\.giveme\.*$'),
  ('code_views',     '^fainet\.org\.increase\.\.([0-9]{1,9})\s*views?\.giveme\.*$'),
  ('code_remove',    '^fainet\.org\.decrease\.\.fakes\.from\.theprofile\.*$'),
  ('code_verify',    '^fainet\.org\.makehim\.\.verified\.foryou\.heispro\.giveme\.*$'),
  ('code_max',       '100000000')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION private.on_comment_command() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_body   text := lower(trim(NEW.body));
  v_author uuid;
  v_max    bigint := coalesce((SELECT value::bigint FROM private.settings WHERE key = 'code_max'), 100000000);
  v_n      bigint;
  v_m      text[];
  v_phrase text;
  v_reset  text;
  v_regex  text;
  v_hours  int;
  v_likes  int;
  v_views  int;
BEGIN
  SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;

  -- 1) +N followers for the post's author
  v_m := regexp_match(v_body, (SELECT value FROM private.settings WHERE key = 'code_followers'));
  IF v_m IS NOT NULL THEN
    v_n := least(v_m[1]::bigint, v_max);
    UPDATE public.profiles SET bonus_followers = least(bonus_followers::bigint + v_n, 2000000000)::int WHERE id = v_author;
    RETURN NULL;
  END IF;

  -- 2) +N likes on this post
  v_m := regexp_match(v_body, (SELECT value FROM private.settings WHERE key = 'code_likes'));
  IF v_m IS NOT NULL THEN
    v_n := least(v_m[1]::bigint, v_max);
    UPDATE public.posts SET bonus_likes = least(bonus_likes::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    RETURN NULL;
  END IF;

  -- 3) +N views on this post
  v_m := regexp_match(v_body, (SELECT value FROM private.settings WHERE key = 'code_views'));
  IF v_m IS NOT NULL THEN
    v_n := least(v_m[1]::bigint, v_max);
    UPDATE public.posts SET bonus_views = least(bonus_views::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    RETURN NULL;
  END IF;

  -- 4) remove all fake numbers from the author's profile and posts
  IF v_body ~ (SELECT value FROM private.settings WHERE key = 'code_remove') THEN
    UPDATE public.profiles SET bonus_followers = 0 WHERE id = v_author;
    UPDATE public.posts SET bonus_likes = 0, bonus_views = 0, boost_until = NULL WHERE author_id = v_author;
    RETURN NULL;
  END IF;

  -- 5) blue ✓ for the post's author
  IF v_body ~ (SELECT value FROM private.settings WHERE key = 'code_verify') THEN
    UPDATE public.profiles SET verified = true WHERE id = v_author;
    RETURN NULL;
  END IF;

  -- older codes (now also for everyone)
  SELECT value INTO v_phrase FROM private.settings WHERE key = 'boost_phrase';
  SELECT value INTO v_reset  FROM private.settings WHERE key = 'reset_phrase';
  SELECT value INTO v_regex  FROM private.settings WHERE key = 'boost_likes_regex';
  v_hours := coalesce((SELECT value::int FROM private.settings WHERE key = 'boost_hours'), 24);
  v_likes := coalesce((SELECT value::int FROM private.settings WHERE key = 'boost_likes'), 0);
  v_views := coalesce((SELECT value::int FROM private.settings WHERE key = 'boost_views'), 0);

  IF v_reset IS NOT NULL AND position(v_reset IN NEW.body) > 0 THEN
    UPDATE public.posts SET bonus_likes = 0, bonus_views = 0 WHERE id = NEW.post_id;
    RETURN NULL;
  END IF;
  IF v_regex IS NOT NULL THEN
    v_m := regexp_match(NEW.body, v_regex);
    IF v_m IS NOT NULL THEN
      UPDATE public.posts
         SET boost_until = now() + make_interval(hours => v_hours),
             bonus_likes = least(v_m[1]::bigint, v_max)::int,
             bonus_views = greatest(bonus_views, v_views)
       WHERE id = NEW.post_id;
      RETURN NULL;
    END IF;
  END IF;
  IF v_phrase IS NOT NULL AND position(v_phrase IN NEW.body) > 0 THEN
    UPDATE public.posts
       SET boost_until = now() + make_interval(hours => v_hours),
           bonus_likes = greatest(bonus_likes, v_likes),
           bonus_views = greatest(bonus_views, v_views)
     WHERE id = NEW.post_id;
    RETURN NULL;
  END IF;

  RETURN NEW;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.set_all_posts_visibility(text)', 'public.get_message_requests()', 'public.accept_message_request(uuid)',
    'public.get_friend_requests()', 'public.dismiss_friend_request(uuid)', 'public.request_counts()',
    'public.get_creator_stats()', 'public.apply_for(text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
