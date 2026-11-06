// Gacha sound, synthesized with the Web Audio API: no audio files, no licensing.
// Browsers only allow audio after a user gesture, so everything starts from a click.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let music: { stop: () => void } | null = null;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, out: master! };
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function tone(midi: number, at: number, dur: number, { type = "sine" as OscillatorType, vol = 0.2, out }: { type?: OscillatorType; vol?: number; out?: AudioNode } = {}) {
  const { ctx, out: dest } = audio();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = hz(midi);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + Math.min(0.04, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out ?? dest);
  o.start(at);
  o.stop(at + dur + 0.05);
}

// Cmaj7 → Am7 → Fmaj7 → G6, soft pad with a slow arpeggio on top.
const CHORDS = [
  [48, 55, 59, 64],
  [45, 52, 55, 60],
  [41, 48, 52, 57],
  [43, 50, 55, 59],
];
const BAR = 2.4;

/** Ambient loop. Schedules a few bars ahead on a timer so it survives background throttling. */
export function startMusic() {
  if (music) return;
  const { ctx, out } = audio();
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 2);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1800;
  bus.connect(lp).connect(out);

  let bar = 0;
  let next = ctx.currentTime + 0.1;
  const schedule = () => {
    while (next < ctx.currentTime + 2 * BAR) {
      const chord = CHORDS[bar % CHORDS.length];
      chord.forEach((n) => tone(n, next, BAR * 1.1, { type: "triangle", vol: 0.05, out: bus }));
      [0, 1, 2, 3, 2, 1].forEach((k, i) => tone(chord[k] + 12, next + i * (BAR / 6), 0.5, { vol: 0.035, out: bus }));
      bar += 1;
      next += BAR;
    }
  };
  schedule();
  const timer = setInterval(schedule, 500);
  music = {
    stop: () => {
      clearInterval(timer);
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      setTimeout(() => bus.disconnect(), 1500);
    },
  };
}

export function stopMusic() {
  music?.stop();
  music = null;
}

/** Rattling capsules while the machine shakes. */
export function sfxShake(seconds = 1.1) {
  const { ctx } = audio();
  const t = ctx.currentTime;
  for (let i = 0; i < seconds * 22; i++) tone(84 + Math.floor(Math.random() * 10), t + i / 22 + Math.random() * 0.02, 0.05, { type: "square", vol: 0.025 });
}

/** Capsule popping open. */
export function sfxPop() {
  const { ctx, out } = audio();
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.2);
}

/** Reveal chime: rarer tiers get longer, higher arpeggios. */
export function sfxReveal(tier: 0 | 1 | 2 | 3) {
  const { ctx } = audio();
  const t = ctx.currentTime;
  const runs = [
    [72, 76, 79],
    [72, 76, 79, 84],
    [72, 76, 79, 83, 86, 91],
    [72, 76, 79, 84, 88, 91, 96, 100],
  ][tier];
  runs.forEach((n, i) => tone(n, t + i * 0.07, 0.9, { type: "triangle", vol: 0.12 }));
  if (tier === 3) [60, 64, 67, 72].forEach((n) => tone(n, t + 0.5, 2.2, { type: "sine", vol: 0.08 }));
}
