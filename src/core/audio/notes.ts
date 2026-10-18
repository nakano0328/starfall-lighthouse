/**
 * Note notation for the generated music (docs/ADR/0004-synthesized-audio.md).
 *
 * A pattern is a space-separated list of tokens, bars optionally split with `|`:
 *   `c4`   a note (letter, optional `#`/`b`, octave), one eighth note long by default
 *   `g#3q` duration suffix: `w` whole, `h` half, `q` quarter, (none) eighth, `s` sixteenth,
 *          `.` after the suffix adds half again (`c4q.`), `~` ties to the next token's length
 *   `r`    a rest (same duration suffixes)
 * Durations are in beats (a quarter note = 1 beat).
 */
export interface NoteEvent {
  /** Start in beats from the pattern start. */
  start: number;
  /** Length in beats. */
  length: number;
  /** Frequency in Hz; null for a rest (kept so callers can see the gaps). */
  freq: number | null;
}

const SEMITONES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DURATIONS: Record<string, number> = { w: 4, h: 2, q: 1, '': 0.5, s: 0.25 };

const TOKEN = /^([a-gr])([#b]?)(\d?)([whqs]?)(\.?)(~?)$/;

/** Frequency of a note name such as `a4` (440 Hz) in twelve-tone equal temperament. */
export function noteFrequency(name: string): number {
  const m = /^([a-g])([#b]?)(\d)$/.exec(name.toLowerCase());
  if (!m) throw new Error(`bad note: ${name}`);
  const [, letter = 'c', accidental = '', octave = '4'] = m;
  const semitone =
    (SEMITONES[letter] ?? 0) + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = (Number(octave) + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Parses a pattern into note events; throws on an unknown token. */
export function parsePattern(pattern: string): NoteEvent[] {
  const events: NoteEvent[] = [];
  let cursor = 0;
  let tied: NoteEvent | null = null;
  for (const raw of pattern.split(/\s+/)) {
    const token = raw.trim().toLowerCase();
    if (token === '' || token === '|') continue;
    const m = TOKEN.exec(token);
    if (!m) throw new Error(`bad pattern token: ${raw}`);
    const [, letter = 'r', accidental = '', octave = '', dur = '', dot = '', tie = ''] = m;
    let length = DURATIONS[dur] ?? 0.5;
    if (dot === '.') length *= 1.5;
    if (letter === 'r') {
      events.push({ start: cursor, length, freq: null });
      tied = null;
    } else {
      const freq = noteFrequency(`${letter}${accidental}${octave === '' ? '4' : octave}`);
      if (tied && tied.freq === freq) {
        tied.length += length;
        if (tie !== '~') tied = null;
      } else {
        const event: NoteEvent = { start: cursor, length, freq };
        events.push(event);
        tied = tie === '~' ? event : null;
      }
    }
    cursor += length;
  }
  return events;
}

/** Total length of a pattern in beats. */
export function patternBeats(pattern: string): number {
  return parsePattern(pattern).reduce((n, e) => Math.max(n, e.start + e.length), 0);
}
