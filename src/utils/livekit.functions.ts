import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLiveKitToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomName: string; participantName: string }) => data)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit credentials not configured");
    }

    // Generate a simple JWT token for LiveKit
    // We'll use a basic approach since we can't use livekit-server-sdk in Workers
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    const now = Math.floor(Date.now() / 1000);
    const payload = btoa(
      JSON.stringify({
        iss: apiKey,
        sub: context.userId,
        name: data.participantName,
        nbf: now,
        exp: now + 3600,
        jti: crypto.randomUUID(),
        video: {
          roomJoin: true,
          room: data.roomName,
          canPublish: true,
          canSubscribe: true,
        },
      })
    )
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

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
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    return { token: `${header}.${payload}.${sig}` };
  });
