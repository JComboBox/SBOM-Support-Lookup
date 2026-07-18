import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePurl } from '../js/purl.js';

test('parses a basic npm purl', () => {
  const result = parsePurl('pkg:npm/lodash@4.17.21');
  assert.deepEqual(result, {
    type: 'npm',
    namespace: '',
    name: 'lodash',
    version: '4.17.21',
    qualifiers: {},
    subpath: ''
  });
});

test('parses a scoped npm purl with a namespace', () => {
  const result = parsePurl('pkg:npm/%40angular/core@15.2.0');
  assert.equal(result.type, 'npm');
  assert.equal(result.namespace, '@angular');
  assert.equal(result.name, 'core');
  assert.equal(result.version, '15.2.0');
});

test('parses qualifiers and subpath', () => {
  const result = parsePurl('pkg:golang/google.golang.org/grpc@1.58.0?arch=amd64#cmd');
  assert.equal(result.type, 'golang');
  assert.equal(result.namespace, 'google.golang.org');
  assert.equal(result.name, 'grpc');
  assert.equal(result.version, '1.58.0');
  assert.deepEqual(result.qualifiers, { arch: 'amd64' });
  assert.equal(result.subpath, 'cmd');
});

test('handles a purl without a version', () => {
  const result = parsePurl('pkg:pypi/django');
  assert.equal(result.name, 'django');
  assert.equal(result.version, '');
});

test('returns null for non-purl input', () => {
  assert.equal(parsePurl('not-a-purl'), null);
  assert.equal(parsePurl(''), null);
  assert.equal(parsePurl(undefined), null);
});
