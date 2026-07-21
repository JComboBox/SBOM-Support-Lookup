import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCpe, CPE_PART_NAMES } from '../js/cpe.js';

test('parses a CPE 2.3 formatted string', () => {
  const result = parseCpe('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*');
  assert.equal(result.cpeVersion, '2.3');
  assert.equal(result.part, 'a');
  assert.equal(result.vendor, 'apache');
  assert.equal(result.product, 'log4j');
  assert.equal(result.version, '2.14.1');
});

test('treats CPE 2.3 ANY (*) and NA (-) fields as empty', () => {
  const result = parseCpe('cpe:2.3:a:python:python:*:-:*:*:*:*:*:*');
  assert.equal(result.product, 'python');
  assert.equal(result.version, ''); // * -> ANY -> empty
  assert.equal(result.update, ''); // - -> NA -> empty
});

test('unescapes backslash-escaped characters in a CPE 2.3 string', () => {
  const result = parseCpe('cpe:2.3:a:vendor:foo\\:bar:1.0:*:*:*:*:*:*:*');
  assert.equal(result.product, 'foo:bar');
  assert.equal(result.version, '1.0');
});

test('parses a CPE 2.2 URI', () => {
  const result = parseCpe('cpe:/a:apache:http_server:2.4.1');
  assert.equal(result.cpeVersion, '2.2');
  assert.equal(result.part, 'a');
  assert.equal(result.vendor, 'apache');
  assert.equal(result.product, 'http_server');
  assert.equal(result.version, '2.4.1');
});

test('percent-decodes CPE 2.2 URI values', () => {
  const result = parseCpe('cpe:/a:some_vendor:my%2fproduct:1.0');
  assert.equal(result.product, 'my/product');
});

test('lowercases the case-insensitive identity fields', () => {
  const result = parseCpe('cpe:2.3:A:Apache:Log4J:2.14.1:*:*:*:*:*:*:*');
  assert.equal(result.part, 'a');
  assert.equal(result.vendor, 'apache');
  assert.equal(result.product, 'log4j');
});

test('returns null for non-CPE input', () => {
  assert.equal(parseCpe('pkg:npm/lodash@4.17.21'), null);
  assert.equal(parseCpe('not-a-cpe'), null);
  assert.equal(parseCpe(''), null);
  assert.equal(parseCpe(undefined), null);
});

test('CPE_PART_NAMES maps the part letters to readable names', () => {
  assert.equal(CPE_PART_NAMES.a, 'application');
  assert.equal(CPE_PART_NAMES.o, 'operating-system');
  assert.equal(CPE_PART_NAMES.h, 'hardware');
});
