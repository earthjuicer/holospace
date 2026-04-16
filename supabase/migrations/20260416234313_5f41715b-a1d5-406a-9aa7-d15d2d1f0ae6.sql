ALTER PUBLICATION supabase_realtime ADD TABLE public.folder_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE public.folders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.folder_files;
ALTER TABLE public.folder_shares REPLICA IDENTITY FULL;
ALTER TABLE public.folders REPLICA IDENTITY FULL;
ALTER TABLE public.folder_files REPLICA IDENTITY FULL;