import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractComponents } from '../js/sbom-parser.js';

test('extracts components from a CycloneDX document, including nested ones', () => {
  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [
      { type: 'library', name: 'requests', version: '2.31.0', purl: 'pkg:pypi/requests@2.31.0' },
      {
        type: 'application',
        name: 'app',
        version: '1.0.0',
        purl: 'pkg:generic/app@1.0.0',
        components: [{ type: 'library', name: 'urllib3', version: '2.0.4', purl: 'pkg:pypi/urllib3@2.0.4' }]
      }
    ]
  };

  const components = extractComponents(bom);
  assert.equal(components.length, 3);
  assert.equal(components[0].name, 'requests');
  assert.equal(components[2].name, 'urllib3');
});

test('extracts components from an SPDX document', () => {
  const doc = {
    spdxVersion: 'SPDX-2.3',
    packages: [
      {
        name: 'flask',
        versionInfo: '2.3.2',
        externalRefs: [
          { referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: 'pkg:pypi/flask@2.3.2' }
        ]
      },
      { name: 'no-purl-package', versionInfo: '1.0.0', externalRefs: [] }
    ]
  };

  const components = extractComponents(doc);
  assert.equal(components.length, 2);
  assert.equal(components[0].purl, 'pkg:pypi/flask@2.3.2');
  assert.equal(components[1].purl, '');
});

test('throws on unrecognized SBOM formats', () => {
  assert.throws(() => extractComponents({ foo: 'bar' }));
});
