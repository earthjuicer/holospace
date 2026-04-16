import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
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
  const [muted, setMuted] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;
    const stream = new MediaStream();
    stream.addTrack(share.videoTrack);
    if (share.audioTrack) stream.addTrack(share.audioTrack);
    videoRef.current.srcObject = stream;
  }, [share.videoTrack, share.audioTrack]);

  const toggleFullscreen = async () => {
    if (!videoRef.current) return;
    if (!document.fullscreenElement) {
      await videoRef.current.requestFullscreen();
      setFullscreen(true);
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
              onClick={() => setMuted(!muted)}
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
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full aspect-video bg-black object-contain"
      />
    </div>
  );
}
