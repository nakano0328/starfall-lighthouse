/**
 * Reveals a string one character at a time. `msPerChar` 0 shows everything at
 * once. Line breaks are revealed with the character before them so the layout
 * does not jump. Pure: feed it elapsed milliseconds.
 */
export class Typewriter {
  private readonly chars: string[];
  private shown = 0;
  private accumulator = 0;

  constructor(
    readonly text: string,
    private msPerChar: number,
  ) {
    this.chars = [...text];
    if (msPerChar <= 0) this.shown = this.chars.length;
  }

  get done(): boolean {
    return this.shown >= this.chars.length;
  }

  get visibleText(): string {
    return this.chars.slice(0, this.shown).join('');
  }

  /** Changes the speed from now on (e.g. fast-forward while a key is held). */
  setSpeed(msPerChar: number): void {
    this.msPerChar = msPerChar;
    if (msPerChar <= 0) this.shown = this.chars.length;
  }

  /** Shows the whole text immediately. */
  reveal(): void {
    this.shown = this.chars.length;
  }

  /** Advances by `dtMs`; returns the number of newly revealed characters. */
  update(dtMs: number): number {
    if (this.done) return 0;
    if (this.msPerChar <= 0) {
      const n = this.chars.length - this.shown;
      this.shown = this.chars.length;
      return n;
    }
    this.accumulator += Math.max(0, dtMs);
    let revealed = 0;
    while (this.accumulator >= this.msPerChar && !this.done) {
      this.accumulator -= this.msPerChar;
      this.shown += 1;
      revealed += 1;
      // Pull a following newline in with the character so lines never dangle.
      while (!this.done && this.chars[this.shown] === '\n') {
        this.shown += 1;
        revealed += 1;
      }
    }
    return revealed;
  }
}
