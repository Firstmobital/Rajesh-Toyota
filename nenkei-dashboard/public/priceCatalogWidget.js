// Shared "pick a model/variant, auto-fill the price fields" widget for the
// Quote and Booking forms. Reads public/data/priceCatalog.json, generated
// from Toyota's official price-list PDFs (see
// scripts note in that file's `generatedFrom`). Values are a starting
// point — every field it fills stays a normal editable input.
export async function initPriceCatalog({ modelSelectId, variantSelectId, fieldMap, hintId }) {
  const modelSelect = document.getElementById(modelSelectId);
  const variantSelect = document.getElementById(variantSelectId);
  if (!modelSelect || !variantSelect) return;

  let rows = [];
  try {
    const res = await fetch('/data/priceCatalog.json');
    const data = await res.json();
    rows = data.rows || [];
  } catch (err) {
    console.error('Could not load price catalog', err);
    return;
  }

  if (!rows.length) return;

  const vehicles = [...new Set(rows.map(r => r.vehicle))].sort();
  modelSelect.innerHTML = '<option value="">Select model to auto-fill prices…</option>' +
    vehicles.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');

  function populateVariants(vehicle) {
    const matches = rows.filter(r => r.vehicle === vehicle);
    variantSelect.disabled = matches.length === 0;
    variantSelect.innerHTML = '<option value="">Select variant…</option>' +
      matches.map((r, i) => {
        const label = [r.variant, r.suffixCode].filter(Boolean).join(' — ') +
          (r.exShowroomPrice ? ` (₹${r.exShowroomPrice.toLocaleString('en-IN')})` : '');
        return `<option value="${i}">${escapeHtml(label)}</option>`;
      }).join('');
    variantSelect.dataset.vehicle = vehicle;
  }

  modelSelect.addEventListener('change', () => {
    populateVariants(modelSelect.value);
  });

  variantSelect.addEventListener('change', () => {
    if (variantSelect.value === '') return;
    const matches = rows.filter(r => r.vehicle === variantSelect.dataset.vehicle);
    const row = matches[Number(variantSelect.value)];
    if (!row) return;
    applyRow(row, fieldMap);
    if (hintId) {
      const hint = document.getElementById(hintId);
      if (hint) hint.textContent = `Filled from ${row.sourceFile} — review before saving.`;
    }
  });
}

function applyRow(row, fieldMap) {
  const set = (name, value) => {
    if (!name || value === undefined || value === null) return;
    const el = document.querySelector(`[name="${name}"]`);
    if (el) el.value = value;
  };

  set(fieldMap.model, row.vehicle);
  set(fieldMap.suffix, row.suffixCode || '');
  set(fieldMap.vehicleCost, row.exShowroomPrice);
  set(fieldMap.registrationRoadTax, row.roadTaxRegistration);
  set(fieldMap.extendedWarranty, row.trueWarranty);

  const insuranceValues = Object.values(row.insurance || {});
  if (insuranceValues.length) set(fieldMap.toyotaProtect, insuranceValues[0]);

  const coating = (row.smilePackage || 0) + (row.tgloss || 0);
  if (coating) set(fieldMap.smilesCoating, coating);

  if (row.tga) set(fieldMap.tga, row.tga);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
