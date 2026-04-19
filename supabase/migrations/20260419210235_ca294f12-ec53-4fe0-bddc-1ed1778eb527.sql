-- Memory table for Elite long-term memory
CREATE TABLE public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'manual', -- 'manual' | 'auto'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memories_user ON public.memories(user_id, created_at DESC);

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mem_all_own" ON public.memories
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER memories_updated_at BEFORE UPDATE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Fix: ensure_credits should refill on a daily basis for ALL tiers up to their monthly_grant
-- (acts as monthly cap with daily smoothing). For paid users we top up to monthly_grant once a day.
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

  _grant := CASE _tier WHEN 'pro' THEN 2500 WHEN 'elite' THEN 8500 ELSE 25 END;

  INSERT INTO public.credits (user_id, balance, monthly_grant, last_daily_grant)
  VALUES (_user_id, _grant, _grant, CURRENT_DATE)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, last_daily_grant INTO _bal, _last FROM public.credits WHERE user_id = _user_id;

  -- Free: hard daily reset to 25
  IF _tier = 'free' AND _last < CURRENT_DATE THEN
    UPDATE public.credits SET balance = 25, monthly_grant = 25, last_daily_grant = CURRENT_DATE, updated_at = now()
      WHERE user_id = _user_id RETURNING balance INTO _bal;
  END IF;

  -- Paid: ensure monthly_grant matches tier and last_daily_grant rolls forward (no balance change unless first time)
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