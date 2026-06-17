import {
  COLORS,
  card,
  chartCard,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getNumberByAliases,
  getTextByAliases,
  initReportPage,
  loadData,
  tableHtml,
} from './shared.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial < 1) return null;
    const dt = new Date((serial - 25569) * MS_PER_DAY);
    if (Number.isNaN(dt.getTime()) || dt.getUTCFullYear() < 2005) return null;
    return dt;
  }

  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime()) && dt.getUTCFullYear() >= 2005) return dt;
  return null;
}

function avg(values) {
  const nums = values.filter(v => v != null && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(values, mean) {
  const nums = values.filter(v => v != null && !Number.isNaN(v));
  if (nums.length < 2 || mean == null) return 0;
  const variance = nums.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function getBusinessDate(row) {
  return parseDate(getTextByAliases(row, [
    'Delivery Date',
    'Retail Date',
    'Retail Invoice Date',
    'Invoice Date',
    'Sale Register Update Date',
  ]));
}

function renderDailyPulse(data, main) {
  const sourceRows = data.joinedAll || data.joined || [];
  const rows = sourceRows.map(row => {
    const date = getBusinessDate(row);
    return {
      ...row,
      _date: date,
      _dateKey: date ? date.toISOString().slice(0, 10) : null,
      _retail: getNumberByAliases(row, ['RETAIL INVOICE AMOUNT', 'RETAIL INV AMOUNT']),
      _margin: typeof row.netMargin === 'number' ? row.netMargin : null,
      _discount: typeof row.discountOnInvoice === 'number' ? row.discountOnInvoice : null,
      _finance: typeof row.financeAmount === 'number' ? row.financeAmount : null,
    };
  }).filter(row => row._dateKey && row._retail != null && row._margin != null);

  if (!rows.length) {
    main.innerHTML = '<div class="empty-state"><p>No daily retail data available.</p></div>';
    return;
  }

  const dailyMap = {};
  rows.forEach(row => {
    if (!dailyMap[row._dateKey]) dailyMap[row._dateKey] = [];
    dailyMap[row._dateKey].push(row);
  });

  const daily = Object.entries(dailyMap)
    .map(([date, dayRows]) => {
      const units = dayRows.length;
      const retail = dayRows.reduce((s, r) => s + (r._retail || 0), 0);
      const margin = dayRows.reduce((s, r) => s + (r._margin || 0), 0);
      const avgDiscount = avg(dayRows.map(r => r._discount));
      const financePen = units ? (dayRows.filter(r => r._finance != null && r._finance > 0).length / units) * 100 : 0;
      return { date, units, retail, margin, avgDiscount, financePen };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const unitsMean = avg(daily.map(d => d.units));
  const unitsStd = stdDev(daily.map(d => d.units), unitsMean);
  const discMean = avg(daily.map(d => d.avgDiscount));
  const discStd = stdDev(daily.map(d => d.avgDiscount), discMean);
  const marginMean = avg(daily.map(d => d.margin));
  const marginStd = stdDev(daily.map(d => d.margin), marginMean);

  const anomalies = daily.filter(d => (
    d.units > (unitsMean || 0) + (1.5 * unitsStd)
    || d.avgDiscount > (discMean || 0) + (1.5 * discStd)
    || d.margin < (marginMean || 0) - (1.5 * marginStd)
  ));

  const totalUnits = daily.reduce((s, d) => s + d.units, 0);
  const totalRetail = daily.reduce((s, d) => s + d.retail, 0);
  const totalMargin = daily.reduce((s, d) => s + d.margin, 0);

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Days Tracked', fmtNum(daily.length))}
        ${card('Total Units', fmtNum(totalUnits))}
        ${card('Total Retail', fmt(totalRetail))}
        ${card('Total Net Margin', fmt(totalMargin), fmtPct(totalRetail ? (totalMargin / totalRetail) * 100 : null))}
        ${card('Avg Discount / Day', fmt(avg(daily.map(d => d.avgDiscount))))}
        ${card('Avg Finance Penetration', fmtPct(avg(daily.map(d => d.financePen))))}
      </div>
    </section>

    <section class="section-block charts-row">
      ${chartCard('Daily Units and Margin', 'chart-daily-units-margin', 320)}
      ${chartCard('Daily Discount and Finance %', 'chart-daily-discount-fin', 320)}
    </section>

    <section class="section-block">
      <h2 class="section-heading">Anomaly Alerts</h2>
      ${tableHtml(
        ['Date', 'Units', 'Retail', 'Net Margin', 'Avg Discount', 'Finance %'],
        anomalies.map(d => [
          d.date,
          fmtNum(d.units),
          fmt(d.retail),
          fmt(d.margin),
          fmt(d.avgDiscount),
          fmtPct(d.financePen),
        ]),
        'No major anomalies detected'
      )}
    </section>`;

  createChart('chart-daily-units-margin', {
    data: {
      labels: daily.map(d => d.date.slice(5)),
      datasets: [
        {
          type: 'bar',
          label: 'Units',
          data: daily.map(d => d.units),
          backgroundColor: COLORS.blue,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Net Margin',
          data: daily.map(d => d.margin),
          borderColor: COLORS.green,
          backgroundColor: COLORS.green,
          pointRadius: 2,
          tension: 0.2,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { position: 'left', ticks: { callback: v => Number(v).toLocaleString('en-IN') } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => `₹${Math.round(v).toLocaleString('en-IN')}` } },
      },
    },
  });

  createChart('chart-daily-discount-fin', {
    data: {
      labels: daily.map(d => d.date.slice(5)),
      datasets: [
        {
          type: 'line',
          label: 'Avg Discount',
          data: daily.map(d => d.avgDiscount),
          borderColor: COLORS.coral,
          backgroundColor: COLORS.coral,
          tension: 0.2,
          pointRadius: 2,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Finance %',
          data: daily.map(d => d.financePen),
          borderColor: COLORS.amber,
          backgroundColor: COLORS.amber,
          tension: 0.2,
          pointRadius: 2,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { position: 'left', ticks: { callback: v => `₹${Math.round(v).toLocaleString('en-IN')}` } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => `${Number(v).toFixed(0)}%` } },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderDailyPulse(data, main);
  },
});
