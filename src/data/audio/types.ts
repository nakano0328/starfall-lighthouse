/** Waveforms the software synth knows (docs/ADR/0004-synthesized-audio.md). */
export type Wave = 'square' | 'pulse' | 'triangle' | 'sawtooth' | 'sine' | 'noise';

export interface Channel {
  wave: Wave;
  /** Note pattern (src/core/audio/notes.ts). All channels of a track span the same beats. */
  pattern: string;
  /** Peak gain 0〜1 before the track's master gain. */
  gain: number;
  /** Envelope in seconds; defaults are short and plucky. */
  attack?: number;
  decay?: number;
  /** Sustain level 0〜1 of the peak after the decay. */
  sustain?: number;
  release?: number;
  /** Semitone offset applied to every note (e.g. −12 for a bass doubling). */
  transpose?: number;
  /** Vibrato depth in cents and rate in Hz. */
  vibrato?: { cents: number; hz: number };
}

export interface Track {
  bpm: number;
  loop: boolean;
  /** Master gain 0〜1. */
  gain: number;
  channels: Channel[];
}

/** One tone of a sound effect: a short frequency sweep with its own envelope. */
export interface SeStep {
  wave: Wave;
  freq: number;
  /** End frequency of a sweep; defaults to `freq`. */
  freqTo?: number;
  /** Start offset within the effect, seconds. */
  at: number;
  duration: number;
  gain: number;
  attack?: number;
  release?: number;
}

export interface SeRecipe {
  steps: SeStep[];
}
