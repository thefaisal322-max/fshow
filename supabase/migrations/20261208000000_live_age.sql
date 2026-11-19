-- "Download FC & Live": the app asks whether live may be unlocked for this person (15+)
CREATE OR REPLACE FUNCTION public.live_age_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(private.age_years(auth.uid()) >= 15, false);
$$;
REVOKE EXECUTE ON FUNCTION public.live_age_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_age_ok() TO authenticated;
