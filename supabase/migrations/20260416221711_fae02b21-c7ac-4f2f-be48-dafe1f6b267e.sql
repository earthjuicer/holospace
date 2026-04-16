CREATE TABLE public.user_workspace (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_workspace ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own workspace"
  ON public.user_workspace FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own workspace"
  ON public.user_workspace FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own workspace"
  ON public.user_workspace FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own workspace"
  ON public.user_workspace FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_workspace_updated_at
  BEFORE UPDATE ON public.user_workspace
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();