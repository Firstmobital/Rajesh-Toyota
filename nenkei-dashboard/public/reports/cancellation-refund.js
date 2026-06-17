import {
  COLORS,
  MONTHS,
  card,
  chartCard,
  chartDefaults,
  createChart,
  fmtNum,
  getModelName,
  getTextByAliases,
  groupBy,
  initReportPage,
  loadData,
  sortedEntries,
  tableHtml,
} from './shared.js';

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeToken(value) {
  return cleanText(value).toLowerCase();
}

const PLACEHOLDER_MODEL_VALUES = new Set(['', 'na', 'n/a', '#n/a', 'unknown', 'cancelled', 'idt', '0']);

function normalizeModelLabel(model) {
  const raw = cleanText(model);
  const lowered = normalizeToken(raw);
  if (PLACEHOLDER_MODEL_VALUES.has(lowered)) return 'Unknown';

  const upper = raw.toUpperCase();
  if (upper === 'LAND CRUISER') return 'Land Cruiser';

  return upper;
}

function getMonthName(row) {
  if (row._monthName && MONTHS.includes(row._monthName)) return row._monthName;
  const monthRaw = cleanText(getTextByAliases(row, ['MONTH']));
  if (!monthRaw) return null;
  return MONTHS.find(month => month.toLowerCase() === monthRaw.slice(0, 3).toLowerCase()) || null;
}

function hasTokenInAliases(row, aliases, token) {
  return aliases.some(alias => normalizeToken(getTextByAliases(row, [alias])).includes(token));
}

function isCancelledRow(row) {
  const directCancelled = hasTokenInAliases(
    row,
    [
      'CUSTOMER NAME',
      'CONTACT NO.',
      'Sale Register Update Date',
      'Delivery Date',
      'Vin Status',
      'Remark',
      'Remarks',
      'Status',
    ],
    'cancelled'
  );

  const financeSource = normalizeToken(getTextByAliases(row._vcmRow, ['Fin-Source', 'FINANCE SOURCE']) || '');
  const vcmCancelled = financeSource === 'cancelled';

  return directCancelled || vcmCancelled;
}

function renderCancellation(data, main) {
  const baseRows = data.joinedAll || data.salesRegister || data.joined || [];
  if (!baseRows.length) {
    main.innerHTML = '<div class="empty-state"><p>No sales data available for this year.</p></div>';
    return;
  }

  const cancelledRows = baseRows
    .filter(row => isCancelledRow(row))
    .map(row => ({
      ...row,
      _month: getMonthName(row) || 'Unknown',
      _model: normalizeModelLabel(getModelName(row)),
    }));

  const totalCancelled = cancelledRows.length;

  const byMonth = groupBy(cancelledRows, row => row._month);
  const monthLabels = MONTHS.filter(month => byMonth[month]);
  const monthCounts = monthLabels.map(month => (byMonth[month] || []).length);

  const byModel = groupBy(cancelledRows, row => row._model);
  const modelRows = sortedEntries(byModel, rows => rows.length)
    .filter(([model]) => model !== 'Unknown')
    .map(([model, rows]) => [
      model,
      fmtNum(rows.length),
    ]);

  const byMonthModel = groupBy(cancelledRows, row => `${row._month}|||${row._model}`);
  const monthOrder = month => {
    const idx = MONTHS.indexOf(month);
    return idx === -1 ? 99 : idx;
  };

  const monthModelRows = Object.entries(byMonthModel)
    .map(([key, rows]) => {
      const [month, model] = key.split('|||');
      return { month, model, count: rows.length };
    })
    .filter(item => item.model !== 'Unknown')
    .sort((a, b) => {
      const monthDiff = monthOrder(a.month) - monthOrder(b.month);
      if (monthDiff !== 0) return monthDiff;
      if (b.count !== a.count) return b.count - a.count;
      return a.model.localeCompare(b.model);
    })
    .map(item => [item.month, item.model, fmtNum(item.count)]);

  const monthModelCounts = {};
  monthModelRows.forEach(([month, model, countText]) => {
    if (!monthModelCounts[month]) monthModelCounts[month] = {};
    monthModelCounts[month][model] = Number(String(countText).replace(/,/g, ''));
  });

  const monthModelLabels = monthLabels;
  const monthModelDatasetLabels = sortedEntries(byModel, rows => rows.length)
    .filter(([model]) => model !== 'Unknown')
    .map(([model]) => model);

  const palette = [
    COLORS.blue,
    COLORS.coral,
    COLORS.green,
    COLORS.amber,
    COLORS.teal,
    '#64748B',
    '#A855F7',
    '#F97316',
    '#22C55E',
    '#0EA5E9',
    '#EF4444',
    '#14B8A6',
  ];

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid kpi-grid-3">
        ${card('Total Cancelled Units', fmtNum(totalCancelled))}
      </div>
    </section>

    <section class="section-block charts-row">
      ${chartCard('Month-wise Cancelled Units', 'chart-month-cancelled', 300)}
    </section>

    <section class="section-block">
      <h2 class="section-heading">Model-wise Cancelled Units</h2>
      ${tableHtml(['Model', 'Cancelled Units'], modelRows, 'No cancelled units')}
    </section>

    <section class="section-block">
      ${chartCard('Month + Model Cancelled Units', 'chart-month-model-cancelled', 360)}
    </section>`;

  createChart('chart-month-cancelled', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{
        label: 'Cancelled Units',
        data: monthCounts,
        backgroundColor: COLORS.coral,
        borderRadius: 4,
      }],
    },
    options: chartDefaults('units'),
  });

  createChart('chart-month-model-cancelled', {
    type: 'bar',
    data: {
      labels: monthModelLabels,
      datasets: monthModelDatasetLabels.map((model, index) => ({
        label: model,
        data: monthModelLabels.map(month => monthModelCounts[month]?.[model] || 0),
        backgroundColor: palette[index % palette.length],
      })),
    },
    options: {
      ...chartDefaults('units'),
      plugins: {
        ...chartDefaults('units').plugins,
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => {
              const model = ctx.dataset?.label || 'Unknown Model';
              const value = Number(ctx.parsed?.y ?? ctx.parsed ?? 0);
              return ` ${model}: ${Math.round(value).toLocaleString('en-IN')} units`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderCancellation(data, main);
  },
});
