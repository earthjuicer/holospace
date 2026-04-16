import { useEffect, useMemo, useState } from "react";
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
  /** Optional: pass the full list of files in the folder to enable prev/next navigation. */
  siblings?: PreviewFile[];
  /** Called when the user navigates to a sibling via arrows / keyboard. */
  onNavigate?: (next: PreviewFile) => void;
}

const BUCKET = "folder-files";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.25;

export function FilePreviewModal({ file, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1);

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

  // Close on Escape, zoom on +/-
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
      if (e.key === "-" || e.key === "_") setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
      if (e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  const [copied, setCopied] = useState(false);

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
            className="flex-1 overflow-auto flex items-center justify-center p-4"
            onClick={(e) => {
              // Click on backdrop (not on media) closes
              if (e.target === e.currentTarget) onClose();
            }}
          >
            {loading || !url ? (
              <Loader2 className="animate-spin text-primary" size={32} />
            ) : isImage ? (
              <img
                src={url}
                alt={file.file_name}
                onClick={(e) => e.stopPropagation()}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease-out",
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
