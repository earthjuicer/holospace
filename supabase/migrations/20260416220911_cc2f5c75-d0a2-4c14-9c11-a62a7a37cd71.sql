-- Restrict voice_channels deletion to the channel creator only.
-- Previously: any authenticated user could delete any channel.
DROP POLICY IF EXISTS "Authenticated users can delete channels" ON public.voice_channels;

CREATE POLICY "Creators can delete their channels"
ON public.voice_channels
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);