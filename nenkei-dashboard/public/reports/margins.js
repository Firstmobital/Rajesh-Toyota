import {
  COLORS,
  MONTHS,
  avg,
  chartCard,
  chartDefaults,
  createChart,
  fmt,
  fmtPct,
  groupBy,
  initReportPage,
  loadData,
  parseNum,
  sortedEntries,
  sum,
  tableHtml,
} from './shared.js';

function renderMargins(data, main) {
  const { joined } = data;
  const matched = joined.filter(row => row.netMargin != null);

  const byModel = groupBy(matched, row => row.MODEL || 'Unknown');
  const modelRows = sortedEntries(byModel, rows => avg(rows.map(row => row.netMargin))).map(([model, rows]) => {
    const avgRetail = avg(rows.map(row => parseNum(row['RETAIL INVOICE AMOUNT'])));
    const avgPurchase = avg(rows.map(row => parseNum(row['PURCHASE AMOUNT'])));
    const avgNM = avg(rows.map(row => row.netMargin));
    const sumNM = sum(rows.map(row => row.netMargin));
    const sumRet = sum(rows.map(row => parseNum(row['RETAIL INVOICE AMOUNT'])));
    const pct = sumRet ? (sumNM / sumRet) * 100 : null;
    return [model, rows.length, fmt(avgRetail), fmt(avgPurchase), fmt(avgNM), fmtPct(pct)];
  });

  const byLoc = groupBy(matched, row => row.Location || row.LOCATION || 'Unknown');
  const locRows = sortedEntries(byLoc, rows => avg(rows.map(row => row.netMargin))).map(([loc, rows]) => {
    const avgNM = avg(rows.map(row => row.netMargin));
    const sumNM = sum(rows.map(row => row.netMargin));
    const sumRet = sum(rows.map(row => parseNum(row['RETAIL INVOICE AMOUNT'])));
    const pct = sumRet ? (sumNM / sumRet) * 100 : null;
    return [loc, rows.length, fmt(avgNM), fmtPct(pct)];
  });

  const byMonth = groupBy(matched, row => row._monthName || 'Unknown');
  const monthLabels = MONTHS.filter(month => byMonth[month]);

  main.innerHTML = `
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
        data: monthLabels.map(month => avg(byMonth[month].map(row => row.netMargin))),
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

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderMargins(data, main);
  },
});
