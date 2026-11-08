-- Hidden codes: only one-way fingerprints (sha256) are stored, never the codes themselves.
-- The old codes are removed.
DELETE FROM private.settings
 WHERE key IN ('boost_phrase', 'reset_phrase', 'boost_likes_regex', 'boost_likes', 'boost_views', 'boost_hours',
               'code_followers', 'code_likes', 'code_views', 'code_remove', 'code_verify');

-- value = comma-separated fingerprints of the accepted spellings (number written as N, lower case, no spaces, no dots at the end)
INSERT INTO private.settings (key, value) VALUES
  ('code_followers', '00e10d85818f27c96de833512e6dae83a8ea70604f31187d9dc4dc323380a9b0,1eb017679321a60d0c9f18994530f9b96f9ec52407257df33f22fc1f5a10f63b'),
  ('code_likes', '61af11bf43652ab342b68b32a66763b93c29ecb96a0e94d32b65407331d46a45,64d86f82d9044ac965f1984ac0f4a187594c85837cbfbd249d9e9cf5a22f6fdf'),
  ('code_views', '3f13a59dedb5f3a62dda0a78f51294ebb777f612c65afb5813773e143472cf7f,8ff38a713e256a5831b5a821692bc902b8fd66dc3a0ff3bf3ac3b52fc4b19584'),
  ('code_remove', '1dcd66a811e83aa801de71555529b063c00cadf60ba4d10fdbd8af9b78e0ca10'),
  ('code_verify', 'dc5b3bb4cf8a1d8475ebbc1c2b67553104229f9c6c22584e0e158dffd9872568')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION private.code_is(p_key text, p_hash text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM private.settings s WHERE s.key = p_key AND p_hash = ANY (string_to_array(s.value, ',')));
$$;

CREATE OR REPLACE FUNCTION private.on_comment_command() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_text   text := rtrim(regexp_replace(lower(NEW.body), '\s+', '', 'g'), '.');
  v_num    text;
  v_hash   text;
  v_author uuid;
  v_max    bigint := coalesce((SELECT value::bigint FROM private.settings WHERE key = 'code_max'), 100000000);
  v_n      bigint;
BEGIN
  IF char_length(v_text) < 20 OR char_length(v_text) > 120 THEN RETURN NEW; END IF;
  v_num := (regexp_match(v_text, '[0-9]{1,9}'))[1];
  v_hash := encode(sha256(convert_to('fshow-code:' || regexp_replace(v_text, '[0-9]+', 'N'), 'UTF8')), 'hex');
  SELECT author_id INTO v_author FROM public.posts WHERE id = NEW.post_id;
  v_n := least(coalesce(v_num, '0')::bigint, v_max);

  IF v_num IS NOT NULL AND private.code_is('code_followers', v_hash) THEN
    UPDATE public.profiles SET bonus_followers = least(bonus_followers::bigint + v_n, 2000000000)::int WHERE id = v_author;
    RETURN NULL;
  ELSIF v_num IS NOT NULL AND private.code_is('code_likes', v_hash) THEN
    UPDATE public.posts SET bonus_likes = least(bonus_likes::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    RETURN NULL;
  ELSIF v_num IS NOT NULL AND private.code_is('code_views', v_hash) THEN
    UPDATE public.posts SET bonus_views = least(bonus_views::bigint + v_n, 2000000000)::int WHERE id = NEW.post_id;
    RETURN NULL;
  ELSIF private.code_is('code_remove', v_hash) THEN
    UPDATE public.profiles SET bonus_followers = 0 WHERE id = v_author;
    UPDATE public.posts SET bonus_likes = 0, bonus_views = 0, boost_until = NULL WHERE author_id = v_author;
    RETURN NULL;
  ELSIF private.code_is('code_verify', v_hash) THEN
    UPDATE public.profiles SET verified = true WHERE id = v_author;
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
