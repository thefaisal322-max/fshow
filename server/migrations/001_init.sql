-- Faisal Show — phase 1: accounts

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash    text NOT NULL,
  first_name       text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 40),
  last_name        text NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 40),
  gender           text NOT NULL CHECK (gender IN ('male', 'female')),
  birthday         date NOT NULL,
  username         text UNIQUE CHECK (username ~ '^[a-z0-9._]{3,20}$'),
  bio              text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 150),
  photo_path       text,
  is_fainet        boolean NOT NULL DEFAULT false,
  profile_complete boolean NOT NULL DEFAULT false,
  followers_count  integer NOT NULL DEFAULT 0,
  following_count  integer NOT NULL DEFAULT 0,
  likes_count      bigint  NOT NULL DEFAULT 0,
  posts_count      integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Login sessions. Only the SHA-256 of the token is stored, so a database leak
-- does not leak usable tokens.
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  user_agent   text,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- 5-digit email codes (hashed). Times are epoch milliseconds.
CREATE TABLE email_codes (
  id           text PRIMARY KEY,          -- sha256(purpose:email)
  hash         text NOT NULL,
  salt         text NOT NULL,
  expires_at   bigint NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  last_sent_at bigint NOT NULL,
  send_count   integer NOT NULL,
  window_start bigint NOT NULL
);

CREATE TABLE rate_limits (
  key          text PRIMARY KEY,          -- sha256(kind:ip or kind:email)
  count        integer NOT NULL,
  window_start bigint NOT NULL
);
