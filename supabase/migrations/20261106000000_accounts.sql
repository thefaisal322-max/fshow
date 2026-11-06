-- Faisal Show — phase 1: accounts
--
-- Security model
--   * Row Level Security (RLS) on every table the app can reach.
--   * The app (role "authenticated") may only change bio + photo_path of its own profile.
--   * Accounts are created only by the `signup` Edge Function after the 5-digit email code
--     is verified. Counters (likes, views, followers) and is_fainet are server-only.
--   * Codes and rate limits live in schema "private", which the API does not expose.

-- ───────────────────────── profiles (public) ─────────────────────────
CREATE TABLE public.profiles (
  id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name       text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 40),
  last_name        text NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 40),
  gender           text NOT NULL CHECK (gender IN ('male', 'female')),
  username         text UNIQUE CHECK (username ~ '^[a-z0-9._]{3,20}$'),
  bio              text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 150),
  -- path inside the "avatars" bucket; must be in the owner's own folder
  photo_path       text CHECK (photo_path IS NULL OR (photo_path LIKE id::text || '/%' AND char_length(photo_path) < 200)),
  is_fainet        boolean NOT NULL DEFAULT false,
  profile_complete boolean NOT NULL DEFAULT false,
  followers_count  integer NOT NULL DEFAULT 0,
  following_count  integer NOT NULL DEFAULT 0,
  likes_count      bigint  NOT NULL DEFAULT 0,
  posts_count      integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signed-in users can read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "owner can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Column-level privileges: even on their own row, users can only touch these two columns.
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (bio, photo_path) ON public.profiles TO authenticated;

-- ───────────────────────── profiles_private ─────────────────────────
CREATE TABLE public.profiles_private (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  birthday   date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can read own private data"
  ON public.profiles_private FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

REVOKE ALL ON public.profiles_private FROM anon, authenticated;
GRANT SELECT ON public.profiles_private TO authenticated;

-- ───────────────────────── private schema (server only) ─────────────────────────
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- 5-digit email codes (HMAC-hashed). Times are epoch milliseconds.
CREATE TABLE private.email_codes (
  id           text PRIMARY KEY,          -- sha256(purpose:email)
  hash         text NOT NULL,
  salt         text NOT NULL,
  expires_at   bigint NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  last_sent_at bigint NOT NULL,
  send_count   integer NOT NULL,
  window_start bigint NOT NULL
);

CREATE TABLE private.rate_limits (
  key          text PRIMARY KEY,          -- sha256(kind:ip or kind:email)
  count        integer NOT NULL,
  window_start bigint NOT NULL
);

-- Only used when EMAIL_TRANSPORT=outbox (automated tests). Never in production.
CREATE TABLE private.test_outbox (
  to_email   text NOT NULL,
  code       text NOT NULL,
  purpose    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── claim_username() ─────────────────────────
-- Picks a unique ID Name and marks the profile complete. Called by the app via rpc().
CREATE FUNCTION public.claim_username(p_username text, p_bio text DEFAULT '')
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text := regexp_replace(lower(trim(coalesce(p_username, ''))), '^@', '');
  v_bio  text := trim(coalesce(p_bio, ''));
  v_row  public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF v_name !~ '^[a-z0-9._]{3,20}$'
     OR v_name LIKE '.%' OR v_name LIKE '%.' OR position('..' IN v_name) > 0
     OR v_name = ANY (ARRAY['admin','fshow','faisalshow','faisal_show','fainet','support','help',
                            'official','root','system','null','undefined','moderator','security']) THEN
    RAISE EXCEPTION 'username-invalid' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_bio) > 150 THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;

  BEGIN
    UPDATE public.profiles
       SET username = v_name, bio = v_bio, profile_complete = true
     WHERE id = v_uid
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'username-taken' USING ERRCODE = '23505';
  END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no-profile' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_username(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_username(text, text) TO authenticated;

-- ───────────────────────── avatars bucket ─────────────────────────
-- Public read (profile pictures), 5 MB max, images only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Users may only write inside their own folder: avatars/<their uid>/...
CREATE POLICY "avatars: owner can read own folder"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "avatars: owner can upload to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "avatars: owner can replace own files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "avatars: owner can delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
