-- Add invite_code to voice_channels for shareable links
ALTER TABLE public.voice_channels
ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;

-- Backfill existing rows with random codes
UPDATE public.voice_channels
SET invite_code = encode(gen_random_bytes(6), 'hex')
WHERE invite_code IS NULL;

-- Make invite_code required and auto-generated for future rows
ALTER TABLE public.voice_channels
ALTER COLUMN invite_code SET NOT NULL,
ALTER COLUMN invite_code SET DEFAULT encode(gen_random_bytes(6), 'hex');

-- Allow anyone (even unauthenticated) to look up channel by invite code
-- so the join page can resolve the code before login
CREATE POLICY "Anyone can view channels by invite code"
ON public.voice_channels
FOR SELECT
TO anon, authenticated
USING (true);