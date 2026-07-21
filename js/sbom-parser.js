// Extracts a flat list of components from a CycloneDX or SPDX (JSON) SBOM document.
// Each component records both its purl and its cpe (either may be empty) plus an
// `identifierType` of 'purl', 'cpe', or 'none' saying which identifier will drive
// the endoflife.date lookup. purl is preferred when a component carries both, since
// it names the ecosystem precisely; cpe is used as the fallback.

import { parsePurl } from './purl.js';
import { parseCpe, CPE_PART_NAMES } from './cpe.js';

/**
 * @param {any} sbomJson
 * @returns {Array<{name: string, version: string, purl: string, cpe: string,
 *            identifierType: 'purl'|'cpe'|'none', type: string, group: string}>}
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

/**
 * Normalizes a raw component into the shared shape, detecting whether a purl or
 * cpe is present and filling in type/group/version from that identifier when the
 * SBOM didn't supply them directly.
 */
function makeComponent({ name = '', version = '', purl = '', cpe = '', type = '', group = '' }) {
  purl = purl || '';
  cpe = cpe || '';

  let identifierType = 'none';
  if (purl) identifierType = 'purl';
  else if (cpe) identifierType = 'cpe';

  let derivedType = type || '';
  let derivedGroup = group || '';
  let derivedVersion = version || '';

  if (identifierType === 'purl') {
    const parsed = parsePurl(purl);
    if (parsed) {
      derivedType = parsed.type || derivedType; // purl type (npm, pypi, ...) beats a generic CycloneDX type
      derivedGroup = derivedGroup || parsed.namespace;
      derivedVersion = derivedVersion || parsed.version;
    }
  } else if (identifierType === 'cpe') {
    const parsed = parseCpe(cpe);
    if (parsed) {
      derivedType = derivedType || CPE_PART_NAMES[parsed.part] || parsed.part;
      derivedGroup = derivedGroup || parsed.vendor;
      derivedVersion = derivedVersion || parsed.version;
    }
  }

  return {
    name: name || '(unknown)',
    version: derivedVersion,
    purl,
    cpe,
    identifierType,
    type: derivedType,
    group: derivedGroup
  };
}

function extractCycloneDX(bom) {
  const components = [];

  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const c of list) {
      components.push(
        makeComponent({
          name: c.name,
          version: c.version,
          purl: c.purl,
          cpe: c.cpe,
          type: c.type,
          group: c.group
        })
      );
      if (c.components) walk(c.components);
    }
  };

  walk(bom.components);
  return components;
}

function extractSPDX(doc) {
  const components = [];

  for (const pkg of doc.packages || []) {
    const refs = pkg.externalRefs || [];
    const purl = findRef(refs, 'purl');
    // SPDX uses referenceType "cpe23Type" (CPE 2.3) and "cpe22Type" (CPE 2.2).
    const cpe = findRef(refs, 'cpe23Type') || findRef(refs, 'cpe22Type');

    components.push(
      makeComponent({
        name: pkg.name,
        version: pkg.versionInfo,
        purl,
        cpe
      })
    );
  }

  return components;
}

function findRef(refs, referenceType) {
  const ref = refs.find((r) => r.referenceType === referenceType);
  return ref ? ref.referenceLocator : '';
}
