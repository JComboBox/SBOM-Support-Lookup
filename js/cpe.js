// Minimal parser for CPE (Common Platform Enumeration) names.
// Supports both the CPE 2.3 formatted string binding
//   cpe:2.3:part:vendor:product:version:update:edition:language:sw_edition:target_sw:target_hw:other
// and the older CPE 2.2 URI binding
//   cpe:/part:vendor:product:version:update:edition:language
// Spec: https://csrc.nist.gov/projects/security-content-automation-protocol/specifications/cpe
//
// Pure function, no dependencies, no DOM/browser APIs.

// CPE "part" component: application, operating system, or hardware.
export const CPE_PART_NAMES = { a: 'application', o: 'operating-system', h: 'hardware' };

const CPE23_FIELDS = [
  'part',
  'vendor',
  'product',
  'version',
  'update',
  'edition',
  'language',
  'swEdition',
  'targetSw',
  'targetHw',
  'other'
];

/**
 * @param {string} cpe
 * @returns {{cpeVersion: '2.3'|'2.2', part: string, vendor: string, product: string,
 *            version: string, update: string, edition: string, language: string} | null}
 */
export function parseCpe(cpe) {
  if (typeof cpe !== 'string') return null;
  const trimmed = cpe.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('cpe:2.3:')) return parseCpe23(trimmed);
  if (lower.startsWith('cpe:/')) return parseCpe22(trimmed);
  return null;
}

function parseCpe23(cpe) {
  const body = cpe.slice('cpe:2.3:'.length);
  const fields = splitUnescaped(body, ':').map(unbindFormattedString);
  if (fields.length < 3) return null; // need at least part:vendor:product

  const parsed = { cpeVersion: '2.3' };
  CPE23_FIELDS.forEach((field, i) => {
    parsed[field] = fields[i] ?? '';
  });
  return finalize(parsed);
}

function parseCpe22(cpe) {
  const body = cpe.slice('cpe:/'.length);
  const fields = splitUnescaped(body, ':').map(unbindUri);
  if (fields.length < 3) return null;

  const [part = '', vendor = '', product = '', version = '', update = '', edition = '', language = ''] = fields;
  return finalize({ cpeVersion: '2.2', part, vendor, product, version, update, edition, language });
}

/** Lowercases the case-insensitive identity fields; leaves version untouched. */
function finalize(parsed) {
  return {
    cpeVersion: parsed.cpeVersion,
    part: (parsed.part || '').toLowerCase(),
    vendor: (parsed.vendor || '').toLowerCase(),
    product: (parsed.product || '').toLowerCase(),
    version: parsed.version || '',
    update: parsed.update || '',
    edition: parsed.edition || '',
    language: parsed.language || ''
  };
}

/** Splits on `sep`, treating a backslash as escaping the following character. */
function splitUnescaped(str, sep) {
  const out = [];
  let current = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && i + 1 < str.length) {
      current += ch + str[i + 1];
      i++;
    } else if (ch === sep) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

/** Unbinds a CPE 2.3 formatted-string value: `*`/`-` are logical ANY/NA, `\x` unescapes to `x`. */
function unbindFormattedString(value) {
  if (value === undefined || value === '*' || value === '-') return '';
  return value.replace(/\\(.)/g, '$1');
}

/** Unbinds a CPE 2.2 URI value: percent-decode, then `*`/`-` are logical ANY/NA. */
function unbindUri(value) {
  if (value === undefined) return '';
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  if (decoded === '*' || decoded === '-') return '';
  return decoded;
}
