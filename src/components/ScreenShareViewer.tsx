import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Maximize2, Minimize2, Volume2, VolumeX, Play } from "lucide-react";
import type { ScreenShareTrackInfo } from "@/hooks/use-livekit-room";

interface Props {
  shares: ScreenShareTrackInfo[];
}

export function ScreenShareViewer({ shares }: Props) {
  if (shares.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`grid gap-3 mb-4 ${
        shares.length === 1
          ? "grid-cols-1"
          : shares.length === 2
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
      }`}
    >
      {shares.map((share) => (
        <ScreenShareTile key={share.participantId} share={share} />
      ))}
    </motion.div>
  );
}

function ScreenShareTile({ share }: { share: ScreenShareTrackInfo }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Separate hidden <audio> element for screen share audio.
  // Keeping audio on its own element avoids the browser muting the video
  // element when it auto-plays — the video can be muted (required for
  // autoplay policy) while audio plays freely.
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  // ── VIDEO track ────────────────────────────────────────────────────────────
  // Attach only the video track to the <video> element.
  // We MUST keep the video element muted so the browser allows autoplay.
  // Audio is handled separately below.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const vTrack = share.videoTrack as unknown as {
      attach?: (el: HTMLMediaElement) => HTMLMediaElement;
      detach?: (el?: HTMLMediaElement) => void;
      mediaStreamTrack?: MediaStreamTrack;
    };

    let usedAttach = false;
    try {
      if (typeof vTrack.attach === "function") {
        vTrack.attach(el);
        usedAttach = true;
      }
    } catch {
      usedAttach = false;
    }

    if (!usedAttach) {
      const stream = new MediaStream();
      const v = vTrack.mediaStreamTrack ?? (share.videoTrack as unknown as MediaStreamTrack);
      if (v) stream.addTrack(v);
      // Do NOT add the audio track here — it goes on the separate <audio> element
      el.srcObject = stream;
    }

    el.muted = true; // Always mute video element — audio is on <audio>
    el.play().catch(() => setNeedsTap(true));

    return () => {
      try {
        if (typeof vTrack.detach === "function") vTrack.detach(el);
      } catch { /* ignore */ }
      if (!usedAttach) el.srcObject = null;
    };
  }, [share.videoTrack]);

  // ── AUDIO track ────────────────────────────────────────────────────────────
  // Attach screen share audio to a SEPARATE <audio> element.
  // This is the key fix — browsers allow audio to play on an <audio> element
  // even when the corresponding <video> is muted for autoplay.
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !share.audioTrack) {
      setAudioReady(false);
      return;
    }

    const aTrack = share.audioTrack as unknown as {
      attach?: (el: HTMLMediaElement) => HTMLMediaElement;
      detach?: (el?: HTMLMediaElement) => void;
      mediaStreamTrack?: MediaStreamTrack;
    };

    let usedAttach = false;
    try {
      if (typeof aTrack.attach === "function") {
        aTrack.attach(audioEl);
        usedAttach = true;
      }
    } catch {
      usedAttach = false;
    }

    if (!usedAttach) {
      const stream = new MediaStream();
      const a = aTrack.mediaStreamTrack ?? (share.audioTrack as unknown as MediaStreamTrack);
      if (a) stream.addTrack(a);
      audioEl.srcObject = stream;
    }

    audioEl.muted = muted;
    audioEl.volume = 1.0;

    audioEl
      .play()
      .then(() => setAudioReady(true))
      .catch(() => {
        // Autoplay blocked — user needs to interact first.
        // We'll retry on next user gesture (handled by handleManualPlay).
        setAudioReady(false);
      });

    setAudioReady(true);

    return () => {
      try {
        if (typeof aTrack.detach === "function") aTrack.detach(audioEl);
      } catch { /* ignore */ }
      if (!usedAttach) audioEl.srcObject = null;
      setAudioReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share.audioTrack]);

  // Sync muted state to the audio element whenever the toggle changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  const handleManualPlay = () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.play().then(() => setNeedsTap(false)).catch(() => {});
    }
    if (audio) {
      audio.muted = false;
      audio.play().then(() => setAudioReady(true)).catch(() => {});
      setMuted(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };

  const toggleFullscreen = async () => {
    const el = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    }) | null;
    if (!el) return;
    if (typeof el.webkitEnterFullscreen === "function" && !document.fullscreenElement) {
      el.webkitEnterFullscreen();
      return;
    }
    if (!document.fullscreenElement) {
      try {
        await el.requestFullscreen();
        setFullscreen(true);
      } catch { /* fullscreen unavailable */ }
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  };

  const hasAudio = !!share.audioTrack;

  return (
    <div className="glass rounded-xl overflow-hidden group relative">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <span className="text-xs font-medium text-foreground flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
          <span className="truncate">{share.participantName} is sharing</span>
          {hasAudio && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              audioReady && !muted
                ? "bg-green-500/20 text-green-600 dark:text-green-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {muted ? "🔇 muted" : audioReady ? "🔊 audio" : "⚠ no audio"}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {hasAudio && (
            <button
              onClick={toggleMute}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title={muted ? "Unmute share audio" : "Mute share audio"}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Fullscreen"
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Video element — always muted so autoplay works */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          controls={false}
          className="w-full aspect-video bg-black object-contain"
          onClick={() => { if (needsTap) handleManualPlay(); }}
        />

        {/* Separate hidden audio element for screen share audio */}
        {/* This is the fix: audio on its own element plays even when video is muted */}
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          muted={muted}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />

        {(needsTap || (!audioReady && hasAudio)) && (
          <button
            onClick={handleManualPlay}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white"
            aria-label="Tap to play screen share"
          >
            <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
              <Play size={26} className="ml-0.5" />
            </div>
            <span className="text-sm font-medium">
              {needsTap ? "Tap to play" : "Tap to enable audio"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
