-- 1. Membership table
CREATE TABLE IF NOT EXISTS public.channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.voice_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

-- Members can see their own membership rows
CREATE POLICY "Users can view their own memberships"
ON public.channel_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Channel creators can see all members of their channels
CREATE POLICY "Creators can view their channel members"
ON public.channel_members
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.voice_channels vc
  WHERE vc.id = channel_members.channel_id AND vc.created_by = auth.uid()
));

-- A user can leave (delete their own membership)
CREATE POLICY "Users can leave channels"
ON public.channel_members
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Channel creators can remove members
CREATE POLICY "Creators can remove members"
ON public.channel_members
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.voice_channels vc
  WHERE vc.id = channel_members.channel_id AND vc.created_by = auth.uid()
));

-- 2. Security-definer helper: is the calling user a member of a channel?
CREATE OR REPLACE FUNCTION public.is_channel_member(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = _channel_id AND user_id = _user_id
  );
$$;

-- 3. Tighten voice_channels SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view channels" ON public.voice_channels;

CREATE POLICY "Users can view their own or joined channels"
ON public.voice_channels
FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by
  OR public.is_channel_member(id, auth.uid())
);

-- 4. Auto-add creator as a member when a channel is created
CREATE OR REPLACE FUNCTION public.add_creator_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.channel_members (channel_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_creator_as_member ON public.voice_channels;
CREATE TRIGGER trg_add_creator_as_member
AFTER INSERT ON public.voice_channels
FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_member();

-- 5. Backfill memberships for existing channels
INSERT INTO public.channel_members (channel_id, user_id)
SELECT id, created_by FROM public.voice_channels
ON CONFLICT DO NOTHING;

-- 6. Secure join-by-invite RPC (no other channel data is leaked)
CREATE OR REPLACE FUNCTION public.join_channel_by_invite(_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _channel_id uuid;
  _is_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, is_active INTO _channel_id, _is_active
  FROM public.voice_channels
  WHERE invite_code = _invite_code
  LIMIT 1;

  IF _channel_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;

  IF NOT _is_active THEN
    RAISE EXCEPTION 'Channel is not active';
  END IF;

  INSERT INTO public.channel_members (channel_id, user_id)
  VALUES (_channel_id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN _channel_id;
END;
$$;