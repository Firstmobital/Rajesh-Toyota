import {
  COLORS,
  MONTHS,
  card,
  chartCard,
  chartDefaults,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getLocationName,
  getModelName,
  getRetailAmount,
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

function normalizeName(value, fallback = 'Unknown') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  const lowered = text.toLowerCase();
  if (['na', 'n/a', '#n/a', 'unknown', '0', 'cancelled', 'idt'].includes(lowered)) return fallback;
  return text;
}

function getSalesOfficer(row) {
  return normalizeName(
    getTextByAliases(row, ['S.O.', 'SO', 'Sales Officer'])
      || row['S.O.']
      || row.SO
      || row['Sales Officer'],
    'Unknown'
  );
}

function calcMarginPct(rows) {
  const margin = sum(rows.map(row => row._netMargin));
  const retail = sum(rows.map(row => row._retailAmount));
  return retail ? (margin / retail) * 100 : null;
}

function getLeakageBand(row) {
  const discountPct = row._discountPct || 0;
  const marginPct = row._marginPct || 0;

  if (discountPct >= 3.5 && marginPct < 2) return 'Severe';
  if (discountPct >= 2.5 && marginPct < 3) return 'High';
  if (discountPct >= 1.5 && marginPct < 4) return 'Watch';
  return 'Healthy';
}

function renderDiscountLeakage(data, main) {
  const rows = (data.joined || [])
    .map(row => {
      const retailAmount = getRetailAmount(row);
      const discount = typeof row.discountOnInvoice === 'number' ? row.discountOnInvoice : null;
      const netMargin = typeof row.netMargin === 'number' ? row.netMargin : null;
      const discountPct = retailAmount && discount != null ? (discount / retailAmount) * 100 : null;
      const marginPct = retailAmount && netMargin != null ? (netMargin / retailAmount) * 100 : null;

      return {
        ...row,
        _retailAmount: retailAmount,
        _discount: discount,
        _netMargin: netMargin,
        _discountPct: discountPct,
        _marginPct: marginPct,
        _model: normalizeName(getModelName(row)),
        _location: normalizeName(getLocationName(row)),
        _so: getSalesOfficer(row),
        _month: MONTHS.includes(row._monthName) ? row._monthName : null,
      };
    })
    .filter(row => row._retailAmount != null && row._discount != null && row._netMargin != null);

  if (!rows.length) {
    main.innerHTML = '<div class="empty-state"><p>No discount and margin matched data available for this year.</p></div>';
    return;
  }

  rows.forEach(row => {
    row._band = getLeakageBand(row);
  });

  const totalUnits = rows.length;
  const avgDiscount = avg(rows.map(row => row._discount));
  const avgDiscountPct = avg(rows.map(row => row._discountPct));
  const avgMargin = avg(rows.map(row => row._netMargin));
  const marginPct = calcMarginPct(rows);

  const severeRows = rows.filter(row => row._band === 'Severe');
  const highRows = rows.filter(row => row._band === 'High');
  const watchRows = rows.filter(row => row._band === 'Watch');

  const leakUnits = severeRows.length + highRows.length;
  const leakRate = totalUnits ? (leakUnits / totalUnits) * 100 : null;

  const byBand = groupBy(rows, row => row._band);
  const bandOrder = ['Healthy', 'Watch', 'High', 'Severe'];

  const monthRows = rows.filter(row => row._month);
  const byMonth = groupBy(monthRows, row => row._month);
  const monthLabels = MONTHS.filter(month => byMonth[month]);
  const monthDiscountPct = monthLabels.map(month => avg((byMonth[month] || []).map(row => row._discountPct)));
  const monthMarginPct = monthLabels.map(month => avg((byMonth[month] || []).map(row => row._marginPct)));

  const modelHotspots = sortedEntries(groupBy(rows, row => row._model), modelRows => {
    const severe = modelRows.filter(row => row._band === 'Severe').length;
    const high = modelRows.filter(row => row._band === 'High').length;
    return severe * 2 + high;
  })
    .filter(([model]) => model !== 'Unknown')
    .slice(0, 12)
    .map(([model, modelRows]) => {
      const severe = modelRows.filter(row => row._band === 'Severe').length;
      const high = modelRows.filter(row => row._band === 'High').length;
      const leak = severe + high;
      return [
        model,
        fmtNum(modelRows.length),
        fmtNum(leak),
        fmtPct(modelRows.length ? (leak / modelRows.length) * 100 : null),
        fmt(avg(modelRows.map(row => row._discount))),
        fmtPct(avg(modelRows.map(row => row._marginPct))),
      ];
    });

  const locationHotspots = sortedEntries(groupBy(rows, row => row._location), locRows => {
    const severe = locRows.filter(row => row._band === 'Severe').length;
    const high = locRows.filter(row => row._band === 'High').length;
    return severe * 2 + high;
  })
    .filter(([location]) => location !== 'Unknown')
    .slice(0, 10)
    .map(([location, locRows]) => {
      const severe = locRows.filter(row => row._band === 'Severe').length;
      const high = locRows.filter(row => row._band === 'High').length;
      const leak = severe + high;
      return [
        location,
        fmtNum(locRows.length),
        fmtNum(leak),
        fmtPct(locRows.length ? (leak / locRows.length) * 100 : null),
        fmt(avg(locRows.map(row => row._discount))),
      ];
    });

  const soHotspots = sortedEntries(groupBy(rows, row => row._so), soRows => {
    const severe = soRows.filter(row => row._band === 'Severe').length;
    const high = soRows.filter(row => row._band === 'High').length;
    return severe * 2 + high;
  })
    .filter(([name]) => name !== 'Unknown')
    .slice(0, 12)
    .map(([name, soRows]) => {
      const severe = soRows.filter(row => row._band === 'Severe').length;
      const high = soRows.filter(row => row._band === 'High').length;
      const leak = severe + high;
      return [
        name,
        fmtNum(soRows.length),
        fmtNum(leak),
        fmtPct(soRows.length ? (leak / soRows.length) * 100 : null),
        fmt(avg(soRows.map(row => row._discount))),
      ];
    });

  const redFlagRows = rows
    .filter(row => row._band === 'Severe' || row._band === 'High')
    .slice()
    .sort((a, b) => {
      const aScore = (a._discountPct || 0) - (a._marginPct || 0);
      const bScore = (b._discountPct || 0) - (b._marginPct || 0);
      return bScore - aScore;
    })
    .slice(0, 20)
    .map((row, index) => [
      String(index + 1),
      row._month || '—',
      row._model,
      row._location,
      row._so,
      fmt(row._retailAmount),
      fmt(row._discount),
      fmtPct(row._discountPct),
      fmt(row._netMargin),
      fmtPct(row._marginPct),
      row._band,
    ]);

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Matched Units', fmtNum(totalUnits), 'Units with retail + discount + net margin')}
        ${card('Avg Discount / Unit', fmt(avgDiscount), fmtPct(avgDiscountPct))}
        ${card('Avg Net Margin / Unit', fmt(avgMargin), `${fmtPct(marginPct)} margin rate`) }
        ${card('Leakage Units (Severe+High)', fmtNum(leakUnits), fmtPct(leakRate))}
        ${card('Severe Leakage Units', fmtNum(severeRows.length), 'High discount + weak margin')}
        ${card('High Leakage Units', fmtNum(highRows.length), 'Elevated risk deals')}
        ${card('Watchlist Units', fmtNum(watchRows.length), 'Moderate risk')}
      </div>
    </section>

    <section class="section-block charts-row">
      ${chartCard('Leakage Band Mix', 'chart-band-mix', 280)}
      ${chartCard('Monthly Discount% vs Margin%', 'chart-monthly-spread', 280)}
    </section>

    <section class="section-block charts-row">
      <div>
        <h2 class="section-heading">Model Leakage Hotspots</h2>
        ${tableHtml(
          ['Model', 'Units', 'Leak Units', 'Leak %', 'Avg Discount', 'Avg Margin %'],
          modelHotspots,
          'No model hotspots'
        )}
      </div>
      <div>
        <h2 class="section-heading">Location Leakage Hotspots</h2>
        ${tableHtml(
          ['Location', 'Units', 'Leak Units', 'Leak %', 'Avg Discount'],
          locationHotspots,
          'No location hotspots'
        )}
      </div>
    </section>

    <section class="section-block">
      <h2 class="section-heading">Sales Officer Leakage Hotspots</h2>
      ${tableHtml(
        ['Sales Officer', 'Units', 'Leak Units', 'Leak %', 'Avg Discount'],
        soHotspots,
        'No sales officer hotspots'
      )}
    </section>

    <section class="section-block">
      <h2 class="section-heading">Red Flag Deals (Top 20)</h2>
      ${tableHtml(
        ['#', 'Month', 'Model', 'Location', 'SO', 'Retail', 'Discount', 'Discount %', 'Net Margin', 'Margin %', 'Band'],
        redFlagRows,
        'No red-flag deals'
      )}
    </section>`;

  createChart('chart-band-mix', {
    type: 'doughnut',
    data: {
      labels: bandOrder,
      datasets: [{
        data: bandOrder.map(band => (byBand[band] || []).length),
        backgroundColor: [COLORS.green, COLORS.amber, COLORS.coral, '#B91C1C'],
      }],
    },
    options: {
      ...chartDefaults('units'),
      plugins: {
        ...chartDefaults('units').plugins,
        legend: { position: 'bottom' },
      },
    },
  });

  createChart('chart-monthly-spread', {
    data: {
      labels: monthLabels,
      datasets: [
        {
          type: 'line',
          label: 'Avg Discount %',
          data: monthDiscountPct,
          borderColor: COLORS.coral,
          backgroundColor: COLORS.coral,
          tension: 0.3,
          pointRadius: 3,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Avg Margin %',
          data: monthMarginPct,
          borderColor: COLORS.blue,
          backgroundColor: COLORS.blue,
          tension: 0.3,
          pointRadius: 3,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: '#F1F5F9' },
          ticks: { font: { size: 11 }, callback: value => `${Number(value).toFixed(1)}%` },
          title: { display: true, text: 'Percent' },
        },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderDiscountLeakage(data, main);
  },
});
