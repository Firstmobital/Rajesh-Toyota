import {
  COLORS,
  MONTHS,
  avg,
  card,
  chartCard,
  chartDefaults,
  createChart,
  fmt,
  groupBy,
  initReportPage,
  loadData,
  showLoading,
} from './shared.js';

async function renderYoY(main) {
  let data2025;
  let data2026;

  try {
    showLoading(true);
    const [a, b] = await Promise.allSettled([loadData(2025), loadData(2026)]);
    data2025 = a.status === 'fulfilled' ? a.value : null;
    data2026 = b.status === 'fulfilled' ? b.value : null;
  } finally {
    showLoading(false);
  }

  if (!data2025 && !data2026) {
    main.innerHTML = '<div class="empty-state"><p>No data available for Year-over-Year comparison.</p></div>';
    return;
  }

  if (!data2025 || !data2026) {
    main.innerHTML = '<div class="empty-state"><p>Year-over-Year comparison requires data for both 2025 and 2026.<br>Only one year has data so far.</p></div>';
    return;
  }

  const matched25 = data2025.joined.filter(row => row.netMargin != null);
  const matched26 = data2026.joined.filter(row => row.netMargin != null);

  const vol25 = groupBy(data2025.joined, row => row._monthName || 'Unknown');
  const vol26 = groupBy(data2026.joined, row => row._monthName || 'Unknown');
  const allMonths = MONTHS.filter(month => vol25[month] || vol26[month]);

  const marg25 = groupBy(matched25, row => row._monthName || 'Unknown');
  const marg26 = groupBy(matched26, row => row._monthName || 'Unknown');

  const allModels25 = groupBy(data2025.joined, row => row.MODEL || 'Unknown');
  const allModels26 = groupBy(data2026.joined, row => row.MODEL || 'Unknown');
  const allModelNames = [...new Set([...Object.keys(allModels25), ...Object.keys(allModels26)])];
  const topModels = allModelNames
    .map(model => ({ model, total: (allModels25[model]?.length || 0) + (allModels26[model]?.length || 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map(item => item.model);

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid kpi-grid-4">
        ${card('2025 Total Units', data2025.joined.length)}
        ${card('2026 Total Units', data2026.joined.length)}
        ${card('2025 Avg Net Margin', fmt(avg(matched25.map(row => row.netMargin))))}
        ${card('2026 Avg Net Margin', fmt(avg(matched26.map(row => row.netMargin))))}
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
        { label: '2025', data: allMonths.map(month => vol25[month]?.length || 0), backgroundColor: COLORS.blue },
        { label: '2026', data: allMonths.map(month => vol26[month]?.length || 0), backgroundColor: COLORS.green },
      ],
    },
    options: { ...chartDefaults('units'), plugins: { ...chartDefaults('units').plugins, legend: { position: 'top' } } },
  });

  createChart('chart-yoy-margin', {
    type: 'line',
    data: {
      labels: allMonths,
      datasets: [
        {
          label: '2025 Avg NM',
          data: allMonths.map(month => avg((marg25[month] || []).map(row => row.netMargin))),
          borderColor: COLORS.blue,
          backgroundColor: COLORS.blue + '22',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
        },
        {
          label: '2026 Avg NM',
          data: allMonths.map(month => avg((marg26[month] || []).map(row => row.netMargin))),
          borderColor: COLORS.green,
          backgroundColor: COLORS.green + '22',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
        },
      ],
    },
    options: { ...chartDefaults('₹'), plugins: { ...chartDefaults('₹').plugins, legend: { position: 'top' } } },
  });

  createChart('chart-yoy-models', {
    type: 'bar',
    data: {
      labels: topModels,
      datasets: [
        { label: '2025', data: topModels.map(model => allModels25[model]?.length || 0), backgroundColor: COLORS.blue },
        { label: '2026', data: topModels.map(model => allModels26[model]?.length || 0), backgroundColor: COLORS.green },
      ],
    },
    options: { ...chartDefaults('units'), plugins: { ...chartDefaults('units').plugins, legend: { position: 'top' } } },
  });
}

initReportPage({
  usesYear: false,
  render: async ({ main }) => {
    await renderYoY(main);
  },
});
