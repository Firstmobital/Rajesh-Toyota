import {
  COLORS,
  card,
  chartCard,
  chartDefaults,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getLocationName,
  getNumberByAliases,
  getTextByAliases,
  groupBy,
  initReportPage,
  loadData,
  sortedEntries,
  tableHtml,
} from './shared.js';

function avg(values) {
  const nums = values.filter(v => v != null && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function sum(values) {
  return values.filter(v => v != null && !Number.isNaN(v)).reduce((a, b) => a + b, 0);
}

function normalizeText(value, fallback = 'Unknown') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  const lowered = text.toLowerCase();
  if (['na', 'n/a', '#n/a', 'unknown', '0', 'cancelled', 'idt'].includes(lowered)) return fallback;
  return text;
}

function extractCity(address) {
  const clean = normalizeText(address, 'Unknown');
  if (clean === 'Unknown') return clean;

  const knownCities = ['Jaipur', 'Dausa', 'Kota', 'Alwar', 'Banswara', 'Nagaur', 'Bharatpur', 'Tonk', 'Sawai Madhopur'];
  const found = knownCities.find(city => clean.toLowerCase().includes(city.toLowerCase()));
  if (found) return found;

  const parts = clean.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return normalizeText(parts[parts.length - 2], 'Unknown');
  return 'Unknown';
}

function marginPct(rows) {
  const margin = sum(rows.map(r => r._margin));
  const retail = sum(rows.map(r => r._retail));
  return retail ? (margin / retail) * 100 : null;
}

function renderGeoYield(data, main) {
  const rows = (data.joined || []).map(row => {
    const address = getTextByAliases(row, ['Current Address', 'Address']) || '';
    return {
      ...row,
      _location: normalizeText(getLocationName(row)),
      _city: extractCity(address),
      _retail: getNumberByAliases(row, ['RETAIL INVOICE AMOUNT', 'RETAIL INV AMOUNT']),
      _margin: typeof row.netMargin === 'number' ? row.netMargin : null,
      _vas: typeof row.totalVAS === 'number' ? row.totalVAS : null,
    };
  }).filter(row => row._retail != null && row._margin != null);

  if (!rows.length) {
    main.innerHTML = '<div class="empty-state"><p>No geographic yield data available.</p></div>';
    return;
  }

  const byCity = groupBy(rows, row => row._city);
  const cityScore = sortedEntries(byCity, cityRows => cityRows.length)
    .slice(0, 15)
    .map(([city, cityRows]) => [
      city,
      fmtNum(cityRows.length),
      fmt(avg(cityRows.map(r => r._retail))),
      fmt(avg(cityRows.map(r => r._margin))),
      fmtPct(marginPct(cityRows)),
      fmt(avg(cityRows.map(r => r._vas))),
    ]);

  const byLocation = groupBy(rows, row => row._location);
  const locationScore = sortedEntries(byLocation, locRows => locRows.length)
    .slice(0, 10)
    .map(([location, locRows]) => [
      location,
      fmtNum(locRows.length),
      fmt(avg(locRows.map(r => r._retail))),
      fmt(avg(locRows.map(r => r._margin))),
      fmtPct(marginPct(locRows)),
    ]);

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Geo-Matched Units', fmtNum(rows.length))}
        ${card('Avg Retail / Unit', fmt(avg(rows.map(r => r._retail))))}
        ${card('Avg Net Margin / Unit', fmt(avg(rows.map(r => r._margin))), fmtPct(marginPct(rows)))}
        ${card('Avg VAS / Unit', fmt(avg(rows.map(r => r._vas))))}
      </div>
    </section>

    <section class="section-block charts-row">
      ${chartCard('Top Cities: Units and Margin %', 'chart-city-yield', 320)}
      ${chartCard('Branch Yield Snapshot', 'chart-location-yield', 320)}
    </section>

    <section class="section-block charts-row">
      <div>
        <h2 class="section-heading">City Demand and Yield</h2>
        ${tableHtml(['City', 'Units', 'Avg Retail', 'Avg Margin', 'Margin %', 'Avg VAS'], cityScore)}
      </div>
      <div>
        <h2 class="section-heading">Location Yield</h2>
        ${tableHtml(['Location', 'Units', 'Avg Retail', 'Avg Margin', 'Margin %'], locationScore)}
      </div>
    </section>`;

  const cityChartRows = sortedEntries(byCity, cityRows => cityRows.length).slice(0, 10);
  createChart('chart-city-yield', {
    data: {
      labels: cityChartRows.map(([city]) => city),
      datasets: [
        {
          type: 'bar',
          label: 'Units',
          data: cityChartRows.map(([, cityRows]) => cityRows.length),
          backgroundColor: COLORS.blue,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Margin %',
          data: cityChartRows.map(([, cityRows]) => marginPct(cityRows)),
          borderColor: COLORS.green,
          backgroundColor: COLORS.green,
          pointRadius: 3,
          tension: 0.3,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { position: 'left', ticks: { callback: v => Number(v).toLocaleString('en-IN') } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => `${Number(v).toFixed(1)}%` } },
      },
    },
  });

  createChart('chart-location-yield', {
    type: 'bar',
    data: {
      labels: locationScore.map(r => r[0]),
      datasets: [{
        label: 'Avg Margin / Unit',
        data: locationScore.map(r => Number(String(r[3]).replace(/[^0-9.-]/g, '')) || 0),
        backgroundColor: COLORS.coral,
      }],
    },
    options: {
      ...chartDefaults('₹'),
      indexAxis: 'y',
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderGeoYield(data, main);
  },
});
