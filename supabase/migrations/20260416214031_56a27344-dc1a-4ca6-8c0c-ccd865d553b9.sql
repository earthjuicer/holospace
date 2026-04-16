-- Categories
CREATE TABLE public.channel_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view categories"
  ON public.channel_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can create categories"
  ON public.channel_categories FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their categories"
  ON public.channel_categories FOR UPDATE
  TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Creators can delete their categories"
  ON public.channel_categories FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

-- Add columns to voice_channels (covers voice + text channels)
ALTER TABLE public.voice_channels
  ADD COLUMN channel_type TEXT NOT NULL DEFAULT 'voice',
  ADD COLUMN category_id UUID REFERENCES public.channel_categories(id) ON DELETE SET NULL,
  ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

-- Allow any authenticated user to delete channels (broaden from creator-only per user request)
DROP POLICY IF EXISTS "Channel creators can delete their channels" ON public.voice_channels;
CREATE POLICY "Authenticated users can delete channels"
  ON public.voice_channels FOR DELETE
  TO authenticated USING (true);

-- Allow any authenticated user to view all channels (so non-creators can see them in the sidebar)
DROP POLICY IF EXISTS "Users can view their own or joined channels" ON public.voice_channels;
CREATE POLICY "Authenticated users can view channels"
  ON public.voice_channels FOR SELECT
  TO authenticated USING (true);

-- Text messages for text channels
CREATE TABLE public.text_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.voice_channels(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.text_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view messages"
  ON public.text_messages FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can post messages"
  ON public.text_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can delete their messages"
  ON public.text_messages FOR DELETE
  TO authenticated USING (auth.uid() = author_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.text_messages;

CREATE INDEX idx_voice_channels_category ON public.voice_channels(category_id, position);
CREATE INDEX idx_text_messages_channel ON public.text_messages(channel_id, created_at);