import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type Participant,
  type RemoteTrack,
  type RemoteAudioTrack,
} from "livekit-client";
import { Mic, MicOff, Headphones, PhoneOff, Users, Volume2, LogIn, Sparkles } from "lucide-react";
import { toast, Toaster } from "sonner";
import { getLiveKitTokenForGuest } from "@/utils/livekit-guest.functions";
import {
  playJoinSound,
  playLeaveSound,
  playMuteSound,
  playUnmuteSound,
} from "@/lib/voice-sounds";

export const Route = createFileRoute("/voice-invite/$code")({
  head: () => ({
    meta: [{ title: "Join voice — invite" }],
  }),
  component: VoiceInvitePage,
});

interface ParticipantInfo {
  identity: string;
  name: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isGuest: boolean;
}

function VoiceInvitePage() {
  const { code } = Route.useParams();
  const [stage, setStage] = useState<"name" | "joining" | "in-room">("name");
  const [name, setName] = useState("");
  const [channelName, setChannelName] = useState<string>("");
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  // iOS Safari + some Android browsers block audio autoplay until a user
  // gesture happens AFTER the track is attached. We surface a tap prompt.
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const roomRef = useRef<Room | null>(null);

  const refreshParticipants = useCallback((r: Room) => {
    const list: ParticipantInfo[] = [];
    const collect = (p: Participant) => {
      const micPub = p.getTrackPublication(Track.Source.Microphone);
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        isMuted: micPub ? micPub.isMuted : true,
        isSpeaking: p.isSpeaking,
        isGuest: p.identity.startsWith("guest-"),
      });
    };
    collect(r.localParticipant);
    r.remoteParticipants.forEach(collect);
    setParticipants(list);
  }, []);

  // Attach a remote audio track in a way that mobile browsers will actually play.
  // - `playsinline` is required on iOS or playback is silently blocked.
  // - `autoplay` + explicit `play()` covers Android Chrome quirks.
  // - We keep the element in the DOM (not display:none on iOS — Safari has
  //   historically refused to play hidden <audio>; using visibility:hidden +
  //   zero size is safer).
  const attachRemoteAudio = useCallback((track: RemoteAudioTrack) => {
    const el = track.attach() as HTMLAudioElement;
    el.setAttribute("data-lk-audio", "1");
    el.autoplay = true;
    el.setAttribute("playsinline", "");
    (el as any).playsInline = true;
    el.controls = false;
    el.style.position = "fixed";
    el.style.width = "1px";
    el.style.height = "1px";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    el.play().catch(() => {
      // Autoplay was blocked — show the unlock UI so the user can tap.
      setNeedsAudioUnlock(true);
    });
  }, []);

  const unlockAudio = useCallback(async () => {
    try {
      await roomRef.current?.startAudio();
    } catch {
      /* ignore */
    }
    const audios = document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]");
    await Promise.all(
      Array.from(audios).map((a) => a.play().catch(() => undefined))
    );
    setNeedsAudioUnlock(false);
  }, []);

  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.querySelectorAll<HTMLAudioElement>("audio[data-lk-audio]").forEach((el) => {
      el.muted = isDeafened;
    });
  }, [isDeafened, participants.length]);

  const join = async () => {
    if (!name.trim()) {
      toast.error("Please enter your name");
      return;
    }
    setStage("joining");
    try {
      const { token, url, channelName: chName } = await getLiveKitTokenForGuest({
        data: { inviteCode: code, participantName: name.trim() },
      });
      setChannelName(chName);

      const room = new Room({ adaptiveStream: true, dynacast: true });
      const id = "lk-conn-status";
      room
        .on(RoomEvent.ConnectionStateChanged, (state) => {
          if (state === ConnectionState.Connecting)
            toast.loading("Connecting…", { id });
          else if (state === ConnectionState.Reconnecting)
            toast.loading("Reconnecting…", { id });
          else if (state === ConnectionState.Connected)
            toast.success("Connected", { id, duration: 1500 });
          else if (state === ConnectionState.Disconnected) toast.dismiss(id);
        })
        .on(RoomEvent.Disconnected, (reason) => {
          // Likely kicked
          if (reason !== undefined) {
            toast.error("You were removed from the channel");
            setStage("name");
            roomRef.current = null;
          }
        })
        .on(RoomEvent.ParticipantConnected, () => refreshParticipants(room))
        .on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(room))
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            attachRemoteAudio(track as RemoteAudioTrack);
          }
          refreshParticipants(room);
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            (track as RemoteAudioTrack).detach().forEach((el) => el.remove());
          }
          refreshParticipants(room);
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => {
          // True when the browser has granted us permission to play audio.
          setNeedsAudioUnlock(!room.canPlaybackAudio);
        })
        .on(RoomEvent.TrackMuted, () => refreshParticipants(room))
        .on(RoomEvent.TrackUnmuted, () => refreshParticipants(room))
        .on(RoomEvent.ActiveSpeakersChanged, () => refreshParticipants(room));

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      try {
        await room.startAudio();
      } catch {
        /* will retry on next user gesture */
      }
      roomRef.current = room;
      refreshParticipants(room);
      playJoinSound();
      setStage("in-room");
    } catch (err: any) {
      toast.error(err?.message || "Could not join voice room");
      setStage("name");
    }
  };

  const leave = async () => {
    await roomRef.current?.disconnect();
    document.querySelectorAll("audio[data-lk-audio]").forEach((el) => el.remove());
    roomRef.current = null;
    setParticipants([]);
    playLeaveSound();
    setStage("name");
  };

  const toggleMute = async () => {
    const r = roomRef.current;
    if (!r) return;
    const next = !isMuted;
    await r.localParticipant.setMicrophoneEnabled(!next);
    setIsMuted(next);
    if (next) playMuteSound();
    else playUnmuteSound();
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Toaster position="top-center" />

      <header className="px-4 md:px-8 py-4 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 size={20} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Voice invite</span>
        </div>
        <Link
          to="/login"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <LogIn size={12} /> Have an account? Sign in
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <AnimatePresence mode="wait">
          {stage === "name" && (
            <motion.div
              key="name"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass p-8 max-w-md w-full text-center"
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/15 flex items-center justify-center">
                <Volume2 size={26} className="text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground mb-1">Join voice channel</h1>
              <p className="text-sm text-muted-foreground mb-4">
                You've been invited as a guest. Pick a name to join.
              </p>
              <div className="mb-4 rounded-lg border border-border/40 bg-muted/40 px-3 py-2.5 text-left">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Sparkles size={14} className="mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="text-foreground/90">You are joining as a guest — your name won't be saved.</p>
                    <Link to="/signup" className="mt-1 inline-flex items-center gap-1 text-primary hover:underline">
                      <LogIn size={12} /> Sign up to keep history
                    </Link>
                  </div>
                </div>
              </div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && join()}
                placeholder="Your display name"
                maxLength={32}
                className="w-full px-3 py-2.5 rounded-lg bg-muted border border-border/40 text-sm outline-none focus:ring-2 focus:ring-primary/40 mb-4"
              />
              <button
                onClick={join}
                className="w-full py-2.5 rounded-lg gradient-accent text-white text-sm font-medium"
              >
                Join voice
              </button>
            </motion.div>
          )}

          {stage === "joining" && (
            <motion.div
              key="joining"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <div className="w-10 h-10 mx-auto mb-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Joining…</p>
            </motion.div>
          )}

          {stage === "in-room" && (
            <motion.div
              key="room"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-2xl w-full"
            >
              <div className="flex items-center gap-2 mb-6">
                <Volume2 size={22} className="text-primary" />
                <h1 className="text-2xl font-bold text-foreground">{channelName}</h1>
                <span className="text-xs text-muted-foreground flex items-center gap-1 ml-2">
                  <Users size={12} /> {participants.length}
                </span>
              </div>

              <div className="glass p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  In voice — {participants.length}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {participants.map((p) => (
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
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate block">{p.name}</span>
                        {p.isGuest && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Guest
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {stage === "in-room" && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="glass-strong px-6 py-3 flex items-center gap-3 shadow-2xl">
              <div className="flex items-center gap-2 pr-3 border-r border-border/30">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm font-medium">{channelName}</span>
              </div>
              <button
                onClick={toggleMute}
                className={`p-2.5 rounded-xl transition-all ${
                  isMuted
                    ? "bg-destructive/20 text-destructive"
                    : "bg-muted/50 text-foreground hover:bg-muted"
                }`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
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
                onClick={leave}
                className="p-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all"
                title="Leave channel"
              >
                <PhoneOff size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
