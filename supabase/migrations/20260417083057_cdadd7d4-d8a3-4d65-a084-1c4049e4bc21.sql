-- Add a `cover` JSONB column to folders so users can customize each card's
-- background. Shape: { "type": "color"|"image", "value": "#hex|url|gradient" }.
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS cover jsonb;

-- Allow folder owners AND users that the folder is shared with (any role,
-- per the existing folder_shares table) to update folder rows. This lets
-- editors change the cover. Owners already have ALL via the existing policy.
DROP POLICY IF EXISTS "Shared users can update folder cover" ON public.folders;
CREATE POLICY "Shared users can update folder cover"
ON public.folders
FOR UPDATE
TO authenticated
USING (public.is_folder_shared_with_me(id))
WITH CHECK (public.is_folder_shared_with_me(id));

-- Storage policies: allow authenticated users to upload cover images into
-- the existing `folder-files` bucket under a `covers/<folder_id>/...` path,
-- gated on owner-or-shared access. SELECT is broad (anyone with folder
-- access) so the signed-URL workflow stays simple.
DROP POLICY IF EXISTS "Folder members can upload covers" ON storage.objects;
CREATE POLICY "Folder members can upload covers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'folder-files'
  AND (storage.foldername(name))[1] = 'covers'
  AND (
    public.is_folder_owner(((storage.foldername(name))[2])::uuid)
    OR public.is_folder_shared_with_me(((storage.foldername(name))[2])::uuid)
  )
);

DROP POLICY IF EXISTS "Folder members can read covers" ON storage.objects;
CREATE POLICY "Folder members can read covers"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'folder-files'
  AND (storage.foldername(name))[1] = 'covers'
  AND (
    public.is_folder_owner(((storage.foldername(name))[2])::uuid)
    OR public.is_folder_shared_with_me(((storage.foldername(name))[2])::uuid)
  )
);

DROP POLICY IF EXISTS "Folder owners can delete covers" ON storage.objects;
CREATE POLICY "Folder owners can delete covers"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'folder-files'
  AND (storage.foldername(name))[1] = 'covers'
  AND public.is_folder_owner(((storage.foldername(name))[2])::uuid)
);