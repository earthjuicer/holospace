CREATE OR REPLACE FUNCTION public.regen_share_token(_folder_id uuid, _expires_in interval DEFAULT interval '24 hours')
RETURNS TABLE(token text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _new_token text;
  _new_expiry timestamptz;
BEGIN
  IF NOT public.is_folder_owner(_folder_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Cap minimum expiry at 5 minutes; "never" callers can pass a very large
  -- interval (e.g. 100 years) which we accept as-is.
  IF _expires_in < interval '5 minutes' THEN
    _expires_in := interval '5 minutes';
  END IF;

  _new_token := encode(extensions.gen_random_bytes(24), 'hex');
  _new_expiry := now() + _expires_in;

  INSERT INTO public.folder_public_shares (folder_id, token, expires_at)
  VALUES (_folder_id, _new_token, _new_expiry)
  ON CONFLICT (folder_id) DO UPDATE
    SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;

  RETURN QUERY SELECT _new_token, _new_expiry;
END;
$function$;