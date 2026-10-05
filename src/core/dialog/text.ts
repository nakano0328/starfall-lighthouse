/**
 * Replaces the control tokens of dialog text (docs/GAME_DESIGN.md §10.1):
 * `{luka}` `{mio}` `{goro}` party names, `{gold}` the purse, `{item:it_x}` an
 * item's display name. Unknown tokens are left as written so they show up in
 * play-testing instead of disappearing silently.
 */
export interface TextContext {
  names: Readonly<Record<string, string>>;
  gold: number;
  itemName: (id: string) => string | undefined;
}

const TOKEN = /\{([a-z_]+)(?::([a-z0-9_]+))?\}/g;

export function formatDialogText(text: string, ctx: TextContext): string {
  return text.replace(TOKEN, (match, key: string, arg: string | undefined) => {
    if (key === 'gold') return String(ctx.gold);
    if (key === 'item') return (arg !== undefined ? ctx.itemName(arg) : undefined) ?? match;
    const name = ctx.names[key];
    return name ?? match;
  });
}
