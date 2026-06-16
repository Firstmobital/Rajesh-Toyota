import {
  COLORS,
  MONTHS,
  avg,
  card,
  chartCard,
  chartDefaults,
  createChart,
  fmt,
  fmtPct,
  groupBy,
  initReportPage,
  loadData,
  normalizeModelName,
  sortedEntries,
  sum,
} from './shared.js';

function renderVAS(data, main) {
  const { joined } = data;
  const totalUnits = joined.length;

  // Calculate overall VAS metrics
  const totalVASAmount = sum(joined.map(row => row.totalVAS || 0));
  const avgTotalVAS = totalUnits ? totalVASAmount / totalUnits : 0;
  
  const insuranceAmount = sum(joined.map(row => row.insurance || 0));
  const avgInsurance = totalUnits ? insuranceAmount / totalUnits : 0;
  const insurancePct = avgTotalVAS ? (avgInsurance / avgTotalVAS) * 100 : 0;
  
  const tgaAmount = sum(joined.map(row => row.tga || 0));
  const avgTGA = totalUnits ? tgaAmount / totalUnits : 0;
  const tgaPct = avgTotalVAS ? (avgTGA / avgTotalVAS) * 100 : 0;
  
  const ewAmount = sum(joined.map(row => row.ew || 0));
  const avgEW = totalUnits ? ewAmount / totalUnits : 0;
  const ewPct = avgTotalVAS ? (avgEW / avgTotalVAS) * 100 : 0;
  
  const coatingAmount = sum(joined.map(row => row.coating || 0));
  const avgCoating = totalUnits ? coatingAmount / totalUnits : 0;
  const coatingPct = avgTotalVAS ? (avgCoating / avgTotalVAS) * 100 : 0;

  // Group by month
  const byMonth = groupBy(joined, row => row._monthName || 'Unknown');
  const monthLabels = MONTHS.filter(month => byMonth[month]);

  // Calculate monthly VAS components
  const monthlyData = monthLabels.map(month => {
    const rows = byMonth[month];
    const count = rows.length;
    return {
      month,
      insurance: count ? sum(rows.map(r => r.insurance || 0)) / count : 0,
      tga: count ? sum(rows.map(r => r.tga || 0)) / count : 0,
      ew: count ? sum(rows.map(r => r.ew || 0)) / count : 0,
      coating: count ? sum(rows.map(r => r.coating || 0)) / count : 0,
    };
  });

  // Group by model
  const normalizedRows = joined.map(row => ({
    ...row,
    _modelNorm: normalizeModelName(row.MODEL),
  }));
  const byModel = groupBy(normalizedRows, row => row._modelNorm);

  const modelData = sortedEntries(byModel, rows => avg(rows.map(r => r.totalVAS || 0))).map(([model, rows]) => ({
    model,
    insurance: avg(rows.map(r => r.insurance || 0)),
    tga: avg(rows.map(r => r.tga || 0)),
    ew: avg(rows.map(r => r.ew || 0)),
    coating: avg(rows.map(r => r.coating || 0)),
    count: rows.length,
  }));

  // Group by location
  const byLocation = groupBy(joined, row => row.Location || row.LOCATION || 'Unknown');
  const locationData = sortedEntries(byLocation, rows => avg(rows.map(r => r.totalVAS || 0))).map(([loc, rows]) => ({
    location: loc,
    avgVAS: avg(rows.map(r => r.totalVAS || 0)),
    count: rows.length,
  }));

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Total VAS / Unit', fmt(avgTotalVAS), 'Per unit avg')}
        ${card('Insurance / Unit', fmt(avgInsurance), `${fmtPct(insurancePct)} of VAS`)}
        ${card('TGA / Unit', fmt(avgTGA), `${fmtPct(tgaPct)} of VAS`)}
        ${card('EW / Unit', fmt(avgEW), `${fmtPct(ewPct)} of VAS`)}
        ${card('T-Gloss / Unit', fmt(avgCoating), `${fmtPct(coatingPct)} of VAS`)}
      </div>
    </section>
    
    <section class="section-block charts-row">
      ${chartCard('Monthly Avg VAS Components / Unit (₹)', 'c-vas-monthly')}
    </section>
    
    <section class="section-block charts-row">
      ${chartCard('Avg VAS / Unit by Model (₹)', 'c-vas-model')}
      ${chartCard('VAS / Unit by Location (₹)', 'c-vas-location')}
    </section>`;

  // Create monthly stacked bar chart
  createChart('c-vas-monthly', {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: 'Insurance',
          data: monthlyData.map(d => d.insurance),
          backgroundColor: COLORS.blue,
        },
        {
          label: 'TGA',
          data: monthlyData.map(d => d.tga),
          backgroundColor: '#D85A30', // coral
        },
        {
          label: 'EW',
          data: monthlyData.map(d => d.ew),
          backgroundColor: '#1D9E75', // teal
        },
        {
          label: 'T-Gloss',
          data: monthlyData.map(d => d.coating),
          backgroundColor: '#BA7517', // brown
        },
      ],
    },
    options: {
      ...chartDefaults('₹'),
      scales: { x: { stacked: true }, y: { stacked: true } },
      plugins: { ...chartDefaults('₹').plugins, legend: { position: 'bottom' } },
    },
  });

  // Create model stacked bar chart (horizontal)
  createChart('c-vas-model', {
    type: 'bar',
    data: {
      labels: modelData.map(d => d.model),
      datasets: [
        {
          label: 'Insurance',
          data: modelData.map(d => d.insurance),
          backgroundColor: COLORS.blue,
        },
        {
          label: 'TGA',
          data: modelData.map(d => d.tga),
          backgroundColor: '#D85A30',
        },
        {
          label: 'EW',
          data: modelData.map(d => d.ew),
          backgroundColor: '#1D9E75',
        },
        {
          label: 'T-Gloss',
          data: modelData.map(d => d.coating),
          backgroundColor: '#BA7517',
        },
      ],
    },
    options: {
      indexAxis: 'y',
      ...chartDefaults('₹'),
      scales: { x: { stacked: true }, y: { stacked: true } },
      plugins: { ...chartDefaults('₹').plugins, legend: { position: 'bottom' } },
    },
  });

  // Create location bar chart
  createChart('c-vas-location', {
    type: 'bar',
    data: {
      labels: locationData.map(d => d.location),
      datasets: [
        {
          label: 'Avg VAS / Unit (₹)',
          data: locationData.map(d => d.avgVAS),
          backgroundColor: COLORS.amber,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      ...chartDefaults('₹'),
      plugins: { ...chartDefaults('₹').plugins, legend: { display: false } },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderVAS(data, main);
  },
});
