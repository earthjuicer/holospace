// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Allowlist — keep in sync with the UI model picker
const ALLOWED_MODELS = new Set([
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-pro-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
]);

const DEFAULT_MODEL = "google/gemini-3-flash-preview";
const MAX_MESSAGES = 60;
const MAX_TOTAL_CHARS = 200_000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---- 1. Authenticate the caller ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // ---- 2. Validate input ----
    const body = await req.json().catch(() => ({}));
    const { messages, model, system } = body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: "messages must be a non-empty array" }, 400);
    }
    if (messages.length > MAX_MESSAGES) {
      return jsonResponse({ error: "Too many messages" }, 400);
    }

    let totalChars = system ? String(system).length : 0;
    for (const m of messages) {
      if (
        !m ||
        typeof m !== "object" ||
        !["user", "assistant", "system"].includes(m.role) ||
        typeof m.content !== "string"
      ) {
        return jsonResponse({ error: "Invalid message format" }, 400);
      }
      totalChars += m.content.length;
    }
    if (totalChars > MAX_TOTAL_CHARS) {
      return jsonResponse({ error: "Prompt too large" }, 400);
    }

    const chosenModel = typeof model === "string" && ALLOWED_MODELS.has(model)
      ? model
      : DEFAULT_MODEL;

    // ---- 3. Forward to AI gateway ----
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "AI not configured" }, 500);
    }

    const finalMessages = system
      ? [{ role: "system", content: String(system) }, ...messages]
      : messages;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: finalMessages,
          stream: true,
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return jsonResponse(
          { error: "Rate limit exceeded, try again soon." },
          429,
        );
      }
      if (response.status === 402) {
        return jsonResponse(
          { error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." },
          402,
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return jsonResponse({ error: "AI gateway error" }, 500);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("run-prompt error:", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
