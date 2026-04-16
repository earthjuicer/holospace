import { useEffect, useRef, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  LocalParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  RemoteAudioTrack,
  Participant,
  ConnectionState,
  ScreenShareCaptureOptions,
} from "livekit-client";
import { getLiveKitToken } from "@/utils/livekit.functions";
import { toast } from "sonner";

export interface ScreenShareTrackInfo {
  participantId: string;
  participantName: string;
  videoTrack: MediaStreamTrack;
  audioTrack?: MediaStreamTrack;
}

export interface VoiceParticipantInfo {
  identity: string;
  name: string;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  isGuest: boolean;
}

export function useLiveKitRoom() {
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  );
  const [participants, setParticipants] = useState<VoiceParticipantInfo[]>([]);
  const [screenShares, setScreenShares] = useState<ScreenShareTrackInfo[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  // Mobile browsers (especially iOS Safari) often block autoplay until the
  // user taps after the track is attached. UI can show a "Tap to enable audio"
  // prompt + call unlockAudio() from a click handler.
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const roomRef = useRef<Room | null>(null);

  const refreshParticipants = useCallback((r: Room) => {
    const list: VoiceParticipantInfo[] = [];
    const collect = (p: Participant, isLocal: boolean) => {
      const micPub = p.getTrackPublication(Track.Source.Microphone);
      const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
      list.push({
        identity: p.identity,
        name: p.name || p.identity,
        isLocal,
        isMuted: micPub ? micPub.isMuted : true,
        isSpeaking: p.isSpeaking,
        isScreenSharing: !!screenPub && !screenPub.isMuted,
        isGuest: p.identity.startsWith("guest-"),
      });
    };
    collect(r.localParticipant, true);
    r.remoteParticipants.forEach((p) => collect(p, false));
    setParticipants(list);
  }, []);

  const refreshScreenShares = useCallback((r: Room) => {
    const list: ScreenShareTrackInfo[] = [];

    const addShare = (p: Participant) => {
      const videoPub = p.getTrackPublication(Track.Source.ScreenShare);
      const audioPub = p.getTrackPublication(Track.Source.ScreenShareAudio);
      const videoTrack = videoPub?.track?.mediaStreamTrack;
      if (videoPub && !videoPub.isMuted && videoTrack) {
        list.push({
          participantId: p.identity,
          participantName: p.name || p.identity,
          videoTrack,
          audioTrack: audioPub?.track?.mediaStreamTrack,
        });
      }
    };

    addShare(r.localParticipant);
    r.remoteParticipants.forEach(addShare);
    setScreenShares(list);
  }, []);

  const connect = useCallback(
    async (roomName: string, participantName: string) => {
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }

      try {
        const { token, url } = await getLiveKitToken({
          data: { roomName, participantName },
        });

        const newRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          publishDefaults: {
            simulcast: true,
            // Allow high-quality screen share
            screenShareEncoding: {
              maxBitrate: 8_000_000, // 8 Mbps for 4K
              maxFramerate: 60,
            },
          },
        });

        newRoom
          .on(RoomEvent.ConnectionStateChanged, (state) => {
            setConnectionState(state);
          })
          .on(RoomEvent.ParticipantConnected, () => {
            refreshParticipants(newRoom);
          })
          .on(RoomEvent.ParticipantDisconnected, () => {
            refreshParticipants(newRoom);
            refreshScreenShares(newRoom);
          })
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
            // Attach remote audio so participants can actually hear each other.
            // LiveKit does NOT auto-play remote audio — we must attach it to a DOM element.
            // Mobile (iOS Safari, some Android Chrome) requires playsinline +
            // autoplay + an explicit play() call, and refuses display:none audio.
            if (track.kind === Track.Kind.Audio) {
              const el = (track as RemoteAudioTrack).attach() as HTMLAudioElement;
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
              el.play().catch(() => setNeedsAudioUnlock(true));
            }
            refreshScreenShares(newRoom);
            refreshParticipants(newRoom);
          })
          .on(RoomEvent.AudioPlaybackStatusChanged, () => {
            setNeedsAudioUnlock(!newRoom.canPlaybackAudio);
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Audio) {
              (track as RemoteAudioTrack).detach().forEach((el) => el.remove());
            }
            refreshScreenShares(newRoom);
            refreshParticipants(newRoom);
          })
          .on(RoomEvent.TrackPublished, () => {
            refreshScreenShares(newRoom);
            refreshParticipants(newRoom);
          })
          .on(RoomEvent.TrackUnpublished, () => {
            refreshScreenShares(newRoom);
            refreshParticipants(newRoom);
          })
          .on(RoomEvent.TrackMuted, () => {
            refreshScreenShares(newRoom);
            refreshParticipants(newRoom);
          })
          .on(RoomEvent.TrackUnmuted, () => {
            refreshScreenShares(newRoom);
            refreshParticipants(newRoom);
          })
          .on(RoomEvent.LocalTrackPublished, () => {
            refreshScreenShares(newRoom);
            refreshParticipants(newRoom);
            const screenPub = newRoom.localParticipant.getTrackPublication(
              Track.Source.ScreenShare
            );
            setIsSharing(!!screenPub && !screenPub.isMuted);
          })
          .on(RoomEvent.LocalTrackUnpublished, () => {
            refreshScreenShares(newRoom);
            refreshParticipants(newRoom);
            const screenPub = newRoom.localParticipant.getTrackPublication(
              Track.Source.ScreenShare
            );
            setIsSharing(!!screenPub && !screenPub.isMuted);
          })
          .on(RoomEvent.ActiveSpeakersChanged, () => {
            refreshParticipants(newRoom);
          });

        await newRoom.connect(url, token);
        await newRoom.localParticipant.setMicrophoneEnabled(true);
        // Required by some browsers (Safari, mobile Chrome) before remote audio plays.
        try {
          await newRoom.startAudio();
        } catch {
          /* user gesture wasn't enough — they may need to click again */
        }

        roomRef.current = newRoom;
        setRoom(newRoom);
        setIsMuted(false);
        refreshParticipants(newRoom);
        refreshScreenShares(newRoom);

        return newRoom;
      } catch (err: any) {
        toast.error(err?.message || "Failed to join voice room");
        throw err;
      }
    },
    [refreshParticipants, refreshScreenShares]
  );

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    // Remove any audio elements we attached
    document.querySelectorAll("audio[data-lk-audio]").forEach((el) => el.remove());
    setRoom(null);
    setParticipants([]);
    setScreenShares([]);
    setIsSharing(false);
    setIsMuted(false);
    setConnectionState(ConnectionState.Disconnected);
  }, []);

  const toggleMute = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return false;
    const next = !isMuted;
    await r.localParticipant.setMicrophoneEnabled(!next);
    setIsMuted(next);
    return next;
  }, [isMuted]);

  const startScreenShare = useCallback(
    async (opts: {
      width: number;
      height: number;
      fps: number;
      audio: boolean;
    }) => {
      const r = roomRef.current;
      if (!r) {
        toast.error("Not connected to a voice room");
        return;
      }
      try {
        const captureOptions: ScreenShareCaptureOptions = {
          audio: opts.audio,
          resolution: {
            width: opts.width,
            height: opts.height,
            frameRate: opts.fps,
          },
          // High-quality content hint
          contentHint: opts.fps >= 60 ? "motion" : "detail",
        };
        await r.localParticipant.setScreenShareEnabled(true, captureOptions);
        setIsSharing(true);

        // Auto-stop detection: when user clicks browser "stop sharing"
        const screenPub = r.localParticipant.getTrackPublication(Track.Source.ScreenShare);
        const track = screenPub?.track?.mediaStreamTrack;
        track?.addEventListener("ended", async () => {
          await r.localParticipant.setScreenShareEnabled(false);
          setIsSharing(false);
        });

        toast.success(`Sharing at ${opts.width}×${opts.height} @ ${opts.fps}fps`);
      } catch (err: any) {
        if (err?.name !== "NotAllowedError") {
          toast.error(err?.message || "Could not start screen share");
        }
      }
    },
    []
  );

  const stopScreenShare = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    await r.localParticipant.setScreenShareEnabled(false);
    setIsSharing(false);
  }, []);

  // Per-participant volume (0.0 to 1.0+). Local participant adjusts via the
  // hidden <audio> element since RemoteParticipant.setVolume isn't applicable.
  const setParticipantVolume = useCallback(
    (identity: string, volume: number) => {
      const r = roomRef.current;
      if (!r) return;
      const remote = r.remoteParticipants.get(identity);
      if (remote) {
        remote.setVolume(volume);
      }
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  return {
    room,
    connectionState,
    isConnected: connectionState === ConnectionState.Connected,
    participants,
    screenShares,
    isMuted,
    isSharing,
    connect,
    disconnect,
    toggleMute,
    startScreenShare,
    stopScreenShare,
    setParticipantVolume,
  };
}
