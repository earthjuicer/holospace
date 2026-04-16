// Synthesized join/leave sounds via WebAudio — no audio files required.
// Discord-style: a quick rising 2-note chirp for join, a falling chirp for leave.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Resume if suspended (autoplay policies)
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function playTone(freqs: number[], durationMs: number, volume = 0.18) {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime;
  const dur = durationMs / 1000;
  const noteDur = dur / freqs.length;

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  gain.connect(audio.destination);

  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freqs[0], now);
  for (let i = 1; i < freqs.length; i++) {
    osc.frequency.exponentialRampToValueAtTime(freqs[i], now + noteDur * i);
  }
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

export function playJoinSound() {
  // Rising two-note chirp: C5 -> G5
  playTone([523.25, 783.99], 220);
}

export function playLeaveSound() {
  // Falling two-note chirp: G5 -> C5
  playTone([783.99, 523.25], 260);
}
