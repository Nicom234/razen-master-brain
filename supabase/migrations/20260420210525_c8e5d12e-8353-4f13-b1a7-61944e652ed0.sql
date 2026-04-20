-- Rebalance credits: tighter caps for higher margin
CREATE OR REPLACE FUNCTION public.grant_subscription_credits(_user_id uuid, _tier subscription_tier)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _amt integer;
BEGIN
  _amt := CASE _tier WHEN 'pro' THEN 400 WHEN 'elite' THEN 1500 ELSE 25 END;
  INSERT INTO public.credits (user_id, balance, monthly_grant, last_daily_grant)
    VALUES (_user_id, _amt, _amt, CURRENT_DATE)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = _amt, monthly_grant = _amt, last_daily_grant = CURRENT_DATE, updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_credits(_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bal integer;
  _last date;
  _tier subscription_tier;
  _grant integer;
BEGIN
  SELECT tier INTO _tier FROM public.subscriptions WHERE user_id = _user_id;
  IF _tier IS NULL THEN _tier := 'free'; END IF;

  _grant := CASE _tier WHEN 'pro' THEN 400 WHEN 'elite' THEN 1500 ELSE 25 END;

  INSERT INTO public.credits (user_id, balance, monthly_grant, last_daily_grant)
  VALUES (_user_id, _grant, _grant, CURRENT_DATE)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, last_daily_grant INTO _bal, _last FROM public.credits WHERE user_id = _user_id;

  -- Free: hard daily reset to 25
  IF _tier = 'free' AND _last < CURRENT_DATE THEN
    UPDATE public.credits SET balance = 25, monthly_grant = 25, last_daily_grant = CURRENT_DATE, updated_at = now()
      WHERE user_id = _user_id RETURNING balance INTO _bal;
  END IF;

  -- Paid: keep monthly_grant in sync
  IF _tier <> 'free' THEN
    UPDATE public.credits SET monthly_grant = _grant, last_daily_grant = CURRENT_DATE, updated_at = now()
      WHERE user_id = _user_id AND (monthly_grant <> _grant OR last_daily_grant < CURRENT_DATE)
      RETURNING balance INTO _bal;
    IF _bal IS NULL THEN
      SELECT balance INTO _bal FROM public.credits WHERE user_id = _user_id;
    END IF;
  END IF;

  RETURN _bal;
END;
$function$;