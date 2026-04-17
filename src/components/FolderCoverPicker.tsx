import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Image as ImageIcon, Link as LinkIcon, Loader2, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type FolderCover =
  | { type: "color"; value: string }
  | { type: "image"; value: string };

interface Props {
  folderId: string;
  cover: FolderCover | null;
  onChange: (cover: FolderCover | null) => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
  "linear-gradient(135deg, #f472b6 0%, #db2777 100%)",
  "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
  "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
  "linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)",
  "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)",
  "#1f2937",
  "#0f172a",
  "#ffffff",
  "#fde68a",
];

export function FolderCoverPicker({ folderId, cover, onChange, onClose }: Props) {
  const [tab, setTab] = useState<"color" | "upload" | "url">("color");
  const [urlInput, setUrlInput] = useState(cover?.type === "image" ? cover.value : "");
  const [uploading, setUploading] = useState(false);
  const [solidColor, setSolidColor] = useState(
    cover?.type === "color" && cover.value.startsWith("#") ? cover.value : "#10b981"
  );
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const apply = (next: FolderCover | null) => {
    onChange(next);
  };

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image (PNG, JPG, GIF, WebP)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image must be smaller than 10MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `covers/${folderId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("folder-files")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("folder-files")
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
      if (sErr || !signed?.signedUrl) throw sErr ?? new Error("No URL");
      apply({ type: "image", value: signed.signedUrl });
      toast.success("Cover updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ type: "spring", damping: 24, stiffness: 320 }}
      className="absolute right-0 top-full mt-2 z-30 w-72 glass-strong rounded-xl border border-border/50 shadow-xl p-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-foreground">Folder cover</div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 p-1 rounded-lg bg-muted/40">
        {[
          { id: "color" as const, label: "Color", Icon: Palette },
          { id: "upload" as const, label: "Upload", Icon: ImageIcon },
          { id: "url" as const, label: "URL", Icon: LinkIcon },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium px-2 py-1.5 rounded-md transition-colors ${
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "color" && (
          <motion.div
            key="color"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="grid grid-cols-4 gap-2 mb-3">
              {PRESET_COLORS.map((c) => {
                const isActive = cover?.type === "color" && cover.value === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => apply({ type: "color", value: c })}
                    className={`h-10 rounded-md border transition-all ${
                      isActive
                        ? "border-primary ring-2 ring-primary/40 scale-95"
                        : "border-border/30 hover:scale-105"
                    }`}
                    style={{ background: c }}
                    aria-label={`Use color ${c}`}
                  />
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Custom hex
              <input
                type="color"
                value={solidColor}
                onChange={(e) => {
                  setSolidColor(e.target.value);
                  apply({ type: "color", value: e.target.value });
                }}
                className="h-7 w-12 rounded cursor-pointer bg-transparent border border-border/40"
              />
              <input
                type="text"
                value={solidColor}
                onChange={(e) => setSolidColor(e.target.value)}
                onBlur={() => {
                  if (/^#[0-9a-fA-F]{6}$/.test(solidColor)) {
                    apply({ type: "color", value: solidColor });
                  }
                }}
                placeholder="#10b981"
                className="flex-1 px-2 py-1 text-xs rounded border border-border/40 bg-background outline-none focus:border-primary/50"
              />
            </label>
          </motion.div>
        )}

        {tab === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <label
              className={`flex flex-col items-center justify-center gap-2 h-28 border-2 border-dashed border-border/50 rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors ${
                uploading ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              {uploading ? (
                <Loader2 size={20} className="animate-spin text-primary" />
              ) : (
                <>
                  <ImageIcon size={20} className="text-muted-foreground" />
                  <span className="text-xs text-muted-foreground text-center px-2">
                    Click to choose an image or GIF
                    <br />
                    <span className="text-[10px] text-muted-foreground/70">
                      PNG, JPG, GIF, WebP · up to 10MB
                    </span>
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
            </label>
          </motion.div>
        )}

        {tab === "url" && (
          <motion.div
            key="url"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://media.giphy.com/...gif"
              className="w-full px-3 py-2 text-xs rounded-lg border border-border/40 bg-background outline-none focus:border-primary/50 mb-2"
            />
            <button
              type="button"
              onClick={() => {
                const v = urlInput.trim();
                if (!/^https?:\/\//i.test(v)) {
                  toast.error("Enter a valid http(s) URL");
                  return;
                }
                apply({ type: "image", value: v });
              }}
              className="w-full px-3 py-1.5 rounded-lg gradient-accent text-white text-xs font-medium"
            >
              Use this image
            </button>
            <p className="text-[10px] text-muted-foreground/70 mt-2">
              Paste a direct image or GIF link (e.g. from Giphy or Tenor).
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {cover && (
        <button
          type="button"
          onClick={() => apply(null)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-md py-1.5 transition-colors"
        >
          <Trash2 size={12} /> Remove cover
        </button>
      )}
    </motion.div>
  );
}
