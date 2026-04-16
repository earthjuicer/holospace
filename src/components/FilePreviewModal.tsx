import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ZoomIn, ZoomOut, RotateCcw, Download, Loader2, Share2, Copy, Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PreviewFile {
  id: string;
  file_name: string;
  mime_type: string | null;
  storage_path: string;
  size_bytes: number;
}

interface Props {
  file: PreviewFile | null;
  onClose: () => void;
  /** Optional: full list of files in the folder, enables prev/next + swipe navigation. */
  siblings?: PreviewFile[];
  /** Called when the user navigates to a sibling via arrows / keyboard / swipe. */
  onNavigate?: (next: PreviewFile) => void;
}

const BUCKET = "folder-files";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.25;
// Minimum horizontal pixels for a swipe to count as a navigation gesture.
const SWIPE_THRESHOLD = 60;
// Max time (ms) for the gesture to count — prevents slow drags from triggering nav.
const SWIPE_MAX_MS = 600;

export function FilePreviewModal({ file, onClose, siblings, onNavigate }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  // Visual feedback while swiping (shifts the media + dims the off-screen direction).
  const [swipeDx, setSwipeDx] = useState(0);
  // One-time pulse hint on the prev/next arrows so first-time users notice them.
  const [showNavHint, setShowNavHint] = useState(false);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      setZoom(1);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setZoom(1);
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, 60 * 30)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          toast.error("Failed to load preview");
          onClose();
        } else {
          setUrl(data.signedUrl);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, onClose]);

  // Compute previous/next siblings (if a list was provided).
  const { prev, next, indexLabel } = useMemo(() => {
    if (!file || !siblings || siblings.length < 2) {
      return { prev: null as PreviewFile | null, next: null as PreviewFile | null, indexLabel: "" };
    }
    const idx = siblings.findIndex((s) => s.id === file.id);
    if (idx === -1) {
      return { prev: null as PreviewFile | null, next: null as PreviewFile | null, indexLabel: "" };
    }
    return {
      prev: idx > 0 ? siblings[idx - 1] : null,
      next: idx < siblings.length - 1 ? siblings[idx + 1] : null,
      indexLabel: `${idx + 1} / ${siblings.length}`,
    };
  }, [file, siblings]);

  const goPrev = () => {
    if (prev && onNavigate) {
      onNavigate(prev);
      setShowNavHint(false);
    }
  };
  const goNext = () => {
    if (next && onNavigate) {
      onNavigate(next);
      setShowNavHint(false);
    }
  };

  // Show the pulse hint exactly once per user when they open a multi-file folder.
  useEffect(() => {
    if (!file) return;
    const hasSiblings = !!siblings && siblings.length > 1;
    if (!hasSiblings) return;
    try {
      if (localStorage.getItem("preview-nav-hint-seen")) return;
      setShowNavHint(true);
      localStorage.setItem("preview-nav-hint-seen", "1");
      const t = setTimeout(() => setShowNavHint(false), 4500);
      return () => clearTimeout(t);
    } catch {
      // localStorage unavailable — silently skip the hint.
    }
  }, [file?.id, siblings?.length]);

  // Touch swipe gestures (mobile). Horizontal swipe > threshold navigates;
  // vertical-dominant swipes are ignored so page scroll/pinch still works.
  // We track on the content wrapper, but cancel if the gesture starts inside
  // a video/audio element so native media controls keep working.
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      touchStart.current = null;
      setSwipeDx(0);
      return;
    }
    // Don't intercept swipes on interactive media controls.
    const target = e.target as HTMLElement;
    if (target.closest("video, audio, button, a, input, [data-no-swipe]")) {
      touchStart.current = null;
      return;
    }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const start = touchStart.current;
    if (!start || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Only show drag feedback once horizontal motion clearly dominates.
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      // Resist swipes when there is no neighbour in that direction.
      const blocked = (dx > 0 && !prev) || (dx < 0 && !next);
      setSwipeDx(blocked ? dx * 0.2 : dx);
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    setSwipeDx(0);
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    if (dt > SWIPE_MAX_MS) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.6) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  // Mouse wheel / trackpad scroll navigates between files.
  // Throttled so a single flick doesn't skip multiple files. Ignored while
  // zoomed (so the wheel still scrolls inside a zoomed image/PDF).
  const wheelLock = useRef(0);
  const onWheel = (e: React.WheelEvent) => {
    if (zoom !== 1) return;
    if (!prev && !next) return;
    const now = Date.now();
    if (now - wheelLock.current < 350) return;
    // Use whichever axis is dominant — supports vertical wheels + horizontal trackpads.
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 20) return;
    wheelLock.current = now;
    if (delta > 0) goNext();
    else goPrev();
  };

  // Close on Escape, zoom on +/-, navigate with arrow keys.
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      if (e.key === "-" || e.key === "_") setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
      if (e.key === "0") setZoom(1);
      if (e.key === "ArrowLeft" && prev && onNavigate) onNavigate(prev);
      if (e.key === "ArrowRight" && next && onNavigate) onNavigate(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onClose, prev, next, onNavigate]);

  const download = async () => {
    if (!file || !url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const shareLink = async (expiresInSec: number, label: string) => {
    if (!file) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, expiresInSec);
    if (error || !data) {
      toast.error("Failed to create share link");
      return;
    }
    try {
      await navigator.clipboard.writeText(data.signedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(`Link copied · expires in ${label}`);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const nativeShare = async () => {
    if (!file || !url) return;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: file.file_name, url });
      } catch {
        // user cancelled — no toast
      }
    } else {
      shareLink(60 * 60 * 24, "24 hours");
    }
  };

  const mime = file?.mime_type ?? "";
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");
  const isPdf = mime.includes("pdf");
  const isText = mime.startsWith("text/");
  const canZoom = isImage || isPdf;

  // Animate the media follow-the-finger while swiping; snap back on release.
  const swipeStyle: React.CSSProperties = swipeDx
    ? { transform: `translateX(${swipeDx}px)`, transition: "none" }
    : { transform: "translateX(0)", transition: "transform 0.2s ease-out" };

  return (
    <AnimatePresence>
      {file && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col"
          onClick={onClose}
        >
          {/* Toolbar */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 bg-background/80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {file.file_name}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {file.mime_type ?? "Unknown type"}
                {canZoom && ` · ${Math.round(zoom * 100)}%`}
                {indexLabel && ` · ${indexLabel}`}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {canZoom && (
                <>
                  <button
                    onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))}
                    className="p-2 rounded-lg hover:bg-muted/60 text-foreground"
                    title="Zoom out (-)"
                    aria-label="Zoom out"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="p-2 rounded-lg hover:bg-muted/60 text-foreground"
                    title="Reset zoom (0)"
                    aria-label="Reset zoom"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))}
                    className="p-2 rounded-lg hover:bg-muted/60 text-foreground"
                    title="Zoom in (+)"
                    aria-label="Zoom in"
                  >
                    <ZoomIn size={16} />
                  </button>
                  <div className="w-px h-6 bg-border/60 mx-1" />
                </>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-2 rounded-lg hover:bg-muted/60 text-foreground"
                    title="Share"
                    aria-label="Share file"
                  >
                    {copied ? <Check size={16} className="text-primary" /> : <Share2 size={16} />}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuLabel>Share this file</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={nativeShare}>
                    <Share2 size={14} className="mr-2" /> Share via…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                    Copy link · expires in
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => shareLink(60 * 60, "1 hour")}>
                    <Copy size={14} className="mr-2" /> 1 hour
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareLink(60 * 60 * 24, "24 hours")}>
                    <Copy size={14} className="mr-2" /> 24 hours
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareLink(60 * 60 * 24 * 7, "7 days")}>
                    <Copy size={14} className="mr-2" /> 7 days
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                onClick={download}
                className="p-2 rounded-lg hover:bg-primary/10 text-primary"
                title="Download"
                aria-label="Download"
              >
                <Download size={16} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-muted/60 text-foreground"
                title="Close (Esc)"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-auto flex items-center justify-center p-4 relative touch-pan-y"
            onClick={(e) => {
              // Click on backdrop (not on media) closes
              if (e.target === e.currentTarget) onClose();
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
          >
            {/* Prev / Next navigation */}
            {prev && (
              <button
                data-no-swipe
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
                className={`absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-10 p-4 sm:p-5 rounded-full bg-background/85 hover:bg-background border border-border/50 text-foreground shadow-xl backdrop-blur transition-all hover:scale-110 active:scale-95 ${
                  showNavHint ? "ring-2 ring-primary/70 animate-pulse" : ""
                }`}
                title="Previous (←)"
                aria-label="Previous file"
              >
                <ChevronLeft size={28} strokeWidth={2.5} />
              </button>
            )}
            {next && (
              <button
                data-no-swipe
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                className={`absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-10 p-4 sm:p-5 rounded-full bg-background/85 hover:bg-background border border-border/50 text-foreground shadow-xl backdrop-blur transition-all hover:scale-110 active:scale-95 ${
                  showNavHint ? "ring-2 ring-primary/70 animate-pulse" : ""
                }`}
                title="Next (→)"
                aria-label="Next file"
              >
                <ChevronRight size={28} strokeWidth={2.5} />
              </button>
            )}
            {loading || !url ? (
              <Loader2 className="animate-spin text-primary" size={32} />
            ) : isImage ? (
              <img
                src={url}
                alt={file.file_name}
                onClick={(e) => e.stopPropagation()}
                style={{
                  ...swipeStyle,
                  transform: `${swipeStyle.transform ?? ""} scale(${zoom})`,
                  transformOrigin: "center center",
                }}
                className="max-w-full max-h-full object-contain select-none"
                draggable={false}
              />
            ) : isVideo ? (
              <video
                src={url}
                controls
                autoPlay
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full"
              />
            ) : isAudio ? (
              <audio
                src={url}
                controls
                autoPlay
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md"
              />
            ) : isPdf ? (
              <iframe
                src={url}
                title={file.file_name}
                onClick={(e) => e.stopPropagation()}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center",
                  transition: "transform 0.15s ease-out",
                }}
                className="w-full h-full max-w-5xl bg-white rounded-lg"
              />
            ) : isText ? (
              <iframe
                src={url}
                title={file.file_name}
                onClick={(e) => e.stopPropagation()}
                className="w-full h-full max-w-5xl bg-white rounded-lg"
              />
            ) : (
              <div
                className="glass p-8 text-center max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-foreground font-medium mb-2">
                  Preview not available
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  This file type can't be previewed in the browser.
                </p>
                <button
                  onClick={download}
                  className="pill-button gradient-accent text-white inline-flex items-center gap-1.5"
                >
                  <Download size={14} /> Download instead
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
