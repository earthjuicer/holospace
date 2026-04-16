import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  FolderLock, FolderOpen, Plus, Share2, Trash2, Users, Lock, Globe, Upload,
  File as FileIcon, Image as ImageIcon, Video, Music, FileText, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { uploadFileToFolder } from "@/lib/folder-upload";

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
  const [latestFiles, setLatestFiles] = useState<Record<string, LatestFile>>({});
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
        () => {
          schedule(fetchFolders);
          schedule(fetchShares);
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

    setFolders(data);

    if (data.length === 0) {
      setFileCounts({});
      setLatestFiles({});
      return;
    }

    const folderIds = data.map((folder) => folder.id);

    // Counts (cheap, used for the "N items" label)
    const { data: fileRows } = await supabase
      .from("folder_files")
      .select("folder_id")
      .in("folder_id", folderIds);

    const counts = folderIds.reduce<Record<string, number>>((acc, id) => {
      acc[id] = 0;
      return acc;
    }, {});

    fileRows?.forEach((file) => {
      counts[file.folder_id] = (counts[file.folder_id] ?? 0) + 1;
    });

    setFileCounts(counts);

    // Latest file per folder for the preview chip on each card.
    const { data: latestRows } = await supabase
      .from("folder_files")
      .select("id, folder_id, file_name, mime_type, storage_path, created_at")
      .in("folder_id", folderIds)
      .order("created_at", { ascending: false });

    const seen: Record<string, LatestFile> = {};
    latestRows?.forEach((row) => {
      if (seen[row.folder_id]) return;
      seen[row.folder_id] = {
        id: row.id,
        file_name: row.file_name,
        mime_type: row.mime_type,
        storage_path: row.storage_path,
      };
    });

    // Sign image previews so we can show a real thumbnail (10 min URL).
    const imageEntries = Object.entries(seen).filter(([, f]) =>
      f.mime_type?.startsWith("image/")
    );
    await Promise.all(
      imageEntries.map(async ([folderId, file]) => {
        const { data: signed } = await supabase.storage
          .from("folder-files")
          .createSignedUrl(file.storage_path, 600);
        if (signed?.signedUrl) {
          seen[folderId] = { ...file, thumbUrl: signed.signedUrl };
        }
      })
    );

    setLatestFiles(seen);
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {myFolders.map((folder, i) => {
            const latest = latestFiles[folder.id];
            const LatestIcon = latest ? fileTypeIcon(latest.mime_type) : null;
            const isDraggingOver = dragOverFolderId === folder.id;
            const isUploading = uploadingFolderId === folder.id;
            return (
              <motion.div
                key={folder.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
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
                className={`glass p-4 group relative transition-all ${
                  isDraggingOver
                    ? "ring-2 ring-primary/60 border-primary/40 bg-primary/5"
                    : ""
                }`}
              >
                {(isDraggingOver || isUploading) && (
                  <div className="absolute inset-0 z-10 rounded-lg bg-primary/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/90 border border-border/50 shadow-sm text-xs font-medium text-foreground">
                      {isUploading ? (
                        <>
                          <Loader2 size={14} className="animate-spin text-primary" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload size={14} className="text-primary" />
                          Drop to upload to {folder.name}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/folders/$folderId"
                    params={{ folderId: folder.id }}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <span className="text-2xl">{folder.icon}</span>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate">{folder.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <span>{formatItemCount(fileCounts[folder.id] ?? 0)}</span>
                        <span>•</span>
                        {folder.owner_id === user?.id ? (
                          <>
                            <Globe size={10} /> Owner
                          </>
                        ) : (
                          <>
                            <Lock size={10} /> Shared with you
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0 opacity-100">
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
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border/40 bg-muted/40 px-2.5 py-2 text-xs font-medium text-primary hover:bg-primary/10"
                      title="Upload files to this folder"
                      aria-label="Upload files to this folder"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Upload size={14} />
                      <span className="hidden sm:inline">Upload</span>
                    </label>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSharingFolderId(sharingFolderId === folder.id ? null : folder.id);
                      }}
                      className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"
                      title="Share folder"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteFolder(folder.id);
                      }}
                      disabled={deletingFolderId === folder.id}
                      className="p-2 rounded-lg hover:bg-destructive/10 text-destructive disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Delete folder"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {latest && (
                  <Link
                    to="/folders/$folderId"
                    params={{ folderId: folder.id }}
                    className="mt-3 flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/30 p-2 hover:bg-muted/50 transition-colors"
                    title={`Latest: ${latest.file_name}`}
                  >
                    {latest.thumbUrl ? (
                      <img
                        src={latest.thumbUrl}
                        alt={latest.file_name}
                        className="w-10 h-10 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-background/60 flex items-center justify-center shrink-0">
                        {LatestIcon ? <LatestIcon size={18} className="text-muted-foreground" /> : null}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                        Latest file
                      </div>
                      <div className="text-xs text-foreground truncate">{latest.file_name}</div>
                    </div>
                  </Link>
                )}

                <AnimatePresence>
                  {sharingFolderId === folder.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2">
                        <input
                          value={shareEmail}
                          onChange={(e) => setShareEmail(e.target.value)}
                          placeholder="Search user name…"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/30 text-sm outline-none"
                          onKeyDown={(e) => e.key === "Enter" && shareFolder(folder.id)}
                        />
                        <button
                          type="button"
                          onClick={() => shareFolder(folder.id)}
                          disabled={sharingBusyFolderId === folder.id}
                          className="px-3 py-1.5 rounded-lg gradient-accent text-white text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {sharingBusyFolderId === folder.id ? "Sharing…" : "Share"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          {myFolders.length === 0 && (
            <div className="glass p-8 text-center col-span-2">
              <FolderLock size={36} className="mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No folders yet</p>
            </div>
          )}
        </div>

        {/* Shared with me */}
        {sharedWithMe.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users size={14} /> Shared with me
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sharedWithMe.map((folder, i) => {
                const latest = latestFiles[folder.id];
                const LatestIcon = latest ? fileTypeIcon(latest.mime_type) : null;
                return (
                  <motion.div
                    key={folder.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="glass p-4"
                  >
                    <Link
                      to="/folders/$folderId"
                      params={{ folderId: folder.id }}
                      className="flex items-center gap-3"
                    >
                      <span className="text-2xl">{folder.icon}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{folder.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Share2 size={10} /> Shared with you • {formatItemCount(fileCounts[folder.id] ?? 0)}
                        </div>
                      </div>
                    </Link>
                    {latest && (
                      <Link
                        to="/folders/$folderId"
                        params={{ folderId: folder.id }}
                        className="mt-3 flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/30 p-2 hover:bg-muted/50 transition-colors"
                        title={`Latest: ${latest.file_name}`}
                      >
                        {latest.thumbUrl ? (
                          <img
                            src={latest.thumbUrl}
                            alt={latest.file_name}
                            className="w-10 h-10 rounded object-cover shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded bg-background/60 flex items-center justify-center shrink-0">
                            {LatestIcon ? <LatestIcon size={18} className="text-muted-foreground" /> : null}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                            Latest file
                          </div>
                          <div className="text-xs text-foreground truncate">{latest.file_name}</div>
                        </div>
                      </Link>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
