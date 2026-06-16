import {
  COLORS,
  MONTHS,
  avg,
  calcMarginPct,
  card,
  chartDefaults,
  createChart,
  fmt,
  fmtNum,
  fmtPct,
  getLocationName,
  getModelName,
  getPurchaseAmount,
  getRetailAmount,
  groupBy,
  initReportPage,
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

function renderModelDeepDive(data, main) {
  const { joined = [] } = data;
  if (!joined.length) {
    main.innerHTML = '<div class="empty-state"><p>No model data available for this year.</p></div>';
    return;
  }

  const byModel = groupBy(joined, row => getModelName(row));
  const modelNames = sortedEntries(byModel, rows => rows.length).map(([name]) => name);
  const initialModel = modelNames[0] || null;

  if (!initialModel) {
    main.innerHTML = '<div class="empty-state"><p>No valid model names found for this year.</p></div>';
    return;
  }

  main.innerHTML = `
    <section class="section-block">
      <div class="section-heading-row">
        <h2 class="section-heading">Model Selector</h2>
        <select id="model-deep-dive-select" class="year-tab" style="border-radius:8px;padding:6px 10px;min-width:220px">
          ${modelNames.map(name => `<option value="${name}">${name}</option>`).join('')}
        </select>
      </div>
    </section>
    <section class="section-block">
      <div class="kpi-grid" id="model-kpi-grid"></div>
    </section>
    <section class="section-block">
      <div class="chart-card">
        <div class="chart-title" id="model-trend-title">Monthly Performance</div>
        <canvas id="model-trend-chart" height="280"></canvas>
      </div>
    </section>
    <section class="section-block" id="model-location-scorecard"></section>
    <section class="section-block" id="model-team-scorecard"></section>`;

  const select = document.getElementById('model-deep-dive-select');
  const kpiGrid = document.getElementById('model-kpi-grid');
  const trendTitle = document.getElementById('model-trend-title');
  const locationSection = document.getElementById('model-location-scorecard');
  const teamSection = document.getElementById('model-team-scorecard');

  function renderForModel(modelName) {
    const rows = byModel[modelName] || [];
    const matched = rows.filter(row => row.netMargin != null);

    const avgRetail = avg(rows.map(row => getRetailAmount(row)));
    const avgPurchase = avg(rows.map(row => getPurchaseAmount(row)));
    const avgMargin = avg(matched.map(row => row.netMargin));
    const marginPct = calcMarginPct(matched);
    const avgVas = avg(rows.map(row => row.totalVAS));
    const avgDiscount = avg(rows.map(row => row.discountOnInvoice));
    const financedUnits = rows.filter(row => typeof row.financeAmount === 'number' && row.financeAmount > 0).length;
    const financePen = rows.length ? (financedUnits / rows.length) * 100 : null;

    if (kpiGrid) {
      kpiGrid.innerHTML = `
        ${card('Selected Model', modelName, `${fmtNum(rows.length)} units`) }
        ${card('Avg Retail / Unit', fmt(avgRetail)) }
        ${card('Avg Purchase / Unit', fmt(avgPurchase)) }
        ${card('Avg Net Margin / Unit', fmt(avgMargin), `${fmtPct(marginPct)} margin rate`) }
        ${card('Avg VAS / Unit', fmt(avgVas), 'Insurance + EW + TGA + Coating') }
        ${card('Avg Discount / Unit', fmt(avgDiscount)) }
        ${card('Finance Penetration', fmtPct(financePen), `${fmtNum(financedUnits)} financed units`) }
        ${card('Matched Margin Units', fmtNum(matched.length), `${fmtNum(rows.length)} total model units`) }`;
    }

    const byMonth = groupBy(rows, row => row._monthName);
    const monthLabels = MONTHS.filter(month => byMonth[month]);
    const unitsSeries = monthLabels.map(month => (byMonth[month] || []).length);
    const marginSeries = monthLabels.map(month => avg((byMonth[month] || []).map(row => row.netMargin)));

    if (trendTitle) {
      trendTitle.textContent = `${modelName}: Monthly Units and Avg Net Margin / Unit`;
    }

    createChart('model-trend-chart', {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: 'Units',
            data: unitsSeries,
            backgroundColor: COLORS.blue,
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'Avg Net Margin / Unit',
            data: marginSeries,
            borderColor: COLORS.green,
            backgroundColor: COLORS.green,
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
              callback: value => Number(value).toLocaleString('en-IN'),
            },
            title: { display: true, text: 'Units' },
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              font: { size: 11 },
              callback: value => `₹${Math.round(value).toLocaleString('en-IN')}`,
            },
            title: { display: true, text: 'Avg Net Margin / Unit' },
          },
        },
      },
    });

    const byLocation = groupBy(rows, row => getLocationName(row));
    const locationRows = sortedEntries(byLocation, entries => entries.length)
      .map(([location, entries]) => {
        const locationMatched = entries.filter(row => row.netMargin != null);
        return [
          location,
          fmtNum(entries.length),
          fmt(avg(entries.map(row => getRetailAmount(row)))),
          fmt(avg(locationMatched.map(row => row.netMargin))),
          fmtPct(calcMarginPct(locationMatched)),
          fmt(avg(entries.map(row => row.totalVAS))),
          fmt(avg(entries.map(row => row.discountOnInvoice))),
        ];
      });

    if (locationSection) {
      locationSection.innerHTML = `
        <h2 class="section-heading">Location Scorecard (${modelName})</h2>
        ${tableHtml(
          ['Location', 'Units', 'Avg Retail', 'Avg Net Margin', 'Margin %', 'Avg VAS', 'Avg Discount'],
          locationRows,
          'No location data'
        )}`;
    }

    const bySo = groupBy(rows, row => normalizeTeamMemberName(row['S.O.']));
    const soRows = sortedEntries(bySo, entries => entries.length)
      .filter(([name]) => name !== 'Unknown')
      .map(([name, entries], index) => {
        const soMatched = entries.filter(row => row.netMargin != null);
        const soFinanced = entries.filter(row => typeof row.financeAmount === 'number' && row.financeAmount > 0).length;
        const soFinancePen = entries.length ? (soFinanced / entries.length) * 100 : null;
        return [
          `#${index + 1}`,
          name,
          fmtNum(entries.length),
          fmt(avg(entries.map(row => getRetailAmount(row)))),
          fmt(avg(soMatched.map(row => row.netMargin))),
          fmtPct(calcMarginPct(soMatched)),
          fmt(avg(entries.map(row => row.totalVAS))),
          fmt(avg(entries.map(row => row.discountOnInvoice))),
          fmtPct(soFinancePen),
        ];
      });

    if (teamSection) {
      teamSection.innerHTML = `
        <h2 class="section-heading">Sales Officer Scorecard (${modelName})</h2>
        ${tableHtml(
          ['#', 'Sales Officer', 'Units', 'Avg Retail', 'Avg Net Margin', 'Margin %', 'Avg VAS', 'Avg Discount', 'Fin %'],
          soRows,
          'No sales officer data'
        )}`;
    }
  }

  if (select) {
    select.value = initialModel;
    select.addEventListener('change', event => {
      renderForModel(event.target.value);
    });
  }

  renderForModel(initialModel);
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderModelDeepDive(data, main);
  },
});
