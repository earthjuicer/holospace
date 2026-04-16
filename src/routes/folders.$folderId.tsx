import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FolderFiles } from "@/components/FolderFiles";
import { ArrowLeft, Link2, RefreshCw, Copy, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/folders/$folderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    upload: search.upload === 1 || search.upload === "1" ? 1 : undefined,
  }),
  head: () => ({
    meta: [{ title: "Folder — Workspace" }],
  }),
  component: FolderDetailPage,
});

interface Folder {
  id: string;
  name: string;
  icon: string;
  owner_id: string;
}

interface Share {
  token: string;
  expires_at: string;
}

function formatRemaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

function FolderDetailPage() {
  const { folderId } = Route.useParams();
  const { upload } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadFolder = async () => {
      setLoading(true);
      try {
        const [{ data: f, error: folderError }, { data: s, error: shareError }] = await Promise.all([
          supabase
            .from("folders")
            .select("id, name, icon, owner_id")
            .eq("id", folderId)
            .maybeSingle(),
          supabase
            .from("folder_public_shares")
            .select("token, expires_at")
            .eq("folder_id", folderId)
            .maybeSingle(),
        ]);

        if (folderError) throw folderError;
        if (shareError) throw shareError;
        if (cancelled) return;

        setFolder(f);
        setShare(s);
      } catch (error) {
        if (!cancelled) {
          setFolder(null);
          setShare(null);
          toast.error(error instanceof Error ? error.message : "Failed to load folder");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadFolder();
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  const isOwner = folder?.owner_id === user?.id;
  const shareActive = share && new Date(share.expires_at).getTime() > Date.now();
  const shareUrl = share ? `${window.location.origin}/share/${share.token}` : "";

  const generateOrRegen = async () => {
    const { data, error } = await supabase.rpc("regen_share_token", {
      _folder_id: folderId,
    });
    if (error || !data?.[0]) {
      toast.error(error?.message || "Failed to generate link");
      return;
    }
    setShare({ token: data[0].token, expires_at: data[0].expires_at });
    toast.success("New share link generated");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const deleteFolder = async () => {
    if (!confirm(`Delete folder "${folder?.name}" and all its files?`)) return;
    const { error } = await supabase.from("folders").delete().eq("id", folderId);
    if (error) {
      toast.error(error.message || "Failed to delete folder");
    } else {
      toast.success("Folder deleted");
      navigate({ to: "/folders" });
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Link to="/folders" className="text-sm text-primary">
          ← Back
        </Link>
        <p className="mt-4 text-muted-foreground">Folder not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <Link
        to="/folders"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft size={14} /> Folders
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{folder.icon}</span>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{folder.name}</h1>
              <p className="text-xs text-muted-foreground">
                {isOwner ? "You own this folder" : "Shared with you"}
              </p>
            </div>
          </div>
          {isOwner && (
            <button
              onClick={deleteFolder}
              className="p-2 rounded-lg hover:bg-destructive/10 text-destructive"
              title="Delete folder"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        {/* Share link panel */}
        {isOwner && (
          <div className="glass p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Link2 size={14} /> Public share link
              </h2>
              {shareActive && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock size={12} /> {formatRemaining(share!.expires_at)}
                </span>
              )}
            </div>
            {shareActive ? (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 px-3 py-2 rounded-lg bg-muted/50 border border-border/30 text-sm outline-none font-mono text-xs"
                />
                <button
                  onClick={copy}
                  className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={generateOrRegen}
                  className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"
                  title="Regenerate"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {share
                    ? "Link expired. Generate a new one."
                    : "No active share link. Anyone with the link can view, download, and upload for 24 hours."}
                </p>
                <button
                  onClick={generateOrRegen}
                  className="px-4 py-2 rounded-lg gradient-accent text-white text-sm font-medium whitespace-nowrap"
                >
                  Generate link
                </button>
              </div>
            )}
          </div>
        )}

        <FolderFiles folderId={folderId} canDelete={isOwner} autoOpenUpload={upload === 1} />
      </motion.div>
    </div>
  );
}
