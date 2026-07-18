// Extracts a flat list of { name, version, purl, type, group } components
// from a CycloneDX or SPDX (JSON) SBOM document.

import { parsePurl } from './purl.js';

/**
 * @param {any} sbomJson
 * @returns {Array<{name: string, version: string, purl: string, type: string, group: string}>}
 */
export function extractComponents(sbomJson) {
  if (!sbomJson || typeof sbomJson !== 'object') {
    throw new Error('SBOM file did not contain a JSON object.');
  }

  if (sbomJson.bomFormat === 'CycloneDX' || Array.isArray(sbomJson.components)) {
    return extractCycloneDX(sbomJson);
  }

  if (sbomJson.spdxVersion || Array.isArray(sbomJson.packages)) {
    return extractSPDX(sbomJson);
  }

  throw new Error('Unrecognized SBOM format. Expected a CycloneDX or SPDX JSON document.');
}

function extractCycloneDX(bom) {
  const components = [];

  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      components.push({
        name: c.name || '(unknown)',
        version: c.version || '',
        purl: c.purl || '',
        type: c.type || '',
        group: c.group || ''
      });
      if (c.components) walk(c.components);
    }
  };

  walk(bom.components);
  return components;
}

function extractSPDX(doc) {
  const components = [];

  for (const pkg of doc.packages || []) {
    const purlRef = (pkg.externalRefs || []).find((r) => r.referenceType === 'purl');
    const purl = purlRef ? purlRef.referenceLocator : '';
    const parsed = purl ? parsePurl(purl) : null;

    components.push({
      name: pkg.name || '(unknown)',
      version: pkg.versionInfo || parsed?.version || '',
      purl,
      type: parsed?.type || '',
      group: parsed?.namespace || ''
    });
  }

  return components;
}
