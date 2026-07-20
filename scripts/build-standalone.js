#!/usr/bin/env node
// Bundles index.html + css/styles.css + js/*.js into a single, dependency-free
// HTML file that can be opened directly via file:// - no static server needed.
//
// This is plain string concatenation, not a bundler/transpiler: the app has no
// build step for development (see CLAUDE.md), this script only exists to produce
// a standalone artifact for sharing. Regenerate with `npm run build`.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const JS_FILES_IN_DEPENDENCY_ORDER = ['js/purl.js', 'js/sbom-parser.js', 'js/eol-client.js', 'js/app.js'];

/** Removes `import ... from '...';` lines and `export` keywords so the files
 * can be concatenated into one classic (non-module) script. */
function stripModuleSyntax(source, filename) {
  return source
    .split('\n')
    .filter((line) => !/^\s*import\s.*from\s+['"].*['"];?\s*$/.test(line))
    .join('\n')
    .replace(/^export\s+/gm, '')
    .trim()
    .concat(`\n// ---- end ${filename} ----`);
}

function build() {
  const css = readFileSync(path.join(root, 'css/styles.css'), 'utf8').trim();

  const js = JS_FILES_IN_DEPENDENCY_ORDER.map((file) => {
    const source = readFileSync(path.join(root, file), 'utf8');
    return `// ---- ${file} ----\n${stripModuleSyntax(source, file)}`;
  }).join('\n\n');

  let html = readFileSync(path.join(root, 'index.html'), 'utf8');

  const linkTag = /<link rel="stylesheet" href="css\/styles\.css" \/>/;
  if (!linkTag.test(html)) throw new Error('Could not find the stylesheet <link> tag in index.html to inline.');
  html = html.replace(linkTag, `<style>\n${css}\n</style>`);

  const scriptTag = /<script type="module" src="js\/app\.js"><\/script>/;
  if (!scriptTag.test(html)) throw new Error('Could not find the <script type="module"> tag in index.html to inline.');
  html = html.replace(scriptTag, `<script>\n${js}\n</script>`);

  const outDir = path.join(root, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'sbom-support-lookup.html');
  writeFileSync(outPath, html);
  console.log(`Wrote ${path.relative(root, outPath)} (${(html.length / 1024).toFixed(1)} KB)`);
}

build();
