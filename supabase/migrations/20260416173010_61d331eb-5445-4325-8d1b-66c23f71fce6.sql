
-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create folders table
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create folder_shares table
CREATE TABLE IF NOT EXISTS public.folder_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(folder_id, shared_with_user_id)
);

ALTER TABLE public.folder_shares ENABLE ROW LEVEL SECURITY;

-- Policies for folders
CREATE POLICY "Owners can manage their folders"
  ON public.folders FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Shared users can view folders"
  ON public.folders FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.folder_shares
      WHERE folder_shares.folder_id = folders.id
      AND folder_shares.shared_with_user_id = auth.uid()
    )
  );

-- Policies for folder_shares
CREATE POLICY "Folder owners can manage shares"
  ON public.folder_shares FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.folders
      WHERE folders.id = folder_shares.folder_id
      AND folders.owner_id = auth.uid()
    )
  );

CREATE POLICY "Shared users can view their shares"
  ON public.folder_shares FOR SELECT USING (shared_with_user_id = auth.uid());

-- Create voice_channels table
CREATE TABLE IF NOT EXISTS public.voice_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_participants INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view channels"
  ON public.voice_channels FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create channels"
  ON public.voice_channels FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Channel creators can update their channels"
  ON public.voice_channels FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Channel creators can delete their channels"
  ON public.voice_channels FOR DELETE USING (auth.uid() = created_by);
