import {
  COLORS,
  MONTHS,
  card,
  chartCard,
  chartDefaults,
  createChart,
  fmtNum,
  fmtPct,
  getLocationName,
  getModelName,
  getTextByAliases,
  groupBy,
  initReportPage,
  loadData,
  tableHtml,
} from './shared.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const INVALID_TEXT_VALUES = new Set(['', 'na', 'n/a', '#n/a', 'cancelled', 'idt', '0']);

function normalizeText(value) {
  return String(value || '').trim();
}

function hasMeaningfulValue(value) {
  const text = normalizeText(value).toLowerCase();
  return !INVALID_TEXT_VALUES.has(text);
}

function parseDate(value) {
  const raw = normalizeText(value);
  if (!raw) return null;

  if (!Number.isNaN(Number(raw)) && /^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial < 1) return null;
    const ms = (serial - 25569) * MS_PER_DAY;
    const dt = new Date(ms);
    if (dt.getUTCFullYear() < 2005) return null;
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  if (!hasMeaningfulValue(raw)) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    if (direct.getUTCFullYear() < 2005) return null;
    return direct;
  }

  const slashLike = raw.match(/^(\d{1,2})[\/-]([A-Za-z]{3}|\d{1,2})[\/-](\d{2,4})$/);
  if (!slashLike) return null;

  const day = Number(slashLike[1]);
  let month = null;
  const monthToken = slashLike[2].toLowerCase();
  const monthMap = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  if (!Number.isNaN(Number(monthToken))) {
    month = Number(monthToken) - 1;
  } else {
    month = monthMap[monthToken.slice(0, 3)];
  }
  const year = Number(slashLike[3].length === 2 ? `20${slashLike[3]}` : slashLike[3]);

  if ([day, month, year].some(item => item == null || Number.isNaN(item))) return null;
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  const dt = new Date(Date.UTC(year, month, day));
  if (dt.getUTCFullYear() < 2005) return null;
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toUtcDayTimestamp(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dayDiff(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const diff = Math.round((toUtcDayTimestamp(toDate) - toUtcDayTimestamp(fromDate)) / MS_PER_DAY);
  return diff >= 0 ? diff : null;
}

function median(values) {
  const nums = values.filter(v => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

function p90(values) {
  const nums = values.filter(v => v != null && !Number.isNaN(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const index = Math.min(nums.length - 1, Math.ceil(nums.length * 0.9) - 1);
  return nums[index];
}

function yesNoToBool(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return ['y', 'yes', 'true', '1', 'done', 'completed'].includes(text);
}

function getMonthName(row) {
  if (row._monthName && MONTHS.includes(row._monthName)) return row._monthName;
  const monthText = getTextByAliases(row, ['MONTH']) || '';
  const short = monthText.slice(0, 3).toLowerCase();
  const matched = MONTHS.find(month => month.toLowerCase() === short);
  return matched || null;
}

function getCustomerName(row) {
  return normalizeText(getTextByAliases(row, ['CUSTOMER NAME']) || 'Unknown');
}

function enrichRow(row, now) {
  const bookingDate = parseDate(getTextByAliases(row, ['Sale Register Update Date', 'Booking Date', 'Sales Register Update Date']));
  const gatePassDate = parseDate(getTextByAliases(row, ['Gate Pass Date']));
  const deliveryDate = parseDate(getTextByAliases(row, ['Delivery Date']));
  const rtoDate = parseDate(getTextByAliases(row, ['RTO Date', 'RTO Completed Date']));

  const gatePassNo = getTextByAliases(row, ['Gate Pass No', 'Gate Pass Number']) || '';
  const hasGatePass = Boolean(gatePassDate) || hasMeaningfulValue(gatePassNo);

  const rtoFlag = getTextByAliases(row, ['RTO Y/N', 'RTO']) || '';
  const hasRto = yesNoToBool(rtoFlag) || Boolean(rtoDate);
  const hasDelivery = Boolean(deliveryDate);

  const bookingToGateDays = dayDiff(bookingDate, gatePassDate);
  const gateToDeliveryDays = dayDiff(gatePassDate, deliveryDate);
  const bookingToDeliveryDays = dayDiff(bookingDate, deliveryDate);

  return {
    ...row,
    _month: getMonthName(row),
    _customer: getCustomerName(row),
    _model: getModelName(row),
    _location: getLocationName(row),
    _bookingDate: bookingDate,
    _gatePassDate: gatePassDate,
    _deliveryDate: deliveryDate,
    _hasGatePass: hasGatePass,
    _hasDelivery: hasDelivery,
    _hasRto: hasRto,
    _bookingToGateDays: bookingToGateDays,
    _gateToDeliveryDays: gateToDeliveryDays,
    _bookingToDeliveryDays: bookingToDeliveryDays,
    _pendingGatePassAging: bookingDate && !hasGatePass ? dayDiff(bookingDate, now) : null,
    _pendingDeliveryAging: hasGatePass && !hasDelivery ? dayDiff(gatePassDate || bookingDate, now) : null,
    _pendingRtoAging: hasDelivery && !hasRto ? dayDiff(deliveryDate, now) : null,
  };
}

function renderBookingFunnel(data, main) {
  const now = new Date();
  const rows = (data.joined || []).map(row => enrichRow(row, now));

  if (!rows.length) {
    main.innerHTML = '<div class="empty-state"><p>No sales data available for this year.</p></div>';
    return;
  }

  const totalBooked = rows.length;
  const gatePassed = rows.filter(row => row._hasGatePass).length;
  const delivered = rows.filter(row => row._hasDelivery).length;
  const rtoCompleted = rows.filter(row => row._hasRto).length;

  const bookingToDeliveryValues = rows.map(row => row._bookingToDeliveryDays);
  const bookingToGateValues = rows.map(row => row._bookingToGateDays);
  const gateToDeliveryValues = rows.map(row => row._gateToDeliveryDays);

  const b2dMedian = median(bookingToDeliveryValues);
  const b2dP90 = p90(bookingToDeliveryValues);
  const b2gMedian = median(bookingToGateValues);
  const g2dMedian = median(gateToDeliveryValues);

  const deliveredIn7Days = rows.filter(row => row._bookingToDeliveryDays != null && row._bookingToDeliveryDays <= 7).length;
  const deliveredIn15Days = rows.filter(row => row._bookingToDeliveryDays != null && row._bookingToDeliveryDays <= 15).length;

  const pendingGatePass = rows.filter(row => row._pendingGatePassAging != null);
  const pendingDelivery = rows.filter(row => row._pendingDeliveryAging != null);
  const pendingRto = rows.filter(row => row._pendingRtoAging != null);

  const funnelRates = {
    gatePass: totalBooked ? (gatePassed / totalBooked) * 100 : null,
    delivered: totalBooked ? (delivered / totalBooked) * 100 : null,
    rto: totalBooked ? (rtoCompleted / totalBooked) * 100 : null,
  };

  const byMonth = groupBy(rows.filter(row => row._month), row => row._month);
  const monthLabels = MONTHS.filter(month => byMonth[month]);
  const monthBookings = monthLabels.map(month => (byMonth[month] || []).length);
  const monthDeliveries = monthLabels.map(month => (byMonth[month] || []).filter(row => row._hasDelivery).length);
  const monthDeliveryRate = monthLabels.map((month, index) => {
    const booked = monthBookings[index];
    return booked ? (monthDeliveries[index] / booked) * 100 : null;
  });

  const agingToRows = (list, agingKey) => list
    .slice()
    .sort((a, b) => (b[agingKey] || 0) - (a[agingKey] || 0))
    .slice(0, 12)
    .map((row, index) => [
      String(index + 1),
      row._customer,
      row._model,
      row._location,
      fmtNum(row[agingKey]),
    ]);

  main.innerHTML = `
    <section class="section-block">
      <div class="kpi-grid">
        ${card('Booked Units', fmtNum(totalBooked), 'Base funnel population')}
        ${card('Gate Pass Done', fmtNum(gatePassed), `${fmtPct(funnelRates.gatePass)} conversion`) }
        ${card('Delivered Units', fmtNum(delivered), `${fmtPct(funnelRates.delivered)} conversion`) }
        ${card('RTO Completed', fmtNum(rtoCompleted), `${fmtPct(funnelRates.rto)} conversion`) }
        ${card('Median Booking -> Delivery', b2dMedian == null ? '—' : `${fmtNum(b2dMedian)} days`, b2dP90 == null ? '—' : `P90 ${fmtNum(b2dP90)} days`) }
        ${card('Median Booking -> Gate Pass', b2gMedian == null ? '—' : `${fmtNum(b2gMedian)} days`) }
        ${card('Median Gate Pass -> Delivery', g2dMedian == null ? '—' : `${fmtNum(g2dMedian)} days`) }
        ${card('Delivery SLA', fmtPct(delivered ? (deliveredIn7Days / delivered) * 100 : null), `${fmtNum(deliveredIn7Days)} within 7d, ${fmtNum(deliveredIn15Days)} within 15d`) }
        ${card('Pending Gate Pass', fmtNum(pendingGatePass.length), 'Open after booking')}
        ${card('Pending Delivery', fmtNum(pendingDelivery.length), 'Gate pass done, delivery pending')}
        ${card('Pending RTO', fmtNum(pendingRto.length), 'Delivered but RTO pending')}
      </div>
    </section>

    <section class="section-block charts-row">
      ${chartCard('Booking to Delivery Funnel', 'chart-funnel', 280)}
      ${chartCard('Monthly Conversion: Booked vs Delivered', 'chart-monthly-conversion', 280)}
    </section>

    <section class="section-block charts-row">
      <div>
        <h2 class="section-heading">Pending Delivery Aging (Top 12)</h2>
        ${tableHtml(['#', 'Customer', 'Model', 'Location', 'Aging Days'], agingToRows(pendingDelivery, '_pendingDeliveryAging'), 'No pending delivery cases')}
      </div>
      <div>
        <h2 class="section-heading">Pending RTO Aging (Top 12)</h2>
        ${tableHtml(['#', 'Customer', 'Model', 'Location', 'Aging Days'], agingToRows(pendingRto, '_pendingRtoAging'), 'No pending RTO cases')}
      </div>
    </section>`;

  createChart('chart-funnel', {
    type: 'bar',
    data: {
      labels: ['Booked', 'Gate Pass', 'Delivered', 'RTO Complete'],
      datasets: [{
        label: 'Units',
        data: [totalBooked, gatePassed, delivered, rtoCompleted],
        backgroundColor: [COLORS.blue, COLORS.amber, COLORS.teal, COLORS.green],
        borderRadius: 4,
      }],
    },
    options: {
      ...chartDefaults('units'),
      plugins: {
        ...chartDefaults('units').plugins,
        legend: { display: false },
      },
    },
  });

  createChart('chart-monthly-conversion', {
    data: {
      labels: monthLabels,
      datasets: [
        {
          type: 'bar',
          label: 'Booked',
          data: monthBookings,
          backgroundColor: COLORS.blue,
          yAxisID: 'y',
          borderRadius: 4,
        },
        {
          type: 'bar',
          label: 'Delivered',
          data: monthDeliveries,
          backgroundColor: COLORS.green,
          yAxisID: 'y',
          borderRadius: 4,
        },
        {
          type: 'line',
          label: 'Delivery Rate %',
          data: monthDeliveryRate,
          borderColor: COLORS.coral,
          backgroundColor: COLORS.coral,
          tension: 0.3,
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
        x: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
        y: {
          position: 'left',
          grid: { color: '#F1F5F9' },
          ticks: { font: { size: 11 }, callback: value => Number(value).toLocaleString('en-IN') },
          title: { display: true, text: 'Units' },
        },
        y2: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { font: { size: 11 }, callback: value => `${Number(value).toFixed(0)}%` },
          title: { display: true, text: 'Delivery Rate %' },
        },
      },
    },
  });
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderBookingFunnel(data, main);
  },
});
