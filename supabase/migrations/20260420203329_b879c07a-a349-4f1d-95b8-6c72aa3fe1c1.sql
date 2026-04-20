CREATE OR REPLACE FUNCTION public.deduct_credit(_user_id uuid, _cost integer DEFAULT 1)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _new integer; _c integer;
BEGIN
  _c := GREATEST(COALESCE(_cost, 1), 1);
  PERFORM public.ensure_credits(_user_id);
  UPDATE public.credits SET balance = balance - _c, updated_at = now()
    WHERE user_id = _user_id AND balance >= _c
    RETURNING balance INTO _new;
  RETURN COALESCE(_new, -1);
END;
$function$;