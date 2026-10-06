// Runs a TypeScript script through Vite's module runner so the project's path aliases
// (@core/*, @data/*, ...) resolve exactly as they do in the app and in Vitest.
// Usage: node scripts/run-ts.mjs <script.ts> [args...]  (the script exports `main(args)`).
import path from 'node:path';

import { createServer, createServerModuleRunner } from 'vite';

const [, , entry, ...args] = process.argv;
if (!entry) {
  console.error('usage: node scripts/run-ts.mjs <script.ts> [args...]');
  process.exit(1);
}
const root = process.cwd();
const server = await createServer({
  configFile: path.resolve(root, 'vite.config.ts'),
  root,
  server: { middlewareMode: true, ws: false },
  logLevel: 'error',
});
try {
  const runner = createServerModuleRunner(server.environments.ssr);
  const id = '/' + path.relative(root, path.resolve(root, entry)).split(path.sep).join('/');
  const mod = await runner.import(id);
  if (typeof mod.main === 'function') await mod.main(args);
} finally {
  await server.close();
}
