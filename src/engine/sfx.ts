/**
 * High-performance Web Audio API Sound Effects Engine for captions & word transitions.
 * Synthesizes realistic mechanical keyboard switches, typewriters, pops, and digital taps
 * with zero external assets, zero latency, and micro-pitch jitter for organic feel.
 */

export type SfxSoundType = 'mechanical' | 'typewriter' | 'pop' | 'tap';
export type SfxTrigger = 'word' | 'caption';

export type SfxConfig = {
  enabled: boolean;
  sound: SfxSoundType;
  trigger: SfxTrigger;
  volume: number; // 0 to 1
  offset: number; // seconds (-0.1 to 0.1)
  mutedIds?: string[];
};

export const defaultSfx: SfxConfig = {
  enabled: true,
  sound: 'mechanical',
  trigger: 'word',
  volume: 0.7,
  offset: 0,
  mutedIds: [],
};

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Synthesize a mechanical keyboard switch click (Cherry MX Blue/Brown style) */
function playMechanicalClick(ctx: AudioContext, gainNode: GainNode, now: number) {
  // Slight pitch jitter so each keystroke feels like a physical key switch
  const jitter = 0.94 + Math.random() * 0.12;

  // 1. High-frequency click transient (noise burst)
  const bufferSize = Math.floor(ctx.sampleRate * 0.015); // 15ms
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.003));
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(3600 * jitter, now);
  bandpass.Q.setValueAtTime(4, now);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.8, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

  noise.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(gainNode);
  noise.start(now);

  // 2. Tactile bottom-out thump (plastic keycap hitting backplate)
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(620 * jitter, now);
  osc.frequency.exponentialRampToValueAtTime(140 * jitter, now + 0.025);

  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

  osc.connect(oscGain);
  oscGain.connect(gainNode);

  osc.start(now);
  osc.stop(now + 0.03);
}

/** Synthesize a vintage typewriter mechanical strike & clack */
function playTypewriterClick(ctx: AudioContext, gainNode: GainNode, now: number) {
  const jitter = 0.95 + Math.random() * 0.1;

  // Metallic strike transient
  const osc1 = ctx.createOscillator();
  const osc1Gain = ctx.createGain();
  osc1.type = 'square';
  osc1.frequency.setValueAtTime(1800 * jitter, now);
  osc1.frequency.exponentialRampToValueAtTime(300, now + 0.03);

  osc1Gain.gain.setValueAtTime(0.5, now);
  osc1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  osc1.connect(osc1Gain);
  osc1Gain.connect(gainNode);
  osc1.start(now);
  osc1.stop(now + 0.035);

  // Deep carriage frame clack
  const osc2 = ctx.createOscillator();
  const osc2Gain = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(280 * jitter, now);
  osc2.frequency.exponentialRampToValueAtTime(60, now + 0.04);

  osc2Gain.gain.setValueAtTime(0.7, now);
  osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc2.connect(osc2Gain);
  osc2Gain.connect(gainNode);
  osc2.start(now);
  osc2.stop(now + 0.045);
}

/** Synthesize a viral pop click (popular in Alex Hormozi reels) */
function playPopClick(ctx: AudioContext, gainNode: GainNode, now: number) {
  const jitter = 0.97 + Math.random() * 0.06;
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1400 * jitter, now);
  osc.frequency.exponentialRampToValueAtTime(220 * jitter, now + 0.035);

  oscGain.gain.setValueAtTime(0.85, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  osc.connect(oscGain);
  oscGain.connect(gainNode);
  osc.start(now);
  osc.stop(now + 0.04);
}

/** Synthesize a subtle modern digital tap */
function playDigitalTap(ctx: AudioContext, gainNode: GainNode, now: number) {
  const jitter = 0.96 + Math.random() * 0.08;
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(2200 * jitter, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.015);

  oscGain.gain.setValueAtTime(0.4, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

  osc.connect(oscGain);
  oscGain.connect(gainNode);
  osc.start(now);
  osc.stop(now + 0.02);
}

/**
 * Play a specific sound effect preset at a given volume.
 */
export function playSfxSound(sound: SfxSoundType = 'mechanical', volume: number = 0.7) {
  const ctx = getAudioContext();
  if (!ctx || volume <= 0) return;

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), now);
  masterGain.connect(ctx.destination);

  switch (sound) {
    case 'mechanical':
      playMechanicalClick(ctx, masterGain, now);
      break;
    case 'typewriter':
      playTypewriterClick(ctx, masterGain, now);
      break;
    case 'pop':
      playPopClick(ctx, masterGain, now);
      break;
    case 'tap':
      playDigitalTap(ctx, masterGain, now);
      break;
  }
}
