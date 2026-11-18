-- 1. Notification settings: which pushes I do NOT want (the in-app list still shows everything).
-- 2. Story highlights: keep stories on the profile after their 24 hours, in named circles.

-- 1 ─────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notif_off text[] NOT NULL DEFAULT '{}'
  CHECK (notif_off <@ ARRAY['like', 'comment', 'follow', 'mention', 'friends', 'message', 'call']::text[]);
GRANT UPDATE (notif_off) ON public.profiles TO authenticated;

-- 2 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.story_highlights (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title      text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 24),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS story_highlights_user_idx ON public.story_highlights (user_id, created_at);
CREATE TABLE IF NOT EXISTS public.story_highlight_items (
  highlight_id uuid NOT NULL REFERENCES public.story_highlights(id) ON DELETE CASCADE,
  story_id     uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  added_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (highlight_id, story_id)
);
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_highlight_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.story_highlights, public.story_highlight_items FROM anon, authenticated;

-- A person's highlights (with their stories), newest first. Hidden when one blocked the other.
CREATE OR REPLACE FUNCTION public.get_highlights(p_user uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(h ORDER BY h->>'created_at' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', hl.id, 'title', hl.title, 'created_at', hl.created_at,
      'stories', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'id', s.id, 'media_path', s.media_path, 'media_type', s.media_type, 'caption', s.caption,
                    'created_at', s.created_at, 'seen', true, 'views_count', NULL) ORDER BY i.added_at), '[]'::jsonb)
                  FROM public.story_highlight_items i JOIN public.stories s ON s.id = i.story_id
                  WHERE i.highlight_id = hl.id)) AS h
    FROM public.story_highlights hl
    WHERE hl.user_id = p_user
      AND auth.uid() IS NOT NULL
      AND NOT private.blocked_between(auth.uid(), p_user)
      AND EXISTS (SELECT 1 FROM public.story_highlight_items i WHERE i.highlight_id = hl.id)
  ) x;
$$;

-- Add my story to a highlight (an existing one, or a new one with p_title). Returns the highlight id.
CREATE OR REPLACE FUNCTION public.add_to_highlight(p_story uuid, p_highlight uuid DEFAULT NULL, p_title text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_id uuid;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_story AND author_id = me) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_highlight IS NULL THEN
    IF (SELECT count(*) FROM public.story_highlights WHERE user_id = me) >= 50 THEN
      RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.story_highlights (user_id, title) VALUES (me, left(trim(coalesce(p_title, '')), 24)) RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id FROM public.story_highlights WHERE id = p_highlight AND user_id = me;
    IF v_id IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    IF (SELECT count(*) FROM public.story_highlight_items WHERE highlight_id = v_id) >= 100 THEN
      RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO public.story_highlight_items (highlight_id, story_id) VALUES (v_id, p_story) ON CONFLICT DO NOTHING;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.remove_from_highlight(p_highlight uuid, p_story uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.story_highlight_items i
   USING public.story_highlights h
   WHERE i.highlight_id = h.id AND h.id = p_highlight AND h.user_id = auth.uid() AND i.story_id = p_story;
  -- an empty highlight disappears
  DELETE FROM public.story_highlights h
   WHERE h.id = p_highlight AND h.user_id = auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.story_highlight_items i WHERE i.highlight_id = h.id);
END $$;

CREATE OR REPLACE FUNCTION public.rename_highlight(p_highlight uuid, p_title text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.story_highlights SET title = left(trim(p_title), 24) WHERE id = p_highlight AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.delete_highlight(p_highlight uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.story_highlights WHERE id = p_highlight AND user_id = auth.uid();
$$;

-- My highlights (for "Add to highlight" — names only)
CREATE OR REPLACE FUNCTION public.my_highlights() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title) ORDER BY created_at DESC), '[]'::jsonb)
  FROM public.story_highlights WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_highlights(uuid), public.add_to_highlight(uuid, uuid, text), public.remove_from_highlight(uuid, uuid),
                       public.rename_highlight(uuid, text), public.delete_highlight(uuid), public.my_highlights() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_highlights(uuid), public.add_to_highlight(uuid, uuid, text), public.remove_from_highlight(uuid, uuid),
                          public.rename_highlight(uuid, text), public.delete_highlight(uuid), public.my_highlights() TO authenticated;
