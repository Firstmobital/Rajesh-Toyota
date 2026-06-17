import {
  COLORS,
  card,
  chartCard,
  chartDefaults,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getModelName,
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

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isMeaningful(value) {
  const raw = normalizeText(value).toLowerCase();
  return !!raw && !['na', 'n/a', '#n/a', 'unknown', 'cancelled', 'idt', '0'].includes(raw);
}

function isExplicitYes(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return false;
  return ['y', 'yes', 'true', '1', 'exchange', 'done'].includes(raw);
}

function hasExchange(row) {
  const oldVehicleReg = getTextByAliases(row, [
    'Old Vehicle Reg No',
    'Old Vehicle Registration No',
    'Exchange Reg No',
    'Old Vehicle Number',
  ]);
  const exchangeFlag = getTextByAliases(row, [
    'Exchange Done',
    'Exchange Flag',
    'Is Exchange',
    'Exchange Yes No',
    'Exchange Y/N',
    'Old Vehicle Taken',
    'Exchange TKM Claim',
  ]);
  const oldVehicleAmt = getNumberByAliases(row, [
    'Exchange',
    'UTRUST (Old Vehicle)',
    'UTRUST Old Vehicle',
    'Old Vehicle Amount',
    'UTRUST Amount',
    'Exchange Amount',
    'Exchange Value',
    'Old Vehicle Valuation',
  ]);

  return (oldVehicleAmt != null && oldVehicleAmt > 0)
    || isExplicitYes(exchangeFlag)
    || isMeaningful(oldVehicleReg);
}

function renderExchangeImpact(data, main) {
  const sourceRows = data.joinedAll || data.joined || [];
  const rows = sourceRows.map(row => ({
    ...row,
    _model: getModelName(row),
    _retail: getNumberByAliases(row, ['RETAIL INVOICE AMOUNT', 'RETAIL INV AMOUNT', 'RETAIL INVOICE AMT']),
    _margin: typeof row.netMargin === 'number' ? row.netMargin : null,
    _discount: typeof row.discountOnInvoice === 'number' ? row.discountOnInvoice : null,
    _vas: typeof row.totalVAS === 'number' ? row.totalVAS : null,
    _exchange: hasExchange(row),
  })).filter(row => row._retail != null && row._margin != null);

  if (!rows.length) {
    main.innerHTML = '<div class="empty-state"><p>No exchange-impact data available.</p></div>';
    return;
  }

  const exchangeRows = rows.filter(row => row._exchange);
  const nonExchangeRows = rows.filter(row => !row._exchange);

  const exchangePen = rows.length ? (exchangeRows.length / rows.length) * 100 : null;
  const marginDelta = (avg(exchangeRows.map(r => r._margin)) || 0) - (avg(nonExchangeRows.map(r => r._margin)) || 0);
  const discountDelta = (avg(exchangeRows.map(r => r._discount)) || 0) - (avg(nonExchangeRows.map(r => r._discount)) || 0);

  const byModel = groupBy(rows, row => row._model);
  const modelImpact = sortedEntries(byModel, modelRows => modelRows.length)
    .slice(0, 15)
    .map(([model, modelRows]) => {
      const ex = modelRows.filter(r => r._exchange);
      const non = modelRows.filter(r => !r._exchange);
      const exMargin = avg(ex.map(r => r._margin));
      const nonMargin = avg(non.map(r => r._margin));
      return [
        model,
        fmtNum(modelRows.length),
        fmtNum(ex.length),
        fmtPct(modelRows.length ? (ex.length / modelRows.length) * 100 : null),
        fmt(exMargin),
        fmt(nonMargin),
        fmt((exMargin || 0) - (nonMargin || 0)),
      ];
    });

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Total Units', fmtNum(rows.length))}
        ${card('Exchange Units', fmtNum(exchangeRows.length), fmtPct(exchangePen))}
        ${card('Avg Margin (Exchange)', fmt(avg(exchangeRows.map(r => r._margin))))}
        ${card('Avg Margin (Non-Exchange)', fmt(avg(nonExchangeRows.map(r => r._margin))))}
        ${card('Margin Delta (Ex - Non)', fmt(marginDelta))}
        ${card('Discount Delta (Ex - Non)', fmt(discountDelta))}
      </div>
    </section>

    <section class="section-block charts-row">
      ${chartCard('Exchange vs Non-Exchange: Avg Margin / Discount / VAS', 'chart-ex-vs-non', 300)}
      ${chartCard('Exchange Penetration by Top Models', 'chart-ex-model', 300)}
    </section>

    <section class="section-block">
      <h2 class="section-heading">Model-level Exchange Impact</h2>
      ${tableHtml(
        ['Model', 'Units', 'Exchange Units', 'Exchange %', 'Ex Avg Margin', 'Non Avg Margin', 'Delta'],
        modelImpact,
        'No model data'
      )}
    </section>`;

  createChart('chart-ex-vs-non', {
    type: 'bar',
    data: {
      labels: ['Avg Margin', 'Avg Discount', 'Avg VAS'],
      datasets: [
        {
          label: 'Exchange',
          data: [
            avg(exchangeRows.map(r => r._margin)) || 0,
            avg(exchangeRows.map(r => r._discount)) || 0,
            avg(exchangeRows.map(r => r._vas)) || 0,
          ],
          backgroundColor: COLORS.coral,
        },
        {
          label: 'Non-Exchange',
          data: [
            avg(nonExchangeRows.map(r => r._margin)) || 0,
            avg(nonExchangeRows.map(r => r._discount)) || 0,
            avg(nonExchangeRows.map(r => r._vas)) || 0,
          ],
          backgroundColor: COLORS.blue,
        },
      ],
    },
    options: chartDefaults('₹'),
  });

  const modelPen = sortedEntries(byModel, modelRows => modelRows.length)
    .slice(0, 12)
    .map(([model, modelRows]) => ({
      model,
      pen: modelRows.length ? (modelRows.filter(r => r._exchange).length / modelRows.length) * 100 : 0,
    }));

  createChart('chart-ex-model', {
    type: 'bar',
    data: {
      labels: modelPen.map(r => r.model),
      datasets: [{
        label: 'Exchange %',
        data: modelPen.map(r => r.pen),
        backgroundColor: COLORS.green,
      }],
    },
    options: {
      ...chartDefaults('%'),
      indexAxis: 'y',
      scales: {
        x: { ticks: { callback: value => `${Number(value).toFixed(0)}%` } },
        y: { grid: { color: '#F1F5F9' } },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderExchangeImpact(data, main);
  },
});
