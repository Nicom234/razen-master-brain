-- Credits system
CREATE TABLE public.credits (
  user_id uuid PRIMARY KEY,
  balance integer NOT NULL DEFAULT 25,
  monthly_grant integer NOT NULL DEFAULT 25,
  last_daily_grant date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credits_select_own" ON public.credits FOR SELECT USING (auth.uid() = user_id);

-- Allow subscriptions inserts/updates from authed users only for their own row (webhook uses service role)
CREATE POLICY "subs_insert_self" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subs_update_self" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create credits row + daily refill function
CREATE OR REPLACE FUNCTION public.ensure_credits(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bal integer;
  _last date;
  _grant integer;
  _tier subscription_tier;
BEGIN
  SELECT tier INTO _tier FROM public.subscriptions WHERE user_id = _user_id;
  IF _tier IS NULL THEN _tier := 'free'; END IF;

  INSERT INTO public.credits (user_id, balance, monthly_grant, last_daily_grant)
  VALUES (_user_id, 25, 25, CURRENT_DATE)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, last_daily_grant INTO _bal, _last FROM public.credits WHERE user_id = _user_id;

  -- Free tier: refill 25/day
  IF _tier = 'free' AND _last < CURRENT_DATE THEN
    UPDATE public.credits SET balance = 25, last_daily_grant = CURRENT_DATE, updated_at = now()
      WHERE user_id = _user_id RETURNING balance INTO _bal;
  END IF;

  RETURN _bal;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credit(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _new integer;
BEGIN
  PERFORM public.ensure_credits(_user_id);
  UPDATE public.credits SET balance = balance - 1, updated_at = now()
    WHERE user_id = _user_id AND balance > 0
    RETURNING balance INTO _new;
  RETURN COALESCE(_new, -1);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_subscription_credits(_user_id uuid, _tier subscription_tier)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _amt integer;
BEGIN
  _amt := CASE _tier WHEN 'pro' THEN 2500 WHEN 'elite' THEN 8500 ELSE 25 END;
  INSERT INTO public.credits (user_id, balance, monthly_grant, last_daily_grant)
    VALUES (_user_id, _amt, _amt, CURRENT_DATE)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = _amt, monthly_grant = _amt, last_daily_grant = CURRENT_DATE, updated_at = now();
END;
$$;