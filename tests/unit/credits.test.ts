import { describe, expect, it } from 'vitest';

import { creditLines, parseCredits, staffRoll } from '@core/credits';
import { CREDIT_SECTIONS, STAFF_ROLL_LINES, STAFF_ROLL_OPENING } from '@data/credits';

const SAMPLE = `# クレジット

## ルール

- 素材を追加したら本表に 1 行追加する

| 素材・ライブラリ | 作者 | ライセンス | URL | 使用箇所 |
| --- | --- | --- | --- | --- |
| ルール表の行 | x | y | z | w |

## ライブラリ

| 素材・ライブラリ | 作者              | ライセンス | URL                 | 使用箇所           |
| ---------------- | ----------------- | ---------- | ------------------- | ------------------ |
| Phaser 3         | Photon Storm Ltd. | MIT        | <https://phaser.io> | ゲームエンジン全体 |

## フォント

| 素材・ライブラリ | 作者 | ライセンス | URL | 使用箇所 |
| ---------------- | ---- | ---------- | --- | -------- |
| （未確定）       | —    | —          | —   | UI 全般  |

## BGM・SE

| 素材・ライブラリ | 作者 | ライセンス | URL | 使用箇所 |
| ---------------- | ---- | ---------- | --- | -------- |
| 星の歌           | 作曲家 A | CC BY 4.0 | <https://example.com/a> | タイトル |
| （未確定）       | —    | —          | —   | SE       |
`;

describe('credits (§11.5 staff roll from docs/CREDITS.md)', () => {
  it('parses credit tables per section, skipping rules, headers and undecided rows', () => {
    const sections = parseCredits(SAMPLE);
    expect(sections.map((s) => s.title)).toEqual(['ライブラリ', 'BGM・SE']);
    expect(sections[0]?.rows).toEqual([
      {
        name: 'Phaser 3',
        author: 'Photon Storm Ltd.',
        license: 'MIT',
        url: 'https://phaser.io',
        usage: 'ゲームエンジン全体',
      },
    ]);
    expect(sections[1]?.rows.map((r) => r.name)).toEqual(['星の歌']);
  });

  it('renders a credit as name plus author and license', () => {
    expect(
      creditLines({
        name: 'Phaser 3',
        author: 'Photon Storm Ltd.',
        license: 'MIT',
        url: '',
        usage: '',
      }),
    ).toEqual(['Phaser 3', 'Photon Storm Ltd. / MIT']);
    expect(creditLines({ name: 'X', author: '—', license: '—', url: '', usage: '' })).toEqual([
      'X',
    ]);
  });

  it('builds the roll from the opening, the sections and the closing', () => {
    const lines = staffRoll(parseCredits(SAMPLE), ['Title'], ['Thanks']);
    expect(lines).toEqual([
      'Title',
      '',
      'ライブラリ',
      '',
      'Phaser 3',
      'Photon Storm Ltd. / MIT',
      '',
      'BGM・SE',
      '',
      '星の歌',
      '作曲家 A / CC BY 4.0',
      '',
      'Thanks',
    ]);
  });

  it('reads the real docs/CREDITS.md and lists Phaser', () => {
    expect(CREDIT_SECTIONS.map((s) => s.title)).toContain('ライブラリ');
    expect(STAFF_ROLL_LINES.slice(0, STAFF_ROLL_OPENING.length)).toEqual([...STAFF_ROLL_OPENING]);
    expect(STAFF_ROLL_LINES).toContain('Phaser 3');
    expect(STAFF_ROLL_LINES.some((l) => l.includes('未確定'))).toBe(false);
  });
});
