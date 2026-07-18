// Minimal parser for Package URLs (purl): https://github.com/package-url/purl-spec
// Format: pkg:type/namespace/name@version?qualifiers#subpath

/**
 * @param {string} purl
 * @returns {{type: string, namespace: string, name: string, version: string,
 *            qualifiers: Record<string,string>, subpath: string} | null}
 */
export function parsePurl(purl) {
  if (typeof purl !== 'string' || !purl.startsWith('pkg:')) return null;

  try {
    const body = purl.slice('pkg:'.length);

    const hashIndex = body.indexOf('#');
    const subpathRaw = hashIndex === -1 ? '' : body.slice(hashIndex + 1);
    const withoutSubpath = hashIndex === -1 ? body : body.slice(0, hashIndex);

    const qIndex = withoutSubpath.indexOf('?');
    const qualifierStr = qIndex === -1 ? '' : withoutSubpath.slice(qIndex + 1);
    const withoutQualifiers = qIndex === -1 ? withoutSubpath : withoutSubpath.slice(0, qIndex);

    const segments = withoutQualifiers.split('/').filter((s) => s.length > 0);
    if (segments.length < 2) return null;

    const type = decodeURIComponent(segments.shift()).toLowerCase();
    let rawNameAndVersion = segments.pop();
    const namespace = segments.map(decodeURIComponent).join('/');

    const atIndex = rawNameAndVersion.lastIndexOf('@');
    let rawVersion = '';
    if (atIndex !== -1) {
      rawVersion = rawNameAndVersion.slice(atIndex + 1);
      rawNameAndVersion = rawNameAndVersion.slice(0, atIndex);
    }
    const name = decodeURIComponent(rawNameAndVersion);
    const version = rawVersion ? decodeURIComponent(rawVersion) : '';

    const qualifiers = {};
    if (qualifierStr) {
      for (const pair of qualifierStr.split('&')) {
        if (!pair) continue;
        const [k, v = ''] = pair.split('=');
        if (k) qualifiers[decodeURIComponent(k)] = decodeURIComponent(v);
      }
    }

    return {
      type,
      namespace,
      name,
      version,
      qualifiers,
      subpath: subpathRaw ? decodeURIComponent(subpathRaw) : ''
    };
  } catch {
    return null;
  }
}
