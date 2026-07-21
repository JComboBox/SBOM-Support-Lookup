import { extractComponents } from './sbom-parser.js';
import { getAllProducts, lookupComponentEol } from './eol-client.js';

const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('sbom-file');
const dropZone = document.getElementById('drop-zone');
const lookupBtn = document.getElementById('lookup-btn');
const filterInput = document.getElementById('filter-input');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const tableBody = document.getElementById('components-body');
const tableSection = document.getElementById('table-section');
const productDatalist = document.getElementById('product-list');

const errorModal = document.getElementById('error-modal');
const errorModalBody = document.getElementById('error-modal-body');
const errorModalClose = document.getElementById('error-modal-close');

/** @type {Array<{name: string, version: string, purl: string, type: string, group: string, eol: any}>} */
let rows = [];

const LOOKUP_CONCURRENCY = 6;

uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

lookupBtn.addEventListener('click', () => runLookups());
filterInput.addEventListener('input', () => renderTable());

errorModalClose.addEventListener('click', closeErrorModal);
errorModal.addEventListener('click', (e) => {
  if (e.target === errorModal) closeErrorModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !errorModal.hidden) closeErrorModal();
});

/** Reads the uploaded SBOM file and populates the package table. */
async function handleFile(file) {
  setStatus(`Reading ${file.name}...`);
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const components = extractComponents(json);

    rows = components.map((c, index) => ({
      ...c,
      id: index,
      eol: null,
      lookupSeq: 0
    }));

    const purlCount = rows.filter((r) => r.identifierType === 'purl').length;
    const cpeCount = rows.filter((r) => r.identifierType === 'cpe').length;
    const noneCount = rows.length - purlCount - cpeCount;
    setStatus(
      `Loaded ${rows.length} package${rows.length === 1 ? '' : 's'} from ${file.name} ` +
        `(${purlCount} via purl, ${cpeCount} via cpe, ${noneCount} with no identifier). ` +
        'In memory only - nothing is uploaded anywhere.'
    );
    tableSection.hidden = rows.length === 0;
    lookupBtn.disabled = rows.length === 0;
    renderTable();
    updateSummary();
    preloadProductList();
  } catch (err) {
    console.error(err);
    setStatus(`Could not read "${file.name}": ${err.message}`, true);
  }
}

/** Warms the product-slug datalist used by the per-row "override" input. */
async function preloadProductList() {
  try {
    const products = await getAllProducts();
    productDatalist.innerHTML = products.map((p) => `<option value="${p}"></option>`).join('');
  } catch (err) {
    console.warn('Could not preload endoflife.date product list', err);
  }
}

/** Runs an EOL lookup for every row, a few at a time, updating the UI as results arrive. */
async function runLookups() {
  lookupBtn.disabled = true;
  setStatus('Loading end-of-life dates from endoflife.date...');

  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      await lookupRow(row);
    }
  };

  const workers = Array.from({ length: Math.min(LOOKUP_CONCURRENCY, rows.length) }, worker);
  await Promise.all(workers);

  const failed = rows.filter((r) => r.eol && !r.eol.ok).length;
  setStatus(
    `Done. Checked ${rows.length} package${rows.length === 1 ? '' : 's'} against endoflife.date` +
      (failed ? ` - ${failed} could not be resolved (click the red X for details).` : '.')
  );
  lookupBtn.disabled = false;
}

/**
 * Looks up a single row (used for both the batch run and per-row product overrides).
 * Guarded with a per-row sequence number so that if a row is re-triggered (e.g. the
 * user edits the product override again) before the previous lookup finishes, the
 * stale result is discarded instead of clobbering the newer one.
 */
async function lookupRow(row) {
  const seq = ++row.lookupSeq;
  row.eol = { status: 'pending' };
  updateResultCell(row);

  let result;
  try {
    result = await lookupComponentEol(
      { name: row.name, version: row.version, type: row.type, cpe: row.cpe },
      row.overrideSlug
    );
  } catch (err) {
    // lookupComponentEol resolves rather than rejects; this only catches
    // truly unexpected programmer errors so the UI never gets stuck.
    result = {
      ok: false,
      slug: null,
      status: 'error',
      label: 'Unexpected error',
      error: { message: err.message, url: null, httpStatus: null, body: null }
    };
  }

  if (seq !== row.lookupSeq) return; // superseded by a newer lookup for this row
  row.eol = result;
  updateResultCell(row);
  updateSummary();
}

function renderTable() {
  const filter = filterInput.value.trim().toLowerCase();
  tableBody.innerHTML = '';
  for (const row of rows) {
    if (filter && !rowMatchesFilter(row, filter)) continue;
    tableBody.appendChild(buildRowElement(row));
  }
}

function rowMatchesFilter(row, filter) {
  return (
    row.name.toLowerCase().includes(filter) ||
    row.version.toLowerCase().includes(filter) ||
    row.purl.toLowerCase().includes(filter) ||
    row.cpe.toLowerCase().includes(filter) ||
    (row.eol?.slug || '').toLowerCase().includes(filter)
  );
}

/** Updates only the "End-of-life result" cell for a row, leaving the rest of the row untouched. */
function updateResultCell(row) {
  const tr = findRowElement(row);
  if (!tr) return; // row is currently filtered out of view

  const cell = tr.children[4];
  cell.innerHTML = buildResultCellHtml(row);

  const errorMark = cell.querySelector('.mark-error');
  if (errorMark) errorMark.addEventListener('click', () => openErrorModal(row));
}

function findRowElement(row) {
  return tableBody.querySelector(`tr[data-row-id="${row.id}"]`);
}

function buildRowElement(row) {
  const tr = document.createElement('tr');
  tr.dataset.rowId = String(row.id);

  tr.innerHTML = `
    <td>${escapeHtml(row.name)}</td>
    <td>${escapeHtml(row.version || '-')}</td>
    <td class="id-cell">${buildIdentifierCellHtml(row)}</td>
    <td>${escapeHtml(row.type || '-')}</td>
    <td>${buildResultCellHtml(row)}</td>
    <td>
      <input type="text" class="override-input" list="product-list" placeholder="override product..." value="${escapeHtml(row.overrideSlug || row.eol?.slug || '')}" />
    </td>
  `;

  const overrideInput = tr.querySelector('.override-input');
  overrideInput.addEventListener('change', () => {
    const value = overrideInput.value.trim();
    row.overrideSlug = value || undefined;
    lookupRow(row);
  });

  const errorMark = tr.querySelector('.mark-error');
  if (errorMark) {
    errorMark.addEventListener('click', () => openErrorModal(row));
  }

  return tr;
}

/** Human-readable label for a row's identifier type, shown as a badge in the UI. */
function identifierTypeLabel(identifierType) {
  if (identifierType === 'purl') return 'PURL';
  if (identifierType === 'cpe') return 'CPE';
  return 'none';
}

/**
 * Builds the "Identifier" cell: a badge saying whether a PURL or CPE was found for
 * this component, plus the identifier string itself.
 */
function buildIdentifierCellHtml(row) {
  const value = row.identifierType === 'cpe' ? row.cpe : row.purl;
  const badge = `<span class="id-badge id-badge-${row.identifierType}" title="Identified by ${identifierTypeLabel(row.identifierType)}">${identifierTypeLabel(row.identifierType)}</span>`;
  return `${badge}<code>${escapeHtml(value || '-')}</code>`;
}

/** Builds the "End-of-life result" cell: a checkmark + dates, or a clickable red X. */
function buildResultCellHtml(row) {
  const eol = row.eol;

  if (!eol || eol.status === 'pending') {
    return `<span class="result-cell"><span class="mark mark-pending">&hellip;</span> <span class="result-text">Not checked yet</span></span>`;
  }

  if (eol.ok) {
    const productLink = eol.slug
      ? `<a class="eol-link" href="https://endoflife.date/${encodeURIComponent(eol.slug)}" target="_blank" rel="noopener">${escapeHtml(eol.slug)}</a>`
      : '';
    return `
      <span class="result-cell">
        <span class="mark mark-ok" title="endoflife.date returned data for this package">&#10003;</span>
        <span class="result-text">${escapeHtml(eol.label)}</span>
        ${productLink}
      </span>
    `;
  }

  return `
    <span class="result-cell">
      <button type="button" class="mark mark-error" title="Click to see the error details">&#10007;</button>
      <span class="result-text result-text-error">${escapeHtml(eol.label || 'Lookup failed')}</span>
    </span>
  `;
}

function openErrorModal(row) {
  const eol = row.eol;
  const err = eol?.error;

  const identifierValue = row.identifierType === 'cpe' ? row.cpe : row.purl;
  errorModalBody.innerHTML = `
    <dl>
      <dt>Package</dt><dd>${escapeHtml(row.name)} ${escapeHtml(row.version || '')}</dd>
      <dt>Identifier</dt><dd>${escapeHtml(identifierTypeLabel(row.identifierType))}: <code>${escapeHtml(identifierValue || '-')}</code></dd>
      <dt>Matched product</dt><dd>${escapeHtml(eol?.slug || '(none)')}</dd>
      <dt>Request URL</dt><dd>${err?.url ? `<code>${escapeHtml(err.url)}</code>` : '-'}</dd>
      <dt>HTTP status</dt><dd>${err?.httpStatus ?? '-'}</dd>
    </dl>
    <p>${escapeHtml(err?.message || 'Unknown error')}</p>
    ${err?.body ? `<pre class="modal-raw">${escapeHtml(truncate(err.body, 2000))}</pre>` : ''}
  `;
  errorModal.hidden = false;
  errorModalClose.focus();
}

function closeErrorModal() {
  errorModal.hidden = true;
}

function truncate(str, maxLength) {
  return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
}

function updateSummary() {
  const counts = { ok: 0, eol: 0, 'eol-scheduled': 0, supported: 0, failed: 0, pending: 0 };
  for (const row of rows) {
    const eol = row.eol;
    if (!eol || eol.status === 'pending') {
      counts.pending += 1;
    } else if (eol.ok) {
      counts.ok += 1;
      counts[eol.status] = (counts[eol.status] || 0) + 1;
    } else {
      counts.failed += 1;
    }
  }
  summaryEl.innerHTML = `
    <span class="summary-item summary-ok">&#10003; ${counts.ok} resolved (${counts.supported} supported, ${counts['eol-scheduled']} sunset scheduled, ${counts.eol} end of life)</span>
    <span class="summary-item summary-error">&#10007; ${counts.failed} failed</span>
    <span class="summary-item">${counts.pending} pending</span>
  `;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('status-error', isError);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
