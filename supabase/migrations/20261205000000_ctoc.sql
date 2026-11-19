-- CtoC (coins → cash): anyone can cash out the coins they EARNED (gifts, promotions, challenges, live taps);
-- they add their HesabPay number + pick an amount, and the admins get a notification right away.
-- Buying coins (receipt sent) also notifies the admins.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'follow', 'mention', 'friend_request', 'friend_accept',
                  'coins', 'coins_rejected', 'gift', 'payout', 'payout_rejected', 'promo', 'monetize', 'monetize_rejected',
                  'warning', 'notice', 'live', 'admin_coins'));

-- a notification to every admin
CREATE OR REPLACE FUNCTION private.notify_admins(p_actor uuid, p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT x.id FROM auth.users x JOIN public.profiles p ON p.id = x.id WHERE private.user_is_admin(x.id) LOOP
    INSERT INTO public.notifications (user_id, actor_id, type, data) VALUES (r.id, p_actor, 'admin_coins', p_data);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION private.notify_admins(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.on_fc_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'fc_payouts' THEN
    PERFORM private.notify_admins(NEW.user_id, jsonb_build_object('kind', 'payout', 'afs', NEW.afs, 'coins', NEW.coins, 'phone', NEW.phone));
  ELSE
    PERFORM private.notify_admins(NEW.user_id, jsonb_build_object('kind', 'buy', 'afs', NEW.afs, 'coins', NEW.coins));
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS fc_payouts_notify ON public.fc_payouts;
CREATE TRIGGER fc_payouts_notify AFTER INSERT ON public.fc_payouts FOR EACH ROW EXECUTE FUNCTION private.on_fc_request();
DROP TRIGGER IF EXISTS fc_purchases_notify ON public.fc_purchases;
CREATE TRIGGER fc_purchases_notify AFTER INSERT ON public.fc_purchases FOR EACH ROW EXECUTE FUNCTION private.on_fc_request();

ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS hesabpay_phone text CHECK (hesabpay_phone IS NULL OR hesabpay_phone ~ '^(\+93|0)7[0-9]{8}$');

-- cash out: no monetization needed any more; only earned coins; 25–10,000 AFS; one request at a time
CREATE OR REPLACE FUNCTION public.request_fc_payout(p_afs int, p_phone text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE me uuid := auth.uid(); v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'); v_coins int; w public.wallets; v_id uuid;
BEGIN
  IF me IS NULL OR NOT public.me_ready() THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_afs IS NULL OR p_afs < 25 OR p_afs > 10000 OR v_phone !~ '^(\+93|0)7[0-9]{8}$' THEN
    RAISE EXCEPTION 'invalid-input' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fc_payouts WHERE user_id = me AND status = 'pending') THEN
    RAISE EXCEPTION 'rate-limited' USING ERRCODE = '42501';
  END IF;
  v_coins := p_afs * 10;
  SELECT * INTO w FROM public.wallets WHERE user_id = me FOR UPDATE;
  IF w.user_id IS NULL OR v_coins > least(w.balance, w.earned - w.cashed) THEN
    RAISE EXCEPTION 'not-enough-coins' USING ERRCODE = '53400';
  END IF;
  INSERT INTO public.fc_payouts (user_id, afs, coins, phone) VALUES (me, p_afs, v_coins, v_phone) RETURNING id INTO v_id;
  PERFORM private.fc_add(me, -v_coins, 'payout', v_id::text);
  UPDATE public.wallets SET cashed = cashed + v_coins, spent = spent - v_coins WHERE user_id = me;
  -- remember the number for next time
  UPDATE public.wallets SET hesabpay_phone = v_phone WHERE user_id = me;
END $$;


-- the wallet also returns the saved HesabPay number
CREATE OR REPLACE FUNCTION public.my_hesabpay() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT hesabpay_phone FROM public.wallets WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.my_hesabpay() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_hesabpay() TO authenticated;
