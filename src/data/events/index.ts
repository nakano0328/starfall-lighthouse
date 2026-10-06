import type { EventCommand } from '@data/types';

import forest from './forest.json';
import minato from './minato.json';

const FILES: Readonly<Record<string, Readonly<Record<string, EventCommand[]>>>> = {
  forest: forest as Record<string, EventCommand[]>,
  minato: minato as Record<string, EventCommand[]>,
};

function build(): Readonly<Record<string, EventCommand[]>> {
  const out: Record<string, EventCommand[]> = {};
  for (const [file, events] of Object.entries(FILES)) {
    for (const [id, commands] of Object.entries(events)) {
      if (out[id]) throw new Error(`duplicate event id ${id} (in ${file})`);
      out[id] = commands;
    }
  }
  return Object.freeze(out);
}

/** Every event script from src/data/events/*.json, keyed by id. */
export const EVENTS: Readonly<Record<string, EventCommand[]>> = build();

export function getEvent(id: string): EventCommand[] {
  const commands = EVENTS[id];
  if (!commands) throw new Error(`unknown event: ${id}`);
  return commands;
}
