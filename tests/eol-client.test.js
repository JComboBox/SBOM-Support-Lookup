import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize,
  versionMajorMinor,
  matchCycle,
  interpretEol,
  lookupComponentEol,
  resetCaches,
  EOL_API_BASE
} from '../js/eol-client.js';

test('normalize strips npm scopes and non-alphanumeric characters', () => {
  assert.equal(normalize('@angular/core'), 'core');
  assert.equal(normalize('Node.js'), 'node-js');
  assert.equal(normalize('  Django  '), 'django');
});

test('versionMajorMinor extracts major/minor from free-form versions', () => {
  assert.equal(versionMajorMinor('3.11.4'), '3.11');
  assert.equal(versionMajorMinor('v18.16.0'), '18.16');
  assert.equal(versionMajorMinor('20'), '20');
  assert.equal(versionMajorMinor('not-a-version'), null);
});

test('matchCycle prefers exact cycle match, then major.minor, then major', () => {
  const cycles = [{ cycle: '3.11' }, { cycle: '3' }, { cycle: '18.16' }];

  assert.deepEqual(matchCycle(cycles, '3.11'), { cycle: '3.11' });
  assert.deepEqual(matchCycle(cycles, '3.11.4'), { cycle: '3.11' });
  assert.deepEqual(matchCycle([{ cycle: '3' }], '3.9.0'), { cycle: '3' });
  assert.equal(matchCycle(cycles, '99.0'), null);
  assert.equal(matchCycle([], '1.0'), null);
});

test('interpretEol handles boolean and date eol values', () => {
  assert.equal(interpretEol({ eol: false }).status, 'supported');
  assert.equal(interpretEol({ eol: true }).status, 'eol');
  assert.equal(interpretEol({ eol: '2000-01-01' }).status, 'eol');
  assert.equal(interpretEol({ eol: '2999-01-01' }).status, 'eol-scheduled');
  assert.equal(interpretEol(null).status, 'unknown');
});

// --- lookupComponentEol: the function that decides checkmark (ok) vs red X (!ok) ---
//
// These stub the global `fetch` used internally by eol-client.js so the
// success/failure branches can be exercised without hitting the network.

function stubFetch(routes) {
  return async (url) => {
    const route = routes[url];
    if (!route) throw new Error(`Unexpected fetch in test: ${url}`);
    if (route.networkError) throw new Error(route.networkError);
    return {
      ok: route.status === undefined || (route.status >= 200 && route.status < 300),
      status: route.status ?? 200,
      json: async () => route.json,
      text: async () => route.text ?? ''
    };
  };
}

function withStubbedFetch(t, routes) {
  const original = global.fetch;
  global.fetch = stubFetch(routes);
  resetCaches();
  t.after(() => {
    global.fetch = original;
    resetCaches();
  });
}

test('lookupComponentEol: ok=true with an eol date for a matched product/version', async (t) => {
  withStubbedFetch(t, {
    [`${EOL_API_BASE}/all.json`]: { json: ['python', 'nodejs'] },
    [`${EOL_API_BASE}/python.json`]: { json: [{ cycle: '3.9', eol: '2025-10-05' }] }
  });

  const result = await lookupComponentEol({ name: 'python', version: '3.9.6' });
  assert.equal(result.ok, true);
  assert.equal(result.slug, 'python');
  assert.equal(result.eolDate, '2025-10-05');
  assert.equal(result.error, null);
});

test('lookupComponentEol: ok=false with status "not-tracked" when no product matches', async (t) => {
  withStubbedFetch(t, {
    [`${EOL_API_BASE}/all.json`]: { json: ['python'] }
  });

  const result = await lookupComponentEol({ name: 'totally-untracked-package', version: '1.0.0' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'not-tracked');
  assert.equal(result.slug, null);
  assert.match(result.error.message, /No product on endoflife.date matched/);
});

test('lookupComponentEol: ok=false with status "no-version-match" when the product has no matching cycle', async (t) => {
  withStubbedFetch(t, {
    [`${EOL_API_BASE}/all.json`]: { json: ['python'] },
    [`${EOL_API_BASE}/python.json`]: { json: [{ cycle: '3.9', eol: '2025-10-05' }] }
  });

  const result = await lookupComponentEol({ name: 'python', version: '2.7.18' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'no-version-match');
  assert.equal(result.slug, 'python');
});

test('lookupComponentEol: ok=false with the real HTTP status/body on an API error', async (t) => {
  withStubbedFetch(t, {
    [`${EOL_API_BASE}/all.json`]: { json: ['python'] },
    [`${EOL_API_BASE}/python.json`]: { status: 500, text: 'internal server error' }
  });

  const result = await lookupComponentEol({ name: 'python', version: '3.9.6' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'error');
  assert.equal(result.error.httpStatus, 500);
  assert.equal(result.error.body, 'internal server error');
  assert.equal(result.error.url, `${EOL_API_BASE}/python.json`);
});

test('lookupComponentEol: a manual product override skips auto-matching', async (t) => {
  withStubbedFetch(t, {
    [`${EOL_API_BASE}/nodejs.json`]: { json: [{ cycle: '18', eol: false }] }
  });

  const result = await lookupComponentEol({ name: 'some-random-lib', version: '18.16.0' }, 'nodejs');
  assert.equal(result.ok, true);
  assert.equal(result.slug, 'nodejs');
  assert.equal(result.status, 'supported');
});
