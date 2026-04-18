import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Hash, Send, Trash2, ArrowLeft, AtSign, Smile } from "lucide-react";
import { toast } from "sonner";
import { ChannelSidebar } from "@/components/ChannelSidebar";
import { createPortal } from "react-dom";

export const Route = createFileRoute("/text/$channelId")({
  head: () => ({
    meta: [
      { title: "Text Channel — Workspace" },
      { name: "description", content: "Chat in a text channel." },
    ],
  }),
  component: TextChannelPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center">
      <p className="text-destructive mb-2">Error: {error.message}</p>
      <Link to="/voice" className="text-primary underline">
        Back to channels
      </Link>
    </div>
  ),
});

interface ChannelInfo {
  id: string;
  name: string;
  channel_type: string;
}

interface Message {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

interface AuthorProfile {
  display_name: string | null;
  avatar_url: string | null;
}

interface WorkspaceUser {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

// Common emoji set for the picker
const EMOJI_LIST = [
  "😀","😂","😍","🥰","😎","🤔","😅","🙏","👍","👎",
  "❤️","🔥","✅","⚡","🎉","🚀","💡","⭐","🎯","💯",
  "😢","😡","🤯","🥳","😴","🤗","😏","🙄","😱","🤩",
  "👋","✌️","🤝","💪","🫂","👀","💬","📌","🔔","🗓️",
];

// Portal emoji picker to avoid z-index collisions
function EmojiPicker({
  onSelect,
  onClose,
  anchorRef,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [pos, setPos] = useState({ bottom: 0, left: 0 });

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 6,
      left: Math.min(rect.left, window.innerWidth - 290),
    });
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const picker = document.getElementById("emoji-picker-portal");
      if (picker && !picker.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return createPortal(
    <div
      id="emoji-picker-portal"
      className="fixed glass-strong p-3 rounded-2xl shadow-2xl"
      style={{ bottom: pos.bottom, left: pos.left, zIndex: 99999, width: 280 }}
    >
      <div className="grid grid-cols-10 gap-1">
        {EMOJI_LIST.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose(); }}
            className="text-xl hover:bg-muted/60 rounded-lg p-1 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

// Portal mention picker
function MentionPicker({
  users,
  query,
  onSelect,
  anchorRef,
}: {
  users: WorkspaceUser[];
  query: string;
  onSelect: (user: WorkspaceUser) => void;
  anchorRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [pos, setPos] = useState({ bottom: 0, left: 0 });

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left });
  }, [anchorRef]);

  const filtered = users.filter((u) => {
    const q = query.toLowerCase();
    return (
      (u.display_name?.toLowerCase().includes(q) ?? false) ||
      (u.username?.toLowerCase().includes(q) ?? false)
    );
  }).slice(0, 6);

  if (filtered.length === 0) return null;

  return createPortal(
    <div
      className="fixed glass-strong rounded-xl shadow-2xl overflow-hidden"
      style={{ bottom: pos.bottom, left: pos.left, zIndex: 99999, minWidth: 200 }}
    >
      {filtered.map((u) => (
        <button
          key={u.user_id}
          onMouseDown={(e) => { e.preventDefault(); onSelect(u); }}
          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/60 w-full text-left transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium overflow-hidden shrink-0">
            {u.avatar_url ? (
              <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (u.display_name || u.username || "?").charAt(0).toUpperCase()
            )}
          </div>
          <span className="text-sm font-medium">
            {u.display_name || u.username || "Unknown"}
          </span>
        </button>
      ))}
    </div>,
    document.body
  );
}

function TextChannelPage() {
  const { channelId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorProfile>>({});
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  // Mention state
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchChannel();
    fetchMessages();
    // Load workspace users for mentions
    supabase.rpc("list_workspace_users").then(({ data }) => {
      if (data) setWorkspaceUsers(data as WorkspaceUser[]);
    });

    const sub = supabase
      .channel(`text-channel-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "text_messages", filter: `channel_id=eq.${channelId}` },
        () => fetchMessages()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const fetchChannel = async () => {
    const { data } = await supabase
      .from("voice_channels")
      .select("id, name, channel_type")
      .eq("id", channelId)
      .maybeSingle();
    if (data) setChannel(data as ChannelInfo);
    setLoading(false);
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("text_messages")
      .select("id, channel_id, author_id, content, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data) {
      setMessages(data as Message[]);
      const ids = Array.from(new Set(data.map((m) => m.author_id)));
      const missing = ids.filter((id) => !authors[id]);
      if (missing.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", missing);
        if (profs) {
          setAuthors((prev) => {
            const next = { ...prev };
            profs.forEach((p) => {
              next[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
            });
            return next;
          });
        }
      }
    }
  };

  const handleDraftChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDraft(val);

    // Detect @mention trigger
    const cursor = e.target.selectionStart ?? val.length;
    const textUpToCursor = val.slice(0, cursor);
    const mentionMatch = textUpToCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
    } else {
      setMentionQuery(null);
    }
  }, []);

  const insertMention = useCallback((u: WorkspaceUser) => {
    const name = u.display_name || u.username || "user";
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const textUpToCursor = draft.slice(0, cursor);
    const replaced = textUpToCursor.replace(/@(\w*)$/, `@${name} `);
    setDraft(replaced + draft.slice(cursor));
    setMentionQuery(null);
    textareaRef.current?.focus();
  }, [draft]);

  const insertEmoji = useCallback((emoji: string) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    setDraft(draft.slice(0, cursor) + emoji + draft.slice(cursor));
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [draft]);

  const sendMessage = async () => {
    if (!draft.trim() || !user) return;
    const content = draft.trim();
    setDraft("");
    setMentionQuery(null);

    // Insert the message
    const { data: msgData, error } = await supabase.from("text_messages").insert({
      channel_id: channelId,
      author_id: user.id,
      content,
    }).select("id").maybeSingle();

    if (error) {
      toast.error("Could not send message");
      setDraft(content);
      return;
    }

    // Detect @mentions and notify each pinged user in real time
    const mentionMatches = content.match(/@(\w+)/g);
    if (mentionMatches && workspaceUsers.length > 0) {
      const mentionedNames = mentionMatches.map((m) => m.slice(1).toLowerCase());
      const mentionedUsers = workspaceUsers.filter((u) => {
        const name = (u.display_name || u.username || "").toLowerCase().replace(/\s+/g, "");
        return mentionedNames.some((mn) => name.includes(mn) || mn.includes(name));
      });

      // Insert a notification row for each mentioned user (skip self)
      const notifRows = mentionedUsers
        .filter((u) => u.user_id !== user.id)
        .map((u) => ({
          recipient_id: u.user_id,
          actor_id: user.id,
          type: "mention",
          channel_id: channelId,
          message_id: msgData?.id ?? null,
          preview: content.length > 80 ? content.slice(0, 80) + "…" : content,
        }));

      if (notifRows.length > 0) {
        await supabase.from("notifications").insert(notifRows);
      }
    }
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("text_messages").delete().eq("id", id);
    if (error) toast.error("Could not delete");
  };

  return (
    <div className="flex h-full">
      <ChannelSidebar
        activeTextId={channelId}
        onJoinVoice={(ch) =>
          navigate({ to: "/voice", search: { channelId: ch.id } })
        }
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border/40 glass flex items-center gap-2 shrink-0">
          <Hash size={20} className="text-muted-foreground" />
          <h1 className="font-semibold text-foreground truncate">
            {loading ? "…" : channel?.name ?? "Channel not found"}
          </h1>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {!loading && channel?.channel_type !== "text" && channel && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              This is a voice channel.{" "}
              <Link to="/voice" className="text-primary underline">
                Go to voice
              </Link>
            </div>
          )}

          {!loading && messages.length === 0 && channel?.channel_type === "text" && (
            <div className="text-center py-12">
              <Hash size={48} className="mx-auto mb-3 text-muted-foreground/30" />
              <h2 className="font-semibold text-foreground">Welcome to #{channel.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                This is the start of the conversation.
              </p>
            </div>
          )}

          <div className="space-y-3 max-w-3xl mx-auto">
            {messages.map((m, i) => {
              const author = authors[m.author_id];
              const name = author?.display_name || "User";
              const prev = messages[i - 1];
              const grouped = prev && prev.author_id === m.author_id;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 group"
                >
                  <div className="w-9 h-9 shrink-0">
                    {!grouped && (
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-sm font-medium overflow-hidden">
                        {author?.avatar_url ? (
                          <img src={author.avatar_url} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          name.charAt(0).toUpperCase()
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {!grouped && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-foreground">{name}</span>
                        <span className="text-[11px] text-muted-foreground/70">
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    {/* Render @mentions with highlight */}
                    <div className="text-sm text-foreground/90 break-words whitespace-pre-wrap">
                      {m.content.split(/(@\w+)/g).map((part, pi) =>
                        part.startsWith("@") ? (
                          <span key={pi} className="text-primary font-medium bg-primary/10 rounded px-0.5">
                            {part}
                          </span>
                        ) : (
                          part
                        )
                      )}
                    </div>
                  </div>
                  {m.author_id === user?.id && (
                    <button
                      onClick={() => deleteMessage(m.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Composer */}
        {channel?.channel_type === "text" && (
          <div className="px-4 py-3 border-t border-border/40 shrink-0">
            <div className="max-w-3xl mx-auto flex items-end gap-2 relative">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={handleDraftChange}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setMentionQuery(null); setShowEmojiPicker(false); return; }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={`Message #${channel.name} — type @ to mention`}
                  rows={1}
                  className="w-full resize-none px-4 py-2.5 pr-10 rounded-xl bg-muted/60 border border-border/30 text-sm outline-none focus:ring-2 focus:ring-primary/40 max-h-32"
                />
                <button
                  ref={emojiButtonRef}
                  type="button"
                  onClick={() => setShowEmojiPicker((v) => !v)}
                  className="absolute right-2.5 bottom-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Emoji"
                >
                  <Smile size={16} />
                </button>
              </div>
              <button
                onClick={() => {
                  const ta = textareaRef.current;
                  const cursor = ta?.selectionStart ?? draft.length;
                  setDraft(draft.slice(0, cursor) + "@" + draft.slice(cursor));
                  setMentionQuery("");
                  ta?.focus();
                }}
                className="p-2.5 rounded-xl bg-muted/60 border border-border/30 text-muted-foreground hover:text-primary transition-colors"
                title="Mention someone"
              >
                <AtSign size={18} />
              </button>
              <button
                onClick={sendMessage}
                disabled={!draft.trim()}
                className="p-2.5 rounded-xl gradient-accent text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="Send"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        )}

        {!loading && !channel && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <p>Channel not found</p>
            <Link to="/voice" className="flex items-center gap-1 text-primary text-sm">
              <ArrowLeft size={14} /> Back to channels
            </Link>
          </div>
        )}
      </div>

      {/* Portal-based mention picker */}
      {mentionQuery !== null && (
        <MentionPicker
          users={workspaceUsers}
          query={mentionQuery}
          onSelect={insertMention}
          anchorRef={textareaRef}
        />
      )}

      {/* Portal-based emoji picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={insertEmoji}
          onClose={() => setShowEmojiPicker(false)}
          anchorRef={emojiButtonRef}
        />
      )}
    </div>
  );
}
