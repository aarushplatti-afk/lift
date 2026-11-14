interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

const TONES: readonly { freq: number; offset: number }[] = [
  { freq: 880, offset: 0 },
  { freq: 1320, offset: 0.17 },
];
const TONE_SEC = 0.15;
const PEAK_GAIN = 0.2;

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const w = window as WebkitWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockChime(): void {
  const c = getContext();
  if (!c) return;
  try {
    void Promise.resolve(c.resume()).catch(() => undefined);
  } catch {
    return;
  }
}

export function playChime(): void {
  const c = ctx;
  if (!c || c.state !== 'running') return;
  try {
    const start = c.currentTime;
    for (const tone of TONES) {
      const t0 = start + tone.offset;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, t0 + 0.02);
      gain.gain.linearRampToValueAtTime(0, t0 + TONE_SEC);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + TONE_SEC);
    }
  } catch {
    return;
  }
}
