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
  assert.equal(components[0].identifierType, 'purl');
  assert.equal(components[0].type, 'pypi'); // purl type wins over the CycloneDX component type
  assert.equal(components[2].name, 'urllib3');
});

test('extracts a CPE identifier from a CycloneDX component with no purl', () => {
  const bom = {
    bomFormat: 'CycloneDX',
    components: [
      { type: 'application', name: 'Log4j', cpe: 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*' }
    ]
  };

  const [component] = extractComponents(bom);
  assert.equal(component.identifierType, 'cpe');
  assert.equal(component.cpe, 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*');
  assert.equal(component.purl, '');
  assert.equal(component.version, '2.14.1'); // filled in from the cpe
  assert.equal(component.group, 'apache'); // vendor from the cpe
});

test('prefers purl over cpe when a CycloneDX component has both', () => {
  const bom = {
    bomFormat: 'CycloneDX',
    components: [
      {
        type: 'library',
        name: 'log4j',
        version: '2.14.1',
        purl: 'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1',
        cpe: 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*'
      }
    ]
  };

  const [component] = extractComponents(bom);
  assert.equal(component.identifierType, 'purl');
  assert.equal(component.purl, 'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1');
  assert.equal(component.cpe, 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*'); // still retained
});

test('extracts components from an SPDX document (purl and cpe)', () => {
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
      {
        name: 'OpenSSL',
        versionInfo: '1.1.1',
        externalRefs: [
          { referenceCategory: 'SECURITY', referenceType: 'cpe23Type', referenceLocator: 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*' }
        ]
      },
      { name: 'no-identifier-package', versionInfo: '1.0.0', externalRefs: [] }
    ]
  };

  const components = extractComponents(doc);
  assert.equal(components.length, 3);

  assert.equal(components[0].identifierType, 'purl');
  assert.equal(components[0].purl, 'pkg:pypi/flask@2.3.2');

  assert.equal(components[1].identifierType, 'cpe');
  assert.equal(components[1].cpe, 'cpe:2.3:a:openssl:openssl:1.1.1:*:*:*:*:*:*:*');
  assert.equal(components[1].purl, '');

  assert.equal(components[2].identifierType, 'none');
  assert.equal(components[2].purl, '');
  assert.equal(components[2].cpe, '');
});

test('throws on unrecognized SBOM formats', () => {
  assert.throws(() => extractComponents({ foo: 'bar' }));
});
