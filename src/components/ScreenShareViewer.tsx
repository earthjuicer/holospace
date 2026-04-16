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
  // Start muted so iOS/Android allow inline autoplay. User can unmute on tap.
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  // True if the browser blocked autoplay and we need a user gesture to start.
  const [needsTap, setNeedsTap] = useState(false);

  // Attach LiveKit tracks to the <video> element using LiveKit's helpers when
  // available. Track.attach() handles edge cases (codec, srcObject reuse,
  // re-attaching across track restarts) better than building a MediaStream
  // ourselves, which is the usual reason mobile shows a black frame.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const vTrack = share.videoTrack as unknown as {
      attach?: (el: HTMLMediaElement) => HTMLMediaElement;
      detach?: (el?: HTMLMediaElement) => HTMLMediaElement[] | HTMLMediaElement;
      mediaStreamTrack?: MediaStreamTrack;
    };
    const aTrack = share.audioTrack as unknown as {
      attach?: (el: HTMLMediaElement) => HTMLMediaElement;
      detach?: (el?: HTMLMediaElement) => HTMLMediaElement[] | HTMLMediaElement;
      mediaStreamTrack?: MediaStreamTrack;
    } | undefined;

    let usedAttach = false;

    try {
      if (typeof vTrack.attach === "function") {
        vTrack.attach(el);
        usedAttach = true;
      }
      if (aTrack && typeof aTrack.attach === "function") {
        aTrack.attach(el);
      }
    } catch {
      usedAttach = false;
    }

    if (!usedAttach) {
      // Fallback: build a MediaStream from the underlying MediaStreamTracks.
      const stream = new MediaStream();
      const v = vTrack.mediaStreamTrack ?? (share.videoTrack as unknown as MediaStreamTrack);
      if (v) stream.addTrack(v);
      const a = aTrack?.mediaStreamTrack;
      if (a) stream.addTrack(a);
      el.srcObject = stream;
    }

    // iOS Safari refuses to play a fresh stream until play() is invoked
    // explicitly; if it's still blocked (background tab, low-power mode),
    // surface a "Tap to play" overlay.
    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
      }
    };
    tryPlay();

    return () => {
      try {
        if (typeof vTrack.detach === "function") vTrack.detach(el);
        if (aTrack && typeof aTrack.detach === "function") aTrack.detach(el);
      } catch {
        // ignore
      }
      if (!usedAttach) {
        el.srcObject = null;
      }
    };
  }, [share.videoTrack, share.audioTrack]);

  const handleManualPlay = () => {
    const el = videoRef.current;
    if (!el) return;
    el.play()
      .then(() => setNeedsTap(false))
      .catch(() => {
        // As a last resort, force-mute and retry — muted inline video is
        // always allowed to autoplay on mobile.
        setMuted(true);
        el.muted = true;
        el.play().then(() => setNeedsTap(false)).catch(() => {});
      });
  };

  const toggleFullscreen = async () => {
    const el = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    }) | null;
    if (!el) return;
    // iOS Safari only supports fullscreen on the <video> element itself.
    if (typeof el.webkitEnterFullscreen === "function" && !document.fullscreenElement) {
      el.webkitEnterFullscreen();
      return;
    }
    if (!document.fullscreenElement) {
      try {
        await el.requestFullscreen();
        setFullscreen(true);
      } catch {
        // fullscreen may be unavailable in this context
      }
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <div className="glass rounded-xl overflow-hidden group relative">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <span className="text-xs font-medium text-foreground flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse shrink-0" />
          <span className="truncate">{share.participantName} is sharing</span>
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {share.audioTrack && (
            <button
              onClick={() => {
                const next = !muted;
                setMuted(next);
                if (videoRef.current) videoRef.current.muted = next;
              }}
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
        <video
          ref={videoRef}
          autoPlay
          playsInline
          {...({ "webkit-playsinline": "true" } as Record<string, string>)}
          muted={muted}
          controls={false}
          className="w-full aspect-video bg-black object-contain"
          onClick={() => {
            if (needsTap) handleManualPlay();
          }}
        />
        {needsTap && (
          <button
            onClick={handleManualPlay}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white"
            aria-label="Tap to play screen share"
          >
            <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
              <Play size={26} className="ml-0.5" />
            </div>
            <span className="text-sm font-medium">Tap to play</span>
          </button>
        )}
      </div>
    </div>
  );
}
