// Client for the public endoflife.date API (https://endoflife.date/docs/api).
// Runs entirely in the browser - no server/API key required.

export const EOL_API_BASE = 'https://endoflife.date/api';

// Maps common purl/package names or ecosystem hints to endoflife.date product slugs.
// endoflife.date mostly tracks platforms, languages, and major frameworks/distros -
// not every library in npm/PyPI/etc. will have a match, which is expected.
export const PRODUCT_ALIASES = {
  node: 'nodejs',
  nodejs: 'nodejs',
  golang: 'go',
  'dotnet-core': 'dotnet',
  dotnetcore: 'dotnet',
  openjdk: 'java',
  jdk: 'java',
  postgres: 'postgresql',
  mongo: 'mongodb',
  psql: 'postgresql'
};

let productListPromise = null;
const cycleCache = new Map();

/** Clears in-memory caches (useful between test runs / new SBOM uploads). */
export function resetCaches() {
  productListPromise = null;
  cycleCache.clear();
}

/** @returns {Promise<string[]>} the full list of product slugs tracked by endoflife.date */
export function getAllProducts() {
  if (!productListPromise) {
    productListPromise = fetch(`${EOL_API_BASE}/all.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load product list (HTTP ${res.status})`);
        return res.json();
      })
      .catch((err) => {
        productListPromise = null;
        throw err;
      });
  }
  return productListPromise;
}

/** @param {string} name @returns {string} a lowercase, hyphenated slug candidate */
export function normalize(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/^@[^/]+\//, '') // strip npm scope, e.g. @angular/core -> core
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Attempts to match a parsed component to an endoflife.date product slug.
 * @param {{name: string, type?: string}} component
 * @returns {Promise<string|null>}
 */
export async function findProductSlug(component) {
  const products = await getAllProducts();
  const productSet = new Set(products);

  const candidates = [];
  const normName = normalize(component.name);
  candidates.push(normName);
  if (PRODUCT_ALIASES[normName]) candidates.push(PRODUCT_ALIASES[normName]);

  const normType = normalize(component.type || '');
  if (PRODUCT_ALIASES[normType]) candidates.push(PRODUCT_ALIASES[normType]);

  for (const candidate of candidates) {
    if (candidate && productSet.has(candidate)) return candidate;
  }
  return null;
}

/** @param {string} product @returns {Promise<any[]>} the release cycles for a product */
export function getCycles(product) {
  if (cycleCache.has(product)) return cycleCache.get(product);
  const promise = fetch(`${EOL_API_BASE}/${encodeURIComponent(product)}.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load EOL data for "${product}" (HTTP ${res.status})`);
      return res.json();
    })
    .catch((err) => {
      cycleCache.delete(product);
      throw err;
    });
  cycleCache.set(product, promise);
  return promise;
}

/** Extracts "major" or "major.minor" from a free-form version string. */
export function versionMajorMinor(version) {
  const m = String(version || '').match(/^v?(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return m[2] !== undefined ? `${m[1]}.${m[2]}` : m[1];
}

/**
 * Finds the best-matching release cycle for a component version.
 * Tries an exact cycle match first, then major.minor, then major only.
 */
export function matchCycle(cycles, version) {
  if (!Array.isArray(cycles) || cycles.length === 0) return null;

  const vStr = String(version || '');
  let match = cycles.find((c) => String(c.cycle) === vStr);
  if (match) return match;

  const mm = versionMajorMinor(vStr);
  if (mm) {
    match = cycles.find((c) => String(c.cycle) === mm);
    if (match) return match;

    const major = mm.split('.')[0];
    match = cycles.find((c) => String(c.cycle) === major);
    if (match) return match;
  }

  return null;
}

/**
 * Interprets a release cycle's `eol` field into a display-friendly status.
 * `eol` is `false` (still supported), `true` (eol, no date known), or an ISO date string.
 */
export function interpretEol(cycle) {
  if (!cycle) return { status: 'unknown', label: 'Unknown', eolDate: null };

  const eol = cycle.eol;

  if (eol === false) return { status: 'supported', label: 'Supported (no EOL date set)', eolDate: null };
  if (eol === true) return { status: 'eol', label: 'End of life', eolDate: null };

  if (typeof eol === 'string') {
    const eolDate = new Date(`${eol}T00:00:00Z`);
    const isPast = !Number.isNaN(eolDate.getTime()) && eolDate.getTime() <= Date.now();
    return {
      status: isPast ? 'eol' : 'eol-scheduled',
      label: isPast ? `End of life since ${eol}` : `Supported until ${eol}`,
      eolDate: eol
    };
  }

  return { status: 'unknown', label: 'Unknown', eolDate: null };
}

/**
 * Full lookup for one SBOM component: find a matching product, fetch its
 * cycles, and interpret the EOL status for the component's version.
 * @param {{name: string, version: string, type?: string}} component
 * @param {string} [overrideSlug] force a specific product slug instead of auto-matching
 */
export async function lookupComponentEol(component, overrideSlug) {
  const slug = overrideSlug || (await findProductSlug(component));

  if (!slug) {
    return { slug: null, cycle: null, status: 'not-tracked', label: 'Not tracked on endoflife.date', eolDate: null };
  }

  const cycles = await getCycles(slug);
  const cycle = matchCycle(cycles, component.version);
  const result = interpretEol(cycle);

  if (!cycle) {
    return { slug, cycle: null, status: 'no-version-match', label: `No matching release for "${component.version || 'unknown'}" in ${slug}`, eolDate: null };
  }

  return { slug, cycle, ...result };
}
