import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Mic, MicOff, Headphones, PhoneOff, Plus, Users, Volume2, Hash, Link2, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";
import { playJoinSound, playLeaveSound, playMuteSound, playUnmuteSound } from "@/lib/voice-sounds";
import { useLiveKitRoom } from "@/hooks/use-livekit-room";
import { ScreenShareControls } from "@/components/ScreenShareControls";
import { ScreenShareViewer } from "@/components/ScreenShareViewer";

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

interface VoiceChannel {
  id: string;
  name: string;
  created_by: string;
  is_active: boolean;
  max_participants: number;
}

function VoicePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { join: joinCode } = Route.useSearch();
  const [channels, setChannels] = useState<VoiceChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDeafened, setIsDeafened] = useState(false);
  const lastChannelRef = useRef<string | null>(null);

  const lk = useLiveKitRoom();

  useEffect(() => {
    fetchChannels();
    const channel = supabase
      .channel("voice_channels_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_channels" }, () => {
        fetchChannels();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
        await fetchChannels();
        joinChannel(data as string);
        toast.success("Joined channel!");
      }
      navigate({ to: "/voice", search: {} as any, replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode, user]);

  const fetchChannels = async () => {
    const { data } = await supabase
      .from("voice_channels")
      .select("id, name, created_by, is_active, max_participants")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (data) setChannels(data as VoiceChannel[]);
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !user) return;
    const { error } = await supabase.from("voice_channels").insert({
      name: newChannelName.trim(),
      created_by: user.id,
    });
    if (error) {
      toast.error("Failed to create channel");
    } else {
      setNewChannelName("");
      setShowCreate(false);
      toast.success("Channel created!");
    }
  };

  // Apply deafen by muting all remote audio elements (LiveKit auto-attaches them)
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.querySelectorAll("audio").forEach((el) => {
      (el as HTMLAudioElement).muted = isDeafened;
    });
  }, [isDeafened, lk.participants.length]);

  const joinChannel = async (channelId: string) => {
    if (!user) return;
    if (lastChannelRef.current === channelId && lk.isConnected) return;

    // Get profile for display
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();

    const displayName = profile?.display_name || user.email?.split("@")[0] || "User";

    setActiveChannel(channelId);
    lastChannelRef.current = channelId;

    try {
      await lk.connect(`voice-${channelId}`, displayName);
      playJoinSound();
      toast.success("Joined voice channel");
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

  const copyInviteLink = async (channel: VoiceChannel, e: React.MouseEvent) => {
    e.stopPropagation();
    if (channel.created_by !== user?.id) {
      toast.error("Only the channel creator can share the invite link");
      return;
    }
    const { data: code, error } = await supabase.rpc("get_channel_invite_code", {
      _channel_id: channel.id,
    });
    if (error || !code) {
      toast.error("Could not load invite code");
      return;
    }
    const link = `${window.location.origin}/voice?join=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedId(channel.id);
    toast.success("Invite link copied!", { description: `Code: ${code}` });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeChannelData = channels.find((c) => c.id === activeChannel);
  const activeParticipants = activeChannel ? lk.participants : [];

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="flex items-start sm:items-center justify-between gap-3 mb-6 flex-col sm:flex-row">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Volume2 size={24} className="text-primary" />
              Voice Channels
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time voice & screen share, powered by LiveKit
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="pill-button gradient-accent text-white flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
          >
            <Plus size={16} /> New Channel
          </button>
        </div>

        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="glass p-4 flex items-center gap-3">
                <Hash size={18} className="text-muted-foreground" />
                <input
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Channel name"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  onKeyDown={(e) => e.key === "Enter" && createChannel()}
                />
                <button
                  onClick={createChannel}
                  className="px-4 py-1.5 rounded-lg gradient-accent text-white text-sm font-medium"
                >
                  Create
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active screen shares (rendered above channel list when in a channel) */}
        {activeChannel && <ScreenShareViewer shares={lk.screenShares} />}

        <div className="space-y-2">
          {channels.map((channel, i) => {
            const isActive = activeChannel === channel.id;
            const channelParticipants = isActive ? activeParticipants : [];
            return (
              <motion.div
                key={channel.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`glass p-4 transition-all ${
                  isActive ? "ring-2 ring-primary/50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => (isActive ? leaveChannel() : joinChannel(channel.id))}
                  >
                    <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center shrink-0">
                      <Volume2 size={20} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{channel.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users size={12} />
                        {isActive ? `${channelParticipants.length} connected` : "Click to join"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {channel.created_by === user?.id && (
                      <button
                        onClick={(e) => copyInviteLink(channel, e)}
                        className="p-2 rounded-lg bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                        title="Copy invite link"
                      >
                        {copiedId === channel.id ? <Check size={16} /> : <Link2 size={16} />}
                      </button>
                    )}
                    {isActive && (
                      <span className="px-2 py-1 rounded-full bg-primary/20 text-primary text-xs font-medium">
                        Connected
                      </span>
                    )}
                  </div>
                </div>

                {/* Participant avatars (only for the active channel) */}
                {isActive && channelParticipants.length > 0 && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                    <div className="flex -space-x-2">
                      {channelParticipants.slice(0, 6).map((p) => (
                        <div
                          key={p.identity}
                          className={`w-7 h-7 rounded-full ring-2 ring-background bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-xs font-medium relative ${
                            p.isSpeaking ? "ring-primary" : ""
                          }`}
                          title={p.name + (p.isMuted ? " (muted)" : "")}
                        >
                          {p.name.charAt(0).toUpperCase()}
                          {p.isMuted && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-destructive flex items-center justify-center">
                              <MicOff size={8} className="text-white" />
                            </div>
                          )}
                          {p.isScreenSharing && (
                            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-1 ring-background" />
                          )}
                        </div>
                      ))}
                    </div>
                    {channelParticipants.length > 6 && (
                      <span className="text-xs text-muted-foreground">
                        +{channelParticipants.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}

          {channels.length === 0 && (
            <div className="glass p-12 text-center">
              <Volume2 size={48} className="mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">No voice channels yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create one to start talking with your team
              </p>
            </div>
          )}
        </div>

        <AnimatePresence>
          {activeChannel && activeChannelData && (
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
                  <span className="text-sm font-medium text-foreground">
                    {activeChannelData.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · {activeParticipants.length}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {activeChannelData.created_by === user?.id && (
                    <button
                      onClick={(e) => copyInviteLink(activeChannelData, e)}
                      className="p-2.5 rounded-xl bg-muted/50 text-foreground hover:bg-muted transition-all"
                      title="Copy invite link"
                    >
                      {copiedId === activeChannelData.id ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  )}
                  <ScreenShareControls
                    isSharing={lk.isSharing}
                    onStart={(opts) => lk.startScreenShare(opts)}
                    onStop={lk.stopScreenShare}
                  />
                  <button
                    onClick={handleToggleMute}
                    className={`p-2.5 rounded-xl transition-all ${
                      lk.isMuted
                        ? "bg-destructive/20 text-destructive"
                        : "bg-muted/50 text-foreground hover:bg-muted"
                    }`}
                    title={lk.isMuted ? "Unmute" : "Mute"}
                  >
                    {lk.isMuted ? <MicOff size={18} /> : <Mic size={18} />}
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
      </motion.div>
    </div>
  );
}
