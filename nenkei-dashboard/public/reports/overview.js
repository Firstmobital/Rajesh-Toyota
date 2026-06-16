import {
  COLORS,
  MONTHS,
  PALETTE,
  avg,
  card,
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
} from './shared.js';

function renderOverview(data, main) {
  const { joined } = data;
  const matched = joined.filter(row => row.netMargin != null);

  const totalUnits = joined.length;
  const avgRetail = avg(joined.map(row => parseNum(row['RETAIL INVOICE AMOUNT'])));
  const avgPurchase = avg(joined.map(row => parseNum(row['PURCHASE AMOUNT'])));
  const avgNetMargin = avg(matched.map(row => row.netMargin));
  const sumNetMargin = sum(matched.map(row => row.netMargin));
  const sumRetail = sum(matched.map(row => parseNum(row['RETAIL INVOICE AMOUNT'])));
  const marginPct = sumRetail ? (sumNetMargin / sumRetail) * 100 : null;
  const avgDiscount = avg(joined.map(row => parseNum(row['TOTAL DISCOUNT'])));

  main.innerHTML = `
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

  const byMonth = groupBy(matched, row => row._monthName);
  const monthLabels = MONTHS.filter(month => byMonth[month]);
  const monthAvgs = monthLabels.map(month => avg(byMonth[month].map(row => row.netMargin)));

  createChart('chart-monthly-margin', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{ label: 'Avg Net Margin (₹)', data: monthAvgs, backgroundColor: COLORS.blue, borderRadius: 4 }],
    },
    options: chartDefaults('₹'),
  });

  const byModel = groupBy(matched, row => row.MODEL || 'Unknown');
  const modelEntries = sortedEntries(byModel, rows => avg(rows.map(row => row.netMargin))).slice(0, 12);

  createChart('chart-model-margin', {
    type: 'bar',
    data: {
      labels: modelEntries.map(([key]) => key),
      datasets: [{ label: 'Avg Net Margin (₹)', data: modelEntries.map(([, rows]) => avg(rows.map(row => row.netMargin))), backgroundColor: PALETTE, borderRadius: 4 }],
    },
    options: { ...chartDefaults('₹'), indexAxis: 'y' },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderOverview(data, main);
  },
});
