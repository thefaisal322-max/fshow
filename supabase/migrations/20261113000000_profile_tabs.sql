-- Profile tabs: All / Posts (no video) / Reels (videos).
DROP FUNCTION public.get_user_posts(uuid, int, int);
CREATE FUNCTION public.get_user_posts(p_user uuid, p_offset int DEFAULT 0, p_limit int DEFAULT 20, p_kind text DEFAULT 'all')
RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.post_json(p, auth.uid()) FROM public.posts p
  WHERE p.author_id = p_user AND private.can_see(p, auth.uid())
    AND (p_kind = 'all'
         OR (p_kind = 'reels' AND p.video_path IS NOT NULL)
         OR (p_kind = 'posts' AND p.video_path IS NULL))
  ORDER BY p.created_at DESC
  OFFSET greatest(p_offset, 0) LIMIT least(greatest(p_limit, 1), 60);
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_posts(uuid, int, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_posts(uuid, int, int, text) TO authenticated;
