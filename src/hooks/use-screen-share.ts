import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

export type ScreenShareQuality = "720p" | "1080p" | "1440p" | "4k";
export type ScreenShareFps = 15 | 30 | 60;

interface QualityPreset {
  width: number;
  height: number;
  label: string;
}

export const QUALITY_PRESETS: Record<ScreenShareQuality, QualityPreset> = {
  "720p": { width: 1280, height: 720, label: "720p HD" },
  "1080p": { width: 1920, height: 1080, label: "1080p Full HD" },
  "1440p": { width: 2560, height: 1440, label: "1440p QHD" },
  "4k": { width: 3840, height: 2160, label: "4K Ultra HD" },
};

interface UseScreenShareOptions {
  quality: ScreenShareQuality;
  fps: ScreenShareFps;
  includeAudio: boolean;
  cursor: "always" | "motion" | "never";
}

export function useScreenShare() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const startShare = useCallback(async (opts: UseScreenShareOptions) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Screen sharing not supported in this browser");
      return null;
    }

    const preset = QUALITY_PRESETS[opts.quality];

    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: preset.width, max: preset.width },
          height: { ideal: preset.height, max: preset.height },
          frameRate: { ideal: opts.fps, max: opts.fps },
          // @ts-ignore — cursor is a valid DisplayMediaStreamOptions field
          cursor: opts.cursor,
        },
        audio: opts.includeAudio
          ? {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              // @ts-ignore — high-quality audio hints
              sampleRate: 48000,
              channelCount: 2,
            }
          : false,
      });

      // Detect when user clicks browser "Stop sharing" button
      mediaStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopShare();
      });

      setStream(mediaStream);
      streamRef.current = mediaStream;
      setIsSharing(true);

      const track = mediaStream.getVideoTracks()[0];
      const settings = track?.getSettings();
      toast.success(`Sharing at ${settings?.width}×${settings?.height} @ ${settings?.frameRate?.toFixed(0)}fps`);

      return mediaStream;
    } catch (err: any) {
      if (err.name !== "NotAllowedError") {
        toast.error(err.message || "Could not start screen share");
      }
      return null;
    }
  }, []);

  const stopShare = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setIsSharing(false);
  }, []);

  return { stream, isSharing, startShare, stopShare };
}
