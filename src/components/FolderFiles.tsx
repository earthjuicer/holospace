import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload, File as FileIcon, Image as ImageIcon, Video, Music,
  FileText, Download, Trash2, Loader2,
} from "lucide-react";
import { toast } from "sonner";

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

export function FolderFiles({ folderId, shareToken, canDelete = false }: Props) {
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, shareToken]);

  const uploadFiles = async (fileList: FileList) => {
    for (const file of Array.from(fileList)) {
      const tmpKey = `${file.name}-${Date.now()}`;
      setUploads((u) => ({ ...u, [tmpKey]: 0 }));
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${folderId}/${crypto.randomUUID()}-${safeName}`;

      try {
        // Use resumable for files > 6MB to handle very large uploads
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
        if (upErr) throw upErr;

        if (shareToken) {
          const { error: rpcErr } = await supabase.rpc("add_share_file", {
            _token: shareToken,
            _storage_path: path,
            _file_name: file.name,
            _size_bytes: file.size,
            _mime_type: file.type || null,
          });
          if (rpcErr) throw rpcErr;
        } else {
          const { data: { user } } = await supabase.auth.getUser();
          const { error: insErr } = await supabase.from("folder_files").insert({
            folder_id: folderId,
            storage_path: path,
            file_name: file.name,
            size_bytes: file.size,
            mime_type: file.type || null,
            uploaded_by: user?.id ?? null,
          });
          if (insErr) throw insErr;
        }

        setUploads((u) => ({ ...u, [tmpKey]: 100 }));
        toast.success(`Uploaded ${file.name}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Upload failed";
        toast.error(`${file.name}: ${msg}`);
      } finally {
        setUploads((u) => {
          const next = { ...u };
          delete next[tmpKey];
          return next;
        });
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
        {Object.entries(uploads).map(([key, pct]) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass p-3 mb-2 flex items-center gap-3"
          >
            <Loader2 size={16} className="animate-spin text-primary" />
            <span className="text-sm flex-1 truncate">{key.split("-")[0]}</span>
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </motion.div>
        ))}
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
                className="glass p-3 flex items-center gap-3 group"
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
                  onClick={() => download(f)}
                  className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"
                  title="Download"
                >
                  <Download size={16} />
                </button>
                {canDelete && (
                  <button
                    onClick={() => remove(f)}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
