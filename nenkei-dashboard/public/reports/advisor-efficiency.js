import {
  COLORS,
  card,
  chartCard,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getTextByAliases,
  initReportPage,
  loadData,
  tableHtml,
} from './shared.js';

function avg(values) {
  const nums = values.filter(v => v != null && !Number.isNaN(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function normalizeName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Unknown';
  const lowered = text.toLowerCase();
  if (['na', 'n/a', '#n/a', 'unknown', '0', 'cancelled', 'idt'].includes(lowered)) return 'Unknown';
  return text;
}

function minMaxNormalize(value, min, max) {
  if (value == null || min == null || max == null || max === min) return 50;
  return ((value - min) / (max - min)) * 100;
}

function scoreToBand(score) {
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 45) return 'C';
  return 'D';
}

function renderAdvisorEfficiency(data, main) {
  const sourceRows = data.joinedAll || data.joined || [];
  const rows = sourceRows.map(row => ({
    ...row,
    _so: normalizeName(getTextByAliases(row, ['S.O.', 'SO', 'Sales Officer']) || row['S.O.']),
    _margin: typeof row.netMargin === 'number' ? row.netMargin : null,
    _vas: typeof row.totalVAS === 'number' ? row.totalVAS : null,
    _discount: typeof row.discountOnInvoice === 'number' ? row.discountOnInvoice : null,
    _finance: typeof row.financeAmount === 'number' ? row.financeAmount : null,
  })).filter(row => row._so !== 'Unknown' && row._margin != null);

  if (!rows.length) {
    main.innerHTML = '<div class="empty-state"><p>No advisor data available.</p></div>';
    return;
  }

  const advisorMap = {};
  rows.forEach(row => {
    if (!advisorMap[row._so]) advisorMap[row._so] = [];
    advisorMap[row._so].push(row);
  });

  const metrics = Object.entries(advisorMap).map(([name, advisorRows]) => {
    const units = advisorRows.length;
    const avgMargin = avg(advisorRows.map(r => r._margin));
    const avgVas = avg(advisorRows.map(r => r._vas));
    const financePen = units ? (advisorRows.filter(r => r._finance != null && r._finance > 0).length / units) * 100 : 0;
    const avgDiscount = avg(advisorRows.map(r => r._discount));
    return { name, units, avgMargin, avgVas, financePen, avgDiscount };
  }).filter(item => item.units >= 3);

  if (!metrics.length) {
    main.innerHTML = '<div class="empty-state"><p>No advisors with enough data (min 3 units).</p></div>';
    return;
  }

  const unitsVals = metrics.map(m => m.units);
  const marginVals = metrics.map(m => m.avgMargin || 0);
  const vasVals = metrics.map(m => m.avgVas || 0);
  const finVals = metrics.map(m => m.financePen || 0);
  const discountVals = metrics.map(m => m.avgDiscount || 0);

  const minUnits = Math.min(...unitsVals);
  const maxUnits = Math.max(...unitsVals);
  const minMargin = Math.min(...marginVals);
  const maxMargin = Math.max(...marginVals);
  const minVas = Math.min(...vasVals);
  const maxVas = Math.max(...vasVals);
  const minFin = Math.min(...finVals);
  const maxFin = Math.max(...finVals);
  const minDisc = Math.min(...discountVals);
  const maxDisc = Math.max(...discountVals);

  const ranked = metrics.map(item => {
    const volumeScore = minMaxNormalize(item.units, minUnits, maxUnits);
    const marginScore = minMaxNormalize(item.avgMargin || 0, minMargin, maxMargin);
    const vasScore = minMaxNormalize(item.avgVas || 0, minVas, maxVas);
    const financeScore = minMaxNormalize(item.financePen || 0, minFin, maxFin);
    const discountScore = 100 - minMaxNormalize(item.avgDiscount || 0, minDisc, maxDisc);

    const composite = (0.3 * volumeScore) + (0.25 * marginScore) + (0.2 * vasScore) + (0.15 * financeScore) + (0.1 * discountScore);
    return {
      ...item,
      volumeScore,
      marginScore,
      vasScore,
      financeScore,
      discountScore,
      composite,
      band: scoreToBand(composite),
    };
  }).sort((a, b) => b.composite - a.composite);

  const top = ranked[0];

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Eligible Advisors', fmtNum(ranked.length), 'Min 3 units')}
        ${card('Top Advisor', top.name, `${fmtNum(top.units)} units | Score ${fmtNum(top.composite)}`)}
        ${card('Top Avg Margin', fmt(top.avgMargin), top.name)}
        ${card('Top Avg VAS', fmt(top.avgVas), top.name)}
      </div>
    </section>

    <section class="section-block">
      ${chartCard('Advisor Composite Efficiency Score', 'chart-advisor-score', 340)}
    </section>

    <section class="section-block">
      <h2 class="section-heading">Advisor Efficiency Scorecard (Ops + Profit)</h2>
      ${tableHtml(
        ['Rank', 'Advisor', 'Units', 'Avg Margin', 'Avg VAS', 'Finance %', 'Avg Discount', 'Composite', 'Band'],
        ranked.map((r, i) => [
          `#${i + 1}`,
          r.name,
          fmtNum(r.units),
          fmt(r.avgMargin),
          fmt(r.avgVas),
          fmtPct(r.financePen),
          fmt(r.avgDiscount),
          fmtNum(r.composite),
          r.band,
        ])
      )}
    </section>`;

  createChart('chart-advisor-score', {
    type: 'bar',
    data: {
      labels: ranked.map(r => r.name),
      datasets: [{
        label: 'Composite Score',
        data: ranked.map(r => r.composite),
        backgroundColor: ranked.map(r => (r.band === 'A' ? COLORS.green : r.band === 'B' ? COLORS.blue : r.band === 'C' ? COLORS.amber : COLORS.coral)),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: v => `${Number(v).toFixed(0)}` } },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderAdvisorEfficiency(data, main);
  },
});
