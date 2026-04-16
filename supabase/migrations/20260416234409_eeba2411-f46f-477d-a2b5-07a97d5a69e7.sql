-- Add remaining tables to the realtime publication.
-- DO blocks make this idempotent in case any are already added.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_channels; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_channel_bans; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.prompts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.prompt_runs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.folder_public_shares; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_workspace; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Ensure every realtime table emits the full row on UPDATE/DELETE so
-- subscribers can react without needing a follow-up fetch.
ALTER TABLE public.voice_channels REPLICA IDENTITY FULL;
ALTER TABLE public.channel_members REPLICA IDENTITY FULL;
ALTER TABLE public.voice_channel_bans REPLICA IDENTITY FULL;
ALTER TABLE public.prompts REPLICA IDENTITY FULL;
ALTER TABLE public.prompt_runs REPLICA IDENTITY FULL;
ALTER TABLE public.folder_public_shares REPLICA IDENTITY FULL;
ALTER TABLE public.user_workspace REPLICA IDENTITY FULL;
ALTER TABLE public.channel_categories REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.text_messages REPLICA IDENTITY FULL;
ALTER TABLE public.voice_rings REPLICA IDENTITY FULL;