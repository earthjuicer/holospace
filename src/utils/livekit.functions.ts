import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";

// Client-side middleware that attaches the Supabase auth token as a header
// before the server function is invoked. Required so the server-side
// `requireSupabaseAuth` middleware can read the Authorization header.
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

export const getLiveKitToken = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: { roomName: string; participantName: string }) => data)
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const url = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret) {
      throw new Error("LiveKit credentials not configured");
    }
    if (!url) {
      throw new Error("LIVEKIT_URL not configured");
    }

    // Build a JWT for LiveKit (HS256). Worker-compatible — no node SDK needed.
    const b64url = (s: string) =>
      btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(
      JSON.stringify({
        iss: apiKey,
        sub: context.userId,
        name: data.participantName,
        nbf: now,
        iat: now,
        exp: now + 60 * 60 * 6, // 6h
        jti: crypto.randomUUID(),
        video: {
          roomJoin: true,
          room: data.roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          canPublishSources: ["camera", "microphone", "screen_share", "screen_share_audio"],
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

    return { token: `${header}.${payload}.${sig}`, url };
  });
