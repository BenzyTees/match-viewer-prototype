// Bundles src/app.ts with esbuild and inlines bundle + sample log into one HTML file.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'dist'), { recursive: true });

const result = await build({
  entryPoints: [join(root, 'src/app.ts')],
  bundle: true, minify: true, format: 'iife', target: 'es2020',
  write: false, legalComments: 'none', logLevel: 'warning',
});
const js = result.outputFiles[0].text;
const log = readFileSync(join(root, 'data/match_log.json'), 'utf8');
const html = readFileSync(join(root, 'src/index.html'), 'utf8')
  .replace('/*__LOG__*/', () => `window.MATCH_LOG=${log};`)
  .replace('/*__APP__*/', () => js.replace(/<\/script>/gi, '<\\/script>'));
writeFileSync(join(root, 'dist/match_viewer_demo.html'), html);
console.log(`dist/match_viewer_demo.html  ${(html.length / 1024).toFixed(0)} KB  (bundle ${(js.length / 1024).toFixed(0)} KB, log ${(log.length / 1024).toFixed(0)} KB)`);
