-- Share links (https://fshow-media.pages.dev/p/?id=…) show a small preview on the web page
-- for people who do not have the app yet. Only PUBLIC posts of not-banned accounts; nothing private.
CREATE OR REPLACE FUNCTION public.get_link_preview(p_post uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'body', left(p.body, 500),
    'image_path', p.image_path,
    'thumb_path', p.thumb_path,
    'is_video', p.video_path IS NOT NULL,
    'video_url', (SELECT m.url FROM public.media_cdn m WHERE m.path = p.video_path),
    'created_at', p.created_at,
    'likes_count', p.likes_count + p.bonus_likes,
    'comments_count', p.comments_count,
    'author', jsonb_build_object('first_name', a.first_name, 'last_name', a.last_name, 'username', a.username,
                                 'photo_path', a.photo_path, 'is_fainet', a.is_fainet)
  )
  FROM public.posts p JOIN public.profiles a ON a.id = p.author_id
  WHERE p.id = p_post AND p.visibility = 'public' AND NOT a.banned;
$$;
REVOKE ALL ON FUNCTION public.get_link_preview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_link_preview(uuid) TO anon, authenticated;
