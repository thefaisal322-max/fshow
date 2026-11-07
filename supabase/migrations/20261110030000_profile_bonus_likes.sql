-- Profile "Likes" total also shows the bonus likes of the user's posts.
-- Real total stays in profiles.likes_count.
CREATE OR REPLACE FUNCTION public.get_profile(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT to_jsonb(a) || jsonb_build_object(
           'likes_count', a.likes_count + coalesce((SELECT sum(p.bonus_likes) FROM public.posts p WHERE p.author_id = a.id), 0)::bigint,
           'followed_by_me', EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followee_id = a.id),
           'follows_me',     EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = a.id AND f.followee_id = auth.uid()))
  FROM public.profiles a WHERE a.id = p_user AND auth.uid() IS NOT NULL;
$$;
