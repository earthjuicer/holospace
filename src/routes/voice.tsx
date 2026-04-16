import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Mic, MicOff, Headphones, PhoneOff, Users, Volume2, Link2, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";
import { playJoinSound, playLeaveSound, playMuteSound, playUnmuteSound } from "@/lib/voice-sounds";
import { useLiveKitRoom } from "@/hooks/use-livekit-room";
import { ScreenShareControls } from "@/components/ScreenShareControls";
import { ScreenShareViewer } from "@/components/ScreenShareViewer";
import { ChannelSidebar, type SidebarChannel } from "@/components/ChannelSidebar";

export const Route = createFileRoute("/voice")({
  validateSearch: (search: Record<string, unknown>) => ({
    join: (search.join as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Voice Channels — Workspace" },
      { name: "description", content: "Discord-style voice channels for your team." },
    ],
  }),
  component: VoicePage,
});

function VoicePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { join: joinCode } = Route.useSearch();
  const [activeChannel, setActiveChannel] = useState<SidebarChannel | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  const lastChannelRef = useRef<string | null>(null);
  const pttHoldingRef = useRef(false);

  const lk = useLiveKitRoom();

  // Auto-join via invite link
  useEffect(() => {
    if (!joinCode || !user || activeChannel) return;
    (async () => {
      const { data, error } = await supabase.rpc("join_channel_by_invite", {
        _invite_code: joinCode,
      });
      if (error || !data) {
        toast.error(error?.message ?? "Invalid invite link");
      } else {
        const { data: ch } = await supabase
          .from("voice_channels")
          .select("id, name, channel_type, category_id, created_by, position")
          .eq("id", data as string)
          .maybeSingle();
        if (ch) joinChannel(ch as unknown as SidebarChannel);
        toast.success("Joined channel!");
      }
      navigate({ to: "/voice", search: {} as any, replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode, user]);

  // Apply deafen by muting all remote audio elements
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.querySelectorAll("audio").forEach((el) => {
      (el as HTMLAudioElement).muted = isDeafened;
    });
  }, [isDeafened, lk.participants.length]);

  // Push-to-talk: hold spacebar to talk while muted
  useEffect(() => {
    if (!lk.isConnected || !lk.room) return;

    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        el.isContentEditable
      );
    };

    const onDown = async (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (!lk.isMuted) return; // PTT only matters when muted
      e.preventDefault();
      if (pttHoldingRef.current) return;
      pttHoldingRef.current = true;
      setPttActive(true);
      await lk.room?.localParticipant.setMicrophoneEnabled(true);
    };

    const onUp = async (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (!pttHoldingRef.current) return;
      e.preventDefault();
      pttHoldingRef.current = false;
      setPttActive(false);
      await lk.room?.localParticipant.setMicrophoneEnabled(false);
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [lk.isConnected, lk.isMuted, lk.room]);

  const joinChannel = async (channel: SidebarChannel) => {
    if (!user) return;
    if (channel.channel_type !== "voice") return;
    if (lastChannelRef.current === channel.id && lk.isConnected) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();

    const displayName = profile?.display_name || user.email?.split("@")[0] || "User";

    setActiveChannel(channel);
    lastChannelRef.current = channel.id;

    try {
      await lk.connect(`voice-${channel.id}`, displayName);
      playJoinSound();
      toast.success(`Joined #${channel.name}`);
    } catch {
      setActiveChannel(null);
      lastChannelRef.current = null;
    }
  };

  const leaveChannel = async () => {
    await lk.disconnect();
    setActiveChannel(null);
    lastChannelRef.current = null;
    setIsDeafened(false);
    playLeaveSound();
    toast("Left voice channel");
  };

  const handleToggleMute = async () => {
    const nextMuted = await lk.toggleMute();
    if (nextMuted) playMuteSound();
    else playUnmuteSound();
  };

  const copyInviteLink = async () => {
    if (!activeChannel) return;
    if (activeChannel.created_by !== user?.id) {
      toast.error("Only the channel creator can share the invite link");
      return;
    }
    const { data: code, error } = await supabase.rpc("get_channel_invite_code", {
      _channel_id: activeChannel.id,
    });
    if (error || !code) {
      toast.error("Could not load invite code");
      return;
    }
    const link = `${window.location.origin}/voice-invite/${code}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-full">
      <ChannelSidebar
        activeVoiceId={activeChannel?.id ?? null}
        onJoinVoice={joinChannel}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
            {!activeChannel ? (
              <div className="glass p-12 text-center">
                <Volume2 size={48} className="mx-auto mb-4 text-muted-foreground/30" />
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  Select a voice channel
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pick a channel on the left to start talking, or create one.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-6">
                  <Volume2 size={22} className="text-primary" />
                  <h1 className="text-2xl font-bold text-foreground">{activeChannel.name}</h1>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                    <Users size={12} /> {lk.participants.length}
                  </span>
                </div>

                <ScreenShareViewer shares={lk.screenShares} />

                <div className="glass p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    In voice — {lk.participants.length}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {lk.participants.map((p) => (
                      <div
                        key={p.identity}
                        className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                          p.isSpeaking ? "bg-primary/10 ring-1 ring-primary/40" : "bg-muted/40"
                        }`}
                      >
                        <div className="relative">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-sm font-medium">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          {p.isMuted && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive flex items-center justify-center ring-2 ring-background">
                              <MicOff size={9} className="text-white" />
                            </div>
                          )}
                        </div>
                        <span className="text-sm truncate">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* Floating control bar */}
      <AnimatePresence>
        {activeChannel && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-[80px] md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-1rem)]"
          >
            <div className="glass-strong px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4 shadow-2xl flex-wrap justify-center">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    lk.isConnected ? "bg-primary animate-pulse" : "bg-muted-foreground"
                  }`}
                />
                <span className="text-sm font-medium text-foreground">{activeChannel.name}</span>
                <span className="text-xs text-muted-foreground">· {lk.participants.length}</span>
              </div>

              <div className="flex items-center gap-1">
                {activeChannel.created_by === user?.id && (
                  <button
                    onClick={copyInviteLink}
                    className="p-2.5 rounded-xl bg-muted/50 text-foreground hover:bg-muted transition-all"
                    title="Copy invite link"
                  >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                )}
                <ScreenShareControls
                  isSharing={lk.isSharing}
                  onStart={(opts) => lk.startScreenShare(opts)}
                  onStop={lk.stopScreenShare}
                />
                <button
                  onClick={handleToggleMute}
                  className={`p-2.5 rounded-xl transition-all relative ${
                    pttActive
                      ? "bg-primary/20 text-primary ring-2 ring-primary"
                      : lk.isMuted
                      ? "bg-destructive/20 text-destructive"
                      : "bg-muted/50 text-foreground hover:bg-muted"
                  }`}
                  title={lk.isMuted ? "Unmute (or hold Space to talk)" : "Mute"}
                >
                  {pttActive || !lk.isMuted ? <Mic size={18} /> : <MicOff size={18} />}
                </button>
                <button
                  onClick={() => setIsDeafened(!isDeafened)}
                  className={`p-2.5 rounded-xl transition-all ${
                    isDeafened
                      ? "bg-destructive/20 text-destructive"
                      : "bg-muted/50 text-foreground hover:bg-muted"
                  }`}
                  title={isDeafened ? "Undeafen" : "Deafen"}
                >
                  <Headphones size={18} />
                </button>
                <button
                  onClick={leaveChannel}
                  className="p-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all"
                  title="Leave channel"
                >
                  <PhoneOff size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
