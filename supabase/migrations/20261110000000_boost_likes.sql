-- fainet.org boost phrase also adds bonus likes (default 500) to the post.
-- Real likes stay in likes_count; the bonus is kept separately in bonus_likes,
-- so the owner can always see real numbers and switch the bonus off.

ALTER TABLE public.posts ADD COLUMN bonus_likes integer NOT NULL DEFAULT 0 CHECK (bonus_likes >= 0);
-- not granted to the app: only the server can set it

INSERT INTO private.settings (key, value) VALUES ('boost_likes', '500')
ON CONFLICT (key) DO NOTHING;

-- Shown likes = real likes + bonus. Ranking keeps using real likes only.
CREATE OR REPLACE FUNCTION private.post_json(p public.posts, me uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'body', p.body, 'image_path', p.image_path, 'video_path', p.video_path, 'thumb_path', p.thumb_path,
    'location', p.location, 'feeling', p.feeling, 'created_at', p.created_at,
    'likes_count', p.likes_count + p.bonus_likes, 'comments_count', p.comments_count, 'saves_count', p.saves_count,
    'shares_count', p.shares_count, 'views_count', p.views_count,
    'boosted', coalesce(p.boost_until > now(), false),
    'liked', EXISTS (SELECT 1 FROM public.post_likes l WHERE l.post_id = p.id AND l.user_id = me),
    'saved', EXISTS (SELECT 1 FROM public.post_saves s WHERE s.post_id = p.id AND s.user_id = me),
    'author', jsonb_build_object('id', a.id, 'first_name', a.first_name, 'last_name', a.last_name,
                                 'username', a.username, 'photo_path', a.photo_path, 'is_fainet', a.is_fainet)
  )
  FROM public.profiles a WHERE a.id = p.author_id;
$$;

-- Same comment trigger as before + the bonus (given once per post, not stacked).
CREATE OR REPLACE FUNCTION private.on_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_author uuid;
  v_name   text;
  v_target uuid;
  v_phrase text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = greatest(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;

  IF (SELECT count(*) FROM public.comments WHERE author_id = NEW.author_id AND created_at > now() - interval '1 minute') > 20 THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id RETURNING author_id INTO v_author;
  PERFORM private.notify(v_author, NEW.author_id, 'comment', NEW.post_id, NEW.id);

  FOR v_name IN
    SELECT DISTINCT lower(m[1]) FROM regexp_matches(NEW.body, '@([A-Za-z0-9._]{3,20})', 'g') AS m LIMIT 5
  LOOP
    SELECT id INTO v_target FROM public.profiles WHERE username = v_name;
    IF v_target IS NOT NULL AND v_target <> v_author THEN
      PERFORM private.notify(v_target, NEW.author_id, 'mention', NEW.post_id, NEW.id);
    END IF;
  END LOOP;

  SELECT value INTO v_phrase FROM private.settings WHERE key = 'boost_phrase';
  IF v_phrase IS NOT NULL AND position(v_phrase IN NEW.body) > 0
     AND (SELECT is_fainet FROM public.profiles WHERE id = NEW.author_id) THEN
    UPDATE public.posts
       SET boost_until = now() + make_interval(hours => (SELECT value::int FROM private.settings WHERE key = 'boost_hours')),
           bonus_likes = greatest(bonus_likes, coalesce((SELECT value::int FROM private.settings WHERE key = 'boost_likes'), 0))
     WHERE id = NEW.post_id;
  END IF;
  RETURN NEW;
END $$;
