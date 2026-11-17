-- Monetization challenges now also count the extra (bonus) followers, likes and views,
-- plus the automatic views every new post gets in its first 10 hours.
-- (Payments still need the admin's approval in the Main tab.)
CREATE OR REPLACE FUNCTION private.user_metric(u uuid, m text) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE m
    WHEN 'post_views'        THEN (SELECT coalesce(max(views_count + bonus_views + private.auto_views(created_at)), 0)
                                   FROM public.posts WHERE author_id = u AND video_path IS NULL)
    WHEN 'reel_plays'        THEN (SELECT coalesce(max(views_count + bonus_views + private.auto_views(created_at)), 0)
                                   FROM public.posts WHERE author_id = u AND video_path IS NOT NULL)
    WHEN 'followers'         THEN (SELECT followers_count + bonus_followers FROM public.profiles WHERE id = u)
    WHEN 'likes_total'       THEN (SELECT coalesce(sum(likes_count + bonus_likes), 0) FROM public.posts WHERE author_id = u)
    WHEN 'posts_count'       THEN (SELECT count(*) FROM public.posts WHERE author_id = u)
    WHEN 'reels_count'       THEN (SELECT count(*) FROM public.posts WHERE author_id = u AND video_path IS NOT NULL)
    WHEN 'comments_received' THEN (SELECT coalesce(sum(comments_count), 0) FROM public.posts WHERE author_id = u)
    WHEN 'shares_total'      THEN (SELECT coalesce(sum(shares_count), 0) FROM public.posts WHERE author_id = u)
    WHEN 'profile_ready'     THEN (SELECT (photo_path IS NOT NULL AND char_length(trim(bio)) > 0)::int FROM public.profiles WHERE id = u)
    ELSE 0 END;
$$;
