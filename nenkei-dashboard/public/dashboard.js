/* ─── State ─────────────────────────────────────────────────── */
let activeYear = 2025;
let activeSection = 'overview';
const dataCache = {};   // year → { data, fetchedAt }
const CACHE_TTL = 5 * 60 * 1000;
const charts = {};

/* ─── Constants ─────────────────────────────────────────────── */
const COLORS = {
  blue:  '#378ADD',
  green: '#97C459',
  amber: '#EF9F27',
  coral: '#D85A30',
  teal:  '#1D9E75',
  gray:  '#94A3B8',
  navy:  '#1A2332',
};
const PALETTE = [COLORS.blue, COLORS.green, COLORS.amber, COLORS.coral, COLORS.teal, COLORS.gray, '#A78BFA', '#FB923C', '#34D399', '#F472B6'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ─── Helpers ───────────────────────────────────────────────── */
function parseNum(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/,/g, '').replace(/₹/g, '').trim());
  return isNaN(n) ? null : n;
}

function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return '₹' + Number(n.toFixed(decimals)).toLocaleString('en-IN');
}

function fmtPct(n) {
  if (n == null) return '—';
  return n.toFixed(2) + '%';
}

function fmtNum(n) {
  if (n == null) return '—';
  return Number(Math.round(n)).toLocaleString('en-IN');
}

function avg(arr) {
  const nums = arr.filter(x => x != null && !isNaN(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sum(arr) {
  return arr.filter(x => x != null && !isNaN(x)).reduce((a, b) => a + b, 0);
}

function groupBy(arr, keyFn) {
  const map = {};
  arr.forEach(item => {
    const k = keyFn(item) || 'Unknown';
    if (!map[k]) map[k] = [];
    map[k].push(item);
  });
  return map;
}

function sortedEntries(obj, valFn, desc = true) {
  return Object.entries(obj)
    .map(([k, v]) => [k, v])
    .sort((a, b) => desc ? valFn(b[1]) - valFn(a[1]) : valFn(a[1]) - valFn(b[1]));
}

function monthOrder(name) {
  const i = MONTHS.indexOf(name);
  return i === -1 ? 99 : i;
}

function normalizeMonthName(val) {
  if (val == null) return null;
  const raw = String(val).trim();
  if (!raw) return null;

  // Already in short month format.
  if (MONTHS.includes(raw)) return raw;

  // Handle full month names and mixed casing.
  const parsed = new Date(`2000-${raw}-01T00:00:00Z`);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  }

  // Fallback for values like "january" or " JAN ".
  const lowered = raw.toLowerCase();
  const matched = MONTHS.find(m => m.toLowerCase() === lowered.slice(0, 3));
  return matched || null;
}

function normalizeModelName(val) {
  const model = String(val || '').trim();
  return model || 'Unknown';
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function createChart(id, config) {
  destroyChart(id);
  const el = document.getElementById(id);
  if (!el) return null;
  charts[id] = new Chart(el.getContext('2d'), config);
  return charts[id];
}

function card(title, value, sub = '') {
  return `<div class="kpi-card"><div class="kpi-label">${title}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}

function chartCard(title, canvasId, height = 300) {
  return `<div class="chart-card"><div class="chart-title">${title}</div><canvas id="${canvasId}" height="${height}"></canvas></div>`;
}

function tableHtml(headers, rows, emptyMsg = 'No data') {
  if (!rows.length) return `<p class="empty">${emptyMsg}</p>`;
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ─── Data Loading ──────────────────────────────────────────── */
async function loadData(year) {
  if (dataCache[year] && Date.now() - dataCache[year].fetchedAt < CACHE_TTL) {
    return dataCache[year].data;
  }
  showLoading(true);
  try {
    const res = await fetch(`/api/data/${year}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    dataCache[year] = { data, fetchedAt: Date.now() };
    return data;
  } finally {
    showLoading(false);
  }
}

function showLoading(visible) {
  document.getElementById('loading-overlay').style.display = visible ? 'flex' : 'none';
}

function showError(msg) {
  document.getElementById('error-message').textContent = msg;
  document.getElementById('error-banner').style.display = 'flex';
}

/* ─── Render Dispatcher ─────────────────────────────────────── */
async function renderSection(section, year) {
  Object.values(charts).forEach(c => c.destroy());
  Object.keys(charts).forEach(k => delete charts[k]);

  const content = document.getElementById('main-content');
  content.innerHTML = '';

  if (section === 'yoy') {
    await renderYoY();
    return;
  }

  let data;
  try {
    data = await loadData(year);
  } catch (e) {
    showError(`Failed to load ${year} data: ${e.message}`);
    content.innerHTML = `<div class="empty-state"><p>Could not load data for ${year}.<br><small>${e.message}</small></p></div>`;
    return;
  }

  switch (section) {
    case 'overview':   renderOverview(data, content); break;
    case 'volumes':    renderVolumes(data, content); break;
    case 'margins':    renderMargins(data, content); break;
    case 'finance':    renderFinance(data, content); break;
    case 'salesteam':  renderSalesTeam(data, content); break;
  }
}

/* ─── 1. Overview ───────────────────────────────────────────── */
function renderOverview(data, el) {
  const { joined } = data;
  const matched = joined.filter(r => r.netMargin != null);

  const totalUnits = joined.length;
  const avgRetail = avg(joined.map(r => parseNum(r['RETAIL INVOICE AMOUNT'])));
  const avgPurchase = avg(joined.map(r => parseNum(r['PURCHASE AMOUNT'])));
  const avgNetMargin = avg(matched.map(r => r.netMargin));
  const sumNetMargin = sum(matched.map(r => r.netMargin));
  const sumRetail = sum(matched.map(r => parseNum(r['RETAIL INVOICE AMOUNT'])));
  const marginPct = sumRetail ? (sumNetMargin / sumRetail) * 100 : null;
  const avgDiscount = avg(joined.map(r => parseNum(r['TOTAL DISCOUNT'])));

  el.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Total Units Sold', totalUnits)}
        ${card('Avg Retail Price', fmt(avgRetail))}
        ${card('Avg Purchase Cost', fmt(avgPurchase))}
        ${card('Avg Net Margin / Unit', fmt(avgNetMargin), `${matched.length} matched units`)}
        ${card('Net Margin %', fmtPct(marginPct))}
        ${card('Avg Discount / Unit', fmt(avgDiscount))}
      </div>
    </section>
    <section class="section-block charts-row">
      ${chartCard('Monthly Avg Net Margin / Unit', 'chart-monthly-margin')}
      ${chartCard('Model-wise Avg Net Margin', 'chart-model-margin')}
    </section>`;

  // Monthly avg net margin
  const byMonth = groupBy(matched, r => r._monthName);
  const monthLabels = MONTHS.filter(m => byMonth[m]);
  const monthAvgs = monthLabels.map(m => avg(byMonth[m].map(r => r.netMargin)));
  createChart('chart-monthly-margin', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{ label: 'Avg Net Margin (₹)', data: monthAvgs, backgroundColor: COLORS.blue, borderRadius: 4 }],
    },
    options: chartDefaults('₹'),
  });

  // Model-wise avg net margin (top 12)
  const byModel = groupBy(matched, r => r['MODEL'] || 'Unknown');
  const modelEntries = sortedEntries(byModel, rows => avg(rows.map(r => r.netMargin))).slice(0, 12);
  createChart('chart-model-margin', {
    type: 'bar',
    data: {
      labels: modelEntries.map(([k]) => k),
      datasets: [{ label: 'Avg Net Margin (₹)', data: modelEntries.map(([, rows]) => avg(rows.map(r => r.netMargin))), backgroundColor: PALETTE, borderRadius: 4 }],
    },
    options: { ...chartDefaults('₹'), indexAxis: 'y' },
  });
}

/* ─── 2. Volumes ────────────────────────────────────────────── */
function renderVolumes(data, el) {
  const { joined } = data;
  const totalUnits = joined.length;

  const normalizedRows = joined.map(r => ({
    ...r,
    _monthNameNorm: normalizeMonthName(r._monthName),
    _modelNorm: normalizeModelName(r['MODEL']),
  }));

  const validMonthRows = normalizedRows.filter(r => r._monthNameNorm);

  // Month labels are strictly ordered and only include months present in data.
  const monthLabelSet = new Set(validMonthRows.map(r => r._monthNameNorm));
  const monthLabels = MONTHS.filter(m => monthLabelSet.has(m));

  // Top 5 models
  const byModel = groupBy(normalizedRows, r => r._modelNorm);
  const top5Models = sortedEntries(byModel, rows => rows.length).slice(0, 5).map(([k]) => k);
  const highestSellingModel = sortedEntries(byModel, rows => rows.length)[0] || null;
  const monthsWithData = monthLabels.length;
  const avgMonthlySales = monthsWithData ? totalUnits / monthsWithData : null;

  // Monthly stacked by top 5 + Other
  const byMonth = groupBy(validMonthRows, r => r._monthNameNorm);

  const stackedDatasets = [...top5Models, 'Other'].map((model, i) => ({
    label: model,
    data: monthLabels.map(m => {
      const rows = byMonth[m] || [];
      return model === 'Other'
        ? rows.filter(r => !top5Models.includes(r._modelNorm)).length
        : rows.filter(r => r._modelNorm === model).length;
    }),
    backgroundColor: PALETTE[i] || '#ccc',
  }));

  // Month-on-month model trend for top 5 models.
  const trendDatasets = top5Models.map((model, i) => ({
    label: model,
    data: monthLabels.map(m => {
      const rows = byMonth[m] || [];
      return rows.filter(r => r._modelNorm === model).length;
    }),
    borderColor: PALETTE[i] || '#ccc',
    backgroundColor: (PALETTE[i] || '#ccc') + '33',
    tension: 0.3,
    pointRadius: 3,
    fill: false,
  }));

  // Fuel mix
  const byFuel = groupBy(normalizedRows, r => r['FUEL'] || 'Unknown');
  // Top colours
  const byColour = groupBy(normalizedRows, r => r['Colour'] || r['COLOUR'] || 'Unknown');
  const topColours = sortedEntries(byColour, rows => rows.length).slice(0, 10);

  el.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid kpi-grid-3">
        ${card('Total Units Sold', totalUnits)}
        ${card('Avg Monthly Sales', fmtNum(avgMonthlySales), monthsWithData ? `${monthsWithData} months with sales` : 'No valid month data')}
        ${card('Highest Selling Model', highestSellingModel ? highestSellingModel[0] : '—', highestSellingModel ? `${highestSellingModel[1].length} units` : 'No model data')}
      </div>
    </section>
    <section class="section-block charts-row">
      ${chartCard('Monthly Volume by Model (Top 5)', 'chart-monthly-vol', 320)}
      ${chartCard('Month-on-Month Model-wise Sales (Top 5)', 'chart-model-mom', 320)}
    </section>
    <section class="section-block charts-row">
      ${chartCard('Fuel Mix', 'chart-fuel', 280)}
      ${chartCard('Top Colours', 'chart-colours', 280)}
    </section>`;

  createChart('chart-monthly-vol', {
    type: 'bar',
    data: { labels: monthLabels, datasets: stackedDatasets },
    options: { ...chartDefaults('units'), plugins: { ...chartDefaults('units').plugins, legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true } } },
  });

  createChart('chart-model-mom', {
    type: 'line',
    data: { labels: monthLabels, datasets: trendDatasets },
    options: { ...chartDefaults('units'), plugins: { ...chartDefaults('units').plugins, legend: { position: 'bottom' } } },
  });

  createChart('chart-fuel', {
    type: 'doughnut',
    data: {
      labels: Object.keys(byFuel),
      datasets: [{ data: Object.values(byFuel).map(r => r.length), backgroundColor: PALETTE }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => {
              const data = ctx.dataset?.data || [];
              const total = data.reduce((sum, item) => {
                const num = Number(item);
                return Number.isFinite(num) ? sum + num : sum;
              }, 0);
              const value = Number(ctx.parsed);
              const percent = total > 0 ? ((value / total) * 100) : 0;
              return ` ${Math.round(value).toLocaleString('en-IN')} units (${percent.toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });

  createChart('chart-colours', {
    type: 'bar',
    data: {
      labels: topColours.map(([k]) => k),
      datasets: [{ label: 'Units', data: topColours.map(([, rows]) => rows.length), backgroundColor: PALETTE }],
    },
    options: { ...chartDefaults('units'), indexAxis: 'y' },
  });
}

/* ─── 3. Margins / Unit ─────────────────────────────────────── */
function renderMargins(data, el) {
  const { joined } = data;
  const matched = joined.filter(r => r.netMargin != null);

  // Per-model table
  const byModel = groupBy(matched, r => r['MODEL'] || 'Unknown');
  const modelRows = sortedEntries(byModel, rows => avg(rows.map(r => r.netMargin))).map(([model, rows]) => {
    const avgRetail = avg(rows.map(r => parseNum(r['RETAIL INVOICE AMOUNT'])));
    const avgPurchase = avg(rows.map(r => parseNum(r['PURCHASE AMOUNT'])));
    const avgNM = avg(rows.map(r => r.netMargin));
    const sumNM = sum(rows.map(r => r.netMargin));
    const sumRet = sum(rows.map(r => parseNum(r['RETAIL INVOICE AMOUNT'])));
    const pct = sumRet ? (sumNM / sumRet) * 100 : null;
    return [model, rows.length, fmt(avgRetail), fmt(avgPurchase), fmt(avgNM), fmtPct(pct)];
  });

  // Location-wise
  const byLoc = groupBy(matched, r => r['Location'] || r['LOCATION'] || 'Unknown');
  const locRows = sortedEntries(byLoc, rows => avg(rows.map(r => r.netMargin))).map(([loc, rows]) => {
    const avgNM = avg(rows.map(r => r.netMargin));
    const sumNM = sum(rows.map(r => r.netMargin));
    const sumRet = sum(rows.map(r => parseNum(r['RETAIL INVOICE AMOUNT'])));
    const pct = sumRet ? (sumNM / sumRet) * 100 : null;
    return [loc, rows.length, fmt(avgNM), fmtPct(pct)];
  });

  // Monthly trend
  const byMonth = groupBy(matched, r => r._monthName || 'Unknown');
  const monthLabels = MONTHS.filter(m => byMonth[m]);

  el.innerHTML = `
    <section class="section-block">
      <h2 class="section-heading">Per-Model Margin Summary</h2>
      ${tableHtml(['Model', 'Units', 'Avg Retail', 'Avg Purchase', 'Avg Net Margin', 'Margin %'], modelRows)}
    </section>
    <section class="section-block">
      ${chartCard('Monthly Net Margin Trend (Avg / Unit)', 'chart-margin-trend')}
    </section>
    <section class="section-block">
      <h2 class="section-heading">Location-wise Margin</h2>
      ${tableHtml(['Location', 'Units', 'Avg Net Margin', 'Margin %'], locRows)}
    </section>`;

  createChart('chart-margin-trend', {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [{
        label: 'Avg Net Margin / Unit (₹)',
        data: monthLabels.map(m => avg(byMonth[m].map(r => r.netMargin))),
        borderColor: COLORS.blue,
        backgroundColor: COLORS.blue + '22',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
      }],
    },
    options: chartDefaults('₹'),
  });
}

/* ─── 4. Finance & Insurance ────────────────────────────────── */
function renderFinance(data, el) {
  const { joined } = data;

  const byFinSrc = groupBy(joined, r => r['FINANCE SOURCE'] || 'Unknown');
  const byFinancier = groupBy(joined, r => r['FINANCIER'] || 'Unknown');
  const byInsCo = groupBy(joined, r => r['INS CO.'] || r['INS CO'] || 'Unknown');
  const byCod = groupBy(joined, r => {
    const v = (r['COD Yes Or No'] || '').toLowerCase();
    return v === 'yes' ? 'COD' : v === 'no' ? 'Non-COD' : 'Unknown';
  });

  const topFinanciers = sortedEntries(byFinancier, rows => rows.length).slice(0, 10);
  const topInsCo = sortedEntries(byInsCo, rows => rows.length).slice(0, 10);

  el.innerHTML = `
    <section class="section-block charts-row">
      ${chartCard('Finance Source Breakdown', 'chart-fin-src', 280)}
      ${chartCard('COD vs Non-COD', 'chart-cod', 280)}
    </section>
    <section class="section-block">
      <h2 class="section-heading">Financier Leaderboard</h2>
      ${tableHtml(['Financier', 'Units', '% Share'], topFinanciers.map(([k, rows]) => [k, rows.length, fmtPct(rows.length / joined.length * 100)]))}
    </section>
    <section class="section-block">
      ${chartCard('Insurance Company Breakdown (Top 10)', 'chart-ins', 280)}
    </section>`;

  createChart('chart-fin-src', {
    type: 'doughnut',
    data: { labels: Object.keys(byFinSrc), datasets: [{ data: Object.values(byFinSrc).map(r => r.length), backgroundColor: PALETTE }] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => {
              const data = ctx.dataset?.data || [];
              const total = data.reduce((sum, item) => {
                const num = Number(item);
                return Number.isFinite(num) ? sum + num : sum;
              }, 0);
              const value = Number(ctx.parsed);
              const percent = total > 0 ? ((value / total) * 100) : 0;
              return ` ${Math.round(value).toLocaleString('en-IN')} units (${percent.toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });

  createChart('chart-cod', {
    type: 'doughnut',
    data: { labels: Object.keys(byCod), datasets: [{ data: Object.values(byCod).map(r => r.length), backgroundColor: [COLORS.blue, COLORS.green, COLORS.gray] }] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: ctx => {
              const data = ctx.dataset?.data || [];
              const total = data.reduce((sum, item) => {
                const num = Number(item);
                return Number.isFinite(num) ? sum + num : sum;
              }, 0);
              const value = Number(ctx.parsed);
              const percent = total > 0 ? ((value / total) * 100) : 0;
              return ` ${Math.round(value).toLocaleString('en-IN')} units (${percent.toFixed(1)}%)`;
            },
          },
        },
      },
    },
  });

  createChart('chart-ins', {
    type: 'bar',
    data: {
      labels: topInsCo.map(([k]) => k),
      datasets: [{ label: 'Units', data: topInsCo.map(([, rows]) => rows.length), backgroundColor: PALETTE }],
    },
    options: { ...chartDefaults('units'), indexAxis: 'y' },
  });
}

/* ─── 5. Sales Team ─────────────────────────────────────────── */
function renderSalesTeam(data, el) {
  const { joined } = data;

  function leaderboard(groupKey, label) {
    const grouped = groupBy(joined, r => r[groupKey] || 'Unknown');
    const rows = sortedEntries(grouped, rows => rows.length).slice(0, 20).map(([name, rows], i) => {
      const avgNM = avg(rows.filter(r => r.netMargin != null).map(r => r.netMargin));
      return [`#${i + 1}`, name, rows.length, fmt(avgNM)];
    });
    return `<div class="leaderboard-block">
      <h3 class="leaderboard-title">${label}</h3>
      ${tableHtml(['#', 'Name', 'Units', 'Avg Net Margin'], rows, `No ${label} data`)}
    </div>`;
  }

  el.innerHTML = `
    <section class="section-block leaderboard-row">
      ${leaderboard('SM', 'Sales Manager (SM)')}
      ${leaderboard('T.L.', 'Team Leader (TL)')}
      ${leaderboard('S.O.', 'Sales Officer (SO)')}
    </section>`;
}

/* ─── 6. Year-over-Year ─────────────────────────────────────── */
async function renderYoY() {
  const content = document.getElementById('main-content');

  let data2025, data2026;
  try {
    showLoading(true);
    [data2025, data2026] = await Promise.allSettled([loadData(2025), loadData(2026)]);
  } finally {
    showLoading(false);
  }

  const d25 = data2025.status === 'fulfilled' ? data2025.value : null;
  const d26 = data2026.status === 'fulfilled' ? data2026.value : null;

  if (!d25 && !d26) {
    content.innerHTML = '<div class="empty-state"><p>No data available for Year-over-Year comparison.</p></div>';
    return;
  }
  if (!d25 || !d26) {
    content.innerHTML = '<div class="empty-state"><p>Year-over-Year comparison requires data for both 2025 and 2026.<br>Only one year has data so far.</p></div>';
    return;
  }

  const matched25 = d25.joined.filter(r => r.netMargin != null);
  const matched26 = d26.joined.filter(r => r.netMargin != null);

  // Monthly volume comparison
  const vol25 = groupBy(d25.joined, r => r._monthName || 'Unknown');
  const vol26 = groupBy(d26.joined, r => r._monthName || 'Unknown');
  const allMonths = MONTHS.filter(m => vol25[m] || vol26[m]);

  // Monthly margin comparison
  const marg25 = groupBy(matched25, r => r._monthName || 'Unknown');
  const marg26 = groupBy(matched26, r => r._monthName || 'Unknown');

  // Model mix: top 8 combined
  const allModels25 = groupBy(d25.joined, r => r['MODEL'] || 'Unknown');
  const allModels26 = groupBy(d26.joined, r => r['MODEL'] || 'Unknown');
  const allModelNames = [...new Set([...Object.keys(allModels25), ...Object.keys(allModels26)])];
  const topModels = allModelNames
    .map(m => ({ m, total: (allModels25[m]?.length || 0) + (allModels26[m]?.length || 0) }))
    .sort((a, b) => b.total - a.total).slice(0, 8).map(x => x.m);

  content.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid kpi-grid-4">
        ${card('2025 Total Units', d25.joined.length)}
        ${card('2026 Total Units', d26.joined.length)}
        ${card('2025 Avg Net Margin', fmt(avg(matched25.map(r => r.netMargin))))}
        ${card('2026 Avg Net Margin', fmt(avg(matched26.map(r => r.netMargin))))}
      </div>
    </section>
    <section class="section-block">
      ${chartCard('Monthly Volume: 2025 vs 2026', 'chart-yoy-vol')}
    </section>
    <section class="section-block">
      ${chartCard('Avg Net Margin / Unit: 2025 vs 2026', 'chart-yoy-margin')}
    </section>
    <section class="section-block">
      ${chartCard('Model Mix: 2025 vs 2026 (Top 8)', 'chart-yoy-models')}
    </section>`;

  createChart('chart-yoy-vol', {
    type: 'bar',
    data: {
      labels: allMonths,
      datasets: [
        { label: '2025', data: allMonths.map(m => vol25[m]?.length || 0), backgroundColor: COLORS.blue },
        { label: '2026', data: allMonths.map(m => vol26[m]?.length || 0), backgroundColor: COLORS.green },
      ],
    },
    options: { ...chartDefaults('units'), plugins: { ...chartDefaults('units').plugins, legend: { position: 'top' } } },
  });

  createChart('chart-yoy-margin', {
    type: 'line',
    data: {
      labels: allMonths,
      datasets: [
        { label: '2025 Avg NM', data: allMonths.map(m => avg((marg25[m] || []).map(r => r.netMargin))), borderColor: COLORS.blue, backgroundColor: COLORS.blue + '22', fill: false, tension: 0.3, pointRadius: 4 },
        { label: '2026 Avg NM', data: allMonths.map(m => avg((marg26[m] || []).map(r => r.netMargin))), borderColor: COLORS.green, backgroundColor: COLORS.green + '22', fill: false, tension: 0.3, pointRadius: 4 },
      ],
    },
    options: { ...chartDefaults('₹'), plugins: { ...chartDefaults('₹').plugins, legend: { position: 'top' } } },
  });

  createChart('chart-yoy-models', {
    type: 'bar',
    data: {
      labels: topModels,
      datasets: [
        { label: '2025', data: topModels.map(m => allModels25[m]?.length || 0), backgroundColor: COLORS.blue },
        { label: '2026', data: topModels.map(m => allModels26[m]?.length || 0), backgroundColor: COLORS.green },
      ],
    },
    options: { ...chartDefaults('units'), plugins: { ...chartDefaults('units').plugins, legend: { position: 'top' } } },
  });
}

/* ─── Chart Defaults ────────────────────────────────────────── */
function chartDefaults(unit = '') {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed;
            const chartType = ctx.chart?.config?.type;
            const isPieLike = chartType === 'pie' || chartType === 'doughnut';

            if (isPieLike) {
              const data = ctx.dataset?.data || [];
              const total = data.reduce((sum, item) => {
                const num = Number(item);
                return Number.isFinite(num) ? sum + num : sum;
              }, 0);
              const percent = total > 0 ? ((Number(v) / total) * 100) : 0;
              const baseLabel = unit === '₹'
                ? `₹${Math.round(v).toLocaleString('en-IN')}`
                : `${Math.round(v).toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;
              return ` ${baseLabel} (${percent.toFixed(1)}%)`;
            }

            if (unit === '₹') return ` ₹${Math.round(v).toLocaleString('en-IN')}`;
            return ` ${Math.round(v).toLocaleString('en-IN')} ${unit}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
      y: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
    },
  };
}

/* ─── Tab & Navigation Wiring ───────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Load user info
  try {
    const me = await fetch('/api/me').then(r => r.json());
    document.getElementById('user-greeting').textContent = `Hi, ${me.displayName}`;
  } catch {
    document.getElementById('user-greeting').textContent = '';
  }

  // Year tabs
  document.getElementById('year-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.year-tab');
    if (!btn) return;
    document.querySelectorAll('.year-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeYear = parseInt(btn.dataset.year, 10);
    renderSection(activeSection, activeYear);
  });

  // Section tabs
  document.getElementById('section-nav').addEventListener('click', e => {
    const btn = e.target.closest('.section-tab');
    if (!btn) return;
    document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    activeSection = btn.dataset.section;
    renderSection(activeSection, activeYear);
  });

  // Initial render
  renderSection(activeSection, activeYear);
});
