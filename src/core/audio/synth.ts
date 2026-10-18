import type { Channel, SeRecipe, Track, Wave } from '@data/audio/types';

import { parsePattern } from './notes';

/**
 * Software synth that renders tracks and sound effects to PCM (mono Float32), so the
 * music needs no audio files and can be unit-tested without Web Audio. The Phaser side
 * wraps the samples in an AudioBuffer (src/audio/AudioPlayer.ts).
 */
export interface Rendered {
  sampleRate: number;
  samples: Float32Array;
  /** Seconds the loop spans (the buffer length for a looping track). */
  seconds: number;
}

const TWO_PI = Math.PI * 2;

/** Deterministic noise so renders are reproducible. */
function noiseSource(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

function waveSample(wave: Wave, phase: number, noise: () => number): number {
  const t = phase - Math.floor(phase);
  switch (wave) {
    case 'square':
      return t < 0.5 ? 1 : -1;
    case 'pulse':
      return t < 0.25 ? 1 : -1;
    case 'triangle':
      return t < 0.5 ? -1 + 4 * t : 3 - 4 * t;
    case 'sawtooth':
      return 2 * t - 1;
    case 'sine':
      return Math.sin(TWO_PI * t);
    case 'noise':
      return noise();
  }
}

/** Linear attack / decay to sustain / release envelope, in seconds from note start. */
function envelope(
  t: number,
  length: number,
  attack: number,
  decay: number,
  sustain: number,
  release: number,
): number {
  if (t < 0) return 0;
  if (t >= length + release) return 0;
  let level: number;
  if (t < attack) level = t / attack;
  else if (t < attack + decay) level = 1 - (1 - sustain) * ((t - attack) / decay);
  else level = sustain;
  if (t > length) level *= 1 - (t - length) / release;
  return Math.max(0, level);
}

/** Renders one channel into `out` (added), given the beat length in seconds. */
function renderChannel(
  out: Float32Array,
  sampleRate: number,
  secondsPerBeat: number,
  channel: Channel,
  seed: number,
): void {
  const attack = channel.attack ?? 0.005;
  const decay = channel.decay ?? 0.08;
  const sustain = channel.sustain ?? 0.6;
  const release = channel.release ?? 0.04;
  const transpose = 2 ** ((channel.transpose ?? 0) / 12);
  const noise = noiseSource(seed);
  const total = out.length;
  for (const event of parsePattern(channel.pattern)) {
    if (event.freq === null) continue;
    const freq = event.freq * transpose;
    const startSample = Math.floor(event.start * secondsPerBeat * sampleRate);
    const lengthSec = event.length * secondsPerBeat * 0.95;
    const endSample = Math.min(total, startSample + Math.ceil((lengthSec + release) * sampleRate));
    let phase = 0;
    for (let i = startSample; i < endSample; i += 1) {
      const t = (i - startSample) / sampleRate;
      const env = envelope(t, lengthSec, attack, decay, sustain, release);
      if (env <= 0) continue;
      let f = freq;
      if (channel.vibrato) {
        f *= 2 ** ((channel.vibrato.cents / 1200) * Math.sin(TWO_PI * channel.vibrato.hz * t));
      }
      const value = waveSample(channel.wave, phase, noise);
      phase += f / sampleRate;
      const idx = i % total; // the release tail of the last note wraps into the loop start
      out[idx] = (out[idx] ?? 0) + value * env * channel.gain;
    }
  }
}

function softClip(x: number): number {
  return Math.tanh(x);
}

/** Beats a track spans: the longest channel (shorter ones are silent after their end). */
export function trackBeats(track: Track): number {
  return track.channels.reduce((n, c) => {
    const beats = parsePattern(c.pattern).reduce((m, e) => Math.max(m, e.start + e.length), 0);
    return Math.max(n, beats);
  }, 0);
}

/** Renders a whole track (one loop iteration) to mono PCM. */
export function renderTrack(track: Track, sampleRate: number): Rendered {
  const secondsPerBeat = 60 / track.bpm;
  const seconds = trackBeats(track) * secondsPerBeat;
  const length = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(length);
  track.channels.forEach((channel, i) =>
    renderChannel(out, sampleRate, secondsPerBeat, channel, 7 + i),
  );
  for (let i = 0; i < length; i += 1) out[i] = softClip((out[i] ?? 0) * track.gain);
  return { sampleRate, samples: out, seconds };
}

/** Renders a sound effect to mono PCM. */
export function renderSe(recipe: SeRecipe, sampleRate: number): Rendered {
  const seconds = recipe.steps.reduce(
    (n, s) => Math.max(n, s.at + s.duration + (s.release ?? 0.02)),
    0,
  );
  const length = Math.max(1, Math.ceil(seconds * sampleRate));
  const out = new Float32Array(length);
  recipe.steps.forEach((step, i) => {
    const noise = noiseSource(31 + i);
    const attack = step.attack ?? 0.003;
    const release = step.release ?? 0.02;
    const start = Math.floor(step.at * sampleRate);
    const end = Math.min(length, start + Math.ceil((step.duration + release) * sampleRate));
    const to = step.freqTo ?? step.freq;
    let phase = 0;
    for (let s = start; s < end; s += 1) {
      const t = (s - start) / sampleRate;
      const env = envelope(t, step.duration, attack, 0.0001, 1, release);
      if (env <= 0) continue;
      const k = Math.min(1, t / step.duration);
      const f = step.freq * (to / step.freq) ** k;
      out[s] = (out[s] ?? 0) + waveSample(step.wave, phase, noise) * env * step.gain;
      phase += f / sampleRate;
    }
  });
  for (let i = 0; i < length; i += 1) out[i] = softClip(out[i] ?? 0);
  return { sampleRate, samples: out, seconds };
}

/** Peak absolute sample value (tests, loudness checks). */
export function peak(samples: Float32Array): number {
  let p = 0;
  for (const v of samples) p = Math.max(p, Math.abs(v));
  return p;
}
