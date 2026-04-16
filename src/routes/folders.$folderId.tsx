import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FolderFiles } from "@/components/FolderFiles";
import { FolderMemberPanel } from "@/components/FolderMemberPanel";
import { ArrowLeft, Link2, RefreshCw, Copy, Clock, Trash2, Link2Off, ChevronDown, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const EXPIRY_OPTIONS = [
  { label: "1 hour", value: "1h", interval: "1 hour", short: "1h" },
  { label: "24 hours", value: "24h", interval: "24 hours", short: "24h" },
  { label: "7 days", value: "7d", interval: "7 days", short: "7d" },
  { label: "Never", value: "never", interval: "100 years", short: "∞" },
] as const;

type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]["value"];

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
  allow_upload: boolean;
}

function formatRemaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  // Treat anything beyond ~10 years as "never expires" (for the "Never" preset).
  if (ms > 10 * 365 * 24 * 3600 * 1000) return "Never expires";
  const days = Math.floor(ms / (24 * 3600000));
  if (days >= 1) {
    const remH = Math.floor((ms % (24 * 3600000)) / 3600000);
    return remH > 0 ? `${days}d ${remH}h left` : `${days}d left`;
  }
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function FolderDetailPage() {
  const { folderId } = Route.useParams();
  const { upload } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [loading, setLoading] = useState(true);
  const [expiry, setExpiry] = useState<ExpiryValue>("24h");
  const [generating, setGenerating] = useState(false);
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
            .select("token, expires_at, allow_upload")
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

  const generateOrRegen = async (value: ExpiryValue = expiry, allowUpload?: boolean) => {
    const opt = EXPIRY_OPTIONS.find((o) => o.value === value) ?? EXPIRY_OPTIONS[1];
    const nextAllowUpload = allowUpload ?? share?.allow_upload ?? true;
    setGenerating(true);
    const { data, error } = await supabase.rpc("regen_share_token", {
      _folder_id: folderId,
      _expires_in: opt.interval,
      _allow_upload: nextAllowUpload,
    });
    setGenerating(false);
    if (error || !data?.[0]) {
      toast.error(error?.message || "Failed to generate link");
      return;
    }
    setShare({
      token: data[0].token,
      expires_at: data[0].expires_at,
      allow_upload: data[0].allow_upload,
    });
    setExpiry(value);
    toast.success(
      value === "never"
        ? "Share link generated — never expires"
        : `New share link · expires in ${opt.label.toLowerCase()}`
    );
  };

  const toggleAllowUpload = async () => {
    if (!share) return;
    const next = !share.allow_upload;
    // Optimistic UI
    setShare({ ...share, allow_upload: next });
    const { error } = await supabase.rpc("set_share_allow_upload", {
      _folder_id: folderId,
      _allow_upload: next,
    });
    if (error) {
      // Revert
      setShare({ ...share });
      toast.error(error.message || "Failed to update permission");
      return;
    }
    toast.success(next ? "Visitors can now upload" : "Link is now read-only");
  };

  // Revoke the public share immediately by deleting the row. The /share/:token
  // page will return "not found" the moment this completes, so anyone holding
  // the old link can no longer view, download, or upload to this folder.
  const stopSharing = async () => {
    if (!confirm("Stop sharing this folder? The current link will stop working immediately.")) return;
    const { error } = await supabase
      .from("folder_public_shares")
      .delete()
      .eq("folder_id", folderId);
    if (error) {
      toast.error(error.message || "Failed to stop sharing");
      return;
    }
    setShare(null);
    toast.success("Sharing stopped");
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
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-muted/50 border border-border/30 outline-none font-mono text-xs"
                  />
                  <button
                    onClick={copy}
                    className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground shrink-0"
                    title="Copy"
                    aria-label="Copy link"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={stopSharing}
                    className="p-2 rounded-lg hover:bg-destructive/10 text-destructive shrink-0"
                    title="Stop sharing"
                    aria-label="Stop sharing folder"
                  >
                    <Link2Off size={14} />
                  </button>
                </div>

                {/* Permission toggle */}
                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
                  <div className="flex items-center gap-2 min-w-0">
                    {share!.allow_upload ? (
                      <Unlock size={14} className="text-primary shrink-0" />
                    ) : (
                      <Lock size={14} className="text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-foreground">
                        {share!.allow_upload ? "Allow upload" : "Read-only"}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {share!.allow_upload
                          ? "Visitors can view, download, and upload files"
                          : "Visitors can only view and download files"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={toggleAllowUpload}
                    role="switch"
                    aria-checked={share!.allow_upload}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      share!.allow_upload ? "bg-primary" : "bg-muted-foreground/40"
                    }`}
                    title={
                      share!.allow_upload
                        ? "Switch to read-only"
                        : "Allow visitors to upload"
                    }
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform ${
                        share!.allow_upload ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Regenerate with:</span>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => generateOrRegen(opt.value)}
                      disabled={generating}
                      className="px-2.5 py-1 rounded-md bg-muted/40 hover:bg-muted/70 text-xs text-foreground border border-border/30 disabled:opacity-50 transition-colors flex items-center gap-1"
                      title={`New link expiring in ${opt.label.toLowerCase()}`}
                    >
                      <RefreshCw size={11} className="text-muted-foreground" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
                  {share
                    ? "Link expired. Generate a new one."
                    : "No active share link. Anyone with the link can view, download, and upload."}
                </p>
                <div className="flex items-center gap-0">
                  <button
                    onClick={() => generateOrRegen(expiry)}
                    disabled={generating}
                    className="px-4 py-2 rounded-l-lg gradient-accent text-white text-sm font-medium whitespace-nowrap disabled:opacity-60"
                  >
                    {generating ? "Generating…" : `Generate (${EXPIRY_OPTIONS.find(o => o.value === expiry)?.label})`}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="px-2 py-2 rounded-r-lg gradient-accent text-white border-l border-white/20 disabled:opacity-60"
                        aria-label="Choose expiry"
                        disabled={generating}
                      >
                        <ChevronDown size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {EXPIRY_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.value}
                          onClick={() => setExpiry(opt.value)}
                        >
                          Expires in {opt.label.toLowerCase()}
                          {expiry === opt.value && (
                            <span className="ml-auto text-primary">✓</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </div>
        )}

        {isOwner && <FolderMemberPanel folderId={folderId} ownerId={folder.owner_id} />}

        <FolderFiles folderId={folderId} canDelete={isOwner} autoOpenUpload={upload === 1} />
      </motion.div>
    </div>
  );
}
