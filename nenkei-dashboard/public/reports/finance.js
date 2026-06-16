import {
  COLORS,
  PALETTE,
  chartCard,
  chartDefaults,
  createChart,
  fmtPct,
  groupBy,
  initReportPage,
  loadData,
  sortedEntries,
  tableHtml,
} from './shared.js';

function renderFinance(data, main) {
  const { joined } = data;

  const byFinSrc = groupBy(joined, row => row['FINANCE SOURCE'] || 'Unknown');
  const byFinancier = groupBy(joined, row => row.FINANCIER || 'Unknown');
  const byInsCo = groupBy(joined, row => row['INS CO.'] || row['INS CO'] || 'Unknown');
  const byCod = groupBy(joined, row => {
    const value = (row['COD Yes Or No'] || '').toLowerCase();
    return value === 'yes' ? 'COD' : value === 'no' ? 'Non-COD' : 'Unknown';
  });

  const topFinanciers = sortedEntries(byFinancier, rows => rows.length).slice(0, 10);
  const topInsCo = sortedEntries(byInsCo, rows => rows.length).slice(0, 10);

  main.innerHTML = `
    <section class="section-block charts-row">
      ${chartCard('Finance Source Breakdown', 'chart-fin-src', 280)}
      ${chartCard('COD vs Non-COD', 'chart-cod', 280)}
    </section>
    <section class="section-block">
      <h2 class="section-heading">Financier Leaderboard</h2>
      ${tableHtml(['Financier', 'Units', '% Share'], topFinanciers.map(([key, rows]) => [key, rows.length, fmtPct(rows.length / joined.length * 100)]))}
    </section>
    <section class="section-block">
      ${chartCard('Insurance Company Breakdown (Top 10)', 'chart-ins', 280)}
    </section>`;

  createChart('chart-fin-src', {
    type: 'doughnut',
    data: { labels: Object.keys(byFinSrc), datasets: [{ data: Object.values(byFinSrc).map(rows => rows.length), backgroundColor: PALETTE }] },
    options: { plugins: { legend: { position: 'bottom' } } },
  });

  createChart('chart-cod', {
    type: 'doughnut',
    data: { labels: Object.keys(byCod), datasets: [{ data: Object.values(byCod).map(rows => rows.length), backgroundColor: [COLORS.blue, COLORS.green, COLORS.gray] }] },
    options: { plugins: { legend: { position: 'bottom' } } },
  });

  createChart('chart-ins', {
    type: 'bar',
    data: {
      labels: topInsCo.map(([key]) => key),
      datasets: [{ label: 'Units', data: topInsCo.map(([, rows]) => rows.length), backgroundColor: PALETTE }],
    },
    options: { ...chartDefaults('units'), indexAxis: 'y' },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderFinance(data, main);
  },
});
