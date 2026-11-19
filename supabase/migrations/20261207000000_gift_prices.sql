-- New gift prices (FC)
CREATE OR REPLACE FUNCTION private.gift_price(p_gift text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_gift
    WHEN 'bronze_watch' THEN 300 WHEN 'butterfly' THEN 500 WHEN 'yellow_flower' THEN 750 WHEN 'gold_watch' THEN 999
    WHEN 'rose' THEN 1200 WHEN 'bird' THEN 1499 WHEN 'smart_gift' THEN 1499 WHEN 'tiger' THEN 1750
    WHEN 'car' THEN 1999 WHEN 'power_love' THEN 2500 WHEN 'fplus' THEN 2999 END;
$$;

-- The owner of a post / reel can see who liked it (newest first)
CREATE OR REPLACE FUNCTION public.get_post_likers(p_post uuid, p_offset int DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = p_post AND author_id = auth.uid()) AND NOT private.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'total', (SELECT count(*) FROM public.post_likes WHERE post_id = p_post),
    'people', (SELECT coalesce(jsonb_agg(private.author_json(a) || jsonb_build_object('liked_at', l.created_at) ORDER BY l.created_at DESC), '[]'::jsonb)
               FROM (SELECT * FROM public.post_likes WHERE post_id = p_post ORDER BY created_at DESC OFFSET greatest(p_offset, 0) LIMIT 50) l
               JOIN public.profiles a ON a.id = l.user_id
               WHERE NOT private.blocked_between(auth.uid(), a.id)));
END $$;
REVOKE EXECUTE ON FUNCTION public.get_post_likers(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_post_likers(uuid, int) TO authenticated;
