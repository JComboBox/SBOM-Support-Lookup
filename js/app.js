import { extractComponents } from './sbom-parser.js';
import { parsePurl } from './purl.js';
import { getAllProducts, lookupComponentEol } from './eol-client.js';

const fileInput = document.getElementById('sbom-file');
const dropZone = document.getElementById('drop-zone');
const lookupBtn = document.getElementById('lookup-btn');
const filterInput = document.getElementById('filter-input');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const tableBody = document.getElementById('components-body');
const tableSection = document.getElementById('table-section');
const productDatalist = document.getElementById('product-list');

/** @type {Array<{name: string, version: string, purl: string, type: string, group: string, eol: any}>} */
let rows = [];

const LOOKUP_CONCURRENCY = 6;
const STATUS_LABELS = {
  eol: 'End of life',
  'eol-scheduled': 'Sunset scheduled',
  supported: 'Supported',
  'not-tracked': 'Not tracked',
  'no-version-match': 'Version unmatched',
  unknown: 'Unknown',
  pending: 'Pending'
};

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

async function handleFile(file) {
  setStatus(`Reading ${file.name}...`);
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const components = extractComponents(json);

    rows = components.map((c) => ({
      ...c,
      purlParsed: c.purl ? parsePurl(c.purl) : null,
      eol: { status: 'pending', label: STATUS_LABELS.pending }
    }));

    setStatus(`Loaded ${rows.length} package${rows.length === 1 ? '' : 's'} from ${file.name}. In memory only - nothing is uploaded anywhere.`);
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

async function preloadProductList() {
  try {
    const products = await getAllProducts();
    productDatalist.innerHTML = products.map((p) => `<option value="${p}"></option>`).join('');
  } catch (err) {
    console.warn('Could not preload endoflife.date product list', err);
  }
}

async function runLookups() {
  lookupBtn.disabled = true;
  setStatus('Looking up end-of-life data on endoflife.date...');

  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      row.eol = { status: 'pending', label: 'Looking up...' };
      renderRow(row);
      try {
        row.eol = await lookupComponentEol(
          { name: row.name, version: row.version, type: row.purlParsed?.type || row.type },
          row.overrideSlug
        );
      } catch (err) {
        row.eol = { status: 'error', label: `Lookup failed: ${err.message}` };
      }
      renderRow(row);
      updateSummary();
    }
  };

  const workers = Array.from({ length: Math.min(LOOKUP_CONCURRENCY, rows.length) }, worker);
  await Promise.all(workers);

  setStatus(`Done. Looked up ${rows.length} package${rows.length === 1 ? '' : 's'} against endoflife.date.`);
  lookupBtn.disabled = false;
}

async function relookupRow(row, slug) {
  row.overrideSlug = slug || undefined;
  row.eol = { status: 'pending', label: 'Looking up...' };
  renderRow(row);
  try {
    row.eol = await lookupComponentEol(
      { name: row.name, version: row.version, type: row.purlParsed?.type || row.type },
      row.overrideSlug
    );
  } catch (err) {
    row.eol = { status: 'error', label: `Lookup failed: ${err.message}` };
  }
  renderRow(row);
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
    (row.eol?.slug || '').toLowerCase().includes(filter)
  );
}

function renderRow(row) {
  const existing = tableBody.querySelector(`tr[data-purl="${cssEscape(row.purl)}"][data-name="${cssEscape(row.name)}"]`);
  const replacement = buildRowElement(row);
  if (existing) existing.replaceWith(replacement);
}

function cssEscape(value) {
  return String(value || '').replace(/["\\]/g, '\\$&');
}

function buildRowElement(row) {
  const tr = document.createElement('tr');
  tr.dataset.purl = row.purl;
  tr.dataset.name = row.name;

  const eol = row.eol || { status: 'pending', label: STATUS_LABELS.pending };
  const badgeClass = `badge badge-${eol.status}`;

  tr.innerHTML = `
    <td>${escapeHtml(row.name)}</td>
    <td>${escapeHtml(row.version || '-')}</td>
    <td class="purl-cell"><code>${escapeHtml(row.purl || '-')}</code></td>
    <td>${escapeHtml(row.purlParsed?.type || row.type || '-')}</td>
    <td>
      <span class="${badgeClass}">${escapeHtml(eol.label || STATUS_LABELS[eol.status] || eol.status)}</span>
      ${eol.slug ? `<a class="eol-link" href="https://endoflife.date/${encodeURIComponent(eol.slug)}" target="_blank" rel="noopener">${escapeHtml(eol.slug)}</a>` : ''}
    </td>
    <td>
      <input type="text" class="override-input" list="product-list" placeholder="override product..." value="${escapeHtml(row.overrideSlug || eol.slug || '')}" />
    </td>
  `;

  const overrideInput = tr.querySelector('.override-input');
  overrideInput.addEventListener('change', () => {
    const value = overrideInput.value.trim();
    relookupRow(row, value || undefined);
  });

  return tr;
}

function updateSummary() {
  const counts = { eol: 0, 'eol-scheduled': 0, supported: 0, 'not-tracked': 0, 'no-version-match': 0, unknown: 0, pending: 0, error: 0 };
  for (const row of rows) {
    const status = row.eol?.status || 'pending';
    counts[status] = (counts[status] || 0) + 1;
  }
  summaryEl.innerHTML = `
    <span class="summary-item badge-eol">${counts.eol} end of life</span>
    <span class="summary-item badge-eol-scheduled">${counts['eol-scheduled']} sunset scheduled</span>
    <span class="summary-item badge-supported">${counts.supported} supported</span>
    <span class="summary-item badge-not-tracked">${counts['not-tracked'] + counts['no-version-match'] + counts.unknown} not tracked / unmatched</span>
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
