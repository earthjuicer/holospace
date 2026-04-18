-- Fix: The new Drive page uploads files to paths like {user_id}/{filename}
-- but the old storage policy only allowed paths under {folder_id}/{filename}.
-- We add policies that let authenticated users upload/read/delete under their own user_id prefix.

-- Allow authenticated users to INSERT objects under their own user_id prefix
DROP POLICY IF EXISTS "Users can upload to own prefix" ON storage.objects;
CREATE POLICY "Users can upload to own prefix"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'folder-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to SELECT their own objects
DROP POLICY IF EXISTS "Users can read own files" ON storage.objects;
CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'folder-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to DELETE their own objects
DROP POLICY IF EXISTS "Users can delete own files" ON storage.objects;
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'folder-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to UPDATE their own objects
DROP POLICY IF EXISTS "Users can update own files" ON storage.objects;
CREATE POLICY "Users can update own files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'folder-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Fix folder_files table: the old policy required a valid folder_id (NOT NULL FK).
-- The new Drive allows files without a folder (root level), so folder_id can be null.
-- Allow any authenticated user to insert their own files.
DROP POLICY IF EXISTS "Users can insert own files" ON public.folder_files;
CREATE POLICY "Users can insert own files"
  ON public.folder_files FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow users to select files they uploaded (via storage_path prefix check)
DROP POLICY IF EXISTS "Users can select own files" ON public.folder_files;
CREATE POLICY "Users can select own files"
  ON public.folder_files FOR SELECT TO authenticated
  USING (
    -- Their own files (path starts with their user_id)
    split_part(storage_path, '/', 1) = auth.uid()::text
    -- OR they own the folder
    OR (folder_id IS NOT NULL AND public.is_folder_owner(folder_id))
    -- OR shared with them
    OR (folder_id IS NOT NULL AND public.is_folder_shared_with_me(folder_id))
  );

-- Allow users to delete their own files
DROP POLICY IF EXISTS "Users can delete own files metadata" ON public.folder_files;
CREATE POLICY "Users can delete own files metadata"
  ON public.folder_files FOR DELETE TO authenticated
  USING (
    split_part(storage_path, '/', 1) = auth.uid()::text
    OR (folder_id IS NOT NULL AND public.is_folder_owner(folder_id))
  );


-- Make folder_id nullable so files can exist at the root level (no folder)
ALTER TABLE public.folder_files
  ALTER COLUMN folder_id DROP NOT NULL;

-- Drop the old FK constraint and re-add as nullable
ALTER TABLE public.folder_files
  DROP CONSTRAINT IF EXISTS folder_files_folder_id_fkey;

ALTER TABLE public.folder_files
  ADD CONSTRAINT folder_files_folder_id_fkey
  FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;
