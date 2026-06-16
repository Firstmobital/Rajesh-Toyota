import {
  COLORS,
  MONTHS,
  avg,
  card,
  calcMarginPct,
  chartCard,
  chartDefaults,
  createChart,
  fmt,
  fmtPct,
  getLocationName,
  getModelName,
  getPurchaseAmount,
  getRetailAmount,
  groupBy,
  initReportPage,
  loadData,
  sortedEntries,
  tableHtml,
} from './shared.js';

function renderMargins(data, main) {
  const { joined } = data;
  const matched = joined.filter(row => row.netMargin != null);
  const discountRows = joined.filter(row => row.discountOnInvoice != null);

  const avgNetMargin = avg(matched.map(row => row.netMargin));
  const marginPct = calcMarginPct(matched);
  const avgDiscount = avg(discountRows.map(row => row.discountOnInvoice));

  const byModel = groupBy(matched, row => getModelName(row));
  const sortedModelEntries = sortedEntries(byModel, rows => avg(rows.map(row => row.netMargin)));

  const bestMarginModel = sortedModelEntries[0]
    ? {
      name: sortedModelEntries[0][0],
      avgMargin: avg(sortedModelEntries[0][1].map(row => row.netMargin)),
      marginPct: calcMarginPct(sortedModelEntries[0][1]),
    }
    : null;

  const bestMarginPctEntry = sortedEntries(byModel, rows => calcMarginPct(rows))[0];
  const bestMarginPctModel = bestMarginPctEntry
    ? {
      name: bestMarginPctEntry[0],
      pct: calcMarginPct(bestMarginPctEntry[1]),
      avgMargin: avg(bestMarginPctEntry[1].map(row => row.netMargin)),
    }
    : null;

  const modelRows = sortedModelEntries.map(([model, rows]) => {
    const avgRetail = avg(rows.map(row => getRetailAmount(row)));
    const avgPurchase = avg(rows.map(row => getPurchaseAmount(row)));
    const avgNM = avg(rows.map(row => row.netMargin));
    const avgDisc = avg(rows.map(row => row.discountOnInvoice));
    const pct = calcMarginPct(rows);
    return [model, rows.length, fmt(avgRetail), fmt(avgPurchase), fmt(avgNM), fmtPct(pct), fmt(avgDisc)];
  });

  const byLoc = groupBy(matched, row => getLocationName(row));
  const locRows = sortedEntries(byLoc, rows => avg(rows.map(row => row.netMargin))).map(([loc, rows]) => {
    const avgRetail = avg(rows.map(row => getRetailAmount(row)));
    const avgNM = avg(rows.map(row => row.netMargin));
    const avgDisc = avg(rows.map(row => row.discountOnInvoice));
    const pct = calcMarginPct(rows);
    return [loc, rows.length, fmt(avgRetail), fmt(avgNM), fmtPct(pct), fmt(avgDisc)];
  });

  const byMonth = groupBy(matched, row => row._monthName || 'Unknown');
  const monthLabels = MONTHS.filter(month => byMonth[month]);
  const monthAvgMargin = monthLabels.map(month => avg(byMonth[month].map(row => row.netMargin)));
  const monthMarginPct = monthLabels.map(month => calcMarginPct(byMonth[month]));

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Avg Gross Margin', fmt(avgNetMargin), 'Using VMC Net Margin')}
        ${card('Margin %', fmtPct(marginPct))}
        ${card('Avg Discount', fmt(avgDiscount), 'From VMC Discount On Invoice')}
        ${card('Best Margin Model', bestMarginModel ? bestMarginModel.name : '—', bestMarginModel ? `${fmt(bestMarginModel.avgMargin)} / unit · ${fmtPct(bestMarginModel.marginPct)}` : 'No data')}
        ${card('Best Margin % Model', bestMarginPctModel ? bestMarginPctModel.name : '—', bestMarginPctModel ? `${fmtPct(bestMarginPctModel.pct)} · ${fmt(bestMarginPctModel.avgMargin)}` : 'No data')}
        ${card('Matched Units', String(matched.length), `${joined.length} total units`)}
      </div>
    </section>
    <section class="section-block">
      <div class="chart-card">
        <div class="chart-title chart-title--compact">Monthly: Avg Net Margin / Unit and Margin %</div>
        <canvas id="chart-margin-trend" height="220"></canvas>
      </div>
    </section>
    <section class="section-block">
      <h2 class="section-heading">Model-wise Per-Unit Margin Scorecard</h2>
      ${tableHtml(['Model', 'Units', 'Avg Retail', 'Avg Purchase', 'Avg Net Margin', 'Margin %', 'Avg Discount'], modelRows)}
    </section>
    <section class="section-block">
      <h2 class="section-heading">Location-wise Margin</h2>
      ${tableHtml(['Location', 'Units', 'Avg Retail', 'Avg Net Margin', 'Margin %', 'Avg Discount'], locRows)}
    </section>`;

  createChart('chart-margin-trend', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: 'Avg Net Margin / Unit (₹)',
          data: monthAvgMargin,
          backgroundColor: COLORS.green,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Margin %',
          data: monthMarginPct,
          borderColor: COLORS.coral,
          backgroundColor: COLORS.coral,
          tension: 0.25,
          pointRadius: 3,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      ...chartDefaults('₹'),
      plugins: {
        ...chartDefaults('₹').plugins,
        legend: { display: true },
      },
      scales: {
        x: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
        y: {
          position: 'left',
          grid: { color: '#F1F5F9' },
          ticks: {
            font: { size: 11 },
            callback: value => `₹${Math.round(value).toLocaleString('en-IN')}`,
          },
        },
        y1: {
          position: 'right',
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            callback: value => `${Number(value).toFixed(1)}%`,
          },
        },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderMargins(data, main);
  },
});
