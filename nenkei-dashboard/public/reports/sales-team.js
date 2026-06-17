import {
  avg,
  calcMarginPct,
  card,
  chartCard,
  chartDefaults,
  COLORS,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getRetailAmount,
  getTextByAliases,
  groupBy,
  initReportPage,
  isExcludedFinanceSourceValue,
  loadData,
  sortedEntries,
  tableHtml,
} from './shared.js';

function normalizeTeamMemberName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Unknown';
  const lowered = text.toLowerCase();
  if (['na', 'n/a', '#n/a', 'unknown', '0', 'cancelled', 'idt'].includes(lowered)) return 'Unknown';
  return text;
}

function isExcludedByFinanceSource(row) {
  const financeSource = getTextByAliases(row._vcmRow, ['Fin-Source', 'FINANCE SOURCE'])
    || '';
  return isExcludedFinanceSourceValue(financeSource);
}

function buildMemberStats(name, rows) {
  const units = rows.length;
  const matched = rows.filter(row => row.netMargin != null);
  const financed = rows.filter(row => typeof row.financeAmount === 'number' && row.financeAmount > 0).length;

  return {
    name,
    units,
    avgRetail: avg(rows.map(row => getRetailAmount(row))),
    avgNetMargin: avg(matched.map(row => row.netMargin)),
    marginPct: calcMarginPct(matched),
    avgVas: avg(rows.map(row => row.totalVAS)),
    avgDiscount: avg(rows.map(row => row.discountOnInvoice)),
    avgInsurance: avg(rows.map(row => row.insurance)),
    avgEw: avg(rows.map(row => row.ew)),
    avgTga: avg(rows.map(row => row.tga)),
    financePenetration: units ? (financed / units) * 100 : null,
  };
}

function renderSalesTeam(data, main) {
  const { joined = [] } = data;
  const usableRows = joined.filter(row => !isExcludedByFinanceSource(row));

  if (!usableRows.length) {
    main.innerHTML = '<div class="empty-state"><p>No sales team data available for this year.</p></div>';
    return;
  }

  const normalizeRoleRows = roleKey => usableRows.map(row => ({
    ...row,
    _teamRoleName: normalizeTeamMemberName(row[roleKey]),
  }));

  const bySm = groupBy(normalizeRoleRows('SM'), row => row._teamRoleName);
  const byTl = groupBy(normalizeRoleRows('T.L.'), row => row._teamRoleName);
  const bySo = groupBy(normalizeRoleRows('S.O.'), row => row._teamRoleName);

  const rankedSo = sortedEntries(bySo, rows => rows.length)
    .filter(([name]) => name !== 'Unknown')
    .map(([name, rows]) => buildMemberStats(name, rows));

  const topSo15 = rankedSo.slice(0, 15);
  const rankedSm = sortedEntries(bySm, rows => rows.length)
    .filter(([name]) => name !== 'Unknown')
    .map(([name, rows]) => buildMemberStats(name, rows));
  const rankedTl = sortedEntries(byTl, rows => rows.length)
    .filter(([name]) => name !== 'Unknown')
    .map(([name, rows]) => buildMemberStats(name, rows));

  const matched = usableRows.filter(row => row.netMargin != null);
  const overallAvgRetail = avg(usableRows.map(row => getRetailAmount(row)));
  const overallAvgMargin = avg(matched.map(row => row.netMargin));
  const overallMarginPct = calcMarginPct(matched);
  const overallAvgVas = avg(usableRows.map(row => row.totalVAS));
  const overallAvgDiscount = avg(usableRows.map(row => row.discountOnInvoice));
  const financedUnits = usableRows.filter(row => typeof row.financeAmount === 'number' && row.financeAmount > 0).length;
  const financePenetration = usableRows.length ? (financedUnits / usableRows.length) * 100 : null;

  const bestByMargin = rankedSo
    .filter(row => row.units >= 3 && row.avgNetMargin != null)
    .sort((a, b) => (b.avgNetMargin || 0) - (a.avgNetMargin || 0))[0] || null;
  const bestByVas = rankedSo
    .filter(row => row.units >= 3 && row.avgVas != null)
    .sort((a, b) => (b.avgVas || 0) - (a.avgVas || 0))[0] || null;
  const highestDiscount = rankedSo
    .filter(row => row.units >= 3 && row.avgDiscount != null)
    .sort((a, b) => (b.avgDiscount || 0) - (a.avgDiscount || 0))[0] || null;
  const topVolume = rankedSo[0] || null;

  const toCommonCells = (row, index) => [
    `#${index + 1}`,
    row.name,
    fmtNum(row.units),
    fmt(row.avgRetail),
    fmt(row.avgNetMargin),
    fmtPct(row.marginPct),
    fmt(row.avgVas),
    fmt(row.avgDiscount),
    fmtPct(row.financePenetration),
  ];

  const smRows = rankedSm.map((row, index) => toCommonCells(row, index));
  const tlRows = rankedTl.map((row, index) => toCommonCells(row, index));

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Avg Retail / Unit', fmt(overallAvgRetail), `${fmtNum(usableRows.length)} valid units`) }
        ${card('Avg Net Margin / Unit', fmt(overallAvgMargin), `${fmtPct(overallMarginPct)} margin rate`) }
        ${card('Avg VAS / Unit', fmt(overallAvgVas), 'Insurance + EW + TGA + Coating') }
        ${card('Highest Discount / Unit (SO)', highestDiscount ? fmt(highestDiscount.avgDiscount) : '—', highestDiscount ? highestDiscount.name : 'No eligible SO') }
        ${card('Finance Penetration', fmtPct(financePenetration), `${fmtNum(financedUnits)} financed units`) }
        ${card('Best GM / Unit (SO)', bestByMargin ? fmt(bestByMargin.avgNetMargin) : '—', bestByMargin ? bestByMargin.name : 'No eligible SO') }
        ${card('Best VAS / Unit (SO)', bestByVas ? fmt(bestByVas.avgVas) : '—', bestByVas ? bestByVas.name : 'No eligible SO') }
        ${card('Top Volume SO', topVolume ? fmtNum(topVolume.units) : '—', topVolume ? topVolume.name : 'No SO data') }
      </div>
    </section>
    <section class="section-block">
      <div class="section-heading-row">
        <h2 class="section-heading">Sales Officer View</h2>
        <div class="segment-toggle" role="tablist" aria-label="Sales Officer data range">
          <button class="segment-btn" id="so-toggle-top15" data-mode="top15" role="tab" aria-selected="false">Top 15</button>
          <button class="segment-btn" id="so-toggle-all" data-mode="all" role="tab" aria-selected="true">All</button>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title" id="so-chart-title">SO: Avg Net Margin / Unit vs Avg VAS / Unit (All)</div>
        <canvas id="chart-so-performance" height="280"></canvas>
      </div>
    </section>
    <section class="section-block">
      <div class="leaderboard-block">
        <h3 class="leaderboard-title">Sales Manager (SM) Scorecard</h3>
        ${tableHtml(['#', 'Name', 'Units', 'Avg Retail', 'Avg Net Margin', 'Margin %', 'Avg VAS', 'Avg Discount', 'Fin %'], smRows, 'No SM data')}
      </div>
    </section>
    <section class="section-block">
      <div class="leaderboard-block">
        <h3 class="leaderboard-title">Team Leader (TL) Scorecard</h3>
        ${tableHtml(['#', 'Name', 'Units', 'Avg Retail', 'Avg Net Margin', 'Margin %', 'Avg VAS', 'Avg Discount', 'Fin %'], tlRows, 'No TL data')}
      </div>
    </section>
    <section class="section-block">
      <div class="leaderboard-block">
        <h3 class="leaderboard-title">Sales Officer (SO) Scorecard</h3>
        <div id="so-table-wrap"></div>
      </div>
    </section>`;

  const soChartTitle = document.getElementById('so-chart-title');
  const soTableWrap = document.getElementById('so-table-wrap');
  const toggleTop15 = document.getElementById('so-toggle-top15');
  const toggleAll = document.getElementById('so-toggle-all');

  function getSoRows(rows) {
    return rows.map((row, index) => [
      ...toCommonCells(row, index),
      fmt(row.avgInsurance),
      fmt(row.avgEw),
      fmt(row.avgTga),
    ]);
  }

  function setToggleState(mode) {
    [toggleTop15, toggleAll].forEach(button => {
      if (!button) return;
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  function renderSoView(mode) {
    const source = mode === 'top15' ? topSo15 : rankedSo;
    const suffix = mode === 'top15' ? 'Top 15' : 'All';

    if (soChartTitle) {
      soChartTitle.textContent = `SO: Avg Net Margin / Unit vs Avg VAS / Unit (${suffix})`;
    }

    if (soTableWrap) {
      soTableWrap.innerHTML = tableHtml(
        ['#', 'Name', 'Units', 'Avg Retail', 'Avg Net Margin', 'Margin %', 'Avg VAS', 'Avg Discount', 'Fin %', 'Ins', 'EW', 'TGA'],
        getSoRows(source),
        'No SO data'
      );
    }

    createChart('chart-so-performance', {
      type: 'bar',
      data: {
        labels: source.map(row => row.name),
        datasets: [
          {
            label: 'Avg Net Margin / Unit',
            data: source.map(row => row.avgNetMargin),
            backgroundColor: COLORS.blue,
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Avg VAS / Unit',
            data: source.map(row => row.avgVas),
            borderColor: COLORS.teal,
            backgroundColor: COLORS.teal,
            tension: 0.3,
            pointRadius: 3,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        ...chartDefaults('₹'),
        plugins: {
          ...chartDefaults('₹').plugins,
          legend: { display: true },
        },
        scales: {
          x: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
          y: {
            position: 'left',
            grid: { color: '#F1F5F9' },
            ticks: {
              font: { size: 11 },
              callback: value => `₹${Math.round(value).toLocaleString('en-IN')}`,
            },
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              font: { size: 11 },
              callback: value => `₹${Math.round(value).toLocaleString('en-IN')}`,
            },
          },
        },
      },
    });

    setToggleState(mode);
  }

  toggleTop15?.addEventListener('click', () => renderSoView('top15'));
  toggleAll?.addEventListener('click', () => renderSoView('all'));
  renderSoView('all');
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderSalesTeam(data, main);
  },
});
