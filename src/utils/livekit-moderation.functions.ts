import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { RoomServiceClient } from "livekit-server-sdk";

const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      sendContext: {},
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }
);

// Kick (and optionally ban) a participant from a voice room. Creator-only.
export const kickVoiceParticipant = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator(
    (data: {
      channelId: string;
      identity: string;
      displayName: string;
      ban: boolean;
    }) => data
  )
  .handler(async ({ data, context }) => {
    const { supabase: db, userId } = context;

    // Verify caller is channel creator
    const { data: ch, error: chErr } = await db
      .from("voice_channels")
      .select("id, created_by")
      .eq("id", data.channelId)
      .maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!ch) throw new Error("Channel not found");
    if (ch.created_by !== userId) throw new Error("Only the channel creator can kick");

    // If ban requested AND target is a guest, persist a ban entry
    // (guests are identified by `guest-<uuid>` identity; we ban by display name)
    if (data.ban && data.identity.startsWith("guest-")) {
      const banKey = `guest:${data.displayName.replace(/\s*\(guest\)\s*$/i, "").trim().toLowerCase()}`;
      await db.from("voice_channel_bans").insert({
        channel_id: data.channelId,
        banned_identity: banKey,
        banned_by: userId,
      });
    }

    // Remove the participant from the LiveKit room
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !url) throw new Error("LiveKit not configured");

    // LiveKit Room Service uses HTTP, not the WebSocket URL
    const httpUrl = url.replace(/^wss?:\/\//, "https://");
    const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    await roomService.removeParticipant(`voice-${data.channelId}`, data.identity);

    return { success: true };
  });
