import { describe, expect, it } from 'vitest';

import { noteFrequency, parsePattern, patternBeats } from '@core/audio/notes';

describe('note notation', () => {
  it('tunes to A4 = 440 Hz in equal temperament', () => {
    expect(noteFrequency('a4')).toBeCloseTo(440);
    expect(noteFrequency('A4')).toBeCloseTo(440);
    expect(noteFrequency('c4')).toBeCloseTo(261.63, 1);
    expect(noteFrequency('c#4')).toBeCloseTo(277.18, 1);
    expect(noteFrequency('db4')).toBeCloseTo(277.18, 1);
    expect(noteFrequency('a5')).toBeCloseTo(880);
    expect(() => noteFrequency('h4')).toThrow();
  });

  it('parses notes, rests, durations, dots and bar lines', () => {
    const events = parsePattern('c4q | e4 g4 r4 b4h. | a4s');
    expect(
      events.map((e) => [e.start, e.length, e.freq === null ? null : Math.round(e.freq)]),
    ).toEqual([
      [0, 1, 262],
      [1, 0.5, 330],
      [1.5, 0.5, 392],
      [2, 0.5, null],
      [2.5, 3, 494],
      [5.5, 0.25, 440],
    ]);
    expect(patternBeats('c4q | e4 g4 r4 b4h. | a4s')).toBe(5.75);
  });

  it('ties equal notes together and defaults the octave to 4', () => {
    const events = parsePattern('c~ c~ cq d');
    expect(events).toHaveLength(2);
    expect(events[0]?.length).toBe(2);
    expect(Math.round(events[0]?.freq ?? 0)).toBe(262);
    expect(events[1]?.start).toBe(2);
  });

  it('rejects unknown tokens', () => {
    expect(() => parsePattern('c4 x9')).toThrow(/bad pattern token/);
  });
});
