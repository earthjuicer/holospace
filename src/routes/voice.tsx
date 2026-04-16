import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Mic, MicOff, Headphones, PhoneOff, Plus, Users, Volume2, Hash,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/voice")({
  head: () => ({
    meta: [
      { title: "Voice Channels — Workspace" },
      { name: "description", content: "Discord-style voice channels for your team." },
    ],
  }),
  component: VoicePage,
});

interface VoiceChannel {
  id: string;
  name: string;
  created_by: string;
  is_active: boolean;
  max_participants: number;
}

function VoicePage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<VoiceChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetchChannels();
    const channel = supabase
      .channel("voice_channels_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_channels" }, () => {
        fetchChannels();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchChannels = async () => {
    const { data } = await supabase
      .from("voice_channels")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (data) setChannels(data);
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !user) return;
    const { error } = await supabase.from("voice_channels").insert({
      name: newChannelName.trim(),
      created_by: user.id,
    });
    if (error) {
      toast.error("Failed to create channel");
    } else {
      setNewChannelName("");
      setShowCreate(false);
      toast.success("Channel created!");
    }
  };

  const joinChannel = (channelId: string) => {
    setActiveChannel(channelId);
    toast.success("Joined voice channel");
  };

  const leaveChannel = () => {
    setActiveChannel(null);
    setIsMuted(false);
    setIsDeafened(false);
    toast("Left voice channel");
  };

  const activeChannelData = channels.find((c) => c.id === activeChannel);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Volume2 size={24} className="text-primary" />
              Voice Channels
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Join a channel to talk with your team
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="pill-button gradient-accent text-white flex items-center gap-1.5"
          >
            <Plus size={16} /> New Channel
          </button>
        </div>

        {/* Create channel form */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="glass p-4 flex items-center gap-3">
                <Hash size={18} className="text-muted-foreground" />
                <input
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Channel name"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  onKeyDown={(e) => e.key === "Enter" && createChannel()}
                />
                <button
                  onClick={createChannel}
                  className="px-4 py-1.5 rounded-lg gradient-accent text-white text-sm font-medium"
                >
                  Create
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Channel list */}
        <div className="space-y-2">
          {channels.map((channel, i) => (
            <motion.div
              key={channel.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`glass p-4 cursor-pointer transition-all hover:scale-[1.01] ${
                activeChannel === channel.id ? "ring-2 ring-primary/50" : ""
              }`}
              onClick={() =>
                activeChannel === channel.id ? leaveChannel() : joinChannel(channel.id)
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center">
                    <Volume2 size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{channel.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users size={12} />
                      {activeChannel === channel.id ? "1 connected" : "0 connected"}
                    </div>
                  </div>
                </div>
                {activeChannel === channel.id && (
                  <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-500 text-xs font-medium">
                    Connected
                  </span>
                )}
              </div>
            </motion.div>
          ))}

          {channels.length === 0 && (
            <div className="glass p-12 text-center">
              <Volume2 size={48} className="mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground">No voice channels yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Create one to start talking with your team
              </p>
            </div>
          )}
        </div>

        {/* Active call bar */}
        <AnimatePresence>
          {activeChannel && activeChannelData && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50"
            >
              <div className="glass-strong px-6 py-3 flex items-center gap-4 shadow-2xl">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm font-medium text-foreground">
                    {activeChannelData.name}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`p-2.5 rounded-xl transition-all ${
                      isMuted
                        ? "bg-destructive/20 text-destructive"
                        : "bg-muted/50 text-foreground hover:bg-muted"
                    }`}
                  >
                    {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  <button
                    onClick={() => setIsDeafened(!isDeafened)}
                    className={`p-2.5 rounded-xl transition-all ${
                      isDeafened
                        ? "bg-destructive/20 text-destructive"
                        : "bg-muted/50 text-foreground hover:bg-muted"
                    }`}
                  >
                    <Headphones size={18} />
                  </button>
                  <button
                    onClick={leaveChannel}
                    className="p-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all"
                  >
                    <PhoneOff size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
