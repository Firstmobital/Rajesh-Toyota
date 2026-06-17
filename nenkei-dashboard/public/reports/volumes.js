import {
  MONTHS,
  PALETTE,
  card,
  chartCard,
  chartDefaults,
  createChart,
  fmtNum,
  groupBy,
  initReportPage,
  loadData,
  normalizeModelName,
  normalizeMonthName,
  sortedEntries,
} from './shared.js';

function renderVolumes(data, main) {
  const { joined } = data;
  const totalUnits = joined.length;

  const normalizedRows = joined.map(row => ({
    ...row,
    _monthNameNorm: normalizeMonthName(row._monthName),
    _modelNorm: normalizeModelName(row.MODEL),
  }));

  const validMonthRows = normalizedRows.filter(row => row._monthNameNorm);
  const monthLabelSet = new Set(validMonthRows.map(row => row._monthNameNorm));
  const monthLabels = MONTHS.filter(month => monthLabelSet.has(month));

  const byModel = groupBy(normalizedRows, row => row._modelNorm);
  const top5Models = sortedEntries(byModel, rows => rows.length).slice(0, 5).map(([key]) => key);
  const highestSellingModel = sortedEntries(byModel, rows => rows.length)[0] || null;
  const monthsWithData = monthLabels.length;
  const avgMonthlySales = monthsWithData ? totalUnits / monthsWithData : null;

  const byMonth = groupBy(validMonthRows, row => row._monthNameNorm);

  const stackedDatasets = [...top5Models, 'Other'].map((model, i) => ({
    label: model,
    data: monthLabels.map(month => {
      const rows = byMonth[month] || [];
      return model === 'Other'
        ? rows.filter(row => !top5Models.includes(row._modelNorm)).length
        : rows.filter(row => row._modelNorm === model).length;
    }),
    backgroundColor: PALETTE[i] || '#ccc',
  }));

  const trendDatasets = top5Models.map((model, i) => ({
    label: model,
    data: monthLabels.map(month => {
      const rows = byMonth[month] || [];
      return rows.filter(row => row._modelNorm === model).length;
    }),
    borderColor: PALETTE[i] || '#ccc',
    backgroundColor: (PALETTE[i] || '#ccc') + '33',
    tension: 0.3,
    pointRadius: 3,
    fill: false,
  }));

  const byFuel = groupBy(normalizedRows, row => row.FUEL || 'Unknown');
  const byColour = groupBy(normalizedRows, row => row.Colour || row.COLOUR || 'Unknown');
  const topColours = sortedEntries(byColour, rows => rows.length).slice(0, 10);

  main.innerHTML = `
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
    options: {
      ...chartDefaults('units'),
      plugins: { ...chartDefaults('units').plugins, legend: { position: 'bottom' } },
      scales: { x: { stacked: true }, y: { stacked: true } },
    },
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
      datasets: [{ data: Object.values(byFuel).map(rows => rows.length), backgroundColor: PALETTE }],
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
      labels: topColours.map(([key]) => key),
      datasets: [{ label: 'Units', data: topColours.map(([, rows]) => rows.length), backgroundColor: PALETTE }],
    },
    options: { ...chartDefaults('units'), indexAxis: 'y' },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderVolumes(data, main);
  },
});
