import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload, File as FileIcon, Image as ImageIcon, Video, Music,
  FileText, Download, Trash2, Loader2, X, LayoutGrid, List as ListIcon,
} from "lucide-react";
import { toast } from "sonner";
import { uploadResumable } from "@/lib/resumable-upload";
import { FilePreviewModal, type PreviewFile } from "./FilePreviewModal";

interface InFlightUpload {
  id: string;
  name: string;
  size: number;
  pct: number;
  cancel?: () => void;
}

export interface FolderFile {
  id: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
}

interface Props {
  folderId: string;
  /** if set, uploads/lists go through public share token (anon mode) */
  shareToken?: string;
  /** owner can delete; share visitors cannot */
  canDelete?: boolean;
  /** if true, automatically opens the file picker on mount (used by ?upload=1) */
  autoOpenUpload?: boolean;
}

const BUCKET = "folder-files";

function fileIcon(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("video/")) return Video;
  if (mime.startsWith("audio/")) return Music;
  if (mime.startsWith("text/") || mime.includes("pdf")) return FileText;
  return FileIcon;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function FolderFiles({ folderId, shareToken, canDelete = false, autoOpenUpload = false }: Props) {
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<Record<string, InFlightUpload>>({});
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoOpenedRef = useRef(false);

  // When the page is opened with ?upload=1, pop the OS file picker once.
  useEffect(() => {
    if (autoOpenUpload && !autoOpenedRef.current && inputRef.current) {
      autoOpenedRef.current = true;
      // Slight delay so the picker opens after the page settles
      const t = setTimeout(() => inputRef.current?.click(), 250);
      return () => clearTimeout(t);
    }
  }, [autoOpenUpload]);

  const load = async () => {
    setLoading(true);
    if (shareToken) {
      const { data, error } = await supabase.rpc("list_share_files", { _token: shareToken });
      if (!error && data) setFiles(data as FolderFile[]);
    } else {
      const { data } = await supabase
        .from("folder_files")
        .select("id, file_name, size_bytes, mime_type, storage_path, created_at")
        .eq("folder_id", folderId)
        .order("created_at", { ascending: false });
      if (data) setFiles(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Anonymous share-token visitors can't use realtime — skip subscription.
    if (shareToken) return;

    let t: ReturnType<typeof setTimeout> | null = null;
    const sub = supabase
      .channel(`folder-files-${folderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "folder_files",
          filter: `folder_id=eq.${folderId}`,
        },
        () => {
          if (t) clearTimeout(t);
          t = setTimeout(load, 200);
        }
      )
      .subscribe();

    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, shareToken]);

  const patchUpload = (id: string, patch: Partial<InFlightUpload>) =>
    setUploads((u) => (u[id] ? { ...u, [id]: { ...u[id], ...patch } } : u));

  const removeUpload = (id: string) =>
    setUploads((u) => {
      const next = { ...u };
      delete next[id];
      return next;
    });

  const uploadFiles = async (fileList: FileList) => {
    for (const file of Array.from(fileList)) {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setUploads((u) => ({
        ...u,
        [id]: { id, name: file.name, size: file.size, pct: 0 },
      }));
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${folderId}/${crypto.randomUUID()}-${safeName}`;
      const RESUMABLE_THRESHOLD = 6 * 1024 * 1024; // 6 MB — standard upload caps around 50MB

      try {
        if (file.size > RESUMABLE_THRESHOLD) {
          // TUS resumable upload — required for files larger than ~50 MB,
          // and gives us per-chunk progress + cancellation.
          await uploadResumable({
            file,
            path,
            onProgress: (pct) => patchUpload(id, { pct }),
            onStart: (cancel) => patchUpload(id, { cancel }),
          });
        } else {
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
          if (upErr) throw upErr;
          patchUpload(id, { pct: 100 });
        }

        if (shareToken) {
          const { error: rpcErr } = await supabase.rpc("add_share_file", {
            _token: shareToken,
            _storage_path: path,
            _file_name: file.name,
            _size_bytes: file.size,
            _mime_type: file.type || "application/octet-stream",
          });
          if (rpcErr) throw rpcErr;
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          const { error: insErr } = await supabase.from("folder_files").insert({
            folder_id: folderId,
            storage_path: path,
            file_name: file.name,
            size_bytes: file.size,
            mime_type: file.type || undefined,
            uploaded_by: user?.id ?? undefined,
          });
          if (insErr) throw insErr;
        }

        toast.success(`Uploaded ${file.name}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        if (msg === "cancelled") {
          toast.info(`Cancelled ${file.name}`);
        } else {
          toast.error(`${file.name}: ${msg}`);
        }
      } finally {
        removeUpload(id);
      }
    }
    load();
  };

  const download = async (f: FolderFile) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(f.storage_path, 60 * 10);
    if (error || !data) {
      toast.error("Failed to generate download link");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = f.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const remove = async (f: FolderFile) => {
    if (!confirm(`Delete ${f.file_name}?`)) return;
    await supabase.storage.from(BUCKET).remove([f.storage_path]);
    await supabase.from("folder_files").delete().eq("id", f.id);
    toast.success("Deleted");
    load();
  };

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        className="glass border-2 border-dashed border-border/40 p-6 text-center mb-4 cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={28} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-foreground font-medium">
          Drop files or click to upload
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Images, videos, recordings, anything up to 5 GB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && uploadFiles(e.target.files)}
        />
      </div>

      <AnimatePresence>
        {Object.values(uploads).map((u) => {
          const done = u.pct >= 100;
          return (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="glass p-3 mb-2"
            >
              <div className="flex items-center gap-3">
                <Loader2 size={16} className="animate-spin text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {u.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatBytes(Math.round((u.size * u.pct) / 100))} of{" "}
                    {formatBytes(u.size)}
                    {done && " · finalizing…"}
                  </div>
                </div>
                <span className="text-xs font-medium text-foreground tabular-nums shrink-0 w-10 text-right">
                  {u.pct}%
                </span>
                {u.cancel && !done && (
                  <button
                    onClick={u.cancel}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Cancel upload"
                    aria-label={`Cancel upload of ${u.name}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={false}
                  animate={{ width: `${u.pct}%` }}
                  transition={{ ease: "easeOut", duration: 0.2 }}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>
      ) : files.length === 0 ? (
        <div className="glass p-8 text-center">
          <FileIcon size={32} className="mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">No files yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => {
            const Icon = fileIcon(f.mime_type);
            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setPreviewFile(f)}
                className="glass p-3 flex items-center gap-3 group cursor-pointer hover:bg-muted/30 transition-colors"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPreviewFile(f);
                  }
                }}
                aria-label={`Preview ${f.file_name}`}
              >
                <Icon size={20} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {f.file_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(f.size_bytes)} ·{" "}
                    {new Date(f.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    download(f);
                  }}
                  className="p-2 rounded-lg hover:bg-primary/10 text-primary"
                  title="Download"
                  aria-label={`Download ${f.file_name}`}
                >
                  <Download size={16} />
                </button>
                {canDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(f);
                    }}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                    aria-label={`Delete ${f.file_name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
