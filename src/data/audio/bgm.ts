import type { Channel, Track } from './types';

/**
 * BGM (docs/GAME_DESIGN.md §15.1) as short chiptune loops rendered at runtime
 * (docs/ADR/0004-synthesized-audio.md). Each track is 4/4; patterns use the notation
 * of src/core/audio/notes.ts. Every channel of a track spans the same number of beats.
 */
export const BGM_KEYS = [
  'bgm_title',
  'bgm_village',
  'bgm_field',
  'bgm_forest',
  'bgm_mine',
  'bgm_ruins',
  'bgm_lighthouse',
  'bgm_battle',
  'bgm_boss',
  'bgm_ending',
  'bgm_gameover',
] as const;

export type BgmKey = (typeof BGM_KEYS)[number];

const bars = (...lines: string[]): string => lines.join(' | ');
const times = (pattern: string, n: number): string =>
  Array.from({ length: n }, () => pattern).join(' | ');

/** Root-position chord as four eighth-note arpeggio steps (1 3 5 3). */
const arp = (a: string, b: string, c: string): string => `${a} ${b} ${c} ${b}`;

const lead = (pattern: string, gain = 0.22): Channel => ({
  wave: 'square',
  pattern,
  gain,
  decay: 0.1,
  sustain: 0.55,
  release: 0.05,
  vibrato: { cents: 6, hz: 5 },
});
const flute = (pattern: string, gain = 0.2): Channel => ({
  wave: 'triangle',
  pattern,
  gain,
  attack: 0.02,
  decay: 0.2,
  sustain: 0.7,
  release: 0.08,
  vibrato: { cents: 10, hz: 4.5 },
});
const bass = (pattern: string, gain = 0.26): Channel => ({
  wave: 'triangle',
  pattern,
  gain,
  decay: 0.12,
  sustain: 0.5,
  release: 0.04,
});
const pad = (pattern: string, gain = 0.1): Channel => ({
  wave: 'sine',
  pattern,
  gain,
  attack: 0.05,
  decay: 0.3,
  sustain: 0.8,
  release: 0.1,
});
const pluck = (pattern: string, gain = 0.12): Channel => ({
  wave: 'pulse',
  pattern,
  gain,
  decay: 0.06,
  sustain: 0.2,
  release: 0.03,
});
const hat = (pattern: string, gain = 0.05): Channel => ({
  wave: 'noise',
  pattern,
  gain,
  attack: 0.001,
  decay: 0.03,
  sustain: 0,
  release: 0.01,
});
const snare = (pattern: string, gain = 0.1): Channel => ({
  wave: 'noise',
  pattern,
  gain,
  attack: 0.001,
  decay: 0.12,
  sustain: 0,
  release: 0.02,
});
const kick = (pattern: string, gain = 0.24): Channel => ({
  wave: 'sine',
  pattern,
  gain,
  attack: 0.001,
  decay: 0.09,
  sustain: 0,
  release: 0.02,
});

// A bar of rock drums: kick on 1 and 3, snare on 2 and 4, hats on every eighth.
const KICK_BAR = 'c2 r c2 r c2 r c2 r';
const SNARE_BAR = 'r r c3q r r c3q';
const HAT_BAR = 'c5 c5 c5 c5 c5 c5 c5 c5';

export const BGM_TRACKS: Readonly<Record<BgmKey, Track>> = {
  // 星空の下、ゆっくりと。Am – F – C – G を二周。
  bgm_title: {
    bpm: 72,
    loop: true,
    gain: 0.9,
    channels: [
      flute(
        bars(
          'e5q a5h e5q',
          'c5q f5h.',
          'g5q e5q c5h',
          'd5q b4q g4h',
          'e5q a5h g5q',
          'f5q a5q c6h',
          'b5q g5q e5h',
          'd5w',
        ),
      ),
      pad(
        bars(
          arp('a3', 'c4', 'e4') + ' ' + arp('a3', 'c4', 'e4'),
          arp('f3', 'a3', 'c4') + ' ' + arp('f3', 'a3', 'c4'),
          arp('c4', 'e4', 'g4') + ' ' + arp('c4', 'e4', 'g4'),
          arp('g3', 'b3', 'd4') + ' ' + arp('g3', 'b3', 'd4'),
          arp('a3', 'c4', 'e4') + ' ' + arp('a3', 'c4', 'e4'),
          arp('f3', 'a3', 'c4') + ' ' + arp('f3', 'a3', 'c4'),
          arp('e3', 'g3', 'b3') + ' ' + arp('e3', 'g3', 'b3'),
          arp('g3', 'b3', 'd4') + ' ' + arp('g3', 'b3', 'd4'),
        ),
        0.12,
      ),
      bass(bars('a2w', 'f2w', 'c3w', 'g2w', 'a2w', 'f2w', 'e2w', 'g2w'), 0.2),
    ],
  },
  // 港の村。跳ねる長調。C – G – Am – F。
  bgm_village: {
    bpm: 112,
    loop: true,
    gain: 0.9,
    channels: [
      lead(
        bars(
          'e5 g5 c6q g5 e5 g5q',
          'd5 g5 b5q g5 d5 b4q',
          'c5 e5 a5q e5 c5 a4q',
          'f5 a5 c6q a5 f5 g5q',
          'e5 g5 c6q g5 e5 g5q',
          'd5 f5 b5q g5 f5 d5q',
          'c5 e5 g5q a5 g5 e5q',
          'f5 e5 d5q c5h',
        ),
      ),
      pluck(
        bars(
          'r c4 e4 g4 r c4 e4 g4',
          'r b3 d4 g4 r b3 d4 g4',
          'r c4 e4 a4 r c4 e4 a4',
          'r c4 f4 a4 r c4 f4 a4',
          'r c4 e4 g4 r c4 e4 g4',
          'r b3 d4 g4 r b3 d4 g4',
          'r c4 e4 a4 r c4 e4 a4',
          'r c4 f4 a4 r b3 d4 g4',
        ),
      ),
      bass(
        bars(
          'c3q g2q c3q g2q',
          'g2q d2q g2q d2q',
          'a2q e2q a2q e2q',
          'f2q c3q f2q c3q',
          'c3q g2q c3q g2q',
          'g2q d2q g2q d2q',
          'a2q e2q a2q e2q',
          'f2q c3q g2q g2q',
        ),
      ),
      hat(times(HAT_BAR, 8)),
    ],
  },
  // 街道。行進する。G – D – Em – C。
  bgm_field: {
    bpm: 126,
    loop: true,
    gain: 0.9,
    channels: [
      lead(
        bars(
          'g4 b4 d5q d5 e5 d5q',
          'f#5 e5 d5q a4 b4 a4q',
          'e4 g4 b4q b4 c5 b4q',
          'a4 c5 e5q d5 c5 b4q',
          'g4 b4 d5q d5 e5 g5q',
          'f#5 e5 d5q d5 e5 f#5q',
          'g5 f#5 e5q d5 b4 g4q',
          'a4 b4 c5q d5h',
        ),
      ),
      pluck(
        bars(
          times('g3 b3 d4 b3', 2),
          times('a3 d4 f#4 d4', 2),
          times('g3 b3 e4 b3', 2),
          times('g3 c4 e4 c4', 2),
          times('g3 b3 d4 b3', 2),
          times('a3 d4 f#4 d4', 2),
          times('g3 b3 e4 b3', 2),
          'g3 c4 e4 c4 a3 d4 f#4 d4',
        ),
        0.1,
      ),
      bass(
        bars(
          'g2q g2 g2 d3q g2q',
          'd2q d2 d2 a2q d2q',
          'e2q e2 e2 b2q e2q',
          'c3q c3 c3 g2q c3q',
          'g2q g2 g2 d3q g2q',
          'd2q d2 d2 a2q d2q',
          'e2q e2 e2 b2q e2q',
          'c3q c3 d3q d3 d3q',
        ),
      ),
      kick(times(KICK_BAR, 8)),
      snare(times(SNARE_BAR, 8)),
    ],
  },
  // ささやきの森。短調で霧のよう。Em – C – D – Bm。
  bgm_forest: {
    bpm: 96,
    loop: true,
    gain: 0.85,
    channels: [
      flute(
        bars(
          'rq b4q e5q g5q',
          'f#5h. e5q',
          'rq a4q d5q f#5q',
          'e5w',
          'rq b4q e5q g5q',
          'a5h. g5q',
          'f#5q d5q b4q a4q',
          'b4w',
        ),
        0.18,
      ),
      pad(
        bars(
          times('e3 g3 b3 g3', 2),
          times('c3 e3 g3 e3', 2),
          times('d3 f#3 a3 f#3', 2),
          times('b2 d3 f#3 d3', 2),
          times('e3 g3 b3 g3', 2),
          times('c3 e3 g3 e3', 2),
          times('d3 f#3 a3 f#3', 2),
          times('b2 d3 f#3 d3', 2),
        ),
        0.14,
      ),
      bass(bars('e2w', 'c2w', 'd2w', 'b1w', 'e2w', 'c2w', 'd2w', 'b1w'), 0.18),
      hat(times('r r c5 r r r c5 r', 8), 0.03),
    ],
  },
  // 廃坑。低く、こつこつと。Dm – Bb – C – A。
  bgm_mine: {
    bpm: 100,
    loop: true,
    gain: 0.9,
    channels: [
      lead(
        bars(
          'd4 r f4 r a4q g4 f4',
          'e4 r d4 r f4h',
          'c4 r e4 r g4q f4 e4',
          'a3 r c#4 r e4h',
          'd4 r f4 r a4q g4 f4',
          'bb3 r d4 r f4h',
          'c4 r e4 r g4q a4 g4',
          'a4 g4 f4 e4 d4h',
        ),
        0.18,
      ),
      bass(
        bars(
          'd2 d2 r d2 r d2 a2 r',
          'bb1 bb1 r bb1 r bb1 f2 r',
          'c2 c2 r c2 r c2 g2 r',
          'a1 a1 r a1 r a1 e2 r',
          'd2 d2 r d2 r d2 a2 r',
          'bb1 bb1 r bb1 r bb1 f2 r',
          'c2 c2 r c2 r c2 g2 r',
          'a1 a1 a1 a1 a1 a1 a1 a1',
        ),
        0.3,
      ),
      kick(times('c2 r r c2 r r c2 r', 8)),
      snare(times('r r r r c3q r r', 8), 0.08),
      hat(times('c5 r c5 r c5 r c5 c5', 8), 0.04),
    ],
  },
  // 沈んだ遺跡。水の中のアルペジオ。Am – Em – F – G。
  bgm_ruins: {
    bpm: 84,
    loop: true,
    gain: 0.85,
    channels: [
      pad(
        bars(
          'a4s c5s e5s a5s e5s c5s a4s c5s e5s a5s e5s c5s a4s c5s e5s a5s',
          'e4s g4s b4s e5s b4s g4s e4s g4s b4s e5s b4s g4s e4s g4s b4s e5s',
          'f4s a4s c5s f5s c5s a4s f4s a4s c5s f5s c5s a4s f4s a4s c5s f5s',
          'g4s b4s d5s g5s d5s b4s g4s b4s d5s g5s d5s b4s g4s b4s d5s g5s',
          'a4s c5s e5s a5s e5s c5s a4s c5s e5s a5s e5s c5s a4s c5s e5s a5s',
          'e4s g4s b4s e5s b4s g4s e4s g4s b4s e5s b4s g4s e4s g4s b4s e5s',
          'f4s a4s c5s f5s c5s a4s f4s a4s c5s f5s c5s a4s f4s a4s c5s f5s',
          'g4s b4s d5s g5s d5s b4s g4s b4s d5s g5s d5s b4s g4s b4s d5s g5s',
        ),
        0.13,
      ),
      flute(
        bars(
          'r r c5q e5h',
          'r r b4q g4h',
          'r r a4q c5h',
          'd5q b4q g4h',
          'r r c5q e5h',
          'r r b4q e5h',
          'f5q e5q c5h',
          'b4w',
        ),
        0.16,
      ),
      bass(bars('a2w', 'e2w', 'f2w', 'g2w', 'a2w', 'e2w', 'f2w', 'g2w'), 0.18),
    ],
  },
  // 灯台の塔。張りつめて上へ。Cm – Ab – Bb – G。
  bgm_lighthouse: {
    bpm: 108,
    loop: true,
    gain: 0.9,
    channels: [
      lead(
        bars(
          'c5 eb5 g5 c6 g5 eb5 c5 eb5',
          'ab4 c5 eb5 ab5 eb5 c5 ab4 c5',
          'bb4 d5 f5 bb5 f5 d5 bb4 d5',
          'g4 b4 d5 g5 d5 b4 g4 b4',
          'c5 eb5 g5 c6 g5 eb5 c5 eb5',
          'ab4 c5 eb5 ab5 eb5 c5 ab4 c5',
          'bb4 d5 f5 bb5 f5 d5 bb4 d5',
          'g5q b5q d6h',
        ),
        0.16,
      ),
      flute(
        bars(
          'g5h. ab5q',
          'g5h f5h',
          'eb5h. d5q',
          'd5w',
          'g5h. ab5q',
          'bb5h ab5h',
          'g5h. f5q',
          'g5w',
        ),
        0.14,
      ),
      bass(
        bars(
          'c2 c2 c3 c2 c2 c2 c3 c2',
          'ab1 ab1 ab2 ab1 ab1 ab1 ab2 ab1',
          'bb1 bb1 bb2 bb1 bb1 bb1 bb2 bb1',
          'g1 g1 g2 g1 g1 g1 g2 g1',
          'c2 c2 c3 c2 c2 c2 c3 c2',
          'ab1 ab1 ab2 ab1 ab1 ab1 ab2 ab1',
          'bb1 bb1 bb2 bb1 bb1 bb1 bb2 bb1',
          'g1 g1 g2 g1 g2 g2 g2 g2',
        ),
        0.26,
      ),
      kick(times('c2 r c2 r c2 r c2 c2', 8)),
      hat(times(HAT_BAR, 8), 0.04),
    ],
  },
  // 通常戦闘。駆ける。Am – G – F – E。
  bgm_battle: {
    bpm: 150,
    loop: true,
    gain: 0.95,
    channels: [
      lead(
        bars(
          'a4 a4 c5 a4 e5 d5 c5 d5',
          'g4 g4 b4 g4 d5 c5 b4 c5',
          'f4 f4 a4 f4 c5 b4 a4 b4',
          'e4 g#4 b4 e5 g#5q e5q',
          'a4 a4 c5 a4 e5 d5 c5 d5',
          'g4 g4 b4 g4 d5 e5 f5 g5',
          'a5 g5 f5 e5 d5 c5 b4 c5',
          'e5q e5 e5 g#5h',
        ),
        0.2,
      ),
      pluck(
        bars(
          times('a3 e4 a4 e4', 2),
          times('g3 d4 g4 d4', 2),
          times('f3 c4 f4 c4', 2),
          times('e3 b3 e4 b3', 2),
          times('a3 e4 a4 e4', 2),
          times('g3 d4 g4 d4', 2),
          times('f3 c4 f4 c4', 2),
          times('e3 g#3 b3 g#3', 2),
        ),
        0.11,
      ),
      bass(
        bars(
          'a2 a2 a2 a2 a2 a2 g2 g2',
          'g2 g2 g2 g2 g2 g2 f2 f2',
          'f2 f2 f2 f2 f2 f2 e2 e2',
          'e2 e2 e2 e2 e2 e2 e2 e2',
          'a2 a2 a2 a2 a2 a2 g2 g2',
          'g2 g2 g2 g2 g2 g2 f2 f2',
          'f2 f2 f2 f2 f2 f2 e2 e2',
          'e2 e2 e2 e2 e2 e2 e2 e2',
        ),
        0.3,
      ),
      kick(times(KICK_BAR, 8)),
      snare(times(SNARE_BAR, 8), 0.12),
      hat(times(HAT_BAR, 8), 0.05),
    ],
  },
  // ボス戦。不穏に、速く。Dm – Eb – Dm – A。
  bgm_boss: {
    bpm: 140,
    loop: true,
    gain: 0.95,
    channels: [
      lead(
        bars(
          'd5 d5 f5 d5 ab5 g5 f5 e5',
          'eb5 eb5 g5 eb5 bb5 ab5 g5 f5',
          'd5 d5 f5 d5 a5 bb5 a5 f5',
          'e5 f5 e5 c#5 a4q c#5q',
          'd5 d5 f5 d5 ab5 g5 f5 e5',
          'eb5 eb5 g5 eb5 bb5 c6 bb5 ab5',
          'a5 bb5 a5 f5 d5 f5 e5 c#5',
          'd5q a4q d5h',
        ),
        0.2,
      ),
      flute(
        bars(
          'd4h. eb4q',
          'eb4h d4h',
          'f4h. e4q',
          'c#4w',
          'd4h. eb4q',
          'g4h f4h',
          'e4h. f4q',
          'd4w',
        ),
        0.1,
      ),
      bass(
        bars(
          'd2 d2 d3 d2 d2 d2 d3 d2',
          'eb2 eb2 eb3 eb2 eb2 eb2 eb3 eb2',
          'd2 d2 d3 d2 d2 d2 d3 d2',
          'a1 a1 a2 a1 a1 a1 a2 a1',
          'd2 d2 d3 d2 d2 d2 d3 d2',
          'eb2 eb2 eb3 eb2 eb2 eb2 eb3 eb2',
          'd2 d2 d3 d2 d2 d2 d3 d2',
          'a1 a1 a1 a1 a1 a1 a1 a1',
        ),
        0.3,
      ),
      kick(times('c2 c2 r c2 c2 r c2 r', 8)),
      snare(times('r r c3q r r c3 c3', 8), 0.12),
      hat(times(HAT_BAR, 8), 0.05),
    ],
  },
  // エンディング。あたたかく、終わりへ。C – Am – F – G, 最後は C。ループしない。
  bgm_ending: {
    bpm: 80,
    loop: false,
    gain: 0.9,
    channels: [
      flute(
        bars(
          'e5q g5q c6h',
          'a5q e5q c5h',
          'f5q a5q c6h',
          'b5q g5q d5h',
          'e5q g5q c6h',
          'a5q e5q c5q a4q',
          'f5q e5q d5q f5q',
          'e5w',
          'g5q a5q c6h',
          'a5q g5q e5h',
          'f5q g5q a5h',
          'g5q f5q d5h',
          'e5q d5q c5q d5q',
          'e5q g5q a5h',
          'g5h f5q d5q',
          'c5w',
          'c5w',
        ),
        0.2,
      ),
      pad(
        bars(
          ...Array.from({ length: 2 }, () => [
            times('c3 e3 g3 e3', 2),
            times('a2 c3 e3 c3', 2),
            times('f2 a2 c3 a2', 2),
            times('g2 b2 d3 b2', 2),
          ]).flat(),
          times('c3 e3 g3 e3', 2),
          times('a2 c3 e3 c3', 2),
          times('f2 a2 c3 a2', 2),
          times('g2 b2 d3 b2', 2),
          times('c3 e3 g3 e3', 2),
          times('a2 c3 e3 c3', 2),
          times('f2 g2 b2 g2', 2),
          times('c3 e3 g3 e3', 2),
          'c3w',
        ),
        0.12,
      ),
      bass(
        bars(
          'c2w',
          'a1w',
          'f1w',
          'g1w',
          'c2w',
          'a1w',
          'f1w',
          'g1w',
          'c2w',
          'a1w',
          'f1w',
          'g1w',
          'c2w',
          'a1w',
          'g1w',
          'c2w',
          'c2w',
        ),
        0.2,
      ),
    ],
  },
  // ゲームオーバー。短く沈む。ループしない。
  bgm_gameover: {
    bpm: 60,
    loop: false,
    gain: 0.9,
    channels: [
      flute(bars('e4q d4q c4q b3q', 'a3h. rq', 'f3q e3q d3q c3q', 'a2w'), 0.2),
      pad(bars('a3h f3h', 'e3h e3h', 'd3h f3h', 'a2w'), 0.12),
      bass(bars('a1w', 'e1w', 'd1w', 'a1w'), 0.2),
    ],
  },
};
