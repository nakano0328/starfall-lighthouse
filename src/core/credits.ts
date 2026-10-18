/**
 * Staff roll source (docs/GAME_DESIGN.md §11.5): the credit tables of docs/CREDITS.md
 * are parsed at build time so every asset row shows up in the ending without a second
 * list to maintain. Pure TypeScript; the markdown text arrives from src/data/credits.ts.
 */

export interface CreditRow {
  name: string;
  author: string;
  license: string;
  url: string;
  usage: string;
}

export interface CreditSection {
  title: string;
  rows: CreditRow[];
}

/** Sections that carry no credits (rules, prose about generated art). */
const SKIPPED_SECTIONS = new Set(['ルール', '画像（生成素材）']);
/** Placeholder rows for material not chosen yet. */
const PLACEHOLDER = /^（.*）$/;

const cellsOf = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

const stripUrl = (cell: string): string => cell.replace(/^<|>$/g, '');

/**
 * Reads every `## 見出し` section of the credits markdown and its table rows. Rows
 * whose material is still undecided (`（未確定）`) and the header/separator lines are
 * left out; sections without a confirmed row are dropped.
 */
export function parseCredits(markdown: string): CreditSection[] {
  const sections: CreditSection[] = [];
  let current: CreditSection | null = null;
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading) {
      const title = heading[1]?.trim() ?? '';
      current = SKIPPED_SECTIONS.has(title) ? null : { title, rows: [] };
      if (current) sections.push(current);
      continue;
    }
    if (!current || !line.startsWith('|')) continue;
    const cells = cellsOf(line);
    if (cells.length < 5) continue;
    const [name = '', author = '', license = '', url = '', usage = ''] = cells;
    if (name === '素材・ライブラリ' || /^-+$/.test(name) || PLACEHOLDER.test(name)) continue;
    current.rows.push({ name, author, license, url: stripUrl(url), usage });
  }
  return sections.filter((s) => s.rows.length > 0);
}

/** One credit as it scrolls: name, then author and license on the next line. */
export function creditLines(row: CreditRow): string[] {
  const by = [row.author, row.license].filter((s) => s !== '' && s !== '—').join(' / ');
  return by === '' ? [row.name] : [row.name, by];
}

/**
 * The full roll: the opening block, each credit section, then the closing block.
 * Blank strings are spacer lines; the caller renders the array as is.
 */
export function staffRoll(
  sections: readonly CreditSection[],
  opening: readonly string[],
  closing: readonly string[],
): string[] {
  const lines: string[] = [...opening];
  for (const section of sections) {
    lines.push('', section.title, '');
    for (const row of section.rows) lines.push(...creditLines(row));
  }
  lines.push('', ...closing);
  return lines;
}
