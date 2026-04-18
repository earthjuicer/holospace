import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  FolderLock, FolderOpen, Plus, Share2, Trash2, Users, Lock, Globe, Upload,
  File as FileIcon, Image as ImageIcon, Video, Music, FileText, Loader2, Download,
  ChevronLeft, ChevronRight, Palette,
} from "lucide-react";
import { toast } from "sonner";
import { uploadFileToFolder } from "@/lib/folder-upload";
import { FilePreviewModal, type PreviewFile } from "@/components/FilePreviewModal";
import { FolderCoverPicker, type FolderCover } from "@/components/FolderCoverPicker";

export const Route = createFileRoute("/folders")({
  head: () => ({
    meta: [
      { title: "Folders — Workspace" },
      { name: "description", content: "Manage your private and shared folders." },
    ],
  }),
  component: FoldersPage,
});

interface Folder {
  id: string;
  name: string;
  icon: string;
  owner_id: string;
  created_at: string;
  cover: FolderCover | null;
}

interface FolderShare {
  id: string;
  folder_id: string;
  shared_with_user_id: string;
  role: string;
}

function formatItemCount(count: number) {
  if (count === 0) return "No items yet";
  if (count === 1) return "1 item";
  return `${count} items`;
}

interface LatestFile {
  id: string;
  file_name: string;
  mime_type: string | null;
  storage_path: string;
  size_bytes: number;
  /** Signed URL for image previews; only set when mime starts with image/. */
  thumbUrl?: string;
}

function fileTypeIcon(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("video/")) return Video;
  if (mime.startsWith("audio/")) return Music;
  if (mime.startsWith("text/") || mime.includes("pdf")) return FileText;
  return FileIcon;
}

function FoldersPage() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [shares, setShares] = useState<FolderShare[]>([]);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  // All files per folder (most-recent first), used for the chip's prev/next nav.
  const [folderFiles, setFolderFiles] = useState<Record<string, LatestFile[]>>({});
  // Per-folder index into folderFiles[folderId] (0 = newest).
  const [chipIndex, setChipIndex] = useState<Record<string, number>>({});
  // Folder IDs that currently have files being dropped onto them.
  const [uploadingFolderId, setUploadingFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharingFolderId, setSharingFolderId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [sharingBusyFolderId, setSharingBusyFolderId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [coverPickerFolderId, setCoverPickerFolderId] = useState<string | null>(null);

  const downloadFile = async (file: LatestFile) => {
    setDownloadingId(file.id);
    try {
      const { data, error } = await supabase.storage
        .from("folder-files")
        .createSignedUrl(file.storage_path, 60, { download: file.file_name });
      if (error || !data?.signedUrl) throw error ?? new Error("No URL");
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  // Move chip to next/prev file in this folder. Lazily signs image thumbnails
  // when navigating into them so we don't pay the cost up-front for every file.
  const navigateChip = async (folderId: string, dir: 1 | -1) => {
    const files = folderFiles[folderId];
    if (!files || files.length < 2) return;
    const cur = chipIndex[folderId] ?? 0;
    const nextIdx = (cur + dir + files.length) % files.length;
    setChipIndex((p) => ({ ...p, [folderId]: nextIdx }));
    const target = files[nextIdx];
    if (target.thumbUrl || !target.mime_type?.startsWith("image/")) return;
    const { data: signed } = await supabase.storage
      .from("folder-files")
      .createSignedUrl(target.storage_path, 600);
    if (!signed?.signedUrl) return;
    setFolderFiles((prev) => {
      const list = prev[folderId];
      if (!list) return prev;
      const updated = [...list];
      updated[nextIdx] = { ...updated[nextIdx], thumbUrl: signed.signedUrl };
      return { ...prev, [folderId]: updated };
    });
  };

  const openPreview = (file: LatestFile) => {
    setPreviewFile({
      id: file.id,
      file_name: file.file_name,
      mime_type: file.mime_type,
      storage_path: file.storage_path,
      size_bytes: file.size_bytes,
    });
  };

  useEffect(() => {
    if (!user) return;
    fetchFolders();
    fetchShares();

    // Auto-refresh: re-fetch whenever folders, shares, or files change anywhere
    // in the workspace. Coalesce bursts so rapid edits trigger one fetch.
    let t: ReturnType<typeof setTimeout> | null = null;
    const schedule = (fn: () => void) => {
      if (t) clearTimeout(t);
      t = setTimeout(fn, 200);
    };

    const sub = supabase
      .channel(`folders-page-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "folders" },
        () => schedule(fetchFolders)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "folder_files" },
        () => schedule(fetchFolders)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "folder_shares" },
        (payload) => {
          schedule(fetchFolders);
          schedule(fetchShares);

          // Toast the recipient when a NEW share lands for them. We look up
          // the folder name + owner display name so the message is meaningful
          // ("Alice shared 'Designs' with you") rather than a generic ping.
          if (payload.eventType !== "INSERT") return;
          const row = payload.new as {
            folder_id: string;
            shared_with_user_id: string;
          };
          if (row.shared_with_user_id !== user.id) return;

          (async () => {
            const { data: folder } = await supabase
              .from("folders")
              .select("name, icon, owner_id")
              .eq("id", row.folder_id)
              .maybeSingle();
            if (!folder) return;
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name, username")
              .eq("user_id", folder.owner_id)
              .maybeSingle();
            const who =
              profile?.display_name || profile?.username || "Someone";
            toast.success(`${who} shared a folder with you`, {
              description: `${folder.icon || "📁"} ${folder.name}`,
              action: {
                label: "Open",
                onClick: () => {
                  navigate({ to: '/folders/$folderId', params: { folderId: row.folder_id } });
                },
              },
            });
          })();
        }
      )
      .subscribe();

    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchFolders = async () => {
    const { data } = await supabase
      .from("folders")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) return;

    setFolders(
      data.map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        owner_id: row.owner_id,
        created_at: row.created_at,
        cover: (row.cover as unknown as FolderCover | null) ?? null,
      }))
    );

    if (data.length === 0) {
      setFileCounts({});
      setFolderFiles({});
      return;
    }

    const folderIds = data.map((folder) => folder.id);

    // Fetch ALL files in one query (sorted newest first).
    // We use this for both the count and the chip's prev/next navigation.
    const { data: fileRows } = await supabase
      .from("folder_files")
      .select("id, folder_id, file_name, mime_type, storage_path, size_bytes, created_at")
      .in("folder_id", folderIds)
      .order("created_at", { ascending: false });

    const counts = folderIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = 0;
      return acc;
    }, {});

    const grouped: Record<string, LatestFile[]> = {};
    fileRows?.forEach((row) => {
      counts[row.folder_id] = (counts[row.folder_id] ?? 0) + 1;
      if (!grouped[row.folder_id]) grouped[row.folder_id] = [];
      grouped[row.folder_id].push({
        id: row.id,
        file_name: row.file_name,
        mime_type: row.mime_type,
        storage_path: row.storage_path,
        size_bytes: row.size_bytes ?? 0,
      });
    });

    setFileCounts(counts);

    // Sign image thumbnails for the FIRST (latest) file of each folder
    // so the initial chip view shows a real image preview without delay.
    // Other indexes get signed lazily on navigation.
    const firstImageEntries = Object.entries(grouped).filter(
      ([, files]) => files[0]?.mime_type?.startsWith("image/")
    );
    await Promise.all(
      firstImageEntries.map(async ([folderId, files]) => {
        const first = files[0];
        const { data: signed } = await supabase.storage
          .from("folder-files")
          .createSignedUrl(first.storage_path, 600);
        if (signed?.signedUrl) {
          grouped[folderId] = [{ ...first, thumbUrl: signed.signedUrl }, ...files.slice(1)];
        }
      })
    );

    setFolderFiles(grouped);
  };

  const fetchShares = async () => {
    const { data } = await supabase.from("folder_shares").select("*");
    if (data) setShares(data);
  };

  const handleDropFiles = async (folderId: string, fileList: FileList) => {
    if (!fileList.length) {
      toast.error("Choose at least one file to upload");
      return;
    }
    setUploadingFolderId(folderId);
    const files = Array.from(fileList);
    let okCount = 0;
    try {
      for (const file of files) {
        try {
          await uploadFileToFolder({ folderId, file });
          okCount += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Upload failed";
          toast.error(`${file.name}: ${msg}`);
        }
      }
      if (okCount > 0) {
        toast.success(`Uploaded ${okCount} file${okCount === 1 ? "" : "s"}`);
      }
      await fetchFolders();
    } finally {
      setUploadingFolderId(null);
      setDragOverFolderId(null);
    }
  };

  const createFolder = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }
    if (!newFolderName.trim()) {
      toast.error("Enter a folder name");
      return;
    }
    setCreatingFolder(true);
    const { error } = await supabase.from("folders").insert({
      name: newFolderName.trim(),
      owner_id: user.id,
    });
    setCreatingFolder(false);
    if (error) {
      toast.error(error.message || "Failed to create folder");
    } else {
      setNewFolderName("");
      setShowCreate(false);
      fetchFolders();
      toast.success("Folder created!");
    }
  };

  const deleteFolder = async (id: string) => {
    setDeletingFolderId(id);
    const { error } = await supabase.from("folders").delete().eq("id", id);
    setDeletingFolderId(null);
    if (error) {
      toast.error(error.message || "Failed to delete folder");
    } else {
      fetchFolders();
      toast.success("Folder deleted");
    }
  };

  const shareFolder = async (folderId: string) => {
    if (!shareEmail.trim()) {
      toast.error("Enter a name to share with");
      return;
    }
    setSharingBusyFolderId(folderId);
    const { data: profiles, error: lookupError } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("display_name", `%${shareEmail.trim()}%`);

    if (lookupError) {
      setSharingBusyFolderId(null);
      toast.error(lookupError.message || "Could not search users");
      return;
    }

    if (!profiles || profiles.length === 0) {
      setSharingBusyFolderId(null);
      toast.error("User not found");
      return;
    }

    const { error } = await supabase.from("folder_shares").insert({
      folder_id: folderId,
      shared_with_user_id: profiles[0].user_id,
      role: "viewer",
    });
    setSharingBusyFolderId(null);

    if (error) {
      toast.error(error.message.includes("duplicate") ? "Already shared with this user" : error.message || "Failed to share");
    } else {
      setShareEmail("");
      setSharingFolderId(null);
      fetchShares();
      toast.success("Folder shared!");
    }
  };

  const saveCover = async (folderId: string, cover: FolderCover | null) => {
    // Optimistic update so the picker preview feels instant.
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, cover } : f)));
    const { error } = await supabase
      .from("folders")
      .update({ cover: cover as unknown as never })
      .eq("id", folderId);
    if (error) {
      toast.error(error.message || "Failed to save cover");
      fetchFolders();
    }
  };

  const myFolders = folders.filter((f) => f.owner_id === user?.id);
  const sharedWithMe = folders.filter(
    (f) => f.owner_id !== user?.id && shares.some((s) => s.folder_id === f.id)
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="flex items-start sm:items-center justify-between gap-3 mb-6 flex-col sm:flex-row">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FolderLock size={24} className="text-primary" />
              Folders
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Organize and share your private folders
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(!showCreate)}
            className="pill-button gradient-accent text-white flex items-center gap-1.5 self-stretch sm:self-auto justify-center"
          >
            <Plus size={16} /> New Folder
          </button>
        </div>

        {/* Create folder */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="glass p-4 flex items-center gap-3">
                <FolderOpen size={18} className="text-muted-foreground" />
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  onKeyDown={(e) => e.key === "Enter" && createFolder()}
                />
                <button
                  type="button"
                  onClick={createFolder}
                  disabled={creatingFolder}
                  className="px-4 py-1.5 rounded-lg gradient-accent text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {creatingFolder ? "Creating…" : "Create"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* My folders */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Lock size={14} /> My Folders
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-8">
          {myFolders.map((folder, i) => {
            const count = fileCounts[folder.id] ?? 0;
            const isDraggingOver = dragOverFolderId === folder.id;
            const isUploading = uploadingFolderId === folder.id;
            return (
              <motion.div
                key={folder.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setDragOverFolderId((cur) => (cur === folder.id ? null : cur));
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.files.length) return;
                  e.preventDefault();
                  handleDropFiles(folder.id, e.dataTransfer.files);
                }}
                className={`group relative flex flex-col items-center gap-2 p-4 rounded-2xl cursor-pointer select-none transition-all duration-150
                  hover:bg-muted/40 active:scale-95
                  ${isDraggingOver ? "bg-primary/10 ring-2 ring-primary/40" : ""}
                `}
                onClick={() => navigate({ to: "/folders/$folderId", params: { folderId: folder.id } })}
              >
                {/* Drop overlay */}
                {(isDraggingOver || isUploading) && (
                  <div className="absolute inset-0 z-10 rounded-2xl bg-primary/10 flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/90 border border-border/50 text-xs font-medium text-foreground shadow">
                      {isUploading ? <><Loader2 size={12} className="animate-spin text-primary" />Uploading…</> : <><Upload size={12} className="text-primary" />Drop files</>}
                    </div>
                  </div>
                )}

                {/* Big folder icon — whole card is clickable via motion.div onClick */}
                <div className="flex flex-col items-center gap-2 w-full">
                  {/* Folder SVG — Windows/macOS style */}
                  <div className="relative w-20 h-16 drop-shadow-md">
                    <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                      {/* Folder back */}
                      <rect x="2" y="14" width="76" height="44" rx="5" fill="#F59E0B" opacity="0.9"/>
                      {/* Folder tab */}
                      <path d="M2 14 Q2 10 6 10 L28 10 Q32 10 34 14 Z" fill="#FBBF24"/>
                      {/* Folder front highlight */}
                      <rect x="2" y="18" width="76" height="40" rx="4" fill="#FCD34D" opacity="0.6"/>
                      {/* Icon overlay */}
                      <text x="40" y="44" textAnchor="middle" fontSize="20" fill="rgba(180,90,0,0.5)">{folder.icon}</text>
                    </svg>
                    {/* File count badge */}
                    {count > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow">
                        {count > 99 ? "99+" : count}
                      </div>
                    )}
                  </div>
                  {/* Folder name */}
                  <span className="text-xs font-medium text-foreground text-center leading-tight max-w-full px-1 truncate w-full text-center">
                    {folder.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{formatItemCount(count)}</span>
                </div>

                {/* Action buttons — only visible on hover, don't intercept folder click */}
                <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    id={`upload-input-${folder.id}`}
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        handleDropFiles(folder.id, e.target.files);
                        e.target.value = "";
                      }
                    }}
                  />
                  <label
                    htmlFor={`upload-input-${folder.id}`}
                    className="p-1 rounded-md bg-background/80 hover:bg-primary/10 text-primary cursor-pointer"
                    title="Upload files"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Upload size={12} />
                  </label>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSharingFolderId(sharingFolderId === folder.id ? null : folder.id); }}
                    className="p-1 rounded-md bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Share folder"
                  >
                    <Share2 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteFolder(folder.id); }}
                    disabled={deletingFolderId === folder.id}
                    className="p-1 rounded-md bg-background/80 hover:bg-destructive/10 text-destructive disabled:opacity-60"
                    title="Delete folder"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Share panel — pops below the card */}
                <AnimatePresence>
                  {sharingFolderId === folder.id && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 z-20 glass rounded-xl p-3 shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          value={shareEmail}
                          onChange={(e) => setShareEmail(e.target.value)}
                          placeholder="Search user name…"
                          autoFocus
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-background border border-border/60 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                          onKeyDown={(e) => e.key === "Enter" && shareFolder(folder.id)}
                        />
                        <button
                          type="button"
                          onClick={() => shareFolder(folder.id)}
                          disabled={sharingBusyFolderId === folder.id}
                          className="px-2.5 py-1.5 rounded-lg gradient-accent text-white text-xs font-medium disabled:opacity-60"
                        >
                          {sharingBusyFolderId === folder.id ? "…" : "Share"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          {myFolders.length === 0 && (
            <div className="glass p-8 text-center col-span-4">
              <FolderLock size={36} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No folders yet. Click + New Folder to create one.</p>
            </div>
          )}
        </div>

        {/* Shared with me */}
        {sharedWithMe.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users size={14} /> Shared with me
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {sharedWithMe.map((folder, i) => {
                const count = fileCounts[folder.id] ?? 0;
                return (
                  <motion.div
                    key={folder.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="group relative flex flex-col items-center gap-2 p-4 rounded-2xl cursor-pointer select-none transition-all duration-150 hover:bg-muted/40 active:scale-95"
                    onClick={() => navigate({ to: "/folders/$folderId", params: { folderId: folder.id } })}
                  >
                    {/* Same PC-style folder card for shared folders */}
                    <div className="flex flex-col items-center gap-2 w-full">
                      <div className="relative w-20 h-16 drop-shadow-md">
                        <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                          <rect x="2" y="14" width="76" height="44" rx="5" fill="#60A5FA" opacity="0.9"/>
                          <path d="M2 14 Q2 10 6 10 L28 10 Q32 10 34 14 Z" fill="#93C5FD"/>
                          <rect x="2" y="18" width="76" height="40" rx="4" fill="#BFDBFE" opacity="0.6"/>
                          <text x="40" y="44" textAnchor="middle" fontSize="20" fill="rgba(30,64,175,0.5)">{folder.icon}</text>
                        </svg>
                        {(fileCounts[folder.id] ?? 0) > 0 && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                            {(fileCounts[folder.id] ?? 0) > 99 ? "99+" : fileCounts[folder.id]}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-medium text-foreground text-center leading-tight truncate w-full text-center px-1">
                        {folder.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Share2 size={9} /> {formatItemCount(fileCounts[folder.id] ?? 0)}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </motion.div>
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
