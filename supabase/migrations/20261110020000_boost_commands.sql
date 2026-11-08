-- Secret boost commands written as a comment by a verified @fainet.org account.
-- The command is applied and the comment is NOT saved, so nobody else ever sees it.
--
-- From any other account these texts are just normal comments.

INSERT INTO private.settings (key, value) VALUES
  ('boost_likes_regex', 'x^'),
  ('reset_phrase', 'disabled:5f1c9e')
ON CONFLICT (key) DO NOTHING;

CREATE FUNCTION private.on_comment_command() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_phrase text;
  v_reset  text;
  v_regex  text;
  v_match  text[];
  v_hours  int;
  v_likes  int;
  v_views  int;
BEGIN
  IF NOT coalesce((SELECT is_fainet FROM public.profiles WHERE id = NEW.author_id), false) THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_phrase FROM private.settings WHERE key = 'boost_phrase';
  SELECT value INTO v_reset  FROM private.settings WHERE key = 'reset_phrase';
  SELECT value INTO v_regex  FROM private.settings WHERE key = 'boost_likes_regex';
  v_hours := coalesce((SELECT value::int FROM private.settings WHERE key = 'boost_hours'), 24);
  v_likes := coalesce((SELECT value::int FROM private.settings WHERE key = 'boost_likes'), 0);
  v_views := coalesce((SELECT value::int FROM private.settings WHERE key = 'boost_views'), 0);

  -- 1) reset to real numbers
  IF v_reset IS NOT NULL AND position(v_reset IN NEW.body) > 0 THEN
    UPDATE public.posts SET bonus_likes = 0, bonus_views = 0 WHERE id = NEW.post_id;
    RETURN NULL;  -- do not save the comment
  END IF;

  -- 2) custom number of likes
  IF v_regex IS NOT NULL THEN
    v_match := regexp_match(NEW.body, v_regex);
    IF v_match IS NOT NULL THEN
      UPDATE public.posts
         SET boost_until = now() + make_interval(hours => v_hours),
             bonus_likes = v_match[1]::int,
             bonus_views = greatest(bonus_views, v_views)
       WHERE id = NEW.post_id;
      RETURN NULL;
    END IF;
  END IF;

  -- 3) the classic phrase
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

CREATE TRIGGER comments_commands BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION private.on_comment_command();

-- The normal comment trigger no longer handles the boost (commands never get saved).
CREATE OR REPLACE FUNCTION private.on_comment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_author uuid;
  v_name   text;
  v_target uuid;
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
  RETURN NEW;
END $$;
