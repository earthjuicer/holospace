import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MonitorUp, Settings2, X } from "lucide-react";
import {
  QUALITY_PRESETS,
  type ScreenShareQuality,
  type ScreenShareFps,
} from "@/hooks/use-screen-share";

interface ScreenShareSettings {
  quality: ScreenShareQuality;
  fps: ScreenShareFps;
  includeAudio: boolean;
  cursor: "always" | "motion" | "never";
}

interface Props {
  isSharing: boolean;
  stream: MediaStream | null;
  onStart: (opts: ScreenShareSettings) => void;
  onStop: () => void;
}

const STORAGE_KEY = "voice_screen_share_settings";

const DEFAULT_SETTINGS: ScreenShareSettings = {
  quality: "1080p",
  fps: 30,
  includeAudio: true,
  cursor: "always",
};

function loadSettings(): ScreenShareSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function ScreenShareControls({ isSharing, stream, onStart, onStop }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ScreenShareSettings>(DEFAULT_SETTINGS);
  const [showPreview, setShowPreview] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleClick = () => {
    if (isSharing) {
      onStop();
    } else {
      onStart(settings);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          onClick={handleClick}
          className={`p-2.5 rounded-xl transition-all ${
            isSharing
              ? "bg-primary/20 text-primary"
              : "bg-muted/50 text-foreground hover:bg-muted"
          }`}
          title={isSharing ? "Stop sharing" : "Share screen"}
        >
          <MonitorUp size={18} />
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          title="Screen share settings"
        >
          <Settings2 size={16} />
        </button>
      </div>

      {/* Local preview */}
      <AnimatePresence>
        {isSharing && stream && showPreview && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed bottom-[160px] md:bottom-28 right-4 z-50 w-64 md:w-80 glass-strong rounded-xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
              <span className="text-xs font-medium text-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                You're sharing
              </span>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X size={12} />
              </button>
            </div>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full aspect-video bg-black object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings dialog */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-strong rounded-2xl p-6 max-w-md w-full"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <MonitorUp size={20} className="text-primary" />
                  Screen Share Settings
                </h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5">
                {/* Quality */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                    Resolution
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(QUALITY_PRESETS) as ScreenShareQuality[]).map((q) => (
                      <button
                        key={q}
                        onClick={() => setSettings((s) => ({ ...s, quality: q }))}
                        className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                          settings.quality === q
                            ? "gradient-accent text-white"
                            : "bg-muted/40 text-foreground hover:bg-muted"
                        }`}
                      >
                        <div>{QUALITY_PRESETS[q].label}</div>
                        <div
                          className={`text-[10px] ${
                            settings.quality === q ? "text-white/70" : "text-muted-foreground"
                          }`}
                        >
                          {QUALITY_PRESETS[q].width}×{QUALITY_PRESETS[q].height}
                        </div>
                      </button>
                    ))}
                  </div>
                  {settings.quality === "4k" && (
                    <p className="text-[11px] text-destructive mt-2">
                      ⚠ 4K requires a high-DPI display & strong upload bandwidth
                    </p>
                  )}
                </div>

                {/* FPS */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                    Frame Rate
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([15, 30, 60] as ScreenShareFps[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setSettings((s) => ({ ...s, fps: f }))}
                        className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                          settings.fps === f
                            ? "gradient-accent text-white"
                            : "bg-muted/40 text-foreground hover:bg-muted"
                        }`}
                      >
                        {f} fps
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    {settings.fps === 60 ? "Smooth — best for gaming/video" : settings.fps === 30 ? "Balanced — best for most content" : "Low bandwidth — best for static content"}
                  </p>
                </div>

                {/* Cursor */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block uppercase tracking-wide">
                    Cursor
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["always", "motion", "never"] as const).map((c) => (
                      <button
                        key={c}
                        onClick={() => setSettings((s) => ({ ...s, cursor: c }))}
                        className={`px-3 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                          settings.cursor === c
                            ? "gradient-accent text-white"
                            : "bg-muted/40 text-foreground hover:bg-muted"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audio toggle */}
                <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/60 transition-all">
                  <div>
                    <div className="text-sm font-medium text-foreground">Share system audio</div>
                    <div className="text-[11px] text-muted-foreground">Stream sound from the shared tab/screen</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.includeAudio}
                    onChange={(e) => setSettings((s) => ({ ...s, includeAudio: e.target.checked }))}
                    className="w-5 h-5 accent-primary"
                  />
                </label>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-muted/40 hover:bg-muted text-foreground text-sm font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowSettings(false);
                    if (!isSharing) onStart(settings);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl gradient-accent text-white text-sm font-medium"
                >
                  {isSharing ? "Save" : "Start sharing"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
