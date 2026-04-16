import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

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

// Mint a short-lived admin JWT for LiveKit Room Service calls.
async function mintAdminToken(apiKey: string, apiSecret: string, room: string) {
  const b64url = (s: string) =>
    btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      iss: apiKey,
      sub: apiKey,
      nbf: now,
      iat: now,
      exp: now + 60,
      jti: crypto.randomUUID(),
      video: {
        roomAdmin: true,
        room,
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
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${header}.${payload}`)
  );
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${payload}.${sigB64}`;
}

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

    const { data: ch, error: chErr } = await db
      .from("voice_channels")
      .select("id, created_by")
      .eq("id", data.channelId)
      .maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!ch) throw new Error("Channel not found");
    if (ch.created_by !== userId)
      throw new Error("Only the channel creator can kick");

    if (data.ban && data.identity.startsWith("guest-")) {
      const banKey = `guest:${data.displayName
        .replace(/\s*\(guest\)\s*$/i, "")
        .trim()
        .toLowerCase()}`;
      await db.from("voice_channel_bans").insert({
        channel_id: data.channelId,
        banned_identity: banKey,
        banned_by: userId,
      });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !url)
      throw new Error("LiveKit not configured");

    const httpUrl = url.replace(/^wss?:\/\//, "https://").replace(/\/$/, "");
    const roomName = `voice-${data.channelId}`;
    const adminToken = await mintAdminToken(apiKey, apiSecret, roomName);

    // LiveKit Twirp endpoint: POST /twirp/livekit.RoomService/RemoveParticipant
    const res = await fetch(
      `${httpUrl}/twirp/livekit.RoomService/RemoveParticipant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ room: roomName, identity: data.identity }),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Failed to remove participant: ${res.status} ${text}`);
    }

    return { success: true };
  });
