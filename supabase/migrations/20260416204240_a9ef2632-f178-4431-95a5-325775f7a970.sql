-- Helper: is the current user the owner of the folder? (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_folder_owner(_folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folders
    WHERE id = _folder_id AND owner_id = auth.uid()
  );
$$;

-- Helper: has the folder been shared with the current user? (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_folder_shared_with_me(_folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folder_shares
    WHERE folder_id = _folder_id AND shared_with_user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_folder_owner(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_folder_shared_with_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_folder_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_folder_shared_with_me(uuid) TO authenticated;

-- ============ folders policies ============
DROP POLICY IF EXISTS "Owners can manage their folders" ON public.folders;
DROP POLICY IF EXISTS "Shared users can view folders" ON public.folders;

CREATE POLICY "Owners can manage their folders"
ON public.folders
FOR ALL
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Shared users can view folders"
ON public.folders
FOR SELECT
TO authenticated
USING (public.is_folder_shared_with_me(id));

-- ============ folder_shares policies ============
DROP POLICY IF EXISTS "Folder owners can manage shares" ON public.folder_shares;
DROP POLICY IF EXISTS "Shared users can view their shares" ON public.folder_shares;

CREATE POLICY "Folder owners can manage shares"
ON public.folder_shares
FOR ALL
TO authenticated
USING (public.is_folder_owner(folder_id))
WITH CHECK (public.is_folder_owner(folder_id));

CREATE POLICY "Shared users can view their shares"
ON public.folder_shares
FOR SELECT
TO authenticated
USING (shared_with_user_id = auth.uid());