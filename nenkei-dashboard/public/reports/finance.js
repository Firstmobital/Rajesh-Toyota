import {
  avg,
  card,
  COLORS,
  chartCard,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getTextByAliases,
  groupBy,
  initReportPage,
  loadData,
  normalizeFinanceSource,
  normalizePartyName,
  sortedEntries,
  sum,
  tableHtml,
} from './shared.js';

function fmtLakhs(value) {
  if (value == null) return '—';
  return `₹${(value / 100000).toFixed(1)} L`;
}

function renderFinance(data, main) {
  const { joined } = data;
  const totalUnits = joined.length;

  if (!totalUnits) {
    main.innerHTML = '<div class="empty-state"><p>No finance data available for this year.</p></div>';
    return;
  }

  const normalized = joined.map(row => {
    const rawSource = getTextByAliases(row, ['FINANCE SOURCE', 'Fin-Source'])
      || getTextByAliases(row._vcmRow, ['Fin-Source', 'FINANCE SOURCE']);
    const rawFinancier = getTextByAliases(row._vcmRow, ['FINANCIER'])
      || getTextByAliases(row, ['FINANCIER']);
    return {
      ...row,
      _financeSource: normalizeFinanceSource(rawSource),
      _financier: normalizePartyName(rawFinancier),
      _financeAmount: typeof row.financeAmount === 'number' ? row.financeAmount : null,
      _payoutFinance: typeof row.payoutFinance === 'number' ? row.payoutFinance : null,
    };
  });

  const bySource = groupBy(normalized, row => row._financeSource);
  const inHouseUnits = (bySource['In-House'] || []).length;
  const selfUnits = (bySource['Self-Arranged'] || []).length;
  const cashUnits = (bySource.Cash || []).length;

  const totalFinanceAmount = sum(normalized.map(row => row._financeAmount));
  const totalPayoutFinance = sum(normalized.map(row => row._payoutFinance));
  const avgDoPerUnit = avg(normalized.map(row => row._financeAmount));
  const avgPayoutPerUnit = avg(normalized.map(row => row._payoutFinance));
  const doCoverageUnits = normalized.filter(row => row._financeAmount != null).length;
  const doCoveragePct = totalUnits ? (doCoverageUnits / totalUnits) * 100 : 0;
  const payoutCoverageUnits = normalized.filter(row => row._payoutFinance != null).length;
  const payoutCoveragePct = totalUnits ? (payoutCoverageUnits / totalUnits) * 100 : 0;
  const payoutToDoPct = totalFinanceAmount ? (totalPayoutFinance / totalFinanceAmount) * 100 : null;

  const financierRows = normalized.filter(row => row._financier !== 'Unknown');
  const byFinancier = groupBy(financierRows, row => row._financier);
  const topFinanciers = sortedEntries(byFinancier, rows => rows.length)
    .slice(0, 10)
    .map(([name, rows]) => ({
      name,
      units: rows.length,
      sharePct: totalUnits ? (rows.length / totalUnits) * 100 : 0,
      avgDo: avg(rows.map(row => row._financeAmount)),
      avgPayout: avg(rows.map(row => row._payoutFinance)),
      totalDo: sum(rows.map(row => row._financeAmount)),
      totalPayout: sum(rows.map(row => row._payoutFinance)),
    }));

  const sourceRows = sortedEntries(bySource, rows => rows.length)
    .map(([source, rows]) => ({
      source,
      units: rows.length,
      sharePct: totalUnits ? (rows.length / totalUnits) * 100 : 0,
      totalDo: sum(rows.map(row => row._financeAmount)),
      avgDo: avg(rows.map(row => row._financeAmount)),
      avgPayout: avg(rows.map(row => row._payoutFinance)),
    }));

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Avg Finance DO / Unit', fmtLakhs(avgDoPerUnit), `${fmtPct(doCoveragePct)} DO coverage`) }
        ${card('Avg Payout Finance / Unit', fmt(avgPayoutPerUnit), `${fmtPct(payoutCoveragePct)} payout coverage`) }
        ${card('Total Finance Amount', fmt(totalFinanceAmount), `${fmtNum(doCoverageUnits)} units with DO`) }
        ${card('Total Payout Finance', fmt(totalPayoutFinance), `${fmtPct(payoutToDoPct)} of total DO`) }
        ${card('In-House Finance', fmtNum(inHouseUnits), `${fmtPct((inHouseUnits / totalUnits) * 100)} penetration`) }
        ${card('Self-Arranged', fmtNum(selfUnits), `${fmtPct((selfUnits / totalUnits) * 100)} penetration`) }
        ${card('Cash Deals', fmtNum(cashUnits), `${fmtPct((cashUnits / totalUnits) * 100)} of total`) }
        ${card('Unique Financiers', fmtNum(Object.keys(byFinancier).length), 'Based on VCM financier values') }
      </div>
    </section>
    <section class="section-block charts-row">
      ${chartCard('Top Financiers: Units and Avg DO / Unit', 'chart-financiers', 280)}
      ${chartCard('Fin-Source Mix: Units and Total Finance Amount', 'chart-fin-source', 280)}
    </section>
    <section class="section-block charts-row">
      <div>
        <h2 class="section-heading">Financier Scorecard</h2>
        ${tableHtml(
          ['Financier', 'Units', '% Share', 'Avg DO / Unit', 'Avg Payout / Unit', 'Payout % of DO'],
          topFinanciers.map(row => [
            row.name,
            fmtNum(row.units),
            fmtPct(row.sharePct),
            fmt(row.avgDo),
            fmt(row.avgPayout),
            fmtPct(row.totalDo ? (row.totalPayout / row.totalDo) * 100 : null),
          ])
        )}
      </div>
      <div>
        <h2 class="section-heading">Fin-Source Scorecard</h2>
        ${tableHtml(
          ['Fin-Source', 'Units', '% Share', 'Total Finance Amount', 'Avg DO / Unit', 'Avg Payout / Unit'],
          sourceRows.map(row => [
            row.source,
            fmtNum(row.units),
            fmtPct(row.sharePct),
            fmt(row.totalDo),
            fmt(row.avgDo),
            fmt(row.avgPayout),
          ])
        )}
      </div>
    </section>`;

  createChart('chart-financiers', {
    data: {
      labels: topFinanciers.map(row => row.name),
      datasets: [
        {
          type: 'bar',
          label: 'Units',
          data: topFinanciers.map(row => row.units),
          backgroundColor: COLORS.blue,
          yAxisID: 'y',
        },
        {
          type: 'line',
          label: 'Avg DO / Unit',
          data: topFinanciers.map(row => row.avgDo),
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
          title: { display: true, text: 'Avg DO / Unit' },
        },
      },
    },
  });

  createChart('chart-fin-source', {
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
          label: 'Total Finance Amount',
          data: sourceRows.map(row => row.totalDo),
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
          ticks: { font: { size: 11 }, callback: value => `₹${Math.round(value / 100000)}L` },
          title: { display: true, text: 'Total Finance Amount' },
        },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderFinance(data, main);
  },
});
