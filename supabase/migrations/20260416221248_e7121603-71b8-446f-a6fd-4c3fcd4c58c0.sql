-- Voice ring (call invitation) table
CREATE TABLE public.voice_rings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.voice_channels(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '45 seconds'),
  responded_at timestamptz,
  CONSTRAINT no_self_ring CHECK (caller_id <> recipient_id)
);

CREATE INDEX idx_voice_rings_recipient_pending
  ON public.voice_rings (recipient_id, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX idx_voice_rings_caller
  ON public.voice_rings (caller_id, created_at DESC);

ALTER TABLE public.voice_rings ENABLE ROW LEVEL SECURITY;

-- SELECT: caller or recipient can see
CREATE POLICY "Caller or recipient can view rings"
  ON public.voice_rings FOR SELECT
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = recipient_id);

-- INSERT: caller must be a channel member AND recipient must be a channel member
CREATE POLICY "Channel members can ring other channel members"
  ON public.voice_rings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = caller_id
    AND public.is_channel_member(channel_id, caller_id)
    AND public.is_channel_member(channel_id, recipient_id)
  );

-- UPDATE: recipient can accept/decline; caller can cancel
CREATE POLICY "Recipient can respond to ring"
  ON public.voice_rings FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "Caller can cancel ring"
  ON public.voice_rings FOR UPDATE
  TO authenticated
  USING (auth.uid() = caller_id)
  WITH CHECK (auth.uid() = caller_id);

-- DELETE: only participants
CREATE POLICY "Caller or recipient can delete ring"
  ON public.voice_rings FOR DELETE
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = recipient_id);

-- Realtime so recipients get instant push
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_rings;
ALTER TABLE public.voice_rings REPLICA IDENTITY FULL;

-- Helper RPC: ring everyone in a channel (skips caller, skips users already with a pending ring)
CREATE OR REPLACE FUNCTION public.ring_channel(_channel_id uuid, _message text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_channel_member(_channel_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not a member of this channel';
  END IF;

  INSERT INTO public.voice_rings (caller_id, recipient_id, channel_id, message)
  SELECT auth.uid(), cm.user_id, _channel_id, _message
  FROM public.channel_members cm
  WHERE cm.channel_id = _channel_id
    AND cm.user_id <> auth.uid()
    -- Skip recipients who already have a fresh pending ring for this channel
    AND NOT EXISTS (
      SELECT 1 FROM public.voice_rings vr
      WHERE vr.channel_id = _channel_id
        AND vr.recipient_id = cm.user_id
        AND vr.status = 'pending'
        AND vr.expires_at > now()
    );

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;