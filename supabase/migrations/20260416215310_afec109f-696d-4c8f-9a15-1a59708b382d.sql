-- Public lookup: resolve a voice invite code to channel info without auth.
CREATE OR REPLACE FUNCTION public.get_voice_channel_by_invite(_invite_code text)
RETURNS TABLE(channel_id uuid, channel_name text, channel_type text, is_active boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, name, channel_type, is_active
  FROM public.voice_channels
  WHERE invite_code = _invite_code
  LIMIT 1;
$$;

-- Allow anonymous (logged-out) callers to invoke it.
GRANT EXECUTE ON FUNCTION public.get_voice_channel_by_invite(text) TO anon, authenticated;
