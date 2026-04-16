-- 1. Storage bucket (private, 5GB file cap)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('folder-files', 'folder-files', false, 5368709120)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 5368709120, public = false;

-- 2. folder_files metadata table
CREATE TABLE public.folder_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  mime_type text,
  uploaded_by uuid,
  uploaded_via_share boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.folder_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Folder owner can manage files"
  ON public.folder_files FOR ALL TO authenticated
  USING (public.is_folder_owner(folder_id))
  WITH CHECK (public.is_folder_owner(folder_id));

CREATE POLICY "Shared users can view files"
  ON public.folder_files FOR SELECT TO authenticated
  USING (public.is_folder_shared_with_me(folder_id));

CREATE INDEX idx_folder_files_folder ON public.folder_files(folder_id, created_at DESC);

-- 3. Public share tokens
CREATE TABLE public.folder_public_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL UNIQUE REFERENCES public.folders(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.folder_public_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages share token"
  ON public.folder_public_shares FOR ALL TO authenticated
  USING (public.is_folder_owner(folder_id))
  WITH CHECK (public.is_folder_owner(folder_id));

-- 4. Storage policies for the bucket
CREATE POLICY "Folder owner reads files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'folder-files'
    AND public.is_folder_owner(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Folder owner inserts files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'folder-files'
    AND public.is_folder_owner(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Folder owner deletes files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'folder-files'
    AND public.is_folder_owner(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Shared users read files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'folder-files'
    AND public.is_folder_shared_with_me(((storage.foldername(name))[1])::uuid)
  );

-- 5. Public RPCs (security definer) for share-link visitors
CREATE OR REPLACE FUNCTION public.get_share_folder(_token text)
RETURNS TABLE (folder_id uuid, folder_name text, folder_icon text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.name, f.icon, s.expires_at
  FROM public.folder_public_shares s
  JOIN public.folders f ON f.id = s.folder_id
  WHERE s.token = _token AND s.expires_at > now();
$$;

CREATE OR REPLACE FUNCTION public.list_share_files(_token text)
RETURNS TABLE (
  id uuid, file_name text, size_bytes bigint, mime_type text,
  storage_path text, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ff.id, ff.file_name, ff.size_bytes, ff.mime_type, ff.storage_path, ff.created_at
  FROM public.folder_files ff
  JOIN public.folder_public_shares s ON s.folder_id = ff.folder_id
  WHERE s.token = _token AND s.expires_at > now()
  ORDER BY ff.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.add_share_file(
  _token text, _storage_path text, _file_name text,
  _size_bytes bigint, _mime_type text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _folder_id uuid;
  _new_id uuid;
BEGIN
  SELECT folder_id INTO _folder_id
  FROM public.folder_public_shares
  WHERE token = _token AND expires_at > now();

  IF _folder_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired share link';
  END IF;

  -- Validate storage_path lives under this folder
  IF split_part(_storage_path, '/', 1) <> _folder_id::text THEN
    RAISE EXCEPTION 'Path does not belong to this folder';
  END IF;

  INSERT INTO public.folder_files (folder_id, storage_path, file_name, size_bytes, mime_type, uploaded_via_share)
  VALUES (_folder_id, _storage_path, _file_name, _size_bytes, _mime_type, true)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.regen_share_token(_folder_id uuid)
RETURNS TABLE (token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _new_token text;
  _new_expiry timestamptz;
BEGIN
  IF NOT public.is_folder_owner(_folder_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  _new_token := encode(extensions.gen_random_bytes(24), 'hex');
  _new_expiry := now() + interval '24 hours';

  INSERT INTO public.folder_public_shares (folder_id, token, expires_at)
  VALUES (_folder_id, _new_token, _new_expiry)
  ON CONFLICT (folder_id) DO UPDATE
    SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;

  RETURN QUERY SELECT _new_token, _new_expiry;
END;
$$;

-- Public RPCs callable by anon
GRANT EXECUTE ON FUNCTION public.get_share_folder(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_share_files(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_share_file(text, text, text, bigint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regen_share_token(uuid) TO authenticated;

-- Storage policies for anon visitors via share token are not feasible directly
-- (storage.objects RLS can't read our token from JS easily). Instead we use a
-- public-style approach: allow anon read/insert when bucket_id matches AND
-- the first folder segment has an active share token.
CREATE OR REPLACE FUNCTION public.folder_has_active_share(_folder_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folder_public_shares
    WHERE folder_id = _folder_id AND expires_at > now()
  );
$$;

CREATE POLICY "Anon read via active share"
  ON storage.objects FOR SELECT TO anon
  USING (
    bucket_id = 'folder-files'
    AND public.folder_has_active_share(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Anon insert via active share"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'folder-files'
    AND public.folder_has_active_share(((storage.foldername(name))[1])::uuid)
  );