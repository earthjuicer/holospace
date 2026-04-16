import { useState, useEffect } from "react";
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
}

interface Props {
  isSharing: boolean;
  onStart: (opts: { width: number; height: number; fps: number; audio: boolean }) => void;
  onStop: () => void;
}

const STORAGE_KEY = "voice_screen_share_settings";

const DEFAULT_SETTINGS: ScreenShareSettings = {
  quality: "1080p",
  fps: 30,
  includeAudio: true,
};

function loadSettings(): ScreenShareSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function ScreenShareControls({ isSharing, onStart, onStop }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ScreenShareSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const fireStart = (s: ScreenShareSettings) => {
    const preset = QUALITY_PRESETS[s.quality];
    onStart({
      width: preset.width,
      height: preset.height,
      fps: s.fps,
      audio: s.includeAudio,
    });
  };

  const handleClick = () => {
    if (isSharing) onStop();
    else fireStart(settings);
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
                      ⚠ 4K requires a high-DPI display & strong upload bandwidth (8+ Mbps)
                    </p>
                  )}
                </div>

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
                    {settings.fps === 60
                      ? "Smooth — best for gaming/video"
                      : settings.fps === 30
                        ? "Balanced — best for most content"
                        : "Low bandwidth — best for static content"}
                  </p>
                </div>

                <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 cursor-pointer hover:bg-muted/60 transition-all">
                  <div>
                    <div className="text-sm font-medium text-foreground">Share system audio</div>
                    <div className="text-[11px] text-muted-foreground">
                      Stream sound from the shared tab/screen
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.includeAudio}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, includeAudio: e.target.checked }))
                    }
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
                    if (!isSharing) fireStart(settings);
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
