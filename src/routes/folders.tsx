import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  FolderLock, FolderOpen, Plus, Share2, Trash2, Users, Lock, Globe,
} from "lucide-react";
import { toast } from "sonner";

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

function FoldersPage() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [shares, setShares] = useState<FolderShare[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharingFolderId, setSharingFolderId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchFolders();
      fetchShares();
    }
  }, [user]);

  const fetchFolders = async () => {
    const { data } = await supabase
      .from("folders")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setFolders(data);
  };

  const fetchShares = async () => {
    const { data } = await supabase.from("folder_shares").select("*");
    if (data) setShares(data);
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    const { error } = await supabase.from("folders").insert({
      name: newFolderName.trim(),
      owner_id: user.id,
    });
    if (error) {
      toast.error("Failed to create folder");
    } else {
      setNewFolderName("");
      setShowCreate(false);
      fetchFolders();
      toast.success("Folder created!");
    }
  };

  const deleteFolder = async (id: string) => {
    const { error } = await supabase.from("folders").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete folder");
    } else {
      fetchFolders();
      toast.success("Folder deleted");
    }
  };

  const shareFolder = async (folderId: string) => {
    if (!shareEmail.trim()) return;
    // Look up user by email from profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id")
      .ilike("display_name", `%${shareEmail}%`);

    if (!profiles || profiles.length === 0) {
      toast.error("User not found");
      return;
    }

    const { error } = await supabase.from("folder_shares").insert({
      folder_id: folderId,
      shared_with_user_id: profiles[0].user_id,
      role: "viewer",
    });

    if (error) {
      toast.error(error.message.includes("duplicate") ? "Already shared with this user" : "Failed to share");
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
                  onClick={createFolder}
                  className="px-4 py-1.5 rounded-lg gradient-accent text-white text-sm font-medium"
                >
                  Create
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
          {myFolders.map((folder, i) => (
            <motion.div
              key={folder.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass p-4 group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{folder.icon}</span>
                  <div>
                    <div className="font-medium text-foreground">{folder.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
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
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setSharingFolderId(sharingFolderId === folder.id ? null : folder.id)}
                    className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"
                  >
                    <Share2 size={14} />
                  </button>
                  <button
                    onClick={() => deleteFolder(folder.id)}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

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
                        onClick={() => shareFolder(folder.id)}
                        className="px-3 py-1.5 rounded-lg gradient-accent text-white text-xs font-medium"
                      >
                        Share
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
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
              {sharedWithMe.map((folder, i) => (
                <motion.div
                  key={folder.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="glass p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{folder.icon}</span>
                    <div>
                      <div className="font-medium text-foreground">{folder.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Share2 size={10} /> Shared with you
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
