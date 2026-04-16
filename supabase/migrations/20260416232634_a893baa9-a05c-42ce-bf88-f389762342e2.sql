ALTER TABLE public.folder_public_shares
  ADD COLUMN IF NOT EXISTS allow_upload boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.folder_share_allows_upload(_folder_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.folder_public_shares
    WHERE folder_id = _folder_id
      AND expires_at > now()
      AND allow_upload = true
  );
$$;

DROP POLICY IF EXISTS "Anon insert via active share" ON storage.objects;
CREATE POLICY "Anon insert via active share"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'folder-files'
  AND public.folder_share_allows_upload(((storage.foldername(name))[1])::uuid)
);

CREATE OR REPLACE FUNCTION public.add_share_file(
  _token text,
  _storage_path text,
  _file_name text,
  _size_bytes bigint,
  _mime_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _folder_id uuid;
  _allow_upload boolean;
  _new_id uuid;
BEGIN
  SELECT folder_id, allow_upload
    INTO _folder_id, _allow_upload
  FROM public.folder_public_shares
  WHERE token = _token AND expires_at > now();

  IF _folder_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired share link';
  END IF;

  IF NOT _allow_upload THEN
    RAISE EXCEPTION 'Uploads are disabled for this share link';
  END IF;

  IF split_part(_storage_path, '/', 1) <> _folder_id::text THEN
    RAISE EXCEPTION 'Path does not belong to this folder';
  END IF;

  INSERT INTO public.folder_files (folder_id, storage_path, file_name, size_bytes, mime_type, uploaded_via_share)
  VALUES (_folder_id, _storage_path, _file_name, _size_bytes, _mime_type, true)
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_share_folder(text);
CREATE OR REPLACE FUNCTION public.get_share_folder(_token text)
RETURNS TABLE(
  folder_id uuid,
  folder_name text,
  folder_icon text,
  expires_at timestamptz,
  allow_upload boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT f.id, f.name, f.icon, s.expires_at, s.allow_upload
  FROM public.folder_public_shares s
  JOIN public.folders f ON f.id = s.folder_id
  WHERE s.token = _token AND s.expires_at > now();
$$;

DROP FUNCTION IF EXISTS public.regen_share_token(uuid);
DROP FUNCTION IF EXISTS public.regen_share_token(uuid, interval);

CREATE OR REPLACE FUNCTION public.regen_share_token(
  _folder_id uuid,
  _expires_in interval DEFAULT '24:00:00'::interval,
  _allow_upload boolean DEFAULT true
)
RETURNS TABLE(token text, expires_at timestamptz, allow_upload boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_token text;
  _new_expiry timestamptz;
BEGIN
  IF NOT public.is_folder_owner(_folder_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _expires_in < interval '5 minutes' THEN
    _expires_in := interval '5 minutes';
  END IF;

  _new_token := encode(extensions.gen_random_bytes(24), 'hex');
  _new_expiry := now() + _expires_in;

  INSERT INTO public.folder_public_shares (folder_id, token, expires_at, allow_upload)
  VALUES (_folder_id, _new_token, _new_expiry, _allow_upload)
  ON CONFLICT (folder_id) DO UPDATE
    SET token = EXCLUDED.token,
        expires_at = EXCLUDED.expires_at,
        allow_upload = EXCLUDED.allow_upload;

  RETURN QUERY SELECT _new_token, _new_expiry, _allow_upload;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_share_allow_upload(
  _folder_id uuid,
  _allow_upload boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_folder_owner(_folder_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.folder_public_shares
     SET allow_upload = _allow_upload
   WHERE folder_id = _folder_id;

  RETURN _allow_upload;
END;
$$;