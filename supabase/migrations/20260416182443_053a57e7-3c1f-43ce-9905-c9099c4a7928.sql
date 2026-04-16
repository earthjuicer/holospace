-- =========================================================
-- 1. Hide voice channel invite codes from non-creators
-- =========================================================

-- Helper: returns invite_code only if caller is the creator
CREATE OR REPLACE FUNCTION public.get_channel_invite_code(_channel_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT invite_code
  FROM public.voice_channels
  WHERE id = _channel_id AND created_by = auth.uid();
$$;

-- =========================================================
-- 2. Restrict profile visibility
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can view profiles" ON public.profiles;

-- Users can always view their own profile
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can view profiles of people they share a folder with (either direction)
CREATE POLICY "Users can view collaborators' profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.folders f
    JOIN public.folder_shares fs ON fs.folder_id = f.id
    WHERE
      -- caller owns folder, profile belongs to a shared user
      (f.owner_id = auth.uid() AND fs.shared_with_user_id = profiles.user_id)
      OR
      -- caller is a shared user, profile belongs to the folder owner
      (fs.shared_with_user_id = auth.uid() AND f.owner_id = profiles.user_id)
      OR
      -- caller and profile owner share a folder (both as collaborators)
      (fs.shared_with_user_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.folder_shares fs2
        WHERE fs2.folder_id = f.id AND fs2.shared_with_user_id = profiles.user_id
      ))
  )
);

-- Voice channel members can see each other's profiles
CREATE POLICY "Channel members can view each other's profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.channel_members cm1
    JOIN public.channel_members cm2 ON cm1.channel_id = cm2.channel_id
    WHERE cm1.user_id = auth.uid() AND cm2.user_id = profiles.user_id
  )
);

-- =========================================================
-- 3. Remove the misleading is_private column from prompts and folders
-- =========================================================
ALTER TABLE public.prompts DROP COLUMN IF EXISTS is_private;
ALTER TABLE public.folders DROP COLUMN IF EXISTS is_private;