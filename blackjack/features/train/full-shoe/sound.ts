/** Short table sounds. One shared AudioContext; any failure is silent (sound is an extra). */
export type Blip = "deal" | "chip" | "good" | "bad" | "win";

const FREQUENCY: Record<Blip, number> = { deal: 330, chip: 440, good: 660, bad: 180, win: 880 };
let context: AudioContext | undefined;

export function blip(kind: Blip, enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "bad" ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime(FREQUENCY[kind], context.currentTime);
    gain.gain.setValueAtTime(0.05, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
  } catch {
    // Sound is enhancement only.
  }
}
