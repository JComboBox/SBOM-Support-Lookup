import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, versionMajorMinor, matchCycle, interpretEol } from '../js/eol-client.js';

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
