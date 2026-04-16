-- Prompts table
CREATE TABLE public.prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_private BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their prompts"
ON public.prompts FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Folder members can view shared prompts"
ON public.prompts FOR SELECT
USING (
  folder_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.folder_shares
    WHERE folder_shares.folder_id = prompts.folder_id
      AND folder_shares.shared_with_user_id = auth.uid()
  )
);

CREATE POLICY "Folder owners can view folder prompts"
ON public.prompts FOR SELECT
USING (
  folder_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.folders
    WHERE folders.id = prompts.folder_id AND folders.owner_id = auth.uid()
  )
);

CREATE TRIGGER update_prompts_updated_at
BEFORE UPDATE ON public.prompts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_prompts_owner ON public.prompts(owner_id);
CREATE INDEX idx_prompts_folder ON public.prompts(folder_id);

-- Prompt runs table (history)
CREATE TABLE public.prompt_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id UUID REFERENCES public.prompts(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  rendered_input TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  output TEXT,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their runs"
ON public.prompt_runs FOR ALL
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

CREATE INDEX idx_prompt_runs_prompt ON public.prompt_runs(prompt_id);
CREATE INDEX idx_prompt_runs_owner ON public.prompt_runs(owner_id);