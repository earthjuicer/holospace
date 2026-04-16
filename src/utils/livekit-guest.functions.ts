import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

// Issue a LiveKit token for a GUEST joining via invite code (no Supabase auth).
// Resolves the invite code server-side, validates the channel is active and is a
// voice channel, then mints a short-lived LiveKit JWT bound to the channel room.
export const getLiveKitTokenForGuest = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { inviteCode: string; participantName: string }) => data
  )
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      throw new Error("Backend not configured");
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: rows, error } = await supabase.rpc(
      "get_voice_channel_by_invite",
      { _invite_code: data.inviteCode }
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Invalid invite link");
    if (row.channel_type !== "voice") throw new Error("This invite is not for a voice channel");
    if (!row.is_active) throw new Error("Channel is not active");

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !url) {
      throw new Error("LiveKit not configured");
    }

    const cleanName = (data.participantName || "Guest").trim().slice(0, 32) || "Guest";
    const guestId = `guest-${crypto.randomUUID()}`;
    const roomName = `voice-${row.channel_id}`;

    const b64url = (s: string) =>
      btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(
      JSON.stringify({
        iss: apiKey,
        sub: guestId,
        name: `${cleanName} (guest)`,
        nbf: now,
        iat: now,
        exp: now + 60 * 60 * 6,
        jti: crypto.randomUUID(),
        video: {
          roomJoin: true,
          room: roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          canPublishSources: ["microphone", "screen_share", "screen_share_audio"],
        },
      })
    );

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(apiSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${header}.${payload}`)
    );
    const sig = b64url(String.fromCharCode(...new Uint8Array(signature)));

    return {
      token: `${header}.${payload}.${sig}`,
      url,
      roomName,
      channelId: row.channel_id as string,
      channelName: row.channel_name as string,
    };
  });
