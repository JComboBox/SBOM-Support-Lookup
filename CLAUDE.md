# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this project is

A static, client-side web app (no backend, no build step) that lets someone upload an SBOM (CycloneDX or SPDX
JSON), see every package's purl, and check end-of-life status for those packages via the public
[endoflife.date](https://endoflife.date) API. It's meant to be trivially cloneable and shareable: open one
HTML page (served statically) and it works.

## Architecture

- `index.html` - page shell, loads `js/app.js` as an ES module.
- `js/purl.js` - pure function `parsePurl(purl)`, no dependencies, no DOM/browser APIs.
- `js/sbom-parser.js` - pure function `extractComponents(sbomJson)`, detects CycloneDX vs SPDX and flattens to
  `{ name, version, purl, type, group }[]`. No DOM/browser APIs.
- `js/eol-client.js` - talks to `https://endoflife.date/api/*` via `fetch`. Exports both the network-calling
  functions (`getAllProducts`, `getCycles`, `lookupComponentEol`) and pure helpers (`normalize`,
  `versionMajorMinor`, `matchCycle`, `interpretEol`) that are unit tested without any network access.
  `lookupComponentEol` never rejects - it always resolves to `{ ok, slug, cycle, status, label, eolDate, error }`.
  `error` is only non-null when `ok` is false, and captures enough (`message`, `url`, `httpStatus`, `body`) to
  show the user the real API response, not just a generic failure message.
- `js/app.js` - the only file that touches the DOM. Wires the **Upload SBOM** button/drag-drop, renders the
  table, runs lookups with limited concurrency, and handles the manual per-row product override. `ok: true`
  results render as a green checkmark with the EOL label/date; `ok: false` results render as a clickable red X
  that opens the `#error-modal` dialog with `row.eol.error`.

Keep this separation: parsing/matching logic (`purl.js`, `sbom-parser.js`, the pure exports of
`eol-client.js`) must stay framework-free and testable with `node:test`; `app.js` stays the only DOM-touching
file.

## Running it

```bash
npm start   # npx serve on http://localhost:5173
npm test    # node --test
```

The app uses `<script type="module">`, so it must be served over http(s) (`npm start`, or any static file
server) - opening `index.html` directly via `file://` will fail in Chromium-based browsers.

There is no bundler, transpiler, or framework in this project. Do not add one (webpack/vite/react/etc.) unless
the user explicitly asks - the whole point is a zero-build, easy-to-share page.

## endoflife.date API notes

- `GET /api/all.json` -> `string[]` of product slugs.
- `GET /api/{product}.json` -> array of release cycle objects with at least `cycle` and `eol`
  (`eol` is `false`, `true`, or an ISO `YYYY-MM-DD` string).
- No API key, and the API is CORS-enabled for browser use.
- endoflife.date tracks platforms/languages/frameworks/distros, not arbitrary libraries, so most SBOM
  components will not have a match. That's expected, not a bug - `PRODUCT_ALIASES` in `js/eol-client.js` is a
  small, deliberately limited alias table; don't try to make it exhaustively cover every ecosystem.

## Conventions

- Vanilla JS, ES modules, no TypeScript, no dependencies (`npm start` shells out to `npx serve` purely as a
  dev convenience and installs nothing into the repo).
- Keep functions in `purl.js`, `sbom-parser.js`, and the pure helpers in `eol-client.js` free of `fetch`/DOM so
  they stay unit-testable via `node --test`.
- When adding a new SBOM format or matching rule, add a corresponding test under `tests/` and, if it's a new
  SBOM format, a sample file under `samples/`.
- `js/app.js` updates a row's result cell in place (`updateResultCell`) rather than replacing the whole `<tr>`.
  Don't reintroduce whole-row replacement on lookup - the row's "Product match" `<input>` must stay mounted
  (and keep focus) across a lookup it itself triggered, or you'll reintroduce a DOM race between the input's
  own event dispatch and the re-render. Each lookup is tagged with an incrementing `row.lookupSeq`; a result is
  only applied if it's still the latest one for that row.
- CSS gotcha already hit once: an element's `hidden` attribute only wins over an author `display` rule if there
  is an explicit `[hidden] { display: none }` override in the stylesheet (author CSS beats the UA stylesheet at
  equal specificity). `#error-modal` relies on `.modal-overlay[hidden] { display: none; }` in `css/styles.css`
  for this reason - don't drop it when touching modal/overlay styles.
