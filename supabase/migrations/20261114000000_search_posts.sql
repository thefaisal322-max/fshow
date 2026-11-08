-- Search tabs: Top / Reels / Posts / People. Finds posts and reels by their text, #hashtags or the author's name.
CREATE FUNCTION public.search_posts(p_query text, p_kind text DEFAULT 'all', p_offset int DEFAULT 0, p_limit int DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH r AS (SELECT lower(trim(coalesce(p_query, ''))) AS raw),
       q AS (SELECT '%' || replace(replace(replace(ltrim(r.raw, '@'), '\', '\\'), '%', '\%'), '_', '\_') || '%' AS pat, r.raw FROM r)
  SELECT private.post_json(p, auth.uid())
  FROM public.posts p
  JOIN public.profiles a ON a.id = p.author_id
  CROSS JOIN q
  WHERE auth.uid() IS NOT NULL AND char_length(q.raw) >= 1
    AND (lower(p.body) LIKE q.pat OR a.username LIKE q.pat OR lower(a.first_name || ' ' || a.last_name) LIKE q.pat)
    AND (p_kind = 'all' OR (p_kind = 'reels' AND p.video_path IS NOT NULL) OR (p_kind = 'posts' AND p.video_path IS NULL))
    AND private.can_see(p, auth.uid())
    AND NOT private.hidden_for(p.id, auth.uid())
  ORDER BY (lower(p.body) LIKE q.pat) DESC,
           ln(1 + p.likes_count + p.bonus_likes) * 2 + ln(1 + p.views_count + p.bonus_views) + extract(epoch FROM p.created_at) / 86400.0 DESC,
           p.id
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 50);
$$;
REVOKE EXECUTE ON FUNCTION public.search_posts(text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_posts(text, text, int, int) TO authenticated;

-- ───────────────────────── @mentions ─────────────────────────
-- Tapping @username in a post or comment opens that profile.
CREATE FUNCTION public.user_id_by_username(p_username text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.id FROM public.profiles a
  WHERE auth.uid() IS NOT NULL AND a.username = lower(ltrim(trim(coalesce(p_username, '')), '@'))
    AND NOT private.blocked_between(a.id, auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.user_id_by_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_id_by_username(text) TO authenticated;

-- @mentions in a new post notify those people (max 5, only people who can see the post).
CREATE FUNCTION private.on_post_mentions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_name text; v_target uuid;
BEGIN
  FOR v_name IN
    SELECT DISTINCT lower(m[1]) FROM regexp_matches(NEW.body, '@([A-Za-z0-9._]{3,20})', 'g') AS m LIMIT 5
  LOOP
    SELECT id INTO v_target FROM public.profiles WHERE username = v_name;
    IF v_target IS NOT NULL AND v_target <> NEW.author_id AND private.can_see(NEW, v_target) THEN
      PERFORM private.notify(v_target, NEW.author_id, 'mention', NEW.id, NULL);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER posts_mentions AFTER INSERT ON public.posts FOR EACH ROW EXECUTE FUNCTION private.on_post_mentions();
