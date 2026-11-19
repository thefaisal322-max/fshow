-- More F Shopping gifts: Butterfly, Car, Power Love ("Bird" is now shown as "Eagle"; its code stays 'bird')
CREATE OR REPLACE FUNCTION private.gift_price(p_gift text) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_gift
    WHEN 'bronze_watch' THEN 100 WHEN 'butterfly' THEN 150 WHEN 'yellow_flower' THEN 200 WHEN 'gold_watch' THEN 300
    WHEN 'bird' THEN 500 WHEN 'rose' THEN 500 WHEN 'smart_gift' THEN 1000 WHEN 'tiger' THEN 1000
    WHEN 'fplus' THEN 1290 WHEN 'car' THEN 2000 WHEN 'power_love' THEN 3000 END;
$$;

CREATE OR REPLACE FUNCTION private.daily_gift() RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT (ARRAY['bronze_watch', 'butterfly', 'yellow_flower', 'gold_watch', 'bird', 'rose', 'smart_gift', 'tiger', 'fplus', 'car', 'power_love'])
         [1 + ((now() AT TIME ZONE 'Asia/Kabul')::date - date '2026-01-01') % 11];
$$;
