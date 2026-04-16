-- 1. Extend profiles with Discord-style fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#5865F2',
  ADD COLUMN IF NOT EXISTS custom_status text,
  ADD COLUMN IF NOT EXISTS status_emoji text;

UPDATE public.profiles
SET username = lower(regexp_replace(coalesce(display_name, substring(user_id::text, 1, 8)), '[^a-z0-9_]', '', 'g'))
WHERE username IS NULL;

UPDATE public.profiles
SET username = 'user_' || substring(user_id::text, 1, 8)
WHERE username IS NULL OR username = '';

DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2. Avatars bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 3. text_messages: replies, edits, soft-delete, threads
ALTER TABLE public.text_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.text_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS thread_root_id uuid REFERENCES public.text_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] DEFAULT '{}';

DROP POLICY IF EXISTS "Authors can edit their messages" ON public.text_messages;
CREATE POLICY "Authors can edit their messages"
  ON public.text_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_text_messages_thread_root ON public.text_messages(thread_root_id) WHERE thread_root_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_text_messages_mentions ON public.text_messages USING GIN(mentioned_user_ids);

-- 4. Reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.text_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view reactions" ON public.message_reactions;
CREATE POLICY "Authenticated users can view reactions"
  ON public.message_reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users add their own reactions" ON public.message_reactions;
CREATE POLICY "Users add their own reactions"
  ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users remove their own reactions" ON public.message_reactions;
CREATE POLICY "Users remove their own reactions"
  ON public.message_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);

-- 5. Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('mention', 'reply', 'thread_reply', 'dm', 'reaction')),
  channel_id uuid REFERENCES public.voice_channels(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.text_messages(id) ON DELETE CASCADE,
  preview text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipients view their notifications" ON public.notifications;
CREATE POLICY "Recipients view their notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);

DROP POLICY IF EXISTS "Recipients can update (mark read) their notifications" ON public.notifications;
CREATE POLICY "Recipients can update (mark read) their notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Recipients can delete their notifications" ON public.notifications;
CREATE POLICY "Recipients can delete their notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = recipient_id);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;

-- 6. Workspace user directory RPC
CREATE OR REPLACE FUNCTION public.list_workspace_users()
RETURNS TABLE (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  accent_color text,
  custom_status text,
  status_emoji text,
  bio text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, username, display_name, avatar_url, accent_color, custom_status, status_emoji, bio
  FROM public.profiles
  ORDER BY display_name NULLS LAST, username;
$$;

-- 7. Realtime — only add tables that aren't already in the publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

ALTER TABLE public.text_messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;