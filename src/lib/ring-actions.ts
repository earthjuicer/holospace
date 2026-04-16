// Helpers for sending and responding to voice "rings" (call invitations).
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Ring a single specific user into a voice channel. */
export async function ringUser(opts: {
  channelId: string;
  recipientId: string;
  message?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    toast.error("Sign in to ring");
    return false;
  }
  const { error } = await supabase.from("voice_rings").insert({
    caller_id: user.id,
    recipient_id: opts.recipientId,
    channel_id: opts.channelId,
    message: opts.message ?? null,
  });
  if (error) {
    toast.error(error.message || "Couldn't ring");
    return false;
  }
  toast.success("Ringing…");
  return true;
}

/** Ring every member of a channel (skips caller and anyone already ringing). */
export async function ringChannel(channelId: string, message?: string) {
  const { data, error } = await supabase.rpc("ring_channel", {
    _channel_id: channelId,
    _message: message ?? undefined,
  });
  if (error) {
    toast.error(error.message || "Couldn't ring channel");
    return 0;
  }
  const count = (data as number) ?? 0;
  if (count === 0) {
    toast.info("No one to ring (everyone's already ringing or you're alone)");
  } else {
    toast.success(`Ringing ${count} ${count === 1 ? "person" : "people"}…`);
  }
  return count;
}

/** Caller cancels their outgoing ring. */
export async function cancelRing(ringId: string) {
  await supabase
    .from("voice_rings")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", ringId);
}

/** Recipient accepts an incoming ring. */
export async function acceptRing(ringId: string) {
  await supabase
    .from("voice_rings")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", ringId);
}

/** Recipient declines an incoming ring. */
export async function declineRing(ringId: string) {
  await supabase
    .from("voice_rings")
    .update({ status: "declined", responded_at: new Date().toISOString() })
    .eq("id", ringId);
}
