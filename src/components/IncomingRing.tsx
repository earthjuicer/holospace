// Global listener for incoming voice "rings" (call invitations).
// - If the app/tab is focused: shows a non-intrusive toast with a Join button + a single chime.
// - If the app is hidden/blurred: shows a full-screen incoming-call modal with a looping ringtone.
// Subscribes via Supabase Realtime so calls are pushed instantly.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Volume2, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { acceptRing, declineRing } from "@/lib/ring-actions";
import {
  playRingChime,
  startRingtone,
  stopRingtone,
} from "@/lib/voice-sounds";

interface IncomingRing {
  id: string;
  caller_id: string;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  caller_name: string;
  caller_avatar: string | null;
  expires_at: string;
}

export function IncomingRing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeRing, setActiveRing] = useState<IncomingRing | null>(null);
  // Track which rings we've already surfaced so a single ring doesn't trigger
  // both the initial-fetch path and the realtime INSERT path.
  const seenRef = useRef<Set<string>>(new Set());
  // Whether the document is currently visible/focused. Drives toast vs modal.
  const isFocusedRef = useRef<boolean>(
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );

  // Track focus state
  useEffect(() => {
    const update = () => {
      isFocusedRef.current = document.visibilityState === "visible" && document.hasFocus();
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  // Fetch the channel + caller display info, then surface the ring
  const surface = async (ringId: string, callerId: string, channelId: string, expiresAt: string) => {
    if (seenRef.current.has(ringId)) return;
    seenRef.current.add(ringId);

    // Skip if already expired
    if (new Date(expiresAt).getTime() <= Date.now()) return;

    const [{ data: ch }, { data: prof }] = await Promise.all([
      supabase
        .from("voice_channels")
        .select("name, channel_type")
        .eq("id", channelId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("user_id", callerId)
        .maybeSingle(),
    ]);

    const ring: IncomingRing = {
      id: ringId,
      caller_id: callerId,
      channel_id: channelId,
      channel_name: ch?.name ?? "Voice channel",
      channel_type: ch?.channel_type ?? "voice",
      caller_name: prof?.display_name ?? "Someone",
      caller_avatar: prof?.avatar_url ?? null,
      expires_at: expiresAt,
    };

    if (isFocusedRef.current) {
      // Subtle in-app: chime + toast with Join button
      playRingChime();
      toast(`📞 ${ring.caller_name} is ringing you`, {
        description: `Join "${ring.channel_name}"?`,
        duration: 15000,
        action: {
          label: "Join",
          onClick: () => handleAccept(ring),
        },
      });
    } else {
      // Background: full-screen modal + looping ringtone
      setActiveRing(ring);
      startRingtone();
    }
  };

  // Subscribe to incoming rings + load any pending ones at mount
  useEffect(() => {
    if (!user) return;

    // Load existing pending rings for this user
    (async () => {
      const { data } = await supabase
        .from("voice_rings")
        .select("id, caller_id, channel_id, expires_at, status")
        .eq("recipient_id", user.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data[0]) {
        const r = data[0];
        surface(r.id, r.caller_id, r.channel_id, r.expires_at);
      }
    })();

    const channel = supabase
      .channel(`voice-rings-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "voice_rings",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          const r = payload.new as {
            id: string;
            caller_id: string;
            channel_id: string;
            expires_at: string;
            status: string;
          };
          if (r.status !== "pending") return;
          surface(r.id, r.caller_id, r.channel_id, r.expires_at);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "voice_rings",
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          // If caller cancelled or it expired, dismiss the modal
          const r = payload.new as { id: string; status: string };
          if (r.status !== "pending") {
            setActiveRing((cur) => {
              if (cur?.id === r.id) {
                stopRingtone();
                return null;
              }
              return cur;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      stopRingtone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Auto-expire the active modal when the ring's expires_at passes
  useEffect(() => {
    if (!activeRing) return;
    const ms = new Date(activeRing.expires_at).getTime() - Date.now();
    if (ms <= 0) {
      setActiveRing(null);
      stopRingtone();
      return;
    }
    const t = setTimeout(() => {
      setActiveRing(null);
      stopRingtone();
    }, ms);
    return () => clearTimeout(t);
  }, [activeRing]);

  const handleAccept = async (ring: IncomingRing) => {
    stopRingtone();
    setActiveRing(null);
    await acceptRing(ring.id);
    navigate({ to: "/voice", search: { join: undefined } });
    // Tiny hint to the user — actual auto-join into the channel happens on the
    // /voice page where they can pick the channel from the sidebar. We surface
    // the channel name so they know which one to click.
    toast.success(`Joining "${ring.channel_name}"`, {
      description: "Tap the channel in the sidebar to connect.",
    });
  };

  const handleDecline = async () => {
    if (!activeRing) return;
    stopRingtone();
    const id = activeRing.id;
    setActiveRing(null);
    await declineRing(id);
  };

  return (
    <AnimatePresence>
      {activeRing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-md flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Incoming call"
        >
          <motion.div
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="glass-strong shadow-2xl max-w-sm w-full p-8 text-center"
          >
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              Incoming call
            </div>

            {/* Pulsing avatar */}
            <div className="relative mx-auto w-28 h-28 mb-5">
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/30"
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/20"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay: 0.3 }}
              />
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-3xl font-semibold text-primary-foreground overflow-hidden">
                {activeRing.caller_avatar ? (
                  <img
                    src={activeRing.caller_avatar}
                    alt={activeRing.caller_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  activeRing.caller_name.charAt(0).toUpperCase()
                )}
              </div>
            </div>

            <div className="text-xl font-semibold text-foreground mb-1.5">
              {activeRing.caller_name}
            </div>
            <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground mb-8">
              {activeRing.channel_type === "voice" ? (
                <Volume2 size={14} />
              ) : (
                <Hash size={14} />
              )}
              <span>{activeRing.channel_name}</span>
            </div>

            <div className="flex items-center justify-center gap-6">
              <button
                onClick={handleDecline}
                className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all flex items-center justify-center shadow-lg hover:scale-105 active:scale-95"
                aria-label="Decline call"
              >
                <PhoneOff size={26} />
              </button>
              <button
                onClick={() => handleAccept(activeRing)}
                className="w-16 h-16 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center shadow-lg hover:scale-105 active:scale-95"
                aria-label="Accept call"
              >
                <Phone size={26} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
