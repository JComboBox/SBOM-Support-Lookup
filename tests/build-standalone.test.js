import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'dist/sbom-support-lookup.html');

test('build-standalone produces a single HTML file with no leftover module syntax', () => {
  execFileSync('node', ['scripts/build-standalone.js'], { cwd: root });

  const html = readFileSync(outputPath, 'utf8');

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<style>/);
  assert.match(html, /<script>[\s\S]*function parsePurl/);

  // The whole point of the standalone build is that it has no ES module
  // import/export statements left, since browsers refuse to resolve those
  // for a page opened via file://.
  assert.doesNotMatch(html, /<script type="module"/);
  assert.doesNotMatch(html, /^\s*import .* from ['"]/m);
  assert.doesNotMatch(html, /^\s*export /m);

  // A sample of functions from each source file should have made it into the bundle.
  for (const fn of ['parsePurl', 'parseCpe', 'extractComponents', 'lookupComponentEol', 'function handleFile']) {
    assert.ok(html.includes(fn), `expected bundled script to contain "${fn}"`);
  }
});
