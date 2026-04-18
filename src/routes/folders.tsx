import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Upload, FolderPlus, Search, Grid3X3, List, Download, Trash2,
  Share2, Link2, Copy, Check, X, Loader2, File as FileIcon,
  Image as ImageIcon, Video, Music, FileText, FolderOpen,
  MoreVertical, Users, Globe, Lock, ChevronRight, Home,
} from "lucide-react";
import { toast } from "sonner";
import { uploadResumable } from "@/lib/resumable-upload";
import { FilePreviewModal, type PreviewFile } from "@/components/FilePreviewModal";

export const Route = createFileRoute("/folders")({
  head: () => ({ meta: [{ title: "Drive — Workspace" }] }),
  component: DrivePage,
});

interface DriveFile {
  id: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  storage_path: string;
  created_at: string;
  folder_id: string;
}

interface DriveFolder {
  id: string;
  name: string;
  icon: string;
  owner_id: string;
  created_at: string;
}

interface ShareRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: string;
  share_id: string;
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

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

// ── Share Modal ─────────────────────────────────────────────────────────────
function ShareModal({
  folder,
  onClose,
}: {
  folder: DriveFolder;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [members, setMembers] = useState<ShareRow[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<{ user_id: string; display_name: string | null; username: string | null; avatar_url: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadMembers();
    loadPublicLink();
  }, [folder.id]);

  const loadMembers = async () => {
    const { data: shares } = await supabase
      .from("folder_shares")
      .select("id, shared_with_user_id, role")
      .eq("folder_id", folder.id);
    if (!shares?.length) { setMembers([]); return; }
    const ids = shares.map((s) => s.shared_with_user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, username, avatar_url")
      .in("user_id", ids);
    const map = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    setMembers(shares.map((s) => ({
      user_id: s.shared_with_user_id,
      display_name: map.get(s.shared_with_user_id)?.display_name ?? null,
      username: map.get(s.shared_with_user_id)?.username ?? null,
      avatar_url: map.get(s.shared_with_user_id)?.avatar_url ?? null,
      role: s.role,
      share_id: s.id,
    })));
  };

  const loadPublicLink = async () => {
    const { data } = await supabase
      .from("folder_public_shares")
      .select("token, expires_at")
      .eq("folder_id", folder.id)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      setPublicLink(`${window.location.origin}/share/${data.token}`);
    }
  };

  // Live search as user types
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!searchQ.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.rpc("list_workspace_users");
      const q = searchQ.toLowerCase();
      const filtered = ((data ?? []) as any[])
        .filter((u: any) =>
          u.user_id !== user?.id &&
          !members.find((m) => m.user_id === u.user_id) &&
          ((u.display_name ?? "").toLowerCase().includes(q) ||
           (u.username ?? "").toLowerCase().includes(q))
        )
        .slice(0, 6);
      setSearchResults(filtered);
      setSearching(false);
    }, 300);
  }, [searchQ, members]);

  const addMember = async (u: typeof searchResults[0]) => {
    setAdding(true);
    const { error } = await supabase.from("folder_shares").insert({
      folder_id: folder.id,
      shared_with_user_id: u.user_id,
      role: "viewer",
    });
    if (error) toast.error(error.message);
    else { toast.success(`Shared with ${u.display_name || u.username}`); await loadMembers(); }
    setSearchQ("");
    setSearchResults([]);
    setAdding(false);
  };

  const removeMember = async (shareId: string, name: string) => {
    const { error } = await supabase.from("folder_shares").delete().eq("id", shareId);
    if (error) toast.error(error.message);
    else { toast.success(`Removed ${name}`); await loadMembers(); }
  };

  const generatePublicLink = async () => {
    setGeneratingLink(true);
    const { data, error } = await supabase.rpc("regen_share_token", {
      _folder_id: folder.id,
      _expires_in: "100 years",
    });
    setGeneratingLink(false);
    if (error || !data?.[0]) { toast.error("Could not generate link"); return; }
    const link = `${window.location.origin}/share/${data[0].token}`;
    setPublicLink(link);
    await navigator.clipboard.writeText(link).catch(() => {});
    toast.success("Public link created and copied!");
  };

  const copyLink = async () => {
    if (!publicLink) return;
    await navigator.clipboard.writeText(publicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Link copied!");
  };

  const revokeLink = async () => {
    await supabase.from("folder_public_shares").delete().eq("folder_id", folder.id);
    setPublicLink(null);
    toast.success("Public link revoked");
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fixed inset-0 bg-black/50" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-strong w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border/30">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Share2 size={16} className="text-primary" />
              Share "{folder.name}"
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* People search */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
              Share with people
            </label>
            <div className="relative">
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search by name or username…"
                className="w-full px-4 py-2.5 rounded-xl bg-muted/50 border border-border/40 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                autoComplete="off"
              />
              {searching && (
                <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-muted-foreground" />
              )}
              {/* Dropdown results */}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 glass-strong rounded-xl shadow-xl overflow-hidden z-10">
                  {searchResults.map((u) => (
                    <button
                      key={u.user_id}
                      onClick={() => addMember(u)}
                      disabled={adding}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 w-full text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold overflow-hidden shrink-0">
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                          : (u.display_name || u.username || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{u.display_name || u.username}</div>
                        {u.username && u.display_name && (
                          <div className="text-xs text-muted-foreground">@{u.username}</div>
                        )}
                      </div>
                      <span className="ml-auto text-xs text-primary font-medium">Add</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Current members */}
          {members.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block flex items-center gap-1">
                <Users size={11} /> People with access
              </label>
              <div className="space-y-1">
                {/* Owner */}
                <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold shrink-0">
                    You
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">You (owner)</div>
                  </div>
                  <Lock size={13} className="text-muted-foreground" />
                </div>
                {members.map((m) => (
                  <div key={m.share_id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted/30 group">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold overflow-hidden shrink-0">
                      {m.avatar_url
                        ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                        : (m.display_name || m.username || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.display_name || m.username}</div>
                      <div className="text-xs text-muted-foreground capitalize">{m.role}</div>
                    </div>
                    <button
                      onClick={() => removeMember(m.share_id, m.display_name || m.username || "user")}
                      className="p-1 rounded-lg hover:bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove access"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Public link */}
          <div className="border-t border-border/30 pt-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block flex items-center gap-1">
              <Globe size={11} /> Anyone with the link
            </label>
            {publicLink ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={publicLink}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-muted/40 border border-border/30 text-xs font-mono outline-none"
                  />
                  <button
                    onClick={copyLink}
                    className="p-2.5 rounded-xl gradient-accent text-white shrink-0 transition-all"
                    title="Copy link"
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
                <button onClick={revokeLink} className="text-xs text-destructive hover:underline">
                  Revoke link
                </button>
              </div>
            ) : (
              <button
                onClick={generatePublicLink}
                disabled={generatingLink}
                className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl border border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 text-sm text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
              >
                {generatingLink ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                {generatingLink ? "Generating…" : "Create shareable link"}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

// ── Context Menu ─────────────────────────────────────────────────────────────
function FileMenu({
  file,
  pos,
  onClose,
  onPreview,
  onDownload,
  onDelete,
  onShare,
}: {
  file: DriveFile;
  pos: { x: number; y: number };
  onClose: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  useEffect(() => {
    const h = () => onClose();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(pos.y, window.innerHeight - 200),
    left: Math.min(pos.x, window.innerWidth - 200),
    zIndex: 99999,
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={style}
      className="glass-strong rounded-xl shadow-2xl overflow-hidden w-48"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {[
        { icon: FileIcon, label: "Open / Preview", action: onPreview },
        { icon: Download, label: "Download", action: onDownload },
        { icon: Share2, label: "Share file", action: onShare },
        { icon: Trash2, label: "Delete", action: onDelete, danger: true },
      ].map(({ icon: Icon, label, action, danger }) => (
        <button
          key={label}
          onClick={() => { action(); onClose(); }}
          className={`flex items-center gap-3 px-4 py-2.5 w-full text-sm hover:bg-muted/50 transition-colors ${danger ? "text-destructive" : "text-foreground"}`}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </motion.div>,
    document.body
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function DrivePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<DriveFolder | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [shareFolder, setShareFolder] = useState<DriveFolder | null>(null);
  const [contextMenu, setContextMenu] = useState<{ file: DriveFile; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  // Load content whenever currentFolder changes
  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentFolder?.id]);

  const load = async () => {
    setLoading(true);
    setSelected(new Set());

    // Load subfolders
    const { data: folderData } = await supabase
      .from("folders")
      .select("id, name, icon, owner_id, created_at")
      .order("name", { ascending: true });

    // Load files in current folder (or root = null)
    let fileQuery = supabase
      .from("folder_files")
      .select("id, file_name, size_bytes, mime_type, storage_path, created_at, folder_id")
      .order("created_at", { ascending: false });

    if (currentFolder) {
      // Inside a folder — show only that folder's files
      fileQuery = fileQuery.eq("folder_id", currentFolder.id);
    } else {
      // Root level — show files with no folder (null) AND files owned by this user
      fileQuery = fileQuery.is("folder_id", null);
    }

    const [{ data: fd }, { data: fileData }] = await Promise.all([
      folderData ? Promise.resolve({ data: folderData }) : supabase.from("folders").select("*"),
      fileQuery,
    ]);

    // Filter folders: show mine + shared with me
    const myFolders = (folderData ?? []).filter((f) => {
      if (currentFolder) return false; // inside a folder, no subfolders for now
      return true;
    });
    setFolders(myFolders as DriveFolder[]);
    setFiles((fileData ?? []) as DriveFile[]);
    setLoading(false);

    // Sign image thumbnails
    const images = (fileData ?? []).filter((f) => f.mime_type?.startsWith("image/") && !thumbs[f.id]);
    if (images.length) {
      const entries = await Promise.all(
        images.map(async (f) => {
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 600);
          return [f.id, data?.signedUrl] as const;
        })
      );
      setThumbs((prev) => {
        const next = { ...prev };
        entries.forEach(([id, url]) => { if (url) next[id] = url; });
        return next;
      });
    }
  };

  const openFolder = (folder: DriveFolder) => {
    setBreadcrumb((b) => [...b, currentFolder].filter(Boolean) as DriveFolder[]);
    setCurrentFolder(folder);
  };

  const navigateBreadcrumb = (index: number) => {
    if (index === -1) {
      setCurrentFolder(null);
      setBreadcrumb([]);
    } else {
      const target = breadcrumb[index];
      setBreadcrumb((b) => b.slice(0, index));
      setCurrentFolder(target);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    setCreatingFolder(true);
    const { error } = await supabase.from("folders").insert({
      name: newFolderName.trim(),
      owner_id: user.id,
      icon: "📁",
    });
    setCreatingFolder(false);
    if (error) { toast.error(error.message); return; }
    setNewFolderName("");
    setShowNewFolder(false);
    toast.success("Drive created");
    load();
  };

  const uploadFiles = async (fileList: FileList) => {
    if (!fileList.length || !user) return;
    setUploading(true);
    let done = 0;
    for (const file of Array.from(fileList)) {
      try {
        // Path MUST start with user.id so RLS policy allows the upload
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
        await uploadResumable({
          path,
          file,
          onProgress: (pct) => setUploadProgress(Math.round((done / fileList.length + pct / 100 / fileList.length) * 100)),
        });
        // Insert metadata — folder_id is nullable (null = root/My Drive)
        const { error: dbErr } = await supabase.from("folder_files").insert({
          file_name: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
          storage_path: path,
          folder_id: currentFolder?.id ?? null,
        });
        if (dbErr) throw new Error(dbErr.message);
        done++;
      } catch (e: any) {
        toast.error(`${file.name}: ${e?.message ?? "Upload failed"}`);
      }
    }
    setUploading(false);
    setUploadProgress(0);
    toast.success(`Uploaded ${done} file${done !== 1 ? "s" : ""}`);
    load();
  };

  const downloadFile = async (file: DriveFile) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, 60, { download: file.file_name });
    if (error || !data?.signedUrl) { toast.error("Download failed"); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = file.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const deleteFile = async (file: DriveFile) => {
    if (!confirm(`Delete "${file.file_name}"?`)) return;
    await supabase.storage.from(BUCKET).remove([file.storage_path]);
    await supabase.from("folder_files").delete().eq("id", file.id);
    toast.success("Deleted");
    load();
  };

  const deleteFolder = async (folder: DriveFolder) => {
    if (!confirm(`Delete drive "${folder.name}" and all its files?`)) return;
    await supabase.from("folders").delete().eq("id", folder.id);
    toast.success("Drive deleted");
    load();
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    if (!confirm(`Delete ${selected.size} item(s)?`)) return;
    const toDelete = files.filter((f) => selected.has(f.id));
    await supabase.storage.from(BUCKET).remove(toDelete.map((f) => f.storage_path));
    await supabase.from("folder_files").delete().in("id", Array.from(selected));
    setSelected(new Set());
    toast.success(`Deleted ${toDelete.length} file(s)`);
    load();
  };

  // Share a single file — generate a public link via folder share mechanism
  const shareFile = async (file: DriveFile) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, 60 * 60 * 24 * 7); // 7-day signed URL
    if (error || !data?.signedUrl) { toast.error("Could not generate link"); return; }
    await navigator.clipboard.writeText(data.signedUrl).catch(() => {});
    toast.success("7-day file link copied to clipboard!", { description: file.file_name });
  };

  // Filter
  const q = search.toLowerCase();
  const filteredFolders = folders.filter((f) => !q || f.name.toLowerCase().includes(q));
  const filteredFiles = files.filter((f) => !q || f.file_name.toLowerCase().includes(q));

  // Drag & drop handlers
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; setDragOver(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setDragOver(false); };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  const isEmpty = filteredFolders.length === 0 && filteredFiles.length === 0 && !loading;

  return (
    <div
      className="h-full flex flex-col relative"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary/50 rounded-2xl flex items-center justify-center pointer-events-none"
          >
            <div className="text-center">
              <Upload size={40} className="mx-auto mb-2 text-primary" />
              <p className="text-lg font-semibold text-primary">Drop files to upload</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="px-6 py-4 border-b border-border/30 flex items-center gap-3 flex-wrap shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            onClick={() => navigateBreadcrumb(-1)}
            className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
          >
            <Home size={15} />
            <span className={currentFolder ? "text-muted-foreground" : "text-foreground"}>My Drive</span>
          </button>
          {breadcrumb.map((b, i) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight size={13} className="text-muted-foreground" />
              <button
                onClick={() => navigateBreadcrumb(i)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {b.name}
              </button>
            </span>
          ))}
          {currentFolder && (
            <span className="flex items-center gap-1">
              <ChevronRight size={13} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{currentFolder.name}</span>
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="pl-9 pr-4 py-2 rounded-xl bg-muted/50 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/30 w-48"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView((v) => v === "grid" ? "list" : "grid")}
            className="p-2 rounded-xl hover:bg-muted/60 text-muted-foreground"
            title={view === "grid" ? "List view" : "Grid view"}
          >
            {view === "grid" ? <List size={17} /> : <Grid3X3 size={17} />}
          </button>
          <button
            onClick={() => setShowNewFolder(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border/30 text-sm hover:bg-muted/80 transition-colors"
          >
            <FolderPlus size={15} />
            <span className="hidden sm:inline">New drive</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-accent text-white text-sm font-medium disabled:opacity-60"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? `${uploadProgress}%` : "Upload"}
          </button>
          <input ref={fileInputRef} type="file" multiple className="sr-only" onChange={(e) => { if (e.target.files?.length) { uploadFiles(e.target.files); e.target.value = ""; } }} />
        </div>
      </div>

      {/* New folder inline */}
      <AnimatePresence>
        {showNewFolder && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border/30"
          >
            <div className="px-6 py-3 flex items-center gap-3 bg-muted/20">
              <FolderOpen size={16} className="text-primary shrink-0" />
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Drive name"
                autoFocus
                className="flex-1 bg-transparent text-sm outline-none"
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
              />
              <button onClick={createFolder} disabled={creatingFolder || !newFolderName.trim()} className="px-3 py-1.5 rounded-lg gradient-accent text-white text-xs font-medium disabled:opacity-50">
                {creatingFolder ? "Creating…" : "Create"}
              </button>
              <button onClick={() => setShowNewFolder(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk actions bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="px-6 py-2 border-b border-border/30 bg-primary/5 flex items-center gap-3"
          >
            <span className="text-sm font-medium">{selected.size} selected</span>
            <button onClick={deleteSelected} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium">
              <Trash2 size={13} /> Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
              <FolderOpen size={28} className="text-muted-foreground/50" />
            </div>
            <p className="text-foreground font-medium mb-1">
              {search ? "No results found" : "This drive is empty"}
            </p>
            <p className="text-sm text-muted-foreground">
              {search ? "Try a different search term" : "Upload files or create a drive to get started"}
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {/* Folders */}
            {filteredFolders.map((folder) => (
              <motion.div
                key={folder.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative"
              >
                <button
                  className="w-full flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer"
                  onDoubleClick={() => openFolder(folder)}
                  onClick={() => openFolder(folder)}
                >
                  <div className="relative">
                    <svg viewBox="0 0 80 60" className="w-16 h-12 drop-shadow">
                      <rect x="2" y="14" width="76" height="44" rx="5" fill="#F59E0B" opacity="0.9"/>
                      <path d="M2 14 Q2 10 6 10 L28 10 Q32 10 34 14 Z" fill="#FBBF24"/>
                      <rect x="2" y="18" width="76" height="40" rx="4" fill="#FCD34D" opacity="0.55"/>
                      <text x="40" y="44" textAnchor="middle" fontSize="18" fill="rgba(146,64,14,0.6)">{folder.icon}</text>
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-foreground text-center truncate w-full">{folder.name}</span>
                </button>
                {/* Folder actions */}
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); setShareFolder(folder); }} className="p-1.5 rounded-lg bg-background/80 hover:bg-primary/10 text-primary" title="Share">
                    <Share2 size={11} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder); }} className="p-1.5 rounded-lg bg-background/80 hover:bg-destructive/10 text-destructive" title="Delete">
                    <Trash2 size={11} />
                  </button>
                </div>
              </motion.div>
            ))}

            {/* Files */}
            {filteredFiles.map((file) => {
              const Icon = fileIcon(file.mime_type);
              const thumb = thumbs[file.id];
              const isSelected = selected.has(file.id);
              return (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`group relative rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                    isSelected ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-transparent hover:border-border/40 hover:bg-muted/30"
                  }`}
                  onClick={() => setSelected((s) => { const n = new Set(s); n.has(file.id) ? n.delete(file.id) : n.add(file.id); return n; })}
                  onDoubleClick={() => setPreviewFile(file as PreviewFile)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ file, x: e.clientX, y: e.clientY }); }}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
                    {thumb ? (
                      <img src={thumb} alt={file.file_name} className="w-full h-full object-cover" />
                    ) : (
                      <Icon size={28} className="text-primary/60" />
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-medium text-foreground truncate">{file.file_name}</p>
                    <p className="text-[10px] text-muted-foreground">{formatBytes(file.size_bytes)}</p>
                  </div>
                  {/* Hover actions */}
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                    <button onClick={(e) => { e.stopPropagation(); downloadFile(file); }} className="p-1.5 rounded-lg bg-background/80 hover:bg-primary/10 text-primary" title="Download">
                      <Download size={11} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); shareFile(file); }} className="p-1.5 rounded-lg bg-background/80 hover:bg-primary/10 text-primary" title="Share link">
                      <Link2 size={11} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteFile(file); }} className="p-1.5 rounded-lg bg-background/80 hover:bg-destructive/10 text-destructive" title="Delete">
                      <Trash2 size={11} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* List view */
          <div className="space-y-0.5">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/20">
              <span className="w-8" />
              <span>Name</span>
              <span className="w-24 text-right">Size</span>
              <span className="w-32 text-right">Modified</span>
              <span className="w-20" />
            </div>
            {filteredFolders.map((folder) => (
              <div
                key={folder.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-3 py-2.5 items-center rounded-xl hover:bg-muted/30 group cursor-pointer transition-colors"
                onClick={() => openFolder(folder)}
              >
                <svg viewBox="0 0 80 60" className="w-8 h-6">
                  <rect x="2" y="14" width="76" height="44" rx="5" fill="#F59E0B" opacity="0.9"/>
                  <path d="M2 14 Q2 10 6 10 L28 10 Q32 10 34 14 Z" fill="#FBBF24"/>
                </svg>
                <span className="text-sm font-medium truncate">{folder.name}</span>
                <span className="w-24 text-right text-xs text-muted-foreground">—</span>
                <span className="w-32 text-right text-xs text-muted-foreground">{new Date(folder.created_at).toLocaleDateString()}</span>
                <div className="w-20 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); setShareFolder(folder); }} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" title="Share"><Share2 size={13} /></button>
                  <button onClick={(e) => { e.stopPropagation(); deleteFolder(folder); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive" title="Delete"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
            {filteredFiles.map((file) => {
              const Icon = fileIcon(file.mime_type);
              const isSelected = selected.has(file.id);
              return (
                <div
                  key={file.id}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-3 py-2.5 items-center rounded-xl group cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/30"
                  }`}
                  onClick={() => setSelected((s) => { const n = new Set(s); n.has(file.id) ? n.delete(file.id) : n.add(file.id); return n; })}
                  onDoubleClick={() => setPreviewFile(file as PreviewFile)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ file, x: e.clientX, y: e.clientY }); }}
                >
                  <Icon size={18} className="text-primary/70 w-8" />
                  <span className="text-sm font-medium truncate">{file.file_name}</span>
                  <span className="w-24 text-right text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</span>
                  <span className="w-32 text-right text-xs text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</span>
                  <div className="w-20 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); setPreviewFile(file as PreviewFile); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Preview"><FileIcon size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); downloadFile(file); }} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" title="Download"><Download size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); shareFile(file); }} className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" title="Share link"><Link2 size={13} /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteFile(file); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive" title="Delete"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File preview */}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />

      {/* Share modal */}
      <AnimatePresence>
        {shareFolder && (
          <ShareModal folder={shareFolder} onClose={() => setShareFolder(null)} />
        )}
      </AnimatePresence>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <FileMenu
            file={contextMenu.file}
            pos={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu(null)}
            onPreview={() => setPreviewFile(contextMenu.file as PreviewFile)}
            onDownload={() => downloadFile(contextMenu.file)}
            onDelete={() => deleteFile(contextMenu.file)}
            onShare={() => shareFile(contextMenu.file)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
