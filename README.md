# SBOM Support Lookup

A single-page, dependency-free web app that:

1. Loads a CycloneDX or SPDX SBOM (JSON) file into browser memory via an **Upload SBOM** button (or drag & drop) - nothing is uploaded to a server.
2. Lists every package in the SBOM along with its [Package URL (purl)](https://github.com/package-url/purl-spec).
3. On clicking **Load End of Life Dates**, looks up each purl against the [endoflife.date](https://endoflife.date) API (the current home of the project formerly at endoflife.me):
   - A package that got a usable response is marked with a green **✓** and shows its EOL/support dates next to it.
   - A package whose lookup failed is marked with a red **✗**. Clicking the ✗ opens a dialog with the actual error response (URL, HTTP status, body).

It's plain HTML/CSS/JavaScript, no framework, no dependencies to install, so it's easy to clone, open, and
share. There are two ways to run it, depending on whether you want to develop it or just hand it to someone.

## Standalone HTML (send this to someone - no server needed)

For sharing with someone who just wants to use the app, generate a single self-contained HTML file:

```bash
npm run build
```

This writes **`dist/sbom-support-lookup.html`** - one file with the CSS and JS inlined into it. Send that file
to anyone and they can double-click it (or open it via `File > Open` in their browser) to run the app straight
from disk, with no server, no `npm install`, and no internet access required except to reach the
endoflife.date API when they click "Load End of Life Dates".

`dist/sbom-support-lookup.html` is checked into the repo and kept up to date, so you can also just download
that file directly from the repo without running anything.

The multi-file version under `js/`/`css/` remains the source of truth for development (see below) - `npm run
build` (`scripts/build-standalone.js`) inlines those files into the standalone copy. Regenerate and commit it
whenever `index.html`, `css/styles.css`, or any `js/*.js` file changes.

## Developing (local server)

```bash
npm start
```

This runs `npx serve` and opens the app at `http://localhost:5173`. A local static server is needed for
day-to-day development because `index.html` loads `js/app.js` as an ES module, and browsers block ES module
`import`s when a page is opened directly from `file://`. (The standalone build above sidesteps this entirely by
inlining everything into one non-module `<script>`.)

No `npm install` step or `node_modules` is needed for the app itself - `npm start` is just a convenience wrapper
around `npx serve`. Any static file server works, e.g.:

```bash
python3 -m http.server 5173
```

Then open the printed URL and:

1. Click **Upload SBOM** (or drag a file onto the drop zone) and pick a CycloneDX or SPDX JSON file. The package
   table appears immediately, listing each package's name, version, purl, and type.
2. Click **Load End of Life Dates**. Each row is checked against endoflife.date, several at a time, and updates
   live with a ✓ (with dates) or a ✗ (click it for the error detail).
3. Optionally type into the **Product match** box on any row to point it at a specific endoflife.date product
   slug and re-run just that row's lookup - useful since most application-level libraries aren't tracked by
   endoflife.date and need a manual hint (or won't have any match at all).

Two sample SBOMs are included in [`samples/`](samples) if you want to try it immediately.

## Running the regression tests

```bash
npm test
```

This runs `node --test`, which auto-discovers every `*.test.js` file under [`tests/`](tests) using Node's
built-in test runner (Node 18+, no dependencies to install). It covers the pure parsing/matching logic
end-to-end, including the success (✓) and failure (✗) branches of the endoflife.date lookup (by stubbing the
global `fetch`), and also runs `scripts/build-standalone.js` and checks the generated
`dist/sbom-support-lookup.html` has no leftover ES module syntax.

## How it works / function reference

### `js/purl.js`

- **`parsePurl(purl)`** - Parses a `pkg:type/namespace/name@version?qualifiers#subpath` string per the
  [purl spec](https://github.com/package-url/purl-spec) into `{ type, namespace, name, version, qualifiers, subpath }`.
  Returns `null` for anything that isn't a valid purl. Pure function, no dependencies.

### `js/sbom-parser.js`

- **`extractComponents(sbomJson)`** - Entry point. Detects whether the parsed JSON is CycloneDX or SPDX and
  delegates to the matching extractor below; throws if neither format is recognized.
- **`extractCycloneDX(bom)`** *(internal)* - Walks `bom.components[]` recursively (including nested
  `components[]`) and flattens each into `{ name, version, purl, type, group }`.
- **`extractSPDX(doc)`** *(internal)* - Reads `doc.packages[]`, pulling the purl out of each package's
  `externalRefs[]` entry where `referenceType === "purl"`.

### `js/eol-client.js`

All network calls to endoflife.date live here. Talks directly to `https://endoflife.date/api/*` from the
browser - no API key required.

- **`getAllProducts()`** - Fetches and caches `GET /api/all.json`, the full list of product slugs endoflife.date
  tracks (e.g. `"python"`, `"nodejs"`, `"ubuntu"`). Used both for automatic matching and to populate the
  "Product match" autocomplete list.
- **`getCycles(product)`** - Fetches and caches `GET /api/{product}.json`, the release-cycle history (with
  `eol` dates) for one product.
- **`fetchJson(url)`** *(internal)* - Shared fetch helper used by the two functions above. On any network
  failure or non-2xx HTTP response, throws an `Error` with `.url`, `.status`, and `.body` attached so the real
  API failure can be shown to the user later, rather than a generic message.
- **`normalize(name)`** - Lowercases a package name, strips an npm scope (`@angular/core` -> `core`), and
  collapses everything else to hyphens, producing a candidate product slug.
- **`findProductSlug(component)`** - Tries to match a parsed SBOM component to a real endoflife.date product
  slug: normalizes the name, checks the small `PRODUCT_ALIASES` table (e.g. `node` -> `nodejs`,
  `golang` -> `go`) for both the name and the purl type, and returns the first candidate that's actually in the
  product list, or `null` if nothing matches.
- **`versionMajorMinor(version)`** - Extracts `"major"` or `"major.minor"` from a free-form version string
  (`"3.11.4"` -> `"3.11"`, `"v18.16.0"` -> `"18.16"`).
- **`matchCycle(cycles, version)`** - Given a product's release cycles, finds the best match for a package
  version: exact cycle match first, then major.minor, then major only. Returns `null` if nothing matches.
- **`interpretEol(cycle)`** - Turns a release cycle's `eol` field (`false`, `true`, or an ISO date string) into
  a display status: `supported`, `eol-scheduled` (a future EOL date), or `eol` (past EOL date), each with a
  human-readable label.
- **`lookupComponentEol(component, overrideSlug)`** - The main entry point used by the UI. Runs the full
  pipeline (match product -> fetch cycles -> match version -> interpret status) for one component and **always
  resolves** (never rejects) with a result object:
  - `ok: true` for a successful lookup, with `slug`, `cycle`, `status`, `label`, and `eolDate` describing the
    match - this is what renders as a ✓.
  - `ok: false` for anything that didn't produce usable EOL data - no product match (`not-tracked`), no
    matching version cycle (`no-version-match`), or a genuine network/HTTP failure (`error`) - each with an
    `error: { message, url, httpStatus, body }` describing exactly what happened, which is what the red **✗**
    click-through dialog displays.
  - `overrideSlug`, if passed, skips auto-matching and forces a specific product slug (used by the per-row
    manual override).
- **`resetCaches()`** - Clears the in-memory product-list/cycle caches (used between test runs and whenever a
  new SBOM is loaded).

### `js/app.js`

The only file that touches the DOM; wires the two files above to the page.

- **`handleFile(file)`** - Reads the uploaded/dropped file, parses it as JSON, runs it through
  `extractComponents`, and renders the initial package table. Called from both the **Upload SBOM** button flow
  and drag-and-drop.
- **`preloadProductList()`** - Populates the `<datalist>` behind each row's "Product match" input with every
  known endoflife.date product slug, so overrides autocomplete.
- **`runLookups()`** - Triggered by **Load End of Life Dates**. Runs `lookupRow` for every package with a small
  worker pool (`LOOKUP_CONCURRENCY = 6`) so the page stays responsive and results stream in as they arrive.
- **`lookupRow(row)`** - Looks up a single row's EOL status via `lookupComponentEol`, used by both the batch
  run and the per-row product-override input. Tags each call with an incrementing `row.lookupSeq` so that if a
  row is re-triggered (e.g. the user edits the override again) before the previous call finishes, the stale
  result is discarded instead of overwriting the newer one.
- **`renderTable()`** - Rebuilds the visible rows from the in-memory `rows` array, applying the current filter
  text.
- **`rowMatchesFilter(row, filter)`** - Predicate used by the filter box: matches on name, version, purl, or
  matched product slug.
- **`buildRowElement(row)`** / **`updateResultCell(row)`** - `buildRowElement` creates a full `<tr>` (used when
  the table is (re)built); `updateResultCell` updates *only* the "End-of-life result" `<td>` in place when a
  lookup completes, so the row's "Product match" `<input>` is never destroyed or loses focus mid-interaction.
- **`buildResultCellHtml(row)`** - Renders the result cell: a green ✓ with the EOL label/date and a link to the
  product's endoflife.date page on success, or a clickable red ✗ button on failure.
- **`openErrorModal(row)` / `closeErrorModal()`** - Show/hide the error-detail dialog, populated with the
  package, purl, matched product (if any), request URL, HTTP status, and message/body from `row.eol.error`.
- **`updateSummary()`** - Renders the counts bar above the table (resolved/supported/scheduled/EOL, failed,
  pending).
- **`setStatus(message, isError)`** - Updates the status line under the upload zone.
- **`escapeHtml(value)`** - Shared HTML-escaping helper used everywhere user-controlled SBOM data is rendered,
  to avoid injecting markup from an untrusted SBOM file.

## Limitations

- Product matching is a best-effort heuristic based on package name. Most application-level libraries
  (e.g. a random npm/PyPI package) aren't tracked by endoflife.date at all - only platforms, languages, OS
  distributions, and major frameworks are. That shows up as a ✗ with a "not tracked" explanation; use the
  editable "Product match" column to point a row at the correct product slug if one exists.
- Everything runs client-side in the browser: the browser needs to be able to reach `endoflife.date`, and the
  SBOM file is never sent anywhere else.

## Project layout

```
index.html                        entry point (multi-file, dev version)
css/styles.css                     styling
js/purl.js                         purl parser
js/sbom-parser.js                  CycloneDX / SPDX -> flat component list
js/eol-client.js                   endoflife.date API client + matching logic
js/app.js                          UI wiring
scripts/build-standalone.js        inlines the above into dist/sbom-support-lookup.html
dist/sbom-support-lookup.html      generated, single-file, no-server-required app
samples/                            example CycloneDX / SPDX SBOMs
tests/                              node:test regression tests for the pure logic modules
```

## Working with Claude Code

This repo includes a [`CLAUDE.md`](CLAUDE.md) with project context for Claude Code. See that file for
architecture notes and conventions to follow when making changes.
