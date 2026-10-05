import type { DialogNode } from '@data/types';

import coast from './coast.json';
import forest from './forest.json';
import minato from './minato.json';

/** Node shape as written in the JSON files: the id is the object key. */
export type DialogNodeJson = Omit<DialogNode, 'id'>;

const FILES: Readonly<Record<string, Readonly<Record<string, DialogNodeJson>>>> = {
  coast: coast as Record<string, DialogNodeJson>,
  forest: forest as Record<string, DialogNodeJson>,
  minato: minato as Record<string, DialogNodeJson>,
};

function build(): Readonly<Record<string, DialogNode>> {
  const out: Record<string, DialogNode> = {};
  for (const [file, nodes] of Object.entries(FILES)) {
    for (const [id, node] of Object.entries(nodes)) {
      if (out[id]) throw new Error(`duplicate dialog id ${id} (in ${file})`);
      out[id] = { id, ...node };
    }
  }
  return Object.freeze(out);
}

/** Every dialog node from src/data/dialogs/*.json, keyed by id. */
export const DIALOGS: Readonly<Record<string, DialogNode>> = build();

export function getDialog(id: string): DialogNode {
  const node = DIALOGS[id];
  if (!node) throw new Error(`unknown dialog: ${id}`);
  return node;
}
