import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Mic, MicOff, Headphones, PhoneOff, Users, Volume2, Copy, Check,
  RefreshCw, Clock, UserX, Ban, Link2, Volume1, Bell,
} from "lucide-react";
import { toast } from "sonner";
import { ringChannel, ringUser } from "@/lib/ring-actions";
import { playJoinSound, playLeaveSound, playMuteSound, playUnmuteSound } from "@/lib/voice-sounds";
import { type VoiceParticipantInfo } from "@/hooks/use-livekit-room";
import { useVoiceRoom } from "@/hooks/voice-room-context";
import { ScreenShareControls } from "@/components/ScreenShareControls";
import { ScreenShareViewer } from "@/components/ScreenShareViewer";
import { ChannelSidebar, type SidebarChannel } from "@/components/ChannelSidebar";
import { kickVoiceParticipant } from "@/utils/livekit-moderation.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/voice")({
  validateSearch: (search: Record<string, unknown>) => ({
    join: (search.join as string) || undefined,
    channelId: (search.channelId as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Voice Channels — Workspace" },
      { name: "description", content: "Discord-style voice channels for your team." },
    ],
  }),
  component: VoicePage,
});

function formatRemaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function VoicePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { join: joinCode, channelId: pendingChannelId } = Route.useSearch();
  // Voice room state lives in a global provider so the connection survives
  // route changes — users now stay in the channel until they hit "Leave".
  const lk = useVoiceRoom();
  const { activeChannel, setActiveChannel } = lk;
  const [isDeafened, setIsDeafened] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);
  const [confirmKick, setConfirmKick] = useState<{
    p: VoiceParticipantInfo;
    ban: boolean;
  } | null>(null);
  // Per-participant volume slider state (0-100). Defaults to 100 = unity gain.
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const lastChannelRef = useRef<string | null>(null);
  const pttHoldingRef = useRef(false);

  // Tick every 30s to refresh expiry countdown
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Auto-join via legacy ?join= invite (still supported for logged-in users)
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

  // Auto-join when we land on /voice?channelId=… (e.g. clicked a voice
  // channel from inside a text channel via the sidebar).
  useEffect(() => {
    if (!pendingChannelId || !user || activeChannel) return;
    (async () => {
      const { data: ch } = await supabase
        .from("voice_channels")
        .select("id, name, channel_type, category_id, created_by, position")
        .eq("id", pendingChannelId)
        .maybeSingle();
      if (ch && (ch as any).channel_type === "voice") {
        joinChannel(ch as unknown as SidebarChannel);
      }
      navigate({ to: "/voice", search: {} as any, replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChannelId, user]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.querySelectorAll("audio").forEach((el) => {
      (el as HTMLAudioElement).muted = isDeafened;
    });
  }, [isDeafened, lk.participants.length]);

  // Push-to-talk
  useEffect(() => {
    if (!lk.isConnected || !lk.room) return;

    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onDown = async (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (!lk.isMuted) return;
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

  const openInviteDialog = async () => {
    if (!activeChannel) return;
    if (activeChannel.created_by !== user?.id) {
      toast.error("Only the channel creator can manage the invite link");
      return;
    }
    setShowInvite(true);
    const { data, error } = await supabase.rpc("get_voice_invite_info", {
      _channel_id: activeChannel.id,
    });
    if (error || !data || data.length === 0) {
      toast.error("Could not load invite info");
      return;
    }
    setInviteCode(data[0].invite_code);
    setInviteExpiresAt(data[0].invite_expires_at);
  };

  const regenInvite = async () => {
    if (!activeChannel) return;
    const { data, error } = await supabase.rpc("regen_voice_invite", {
      _channel_id: activeChannel.id,
    });
    if (error || !data || data.length === 0) {
      toast.error(error?.message ?? "Could not regenerate link");
      return;
    }
    setInviteCode(data[0].invite_code);
    setInviteExpiresAt(data[0].invite_expires_at);
    toast.success("New invite link generated");
  };

  const copyInviteLink = () => {
    if (!inviteCode) return;
    const link = `${window.location.origin}/voice-invite/${inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const performKick = async (p: VoiceParticipantInfo, ban: boolean) => {
    if (!activeChannel) return;
    try {
      await kickVoiceParticipant({
        data: {
          channelId: activeChannel.id,
          identity: p.identity,
          displayName: p.name,
          ban,
        },
      });
      toast.success(ban ? `${p.name} banned` : `${p.name} kicked`);
    } catch (err: any) {
      toast.error(err?.message || "Could not kick participant");
    }
    setConfirmKick(null);
  };

  const isCreator = activeChannel?.created_by === user?.id;

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
                    {lk.participants.map((p) => {
                      const vol = volumes[p.identity] ?? 100;
                      const card = (
                        <div
                          className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                            p.isSpeaking ? "bg-primary/10" : "bg-muted/40"
                          }`}
                        >
                          <div className="relative">
                            {/* Animated speaking ring */}
                            {p.isSpeaking && !p.isMuted && (
                              <>
                                <span className="absolute inset-0 rounded-full ring-2 ring-primary animate-pulse" />
                                <span className="absolute -inset-1 rounded-full ring-2 ring-primary/40 animate-ping" />
                              </>
                            )}
                            <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-sm font-medium">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            {p.isMuted && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive flex items-center justify-center ring-2 ring-background z-10">
                                <MicOff size={9} className="text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm truncate block">{p.name}</span>
                            {p.isGuest && (
                              <span className="inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">
                                Guest
                              </span>
                            )}
                          </div>
                        </div>
                      );

                      // Local participant — no actions
                      if (p.isLocal) return <div key={p.identity}>{card}</div>;

                      // Remote participant — wrap in popover (left-click for volume)
                      // and context menu (right-click for moderation if creator).
                      const withPopover = (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-left w-full">{card}</button>
                          </PopoverTrigger>
                          <PopoverContent className="w-60 p-3" side="top">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium truncate">{p.name}</span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">
                                {vol}%
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Volume1 size={14} className="text-muted-foreground shrink-0" />
                              <Slider
                                value={[vol]}
                                min={0}
                                max={200}
                                step={5}
                                onValueChange={([v]) => {
                                  setVolumes((prev) => ({ ...prev, [p.identity]: v }));
                                  lk.setParticipantVolume(p.identity, v / 100);
                                }}
                              />
                              <Volume2 size={14} className="text-muted-foreground shrink-0" />
                            </div>
                            <p className="text-[10px] text-muted-foreground/70 mt-2">
                              0% mutes them just for you · 200% boosts
                            </p>
                          </PopoverContent>
                        </Popover>
                      );

                      // Anyone (including the creator) can right-click another
                      // participant. Hosts can additionally kick/ban; everyone
                      // can ring an absent / signed-in user.
                      // Note: ringing only works for non-guest, non-local participants.
                      const canRing = !p.isLocal && !p.isGuest && activeChannel;
                      if (isCreator || canRing) {
                        return (
                          <ContextMenu key={p.identity}>
                            <ContextMenuTrigger asChild>
                              <div className="cursor-context-menu">{withPopover}</div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              {canRing && (
                                <ContextMenuItem
                                  onClick={() =>
                                    ringUser({
                                      channelId: activeChannel.id,
                                      recipientId: p.identity,
                                    })
                                  }
                                >
                                  <Bell size={14} className="mr-2" /> Ring {p.name}
                                </ContextMenuItem>
                              )}
                              {isCreator && (
                                <ContextMenuItem
                                  onClick={() => setConfirmKick({ p, ban: false })}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <UserX size={14} className="mr-2" /> Kick {p.name}
                                </ContextMenuItem>
                              )}
                              {isCreator && p.isGuest && (
                                <ContextMenuItem
                                  onClick={() => setConfirmKick({ p, ban: true })}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Ban size={14} className="mr-2" /> Ban {p.name}
                                </ContextMenuItem>
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      }

                      return <div key={p.identity}>{withPopover}</div>;
                    })}
                  </div>
                  {isCreator && lk.participants.some((p) => !p.isLocal) && (
                    <p className="text-[10px] text-muted-foreground/60 mt-3">
                      Tip: right-click a participant to kick or ban them.
                    </p>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* Audio unlock prompt for mobile browsers that block autoplay */}
      <AnimatePresence>
        {activeChannel && lk.needsAudioUnlock && (
          <motion.button
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            onClick={lk.unlockAudio}
            className="fixed bottom-[150px] md:bottom-24 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium shadow-2xl flex items-center gap-2 hover:bg-primary/90"
          >
            <Volume2 size={16} />
            Tap to enable audio
          </motion.button>
        )}
      </AnimatePresence>

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
                <button
                  onClick={() => activeChannel && ringChannel(activeChannel.id)}
                  className="p-2.5 rounded-xl bg-muted/50 text-foreground hover:bg-muted transition-all"
                  title="Ring everyone in this channel"
                  aria-label="Ring everyone"
                >
                  <Bell size={18} />
                </button>
                {isCreator && (
                  <button
                    onClick={openInviteDialog}
                    className="p-2.5 rounded-xl bg-muted/50 text-foreground hover:bg-muted transition-all"
                    title="Manage invite link"
                  >
                    <Link2 size={18} />
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

      {/* Invite link manager */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guest invite link</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Share this link to let anyone join the voice channel as a guest — no account needed.
          </p>

          {inviteCode ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted border border-border/40">
                <input
                  readOnly
                  value={`${window.location.origin}/voice-invite/${inviteCode}`}
                  className="flex-1 bg-transparent text-sm outline-none"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={copyInviteLink}
                  className="p-1.5 rounded-md hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy link"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={12} />
                  {inviteExpiresAt ? formatRemaining(inviteExpiresAt) : "—"}
                </span>
                <button
                  onClick={regenInvite}
                  className="text-xs text-primary hover:text-primary/80 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                >
                  <RefreshCw size={12} /> Regenerate (24h)
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
          )}

          <DialogFooter>
            <button
              onClick={() => setShowInvite(false)}
              className="px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted"
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kick/ban confirm */}
      <Dialog open={!!confirmKick} onOpenChange={(o) => !o && setConfirmKick(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmKick?.ban ? "Ban" : "Kick"} {confirmKick?.p.name}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmKick?.ban
              ? `${confirmKick?.p.name} will be removed and won't be able to rejoin via the invite link with this name.`
              : `${confirmKick?.p.name} will be removed from the channel. They can rejoin if they still have the invite link.`}
          </p>
          <DialogFooter>
            <button
              onClick={() => setConfirmKick(null)}
              className="px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => confirmKick && performKick(confirmKick.p, confirmKick.ban)}
              className="px-4 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium"
            >
              {confirmKick?.ban ? "Ban" : "Kick"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
