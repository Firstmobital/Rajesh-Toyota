import {
  avg,
  card,
  COLORS,
  chartCard,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getNumberByAliases,
  getTextByAliases,
  groupBy,
  initReportPage,
  loadData,
  normalizePartyName,
  sortedEntries,
  sum,
  tableHtml,
} from './shared.js';

function normalizeInsuranceCategory(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Unknown';

  const lowered = raw.toLowerCase();
  if (['na', 'n/a', '#n/a', 'unknown', '0', 'cancelled', 'idt'].includes(lowered)) return 'Unknown';

  const canonicalMap = {
    tp: 'TP',
    self: 'Self',
    rmi: 'RMI',
    demo: 'DEMO',
    '1+3 policy': '1+3 Policy',
    '1+1 policy': '1+1 Policy',
    '3+3 policy': '3+3 Policy',
  };
  if (canonicalMap[lowered]) return canonicalMap[lowered];

  return raw;
}

function renderInsurance(data, main) {
  const { joined } = data;
  const totalUnits = joined.length;

  if (!totalUnits) {
    main.innerHTML = '<div class="empty-state"><p>No insurance data available for this year.</p></div>';
    return;
  }

  const normalized = joined.map(row => {
    const insSource = getTextByAliases(row._vcmRow, ['INS SOURCE'])
      || getTextByAliases(row, ['INS SOURCE']);
    const insType = getTextByAliases(row._vcmRow, ['INS Type'])
      || getTextByAliases(row, ['INS Type']);
    const insurer = getTextByAliases(row._vcmRow, ['INSURANCE CO.', 'INSURANCE CO'])
      || getTextByAliases(row, ['INSURANCE CO.', 'INSURANCE CO', 'INS CO.', 'INS CO']);
    const payoutInsurance = getNumberByAliases(row._vcmRow, ['PAYOUT INSURANCE'])
      ?? getNumberByAliases(row, ['PAYOUT INSURANCE']);
    const insMargin = getNumberByAliases(row._vcmRow, ['Ins Margin'])
      ?? getNumberByAliases(row, ['Ins Margin']);

    return {
      ...row,
      _insSource: normalizeInsuranceCategory(insSource),
      _insType: normalizeInsuranceCategory(insType),
      _insurer: normalizePartyName(insurer),
      _payoutInsurance: payoutInsurance,
      _insMargin: insMargin,
    };
  });

  const insuredRows = normalized.filter(row => row._insurer !== 'Unknown');
  const insuredUnits = insuredRows.length;

  const payoutCoverageUnits = normalized.filter(row => row._payoutInsurance != null).length;
  const marginCoverageUnits = normalized.filter(row => row._insMargin != null).length;

  const totalPayoutInsurance = sum(normalized.map(row => row._payoutInsurance));
  const totalInsMargin = sum(normalized.map(row => row._insMargin));
  const avgPayoutPerUnit = avg(normalized.map(row => row._payoutInsurance));
  const avgInsMarginPerUnit = avg(normalized.map(row => row._insMargin));

  const payoutCoveragePct = totalUnits ? (payoutCoverageUnits / totalUnits) * 100 : 0;
  const marginCoveragePct = totalUnits ? (marginCoverageUnits / totalUnits) * 100 : 0;
  const marginToPayoutPct = totalPayoutInsurance ? (totalInsMargin / totalPayoutInsurance) * 100 : null;

  const byInsurer = groupBy(insuredRows, row => row._insurer);
  const topInsurers = sortedEntries(byInsurer, rows => rows.length)
    .slice(0, 10)
    .map(([name, rows]) => ({
      name,
      units: rows.length,
      sharePct: insuredUnits ? (rows.length / insuredUnits) * 100 : 0,
      totalPayout: sum(rows.map(row => row._payoutInsurance)),
      totalMargin: sum(rows.map(row => row._insMargin)),
      avgPayout: avg(rows.map(row => row._payoutInsurance)),
      avgMargin: avg(rows.map(row => row._insMargin)),
    }));

  const bySource = groupBy(normalized, row => row._insSource);
  const sourceRows = sortedEntries(bySource, rows => rows.length)
    .map(([source, rows]) => ({
      source,
      units: rows.length,
      sharePct: totalUnits ? (rows.length / totalUnits) * 100 : 0,
      avgPayout: avg(rows.map(row => row._payoutInsurance)),
      avgMargin: avg(rows.map(row => row._insMargin)),
      totalPayout: sum(rows.map(row => row._payoutInsurance)),
    }));

  const byType = groupBy(normalized, row => row._insType);
  const typeRows = sortedEntries(byType, rows => rows.length)
    .map(([type, rows]) => ({
      type,
      units: rows.length,
      sharePct: totalUnits ? (rows.length / totalUnits) * 100 : 0,
      avgPayout: avg(rows.map(row => row._payoutInsurance)),
      avgMargin: avg(rows.map(row => row._insMargin)),
    }));

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Insured Units', fmtNum(insuredUnits), `${fmtPct(totalUnits ? (insuredUnits / totalUnits) * 100 : 0)} of total`) }
        ${card('Total Payout Insurance', fmt(totalPayoutInsurance), `${fmtNum(payoutCoverageUnits)} payout-covered units`) }
        ${card('Avg Payout Insurance / Unit', fmt(avgPayoutPerUnit), `${fmtPct(payoutCoveragePct)} payout coverage`) }
        ${card('Total Ins Margin', fmt(totalInsMargin), `${fmtNum(marginCoverageUnits)} margin-covered units`) }
        ${card('Avg Ins Margin / Unit', fmt(avgInsMarginPerUnit), `${fmtPct(marginCoveragePct)} margin coverage`) }
        ${card('Ins Margin as % of Payout', fmtPct(marginToPayoutPct)) }
        ${card('Unique Insurers', fmtNum(Object.keys(byInsurer).length), 'Normalized insurer names') }
        ${card('Unique Ins Types', fmtNum(Object.keys(byType).length), 'From INS Type values') }
      </div>
    </section>

    <section class="section-block charts-row">
      ${chartCard('Top Insurance Companies: Units and Avg Payout / Unit', 'chart-insurer', 280)}
      ${chartCard('INS Source Mix: Units and Avg Ins Margin / Unit', 'chart-source', 280)}
    </section>

    <section class="section-block">
      ${chartCard('INS Type Mix by Units', 'chart-type', 240)}
    </section>

    <section class="section-block charts-row">
      <div>
        <h2 class="section-heading">Insurance Company Scorecard</h2>
        ${tableHtml(
          ['Insurance Co.', 'Units', '% Share', 'Avg Payout / Unit', 'Avg Ins Margin / Unit', 'Ins Margin % of Payout'],
          topInsurers.map(row => [
            row.name,
            fmtNum(row.units),
            fmtPct(row.sharePct),
            fmt(row.avgPayout),
            fmt(row.avgMargin),
            fmtPct(row.totalPayout ? (row.totalMargin / row.totalPayout) * 100 : null),
          ])
        )}
      </div>
      <div>
        <h2 class="section-heading">INS Source Scorecard</h2>
        ${tableHtml(
          ['INS Source', 'Units', '% Share', 'Total Payout', 'Avg Payout / Unit', 'Avg Ins Margin / Unit'],
          sourceRows.map(row => [
            row.source,
            fmtNum(row.units),
            fmtPct(row.sharePct),
            fmt(row.totalPayout),
            fmt(row.avgPayout),
            fmt(row.avgMargin),
          ])
        )}
      </div>
    </section>

    <section class="section-block">
      <h2 class="section-heading">INS Type Scorecard</h2>
      ${tableHtml(
        ['INS Type', 'Units', '% Share', 'Avg Payout / Unit', 'Avg Ins Margin / Unit'],
        typeRows.map(row => [
          row.type,
          fmtNum(row.units),
          fmtPct(row.sharePct),
          fmt(row.avgPayout),
          fmt(row.avgMargin),
        ])
      )}
    </section>`;

  createChart('chart-insurer', {
    data: {
      labels: topInsurers.map(row => row.name),
      datasets: [
        {
          type: 'bar',
          label: 'Units',
          data: topInsurers.map(row => row.units),
          backgroundColor: COLORS.blue,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Avg Payout / Unit',
          data: topInsurers.map(row => row.avgPayout),
          borderColor: COLORS.green,
          backgroundColor: COLORS.green,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { ticks: { font: { size: 11 } } },
        y: {
          position: 'left',
          ticks: { font: { size: 11 }, callback: value => Number(value).toLocaleString('en-IN') },
          title: { display: true, text: 'Units' },
        },
        y2: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 11 }, callback: value => `₹${Math.round(value / 1000)}k` },
          title: { display: true, text: 'Avg Payout / Unit' },
        },
      },
    },
  });

  createChart('chart-source', {
    data: {
      labels: sourceRows.map(row => row.source),
      datasets: [
        {
          type: 'bar',
          label: 'Units',
          data: sourceRows.map(row => row.units),
          backgroundColor: COLORS.coral,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Avg Ins Margin / Unit',
          data: sourceRows.map(row => row.avgMargin),
          borderColor: COLORS.amber,
          backgroundColor: COLORS.amber,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { ticks: { font: { size: 11 } } },
        y: {
          position: 'left',
          ticks: { font: { size: 11 }, callback: value => Number(value).toLocaleString('en-IN') },
          title: { display: true, text: 'Units' },
        },
        y2: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 11 }, callback: value => `₹${Math.round(value / 1000)}k` },
          title: { display: true, text: 'Avg Ins Margin / Unit' },
        },
      },
    },
  });

  createChart('chart-type', {
    type: 'bar',
    data: {
      labels: typeRows.map(row => row.type),
      datasets: [
        {
          label: 'Units',
          data: typeRows.map(row => row.units),
          backgroundColor: COLORS.teal,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { font: { size: 11 }, callback: value => Number(value).toLocaleString('en-IN') },
          title: { display: true, text: 'Units' },
        },
        y: { ticks: { font: { size: 11 } } },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderInsurance(data, main);
  },
});
