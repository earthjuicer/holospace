import { useNavigate, useLocation } from "@tanstack/react-router";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useVoiceRoom } from "@/hooks/voice-room-context";
import { playLeaveSound, playMuteSound, playUnmuteSound } from "@/lib/voice-sounds";
import { toast } from "sonner";

/**
 * Persistent mini bar that appears whenever the user is connected to a voice
 * channel. It floats above all routes so the user *stays* in voice while
 * browsing chat, folders, etc. — they only leave by hitting the hangup button.
 */
export function VoiceStatusBar() {
  const lk = useVoiceRoom();
  const navigate = useNavigate();
  const location = useLocation();

  const visible = lk.isConnected && !!lk.activeChannel;
  const onVoicePage = location.pathname.startsWith("/voice");

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

  return (
    <AnimatePresence>
      {visible && !onVoicePage && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-40 glass border border-border/40 shadow-lg rounded-full px-3 py-2 flex items-center gap-2"
        >
          <button
            onClick={() =>
              navigate({
                to: "/voice",
                search: {} as any,
              })
            }
            className="flex items-center gap-2 pl-1 pr-2 hover:opacity-80 transition-opacity min-w-0"
            title="Open voice channel"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <Volume2 size={14} className="text-primary shrink-0" />
            <div className="text-left min-w-0 max-w-[140px]">
              <div className="text-xs font-medium text-foreground truncate">
                {lk.activeChannel!.name}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Voice connected
              </div>
            </div>
          </button>

          <div className="w-px h-6 bg-border/60" />

          <button
            onClick={handleMute}
            className={`p-2 rounded-full transition-colors ${
              lk.isMuted
                ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                : "hover:bg-muted/60 text-foreground"
            }`}
            title={lk.isMuted ? "Unmute" : "Mute"}
            aria-label={lk.isMuted ? "Unmute" : "Mute"}
          >
            {lk.isMuted ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
          <button
            onClick={handleLeave}
            className="p-2 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            title="Leave voice channel"
            aria-label="Leave voice channel"
          >
            <PhoneOff size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
