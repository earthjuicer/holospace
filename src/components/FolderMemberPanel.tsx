import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserPlus, X, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface WorkspaceUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface ShareRow {
  id: string;
  shared_with_user_id: string;
  role: string;
  created_at: string;
}

interface MemberEntry extends ShareRow {
  profile?: WorkspaceUser;
}

interface Props {
  folderId: string;
  ownerId: string;
}

/**
 * Per-user share manager. Lets the folder owner grant signed-in workspace
 * users access to a folder and revoke them individually. Backed by the
 * existing `folder_shares` table — RLS already restricts manage rights to
 * the folder owner, so we only render this panel when isOwner is true.
 */
export function FolderMemberPanel({ folderId, ownerId }: Props) {
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<WorkspaceUser[]>([]);
  const [query, setQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: shares, error: sErr }, { data: users, error: uErr }] = await Promise.all([
      supabase
        .from("folder_shares")
        .select("id, shared_with_user_id, role, created_at")
        .eq("folder_id", folderId)
        .order("created_at", { ascending: true }),
      supabase.rpc("list_workspace_users"),
    ]);

    if (sErr) toast.error(sErr.message);
    if (uErr) toast.error(uErr.message);

    const userList = (users ?? []) as WorkspaceUser[];
    setAllUsers(userList);

    const byId = new Map(userList.map((u) => [u.user_id, u]));
    setMembers(
      ((shares ?? []) as ShareRow[]).map((s) => ({
        ...s,
        profile: byId.get(s.shared_with_user_id),
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

  // Close picker on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showPicker]);

  const memberIds = useMemo(
    () => new Set(members.map((m) => m.shared_with_user_id)),
    [members]
  );

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allUsers
      .filter((u) => u.user_id !== ownerId && !memberIds.has(u.user_id))
      .filter((u) => {
        if (!q) return true;
        const haystack = `${u.username ?? ""} ${u.display_name ?? ""}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 8);
  }, [allUsers, memberIds, ownerId, query]);

  const grant = async (user: WorkspaceUser) => {
    setAdding(user.user_id);
    const { data, error } = await supabase
      .from("folder_shares")
      .insert({
        folder_id: folderId,
        shared_with_user_id: user.user_id,
        role: "viewer",
      })
      .select("id, shared_with_user_id, role, created_at")
      .single();
    setAdding(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembers((prev) => [...prev, { ...(data as ShareRow), profile: user }]);
    toast.success(`Shared with ${user.display_name || user.username || "user"}`);
    setQuery("");
  };

  const revoke = async (m: MemberEntry) => {
    const name = m.profile?.display_name || m.profile?.username || "this user";
    if (!confirm(`Revoke access for ${name}?`)) return;
    setRevoking(m.id);
    const { error } = await supabase.from("folder_shares").delete().eq("id", m.id);
    setRevoking(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMembers((prev) => prev.filter((x) => x.id !== m.id));
    toast.success("Access revoked");
  };

  return (
    <div className="glass p-4 mb-6" ref={containerRef}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users size={14} /> Shared with
          {!loading && (
            <span className="text-xs font-normal text-muted-foreground">
              ({members.length})
            </span>
          )}
        </h2>
      </div>

      {/* Add user search */}
      <div className="relative mb-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/30 focus-within:border-primary/40 transition-colors">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowPicker(true);
            }}
            onFocus={() => setShowPicker(true)}
            placeholder="Add by username or name…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>

        <AnimatePresence>
          {showPicker && (query.length > 0 || candidates.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 mt-1 z-10 rounded-lg border border-border/50 bg-popover shadow-lg overflow-hidden"
            >
              {candidates.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  {query
                    ? "No matching users found."
                    : "No more users available to add."}
                </div>
              ) : (
                <ul className="max-h-64 overflow-auto py-1">
                  {candidates.map((u) => {
                    const isAdding = adding === u.user_id;
                    return (
                      <li key={u.user_id}>
                        <button
                          onClick={() => grant(u)}
                          disabled={isAdding}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/60 disabled:opacity-60 text-left"
                        >
                          <Avatar user={u} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {u.display_name || u.username || "Unnamed user"}
                            </div>
                            {u.username && u.display_name && (
                              <div className="text-[11px] text-muted-foreground truncate">
                                @{u.username}
                              </div>
                            )}
                          </div>
                          {isAdding ? (
                            <Loader2 size={14} className="animate-spin text-primary shrink-0" />
                          ) : (
                            <UserPlus size={14} className="text-primary shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Members list */}
      {loading ? (
        <div className="text-xs text-muted-foreground py-2">Loading members…</div>
      ) : members.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          No one else has access yet. Add a workspace user above to share this folder.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {members.map((m) => {
            const u = m.profile;
            const isRevoking = revoking === m.id;
            return (
              <li
                key={m.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/40 group"
              >
                <Avatar user={u} fallbackId={m.shared_with_user_id} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {u?.display_name || u?.username || "Unknown user"}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {u?.username ? `@${u.username} · ` : ""}
                    {m.role === "editor" ? "Can edit" : "Can view"}
                  </div>
                </div>
                <button
                  onClick={() => revoke(m)}
                  disabled={isRevoking}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-60 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                  title="Revoke access"
                  aria-label={`Revoke access for ${u?.display_name || u?.username || "user"}`}
                >
                  {isRevoking ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <X size={14} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Avatar({ user, fallbackId }: { user?: WorkspaceUser; fallbackId?: string }) {
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        className="w-7 h-7 rounded-full object-cover shrink-0"
      />
    );
  }
  const name = user?.display_name || user?.username || fallbackId || "?";
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
      {initial}
    </div>
  );
}
