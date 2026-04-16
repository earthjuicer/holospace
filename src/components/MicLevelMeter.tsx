interface Props {
  /** 0..1 from LiveKit's Participant.audioLevel */
  level: number;
  isMuted: boolean;
  /** Optional className for sizing — default is a 4-segment mini meter */
  className?: string;
}

/**
 * Tiny 4-bar mic level meter. Renders dimmed bars for muted participants and
 * fills bars proportional to `level`. Used beside each participant so you can
 * see at a glance whether their mic is actually transmitting audio.
 */
export function MicLevelMeter({ level, isMuted, className = "" }: Props) {
  const bars = 4;
  // Audio levels from LiveKit are typically 0..0.5 in normal speech — scale up
  // so a normal speaker fills ~3 of 4 bars instead of barely registering.
  const scaled = Math.min(1, level * 3);
  const active = isMuted ? 0 : Math.round(scaled * bars);

  return (
    <div
      className={`flex items-end gap-[2px] h-3 ${className}`}
      aria-label={isMuted ? "Microphone muted" : `Mic level ${Math.round(scaled * 100)}%`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isMuted ? 0 : Math.round(scaled * 100)}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const filled = i < active;
        const heights = ["h-1", "h-1.5", "h-2", "h-3"];
        return (
          <span
            key={i}
            className={`w-[3px] rounded-sm transition-colors ${heights[i]} ${
              isMuted
                ? "bg-muted-foreground/20"
                : filled
                ? "bg-primary"
                : "bg-muted-foreground/30"
            }`}
          />
        );
      })}
    </div>
  );
}
