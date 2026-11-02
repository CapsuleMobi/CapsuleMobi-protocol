import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './render.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => join(root, ...a);

export function tokenMap() {
  const css = readFileSync(p('src/tokens.css'), 'utf8');
  return Object.fromEntries([...css.matchAll(/(--color-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

export function faviconSvg() {
  const t = tokenMap();
  const d = readFileSync(p('brand/favicon-path.txt'), 'utf8').trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${t['--color-silver']}"/><path fill="${t['--color-logo-ink']}" d="${d}"/></svg>\n`;
}

export function build(outDir = p('dist'), register = JSON.parse(readFileSync(p('register.json'), 'utf8'))) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'assets'), { recursive: true });
  writeFileSync(join(outDir, 'index.html'), renderPage(register));
  writeFileSync(join(outDir, 'favicon.svg'), faviconSvg());
  const copies = [
    ['src/tokens.css', 'assets/tokens.css'], ['src/main.css', 'assets/main.css'],
    ['src/js/core.js', 'assets/core.js'], ['src/js/motion.js', 'assets/motion.js'], ['src/js/app.js', 'assets/app.js'],
    ['brand/capsule-logo.png', 'assets/capsule-logo.png'], ['brand/logo-192.png', 'assets/logo-192.png'],
    ['brand/apple-touch-icon.png', 'assets/apple-touch-icon.png']
  ];
  for (const [a, b] of copies) copyFileSync(p(a), join(outDir, b));
  writeFileSync(join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  return outDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('built', build());
}
