import { createContext, useContext, useState, type ReactNode } from "react";
import { useLiveKitRoom } from "./use-livekit-room";

/**
 * Lightweight metadata about the channel we're connected to. Stored alongside
 * the LiveKit room so that *anywhere* in the app can show "you're in #general"
 * and let the user leave — even after navigating away from /voice.
 */
export interface ActiveVoiceChannel {
  id: string;
  name: string;
  channel_type: string;
  category_id: string | null;
  created_by: string;
  position: number;
}

type LiveKit = ReturnType<typeof useLiveKitRoom>;

interface VoiceRoomContextValue extends LiveKit {
  activeChannel: ActiveVoiceChannel | null;
  setActiveChannel: (c: ActiveVoiceChannel | null) => void;
}

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

/**
 * Hosts a single LiveKit room for the entire app. Mounted once at the root —
 * navigating between routes no longer disconnects the user from voice.
 */
export function VoiceRoomProvider({ children }: { children: ReactNode }) {
  const lk = useLiveKitRoom();
  const [activeChannel, setActiveChannel] = useState<ActiveVoiceChannel | null>(null);

  return (
    <VoiceRoomContext.Provider value={{ ...lk, activeChannel, setActiveChannel }}>
      {children}
    </VoiceRoomContext.Provider>
  );
}

export function useVoiceRoom() {
  const ctx = useContext(VoiceRoomContext);
  if (!ctx) {
    throw new Error("useVoiceRoom must be used inside VoiceRoomProvider");
  }
  return ctx;
}
