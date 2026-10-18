import { describe, expect, it } from 'vitest';

import { peak, renderSe, renderTrack, trackBeats } from '@core/audio/synth';
import type { Track } from '@data/audio/types';

const RATE = 8000;

const track: Track = {
  bpm: 120,
  loop: true,
  gain: 0.9,
  channels: [
    { wave: 'square', pattern: 'c4q e4q g4q c5q', gain: 0.3 },
    { wave: 'triangle', pattern: 'c3h g2h', gain: 0.3 },
    { wave: 'noise', pattern: 'c5 c5 c5 c5 c5 c5 c5 c5', gain: 0.1, decay: 0.02, sustain: 0 },
  ],
};

describe('software synth', () => {
  it('renders a track to one loop of mono PCM at the given rate', () => {
    expect(trackBeats(track)).toBe(4);
    const r = renderTrack(track, RATE);
    expect(r.sampleRate).toBe(RATE);
    expect(r.seconds).toBeCloseTo(2);
    expect(r.samples.length).toBe(RATE * 2);
    expect(peak(r.samples)).toBeGreaterThan(0.1);
    expect(peak(r.samples)).toBeLessThanOrEqual(1);
  });

  it('is deterministic (noise included)', () => {
    const a = renderTrack(track, RATE).samples;
    const b = renderTrack(track, RATE).samples;
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });

  it('plays rests as silence', () => {
    const quiet = renderTrack(
      { ...track, channels: [{ wave: 'sine', pattern: 'rq c4q', gain: 0.5 }] },
      RATE,
    );
    const firstBeat = quiet.samples.subarray(0, RATE / 2 - 10);
    expect(peak(firstBeat)).toBe(0);
    expect(peak(quiet.samples.subarray(RATE / 2, RATE))).toBeGreaterThan(0.1);
  });

  it('renders sound effects with sweeps', () => {
    const se = renderSe(
      { steps: [{ wave: 'square', freq: 880, freqTo: 220, at: 0, duration: 0.1, gain: 0.5 }] },
      RATE,
    );
    expect(se.samples.length).toBeGreaterThanOrEqual(Math.floor(0.12 * RATE));
    expect(se.samples.length).toBeLessThanOrEqual(Math.ceil(0.12 * RATE) + 1);
    expect(peak(se.samples)).toBeGreaterThan(0.3);
  });
});
