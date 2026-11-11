// Stage the Electron app: bundle Freefield's server into one ESM file and copy the folders it reads at run time.
// usage: node scripts/stage.mjs <path to a freefield checkout with node_modules installed>
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(process.argv[2] || join(here, '..', 'freefield'));
const stage = join(here, 'stage');
if (!existsSync(join(src, 'server', 'server.ts'))) throw new Error(`not a freefield checkout: ${src}`);
if (!existsSync(join(src, 'node_modules'))) throw new Error(`run "npm ci" in ${src} first`);

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// server/registry.ts finds the repo root as the parent of its own folder, so the bundle goes to stage/server-dist/
await build({
  entryPoints: [join(src, 'server', 'server.ts')],
  outfile: join(stage, 'server-dist', 'server.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22',
  banner: { js: "import { createRequire as __ffRequire } from 'node:module'; const require = __ffRequire(import.meta.url);" },
  logLevel: 'info',
});

// read at run time: app manifests and workflows, their schema, the web UI with its examples, the VRAM map, the lab marks
for (const rel of ['apps', 'schema', 'web', 'docs/vram-map.json', 'lab/flags.json', 'LICENSE']) {
  const from = join(src, rel);
  if (existsSync(from)) cpSync(from, join(stage, rel), { recursive: true });
}
for (const f of ['main.cjs', 'preload.cjs', 'settings.html']) cpSync(join(here, f), join(stage, f));

const ff = JSON.parse(readFileSync(join(src, 'package.json'), 'utf-8'));
const self = JSON.parse(readFileSync(join(here, 'package.json'), 'utf-8'));
writeFileSync(join(stage, 'package.json'), JSON.stringify({
  name: 'freefield-studio', productName: 'Freefield Studio', version: self.version,
  description: `${ff.description} Desktop build of freefield ${ff.version}.`,
  author: 'neuregex', license: ff.license, main: 'main.cjs', type: 'commonjs',
}, null, 2));
console.log(`staged ${stage}`);
