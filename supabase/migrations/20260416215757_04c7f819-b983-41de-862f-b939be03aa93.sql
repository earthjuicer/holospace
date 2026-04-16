-- Add expiry to voice channel invites
ALTER TABLE public.voice_channels
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');

UPDATE public.voice_channels
SET invite_expires_at = now() + interval '24 hours'
WHERE invite_expires_at < now() + interval '1 hour';

-- Bans table
CREATE TABLE IF NOT EXISTS public.voice_channel_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.voice_channels(id) ON DELETE CASCADE,
  banned_identity text NOT NULL,
  banned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, banned_identity)
);

ALTER TABLE public.voice_channel_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Channel creator can view bans" ON public.voice_channel_bans;
DROP POLICY IF EXISTS "Channel creator can insert bans" ON public.voice_channel_bans;
DROP POLICY IF EXISTS "Channel creator can delete bans" ON public.voice_channel_bans;

CREATE POLICY "Channel creator can view bans"
  ON public.voice_channel_bans FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.voice_channels vc
    WHERE vc.id = voice_channel_bans.channel_id AND vc.created_by = auth.uid()));

CREATE POLICY "Channel creator can insert bans"
  ON public.voice_channel_bans FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.voice_channels vc
    WHERE vc.id = voice_channel_bans.channel_id AND vc.created_by = auth.uid())
    AND banned_by = auth.uid());

CREATE POLICY "Channel creator can delete bans"
  ON public.voice_channel_bans FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.voice_channels vc
    WHERE vc.id = voice_channel_bans.channel_id AND vc.created_by = auth.uid()));

-- Replace get_voice_channel_by_invite
DROP FUNCTION IF EXISTS public.get_voice_channel_by_invite(text);

CREATE FUNCTION public.get_voice_channel_by_invite(_invite_code text)
RETURNS TABLE(channel_id uuid, channel_name text, channel_type text, is_active boolean, invite_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id, name, channel_type, is_active, invite_expires_at
  FROM public.voice_channels
  WHERE invite_code = _invite_code AND invite_expires_at > now()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_voice_channel_by_invite(text) TO anon, authenticated;

-- Ban check (anon-callable so guest token issuance can verify)
CREATE OR REPLACE FUNCTION public.is_voice_identity_banned(_channel_id uuid, _identity text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.voice_channel_bans
    WHERE channel_id = _channel_id AND banned_identity = _identity
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_voice_identity_banned(uuid, text) TO anon, authenticated;

-- Regenerate invite code + 24h expiry (creator only)
CREATE OR REPLACE FUNCTION public.regen_voice_invite(_channel_id uuid)
RETURNS TABLE(invite_code text, invite_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _new_code text; _new_expiry timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.voice_channels WHERE id = _channel_id AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  _new_code := encode(extensions.gen_random_bytes(6), 'hex');
  _new_expiry := now() + interval '24 hours';
  UPDATE public.voice_channels SET invite_code = _new_code, invite_expires_at = _new_expiry
  WHERE id = _channel_id;
  RETURN QUERY SELECT _new_code, _new_expiry;
END;
$$;

-- Get invite info (creator only) — replaces get_channel_invite_code with expiry data
CREATE OR REPLACE FUNCTION public.get_voice_invite_info(_channel_id uuid)
RETURNS TABLE(invite_code text, invite_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT invite_code, invite_expires_at
  FROM public.voice_channels
  WHERE id = _channel_id AND created_by = auth.uid();
$$;