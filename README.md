# SBOM Support Lookup

A single-page, dependency-free web app that:

1. Loads a CycloneDX or SPDX SBOM (JSON) file into browser memory - nothing is uploaded to a server.
2. Lists every package in the SBOM along with its [Package URL (purl)](https://github.com/package-url/purl-spec).
3. Looks up each package against the [endoflife.date](https://endoflife.date) public API to show whether, and when, it reaches end of life.

It's plain HTML/CSS/JavaScript (ES modules, no build step, no framework) so it's easy to clone, open, and share.

## Quick start

```bash
npm start
```

This runs `npx serve` and opens the app at `http://localhost:5173`. A local static server is required because
the page uses ES modules, which browsers block when loaded directly from `file://`.

No `npm install` step or `node_modules` is needed for the app itself - `npm start` is just a convenience wrapper
around `npx serve`. You can use any static file server instead, e.g.:

```bash
python3 -m http.server 5173
```

Then open the printed URL, upload (or drag & drop) an SBOM, and click **"Look up end-of-life status"**.
Two sample SBOMs are included in [`samples/`](samples) if you want to try it immediately.

## How it works

- **SBOM parsing** (`js/sbom-parser.js`) - reads CycloneDX (`components[]`, including nested components) or
  SPDX (`packages[].externalRefs[]` with `referenceType: "purl"`) JSON documents into a flat list of
  `{ name, version, purl, type, group }`.
- **PURL parsing** (`js/purl.js`) - a small, dependency-free parser for the `pkg:type/namespace/name@version`
  format.
- **EOL lookup** (`js/eol-client.js`) - calls the public [endoflife.date API](https://endoflife.date/docs/api)
  directly from the browser (no API key required):
  - `GET /api/all.json` for the full list of tracked product slugs.
  - `GET /api/{product}.json` for a product's release cycles and their `eol` dates.
  - Each SBOM package name is normalized and matched against the product list (with a small alias table for
    common cases like `node` -> `nodejs`, `golang` -> `go`). The best-matching release cycle for the package's
    version is then used to report the status: **Supported**, **Sunset scheduled**, **End of life**, or
    **Not tracked**.
- **UI** (`js/app.js`, `index.html`, `css/styles.css`) - renders the table, runs lookups with limited
  concurrency, and lets you manually correct a package's matched product (endoflife.date tracks languages,
  frameworks, and platforms, not every library on npm/PyPI/etc., so many packages won't auto-match).

## Limitations

- Product matching is a best-effort heuristic based on package name. Most application-level libraries
  (e.g. a random npm/PyPI package) aren't tracked by endoflife.date at all - only platforms, languages, OS
  distributions, and major frameworks are. Use the editable "Product match" column to point a row at the
  correct [endoflife.date](https://endoflife.date/) product slug.
  Everything runs client-side in the browser: the requesting browser needs to be able to reach `endoflife.date` and the SBOM file is never sent anywhere else.

## Testing

Pure logic (purl parsing, SBOM extraction, version/cycle matching) is covered by Node's built-in test runner:

```bash
npm test
```

## Project layout

```
index.html            entry point
css/styles.css         styling
js/purl.js             purl parser
js/sbom-parser.js      CycloneDX / SPDX -> flat component list
js/eol-client.js       endoflife.date API client + matching logic
js/app.js              UI wiring
samples/                example CycloneDX / SPDX SBOMs
tests/                  node:test unit tests for the pure logic modules
```

## Working with Claude Code

This repo includes a [`CLAUDE.md`](CLAUDE.md) with project context for Claude Code. See that file for
architecture notes and conventions to follow when making changes.
