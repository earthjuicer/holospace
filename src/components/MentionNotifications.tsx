import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AtSign, X, Bell } from "lucide-react";
import { createPortal } from "react-dom";

interface MentionNotif {
  id: string;
  actor_id: string;
  channel_id: string | null;
  message_id: string | null;
  preview: string | null;
  created_at: string;
  actorName?: string;
  actorAvatar?: string | null;
  channelName?: string;
}

/**
 * Global listener — mounts once in AppLayout.
 * Subscribes to the notifications table for the current user and fires
 * a pop-up toast whenever a new mention arrives in real time.
 */
export function MentionNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<MentionNotif[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch unread count on mount
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null)
      .then(({ count }) => setUnreadCount(count ?? 0));

    // Subscribe to new notifications in real time
    const sub = supabase
      .channel(`mention-notifs-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as MentionNotif;
          if (seenRef.current.has(row.id)) return;
          seenRef.current.add(row.id);

          // Enrich with actor name + channel name
          const [actorRes, channelRes] = await Promise.all([
            supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("user_id", row.actor_id)
              .maybeSingle(),
            row.channel_id
              ? supabase
                  .from("voice_channels")
                  .select("name")
                  .eq("id", row.channel_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          const enriched: MentionNotif = {
            ...row,
            actorName: actorRes.data?.display_name || "Someone",
            actorAvatar: actorRes.data?.avatar_url,
            channelName: (channelRes as any).data?.name,
          };

          setQueue((q) => [...q, enriched]);
          setUnreadCount((n) => n + 1);

          // Browser notification if tab is not focused
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            new Notification(`${enriched.actorName} mentioned you`, {
              body: enriched.preview ?? "You were mentioned in a message",
              icon: enriched.actorAvatar ?? undefined,
            });
          }

          // Auto-dismiss after 6 seconds
          setTimeout(() => {
            setQueue((q) => q.filter((n) => n.id !== row.id));
          }, 6000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [user?.id]);

  const dismiss = (id: string) => setQueue((q) => q.filter((n) => n.id !== id));

  const jumpToMessage = async (notif: MentionNotif) => {
    // Mark as read
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notif.id);

    dismiss(notif.id);
    setUnreadCount((n) => Math.max(0, n - 1));

    if (notif.channel_id) {
      navigate({ to: "/text/$channelId", params: { channelId: notif.channel_id } });
    }
  };

  if (!user) return null;

  return createPortal(
    <>
      {/* Notification stack — bottom-right corner */}
      <div
        className="fixed bottom-6 right-6 flex flex-col gap-2 z-[99999]"
        style={{ maxWidth: 340 }}
      >
        <AnimatePresence>
          {queue.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 80, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.9 }}
              transition={{ type: "spring", damping: 22, stiffness: 300 }}
              className="glass-strong rounded-2xl shadow-2xl overflow-hidden border border-primary/20"
            >
              {/* Accent bar */}
              <div className="h-1 w-full gradient-accent" />

              <div className="px-4 py-3 flex items-start gap-3">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {notif.actorAvatar ? (
                    <img src={notif.actorAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <AtSign size={16} className="text-primary" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                      Mentioned
                    </span>
                    {notif.channelName && (
                      <span className="text-[11px] text-muted-foreground">
                        in #{notif.channelName}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {notif.actorName} mentioned you
                  </p>
                  {notif.preview && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {notif.preview}
                    </p>
                  )}
                  <button
                    onClick={() => jumpToMessage(notif)}
                    className="mt-2 text-xs font-medium text-primary hover:underline"
                  >
                    Jump to message →
                  </button>
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => dismiss(notif.id)}
                  className="p-1 rounded-lg hover:bg-muted/60 text-muted-foreground shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Unread badge on bell — shown in bottom-right if no active toasts */}
      {unreadCount > 0 && queue.length === 0 && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="fixed bottom-6 right-6 z-[99998] w-12 h-12 rounded-full gradient-accent text-white shadow-2xl flex items-center justify-center"
          onClick={async () => {
            if (!user) return;
            // Navigate to most recent unread mention channel
            const { data } = await supabase
              .from("notifications")
              .select("channel_id")
              .eq("recipient_id", user.id)
              .is("read_at", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (data?.channel_id) {
              navigate({ to: "/text/$channelId", params: { channelId: data.channel_id } });
            }
            // Mark all read
            await supabase
              .from("notifications")
              .update({ read_at: new Date().toISOString() })
              .eq("recipient_id", user.id)
              .is("read_at", null);
            setUnreadCount(0);
          }}
          title={`${unreadCount} unread mention${unreadCount !== 1 ? "s" : ""}`}
        >
          <Bell size={20} />
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        </motion.button>
      )}
    </>,
    document.body
  );
}
