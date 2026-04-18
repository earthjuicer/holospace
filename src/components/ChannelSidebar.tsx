import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, ChevronRight, Plus, Volume2, Hash, Trash2, FolderPlus, Bell, Mic, MicOff, PhoneOff,
} from "lucide-react";
import { useVoiceRoom } from "@/hooks/voice-room-context";
import { playLeaveSound, playMuteSound, playUnmuteSound } from "@/lib/voice-sounds";
import { toast } from "sonner";
import { ringChannel } from "@/lib/ring-actions";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export interface SidebarChannel {
  id: string;
  name: string;
  channel_type: "voice" | "text";
  category_id: string | null;
  created_by: string;
  position: number;
}

export interface SidebarCategory {
  id: string;
  name: string;
  position: number;
}

interface Props {
  activeVoiceId?: string | null;
  activeTextId?: string | null;
  onJoinVoice: (ch: SidebarChannel) => void;
}

export function ChannelSidebar({ activeVoiceId, activeTextId, onJoinVoice }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const lk = useVoiceRoom();

  const handleMute = async () => {
    const muted = await lk.toggleMute();
    if (muted) playMuteSound();
    else playUnmuteSound();
  };

  const handleLeave = async () => {
    await lk.disconnect();
    lk.setActiveChannel(null);
    playLeaveSound();
    toast("Left voice channel");
  };
  const [categories, setCategories] = useState<SidebarCategory[]>([]);
  const [channels, setChannels] = useState<SidebarChannel[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Create dialogs
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showChannelDialog, setShowChannelDialog] = useState<{
    type: "voice" | "text";
    categoryId: string | null;
  } | null>(null);
  const [draftName, setDraftName] = useState("");

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "channel"; id: string; name: string }
    | { kind: "category"; id: string; name: string }
    | null
  >(null);

  useEffect(() => {
    fetchAll();
    const ch1 = supabase
      .channel("sidebar-voice-channels")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_channels" }, fetchChannels)
      .subscribe();
    const ch2 = supabase
      .channel("sidebar-categories")
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_categories" }, fetchCategories)
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = async () => {
    await Promise.all([fetchCategories(), fetchChannels()]);
  };

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("channel_categories")
      .select("id, name, position")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setCategories(data as SidebarCategory[]);
  };

  const fetchChannels = async () => {
    const { data } = await supabase
      .from("voice_channels")
      .select("id, name, channel_type, category_id, created_by, position")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (data) setChannels(data as unknown as SidebarChannel[]);
  };

  const createCategory = async () => {
    if (!draftName.trim() || !user) return;
    const { error } = await supabase.from("channel_categories").insert({
      name: draftName.trim().toUpperCase(),
      created_by: user.id,
      position: categories.length,
    });
    if (error) toast.error("Could not create category");
    else toast.success("Category created");
    setDraftName("");
    setShowCategoryDialog(false);
  };

  const createChannel = async () => {
    if (!draftName.trim() || !user || !showChannelDialog) return;
    const inCat = channels.filter((c) => c.category_id === showChannelDialog.categoryId);
    const { error } = await supabase.from("voice_channels").insert({
      name: draftName.trim().toLowerCase().replace(/\s+/g, "-"),
      created_by: user.id,
      channel_type: showChannelDialog.type,
      category_id: showChannelDialog.categoryId,
      position: inCat.length,
      is_active: true,
    });
    if (error) toast.error("Could not create channel");
    else toast.success("Channel created");
    setDraftName("");
    setShowChannelDialog(null);
  };

  const deleteChannel = async (id: string) => {
    const { error } = await supabase.from("voice_channels").delete().eq("id", id);
    if (error) toast.error("Could not delete");
    else toast.success("Channel deleted");
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("channel_categories").delete().eq("id", id);
    if (error) toast.error("Could not delete");
    else toast.success("Category deleted");
  };

  const channelsByCategory = (catId: string | null) =>
    channels.filter((c) => c.category_id === catId);

  const renderChannel = (ch: SidebarChannel) => {
    const Icon = ch.channel_type === "voice" ? Volume2 : Hash;
    const isActive =
      (ch.channel_type === "voice" && activeVoiceId === ch.id) ||
      (ch.channel_type === "text" && activeTextId === ch.id);

    return (
      <ContextMenu key={ch.id}>
        <ContextMenuTrigger asChild>
          <button
            onClick={() => {
              if (ch.channel_type === "voice") onJoinVoice(ch);
              else navigate({ to: "/text/$channelId", params: { channelId: ch.id } });
            }}
            className={`group w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
              isActive
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            <Icon size={16} className="shrink-0 opacity-70" />
            <span className="truncate flex-1 text-left">{ch.name}</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete({ kind: "channel", id: ch.id, name: ch.name });
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-opacity cursor-pointer"
              title="Delete channel"
              role="button"
              tabIndex={0}
            >
              <Trash2 size={12} />
            </span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {ch.channel_type === "voice" && (
            <ContextMenuItem onClick={() => ringChannel(ch.id)}>
              <Bell size={14} className="mr-2" /> Ring everyone in {ch.name}
            </ContextMenuItem>
          )}
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setConfirmDelete({ kind: "channel", id: ch.id, name: ch.name })}
          >
            <Trash2 size={14} className="mr-2" /> Delete channel
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderCategory = (cat: SidebarCategory | null) => {
    const isUncategorized = cat === null;
    const id = cat?.id ?? "__uncategorized";
    const isCollapsed = collapsed[id];
    const list = channelsByCategory(cat?.id ?? null);
    if (isUncategorized && list.length === 0) return null;

    return (
      <div key={id} className="mb-1">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex items-center gap-1 px-1 py-1 group">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
                className="flex items-center gap-1 flex-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                <span className="truncate">{cat?.name ?? "Channels"}</span>
              </button>
              <button
                onClick={() => {
                  setShowChannelDialog({ type: "voice", categoryId: cat?.id ?? null });
                  setDraftName("");
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity"
                title="Create channel"
              >
                <Plus size={12} />
              </button>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => {
                setShowChannelDialog({ type: "voice", categoryId: cat?.id ?? null });
                setDraftName("");
              }}
            >
              <Volume2 size={14} className="mr-2" /> Create voice channel
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                setShowChannelDialog({ type: "text", categoryId: cat?.id ?? null });
                setDraftName("");
              }}
            >
              <Hash size={14} className="mr-2" /> Create text channel
            </ContextMenuItem>
            {cat && (
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete({ kind: "category", id: cat.id, name: cat.name })}
              >
                <Trash2 size={14} className="mr-2" /> Delete category
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>

        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-0.5 pl-1"
            >
              {list.map(renderChannel)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <aside className="w-60 shrink-0 h-full glass border-r border-border/40 flex flex-col">
      <div className="px-3 py-3 border-b border-border/30 flex items-center justify-between">
        <span className="text-sm font-semibold gradient-accent-text">Channels</span>
        <button
          onClick={() => {
            setShowCategoryDialog(true);
            setDraftName("");
          }}
          className="p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          title="New category"
        >
          <FolderPlus size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Uncategorized channels */}
        {renderCategory(null)}
        {/* Categories */}
        {categories.map((cat) => renderCategory(cat))}

        {channels.length === 0 && categories.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground/70">
            No channels yet. Click + to create one.
          </div>
        )}
      </div>

      {/* Voice status — shows when connected, pinned at bottom of sidebar */}
      {lk.isConnected && lk.activeChannel && (
        <div className="px-2 pb-2 pt-1 border-t border-border/30 shrink-0">
          <div className="glass rounded-xl px-3 py-2 flex items-center gap-2">
            <button
              onClick={() => navigate({ to: "/voice", search: {} as any })}
              className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              title="Open voice channel"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-foreground truncate">
                  {lk.activeChannel.name}
                </div>
                <div className="text-[10px] text-muted-foreground">Voice connected</div>
              </div>
            </button>
            <button
              onClick={handleMute}
              className={`p-1.5 rounded-lg transition-colors ${
                lk.isMuted
                  ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                  : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
              title={lk.isMuted ? "Unmute" : "Mute"}
            >
              {lk.isMuted ? <MicOff size={13} /> : <Mic size={13} />}
            </button>
            <button
              onClick={handleLeave}
              className="p-1.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              title="Leave voice channel"
            >
              <PhoneOff size={13} />
            </button>
          </div>
        </div>
      )}

      {/* New category dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createCategory()}
            placeholder="e.g. General"
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border/40 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <DialogFooter>
            <button
              onClick={() => setShowCategoryDialog(false)}
              className="px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={createCategory}
              className="px-4 py-1.5 rounded-lg gradient-accent text-white text-sm font-medium"
            >
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New channel dialog */}
      <Dialog open={!!showChannelDialog} onOpenChange={(o) => !o && setShowChannelDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              New {showChannelDialog?.type === "voice" ? "voice" : "text"} channel
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => showChannelDialog && setShowChannelDialog({ ...showChannelDialog, type: "text" })}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
                showChannelDialog?.type === "text"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Hash size={14} /> Text
            </button>
            <button
              onClick={() => showChannelDialog && setShowChannelDialog({ ...showChannelDialog, type: "voice" })}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
                showChannelDialog?.type === "voice"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Volume2 size={14} /> Voice
            </button>
          </div>
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createChannel()}
            placeholder="channel-name"
            className="w-full px-3 py-2 rounded-lg bg-muted border border-border/40 text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <DialogFooter>
            <button
              onClick={() => setShowChannelDialog(null)}
              className="px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={createChannel}
              className="px-4 py-1.5 rounded-lg gradient-accent text-white text-sm font-medium"
            >
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {confirmDelete?.kind === "category" ? "category" : "channel"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{confirmDelete?.name}</span> will be
            permanently removed
            {confirmDelete?.kind === "category"
              ? ". Channels inside will be moved out of the category."
              : "."}
          </p>
          <DialogFooter>
            <button
              onClick={() => setConfirmDelete(null)}
              className="px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (!confirmDelete) return;
                if (confirmDelete.kind === "channel") await deleteChannel(confirmDelete.id);
                else await deleteCategory(confirmDelete.id);
                setConfirmDelete(null);
              }}
              className="px-4 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
