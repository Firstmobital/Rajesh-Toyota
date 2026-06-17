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
  getModelName,
  getNumberByAliases,
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

function normalizeText(value, fallback = 'Unknown') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  const lowered = text.toLowerCase();
  if (['na', 'n/a', '#n/a', 'unknown', '0', 'cancelled', 'idt'].includes(lowered)) return fallback;
  return text;
}

function normalizeFuel(value) {
  const raw = normalizeText(value);
  const lowered = raw.toLowerCase();
  if (lowered.includes('hybrid')) return 'Hybrid';
  if (lowered.includes('diesel')) return 'Diesel';
  if (lowered.includes('petrol')) return 'Petrol';
  if (lowered.includes('cng')) return 'CNG';
  if (lowered.includes('ev') || lowered.includes('electric')) return 'Electric';
  return raw;
}

function normalizeTransmission(value) {
  const raw = normalizeText(value);
  const lowered = raw.toLowerCase();
  if (['unknown', 'na', 'n/a', '#n/a'].includes(lowered)) return 'Unknown';
  if (lowered.includes('policy') || lowered.includes('insur') || lowered.includes('comprehensive')) return 'Unknown';
  if (lowered === 'at' || lowered.includes('auto')) return 'AT';
  if (lowered === 'mt' || lowered.includes('manual')) return 'MT';
  if (lowered.includes('cvt')) return 'CVT';
  if (lowered.includes('amt')) return 'AMT';
  if (/\b6at\b|\b5at\b|\bat\b/.test(lowered)) return 'AT';
  if (/\b6mt\b|\b5mt\b|\bmt\b/.test(lowered)) return 'MT';
  return raw;
}

function normalizeBuyerType(value) {
  const raw = normalizeText(value);
  const lowered = raw.toLowerCase();
  if (lowered.includes('pvt') || lowered.includes('private')) return 'Pvt';
  if (lowered.includes('trc')) return 'TRC';
  if (lowered.includes('taxi') || lowered.includes('commercial')) return 'Taxi/Commercial';
  if (lowered === 'bh' || lowered.includes('bharat')) return 'BH';
  return raw;
}

function deriveBuyerType(row) {
  const mapped = normalizeBuyerType(
    getTextByAliases(row, [
      'Buyer Type',
      'Registration Type',
      'Regn Type',
      'Pvt/Trc/Taxi',
      'Customer Type',
      'Reg Type',
      'Registration Category',
      'RTO Type',
    ])
  );
  if (mapped !== 'Unknown') return mapped;

  const trcOrFitness = getNumberByAliases(row, ['TRC /Fitness', 'TRC/Fitness']);
  if (trcOrFitness != null && trcOrFitness > 0) return 'TRC/Fitness';
  return 'Unspecified';
}

function calcMarginPct(rows) {
  const margin = sum(rows.map(row => row._netMargin));
  const retail = sum(rows.map(row => row._retailAmount));
  return retail ? (margin / retail) * 100 : null;
}

function renderProductMix(data, main) {
  const sourceRows = data.joinedAll || data.joined || [];
  const rows = sourceRows
    .map(row => {
      const model = normalizeText(getModelName(row));
      const fuel = normalizeFuel(getTextByAliases(row, ['FUEL', 'Fuel', 'Fuel Type']));
      const transmissionHint = getTextByAliases(row, ['Variant', 'Grade', 'Description']);
      const transmission = normalizeTransmission(
        getTextByAliases(row, ['Transmission', 'Transmission Type', 'AT/MT', 'Gear', 'Gearbox', 'Trans'])
          || transmissionHint
      );
      const buyerType = deriveBuyerType(row);

      const retailAmount = getRetailAmount(row);
      const netMargin = typeof row.netMargin === 'number' ? row.netMargin : null;
      const vas = typeof row.totalVAS === 'number' ? row.totalVAS : null;

      return {
        ...row,
        _model: model,
        _fuel: fuel,
        _transmission: transmission,
        _buyerType: buyerType,
        _segment: `${model} | ${fuel} | ${transmission} | ${buyerType}`,
        _retailAmount: retailAmount,
        _netMargin: netMargin,
        _vas: vas,
        _location: normalizeText(getLocationName(row)),
      };
    })
    .filter(row => row._retailAmount != null && row._netMargin != null);

  if (!rows.length) {
    main.innerHTML = '<div class="empty-state"><p>No profitability data available for this year.</p></div>';
    return;
  }

  const totalUnits = rows.length;
  const avgRetail = avg(rows.map(row => row._retailAmount));
  const avgMargin = avg(rows.map(row => row._netMargin));
  const avgVas = avg(rows.map(row => row._vas));
  const marginPct = calcMarginPct(rows);
  const mappedBuyerTypeUnits = rows.filter(row => row._buyerType !== 'Unspecified').length;

  const bySegment = groupBy(rows, row => row._segment);
  const segmentRows = sortedEntries(bySegment, segmentRows => segmentRows.length)
    .slice(0, 30)
    .map(([segment, segmentItems]) => {
      const leakMarginPct = calcMarginPct(segmentItems);
      return [
        segment,
        fmtNum(segmentItems.length),
        fmt(avg(segmentItems.map(item => item._retailAmount))),
        fmt(avg(segmentItems.map(item => item._netMargin))),
        fmtPct(leakMarginPct),
        fmt(avg(segmentItems.map(item => item._vas))),
      ];
    });

  const byModel = groupBy(rows, row => row._model);
  const modelRows = sortedEntries(byModel, modelItems => modelItems.length)
    .slice(0, 12)
    .map(([model, modelItems]) => ({
      model,
      units: modelItems.length,
      marginPct: calcMarginPct(modelItems),
      avgMargin: avg(modelItems.map(item => item._netMargin)),
      avgVas: avg(modelItems.map(item => item._vas)),
    }));

  const byBuyerType = groupBy(rows, row => row._buyerType);
  const buyerRows = sortedEntries(byBuyerType, buyerItems => buyerItems.length)
    .map(([buyerType, buyerItems]) => [
      buyerType,
      fmtNum(buyerItems.length),
      fmtPct(totalUnits ? (buyerItems.length / totalUnits) * 100 : null),
      fmt(avg(buyerItems.map(item => item._netMargin))),
      fmtPct(calcMarginPct(buyerItems)),
      fmt(avg(buyerItems.map(item => item._vas))),
    ]);

  const byLocation = groupBy(rows, row => row._location);
  const locationRows = sortedEntries(byLocation, locItems => locItems.length)
    .slice(0, 10)
    .map(([location, locItems]) => [
      location,
      fmtNum(locItems.length),
      fmt(avg(locItems.map(item => item._netMargin))),
      fmtPct(calcMarginPct(locItems)),
      fmt(avg(locItems.map(item => item._vas))),
    ]);

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Units (Profitability-Matched)', fmtNum(totalUnits))}
        ${card('Avg Retail / Unit', fmt(avgRetail))}
        ${card('Avg Net Margin / Unit', fmt(avgMargin), `${fmtPct(marginPct)} margin rate`) }
        ${card('Avg VAS / Unit', fmt(avgVas), 'Insurance + EW + TGA + Coating')}
        ${card('Buyer-Type Mapped Units', fmtNum(mappedBuyerTypeUnits), fmtPct(totalUnits ? (mappedBuyerTypeUnits / totalUnits) * 100 : null))}
      </div>
    </section>

    <section class="section-block charts-row">
      ${chartCard('Model Mix: Units and Margin %', 'chart-model-mix', 320)}
      ${chartCard('Model Mix: Avg Margin vs Avg VAS', 'chart-model-profit-scatter', 320)}
    </section>

    <section class="section-block">
      <h2 class="section-heading">Product-Mix Profitability Matrix (Top 30 Segments)</h2>
      ${tableHtml(
        ['Segment (Model | Fuel | Transmission | Buyer Type)', 'Units', 'Avg Retail', 'Avg Net Margin', 'Margin %', 'Avg VAS'],
        segmentRows,
        'No segment data'
      )}
    </section>

    <section class="section-block charts-row">
      <div>
        <h2 class="section-heading">Buyer-Type Profitability</h2>
        ${tableHtml(
          ['Buyer Type', 'Units', '% Share', 'Avg Net Margin', 'Margin %', 'Avg VAS'],
          buyerRows,
          'No buyer-type data'
        )}
      </div>
      <div>
        <h2 class="section-heading">Location Profitability Snapshot</h2>
        ${tableHtml(
          ['Location', 'Units', 'Avg Net Margin', 'Margin %', 'Avg VAS'],
          locationRows,
          'No location data'
        )}
      </div>
    </section>`;

  createChart('chart-model-mix', {
    data: {
      labels: modelRows.map(row => row.model),
      datasets: [
        {
          type: 'bar',
          label: 'Units',
          data: modelRows.map(row => row.units),
          backgroundColor: COLORS.blue,
          yAxisID: 'y',
          borderRadius: 4,
        },
        {
          type: 'line',
          label: 'Margin %',
          data: modelRows.map(row => row.marginPct),
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
        x: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
        y: {
          position: 'left',
          grid: { color: '#F1F5F9' },
          ticks: { font: { size: 11 }, callback: value => Number(value).toLocaleString('en-IN') },
          title: { display: true, text: 'Units' },
        },
        y2: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 11 }, callback: value => `${Number(value).toFixed(1)}%` },
          title: { display: true, text: 'Margin %' },
        },
      },
    },
  });

  createChart('chart-model-profit-scatter', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Model Position',
        data: modelRows.map(row => ({ x: row.avgVas || 0, y: row.avgMargin || 0, model: row.model, units: row.units })),
        backgroundColor: COLORS.coral,
        pointRadius: modelRows.map(row => Math.max(4, Math.min(14, row.units / 20))),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => {
              const raw = ctx.raw || {};
              const model = raw.model || 'Model';
              return ` ${model}: Margin ${fmt(raw.y)} | VAS ${fmt(raw.x)} | Units ${fmtNum(raw.units)}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Avg VAS / Unit' },
          ticks: { callback: value => `₹${Math.round(value).toLocaleString('en-IN')}` },
        },
        y: {
          title: { display: true, text: 'Avg Net Margin / Unit' },
          ticks: { callback: value => `₹${Math.round(value).toLocaleString('en-IN')}` },
        },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderProductMix(data, main);
  },
});
