const dataCache = {};
const CACHE_TTL = 5 * 60 * 1000;
const charts = {};

export const COLORS = {
  blue: '#378ADD',
  green: '#97C459',
  amber: '#EF9F27',
  coral: '#D85A30',
  teal: '#1D9E75',
  gray: '#94A3B8',
  navy: '#1A2332',
};

export const PALETTE = [
  COLORS.blue,
  COLORS.green,
  COLORS.amber,
  COLORS.coral,
  COLORS.teal,
  COLORS.gray,
  '#A78BFA',
  '#FB923C',
  '#34D399',
  '#F472B6',
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseNum(val) {
  if (val == null || val === '') return null;
  const n = parseFloat(String(val).replace(/,/g, '').replace(/₹/g, '').trim());
  return Number.isNaN(n) ? null : n;
}

export function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return '₹' + Number(n.toFixed(decimals)).toLocaleString('en-IN');
}

export function fmtPct(n) {
  if (n == null) return '—';
  return n.toFixed(2) + '%';
}

export function fmtNum(n) {
  if (n == null) return '—';
  return Number(Math.round(n)).toLocaleString('en-IN');
}

export function avg(arr) {
  const nums = arr.filter(x => x != null && !Number.isNaN(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function sum(arr) {
  return arr.filter(x => x != null && !Number.isNaN(x)).reduce((a, b) => a + b, 0);
}

export function groupBy(arr, keyFn) {
  const map = {};
  arr.forEach(item => {
    const key = keyFn(item) || 'Unknown';
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return map;
}

export function sortedEntries(obj, valFn, desc = true) {
  return Object.entries(obj).sort((a, b) => {
    const diff = valFn(a[1]) - valFn(b[1]);
    return desc ? -diff : diff;
  });
}

export function normalizeMonthName(val) {
  if (val == null) return null;
  const raw = String(val).trim();
  if (!raw) return null;

  if (MONTHS.includes(raw)) return raw;

  const parsed = new Date(`2000-${raw}-01T00:00:00Z`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  }

  const lowered = raw.toLowerCase();
  return MONTHS.find(m => m.toLowerCase() === lowered.slice(0, 3)) || null;
}

export function normalizeModelName(val) {
  const model = String(val || '').trim();
  return model || 'Unknown';
}

export function getModelName(row) {
  return normalizeModelName(row?.MODEL || row?.Model || row?.model || 'Unknown');
}

export function getLocationName(row) {
  const loc = String(row?.Location || row?.LOCATION || row?.location || '').trim();
  return loc || 'Unknown';
}

function normalizeHeaderLookupKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getNumberByAliases(row, aliases) {
  if (!row) return null;
  const aliasSet = new Set(aliases.map(normalizeHeaderLookupKey));
  const entries = Object.entries(row);

  for (const [key, value] of entries) {
    if (aliasSet.has(normalizeHeaderLookupKey(key))) {
      return parseNum(value);
    }
  }

  for (const [key, value] of entries) {
    const normalizedKey = normalizeHeaderLookupKey(key);
    if (aliases.some(alias => normalizedKey.includes(normalizeHeaderLookupKey(alias)))) {
      return parseNum(value);
    }
  }

  return null;
}

export function getTextByAliases(row, aliases) {
  if (!row) return null;
  const aliasSet = new Set(aliases.map(normalizeHeaderLookupKey));
  const entries = Object.entries(row);

  for (const [key, value] of entries) {
    if (!aliasSet.has(normalizeHeaderLookupKey(key))) continue;
    const text = String(value || '').trim();
    if (text) return text;
  }

  for (const [key, value] of entries) {
    const normalizedKey = normalizeHeaderLookupKey(key);
    if (!aliases.some(alias => normalizedKey.includes(normalizeHeaderLookupKey(alias)))) continue;
    const text = String(value || '').trim();
    if (text) return text;
  }

  return null;
}

export function normalizePartyName(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Unknown';

  const lowered = raw.toLowerCase();
  if (['na', 'n/a', '#n/a', 'unknown', '0'].includes(lowered)) return 'Unknown';
  if (lowered === 'cancelled' || lowered === 'idt') return 'Unknown';

  const canonicalMap = {
    cash: 'Cash',
    self: 'Self',
    tfs: 'TFS',
    sbi: 'SBI',
    pnb: 'PNB',
    'hdfc bank': 'HDFC Bank',
    'icici bank': 'ICICI Bank',
    'axis bank': 'Axis Bank',
    'au bank': 'AU Bank',
    'bank of baroda': 'Bank of Baroda',
  };
  if (canonicalMap[lowered]) return canonicalMap[lowered];

  return raw;
}

export function normalizeFinanceSource(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!raw) return 'Unknown';

  if (isExcludedFinanceSourceValue(raw) || raw === '#n/a' || raw === 'na') return 'Unknown';
  if (raw.includes('cash')) return 'Cash';
  if (raw.includes('self')) return 'Self-Arranged';
  if (raw.includes('in house') || raw.includes('inhouse') || raw.includes('tfs')) return 'In-House';

  return 'Other';
}

const EXCLUDED_FINANCE_SOURCE_VALUES = new Set(['', 'cancelled', 'idt', 'demo', 'water dn', 'staff']);

export function isExcludedFinanceSourceValue(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return EXCLUDED_FINANCE_SOURCE_VALUES.has(normalized);
}

export function getRetailAmount(row) {
  return getNumberByAliases(row, [
    'RETAIL INVOICE AMOUNT',
    'RETAIL INV AMOUNT',
    'RETAIL INVOICE AMT',
  ]);
}

export function getPurchaseAmount(row) {
  return getNumberByAliases(row, [
    'PURCHASE AMOUNT',
    'Purchase Amount (NDP)',
    'Purchase Amount NDP',
    'PURCHASE AMT',
  ]);
}

export function calcMarginPct(rows) {
  const totalMargin = sum(rows.map(row => row?.netMargin));
  const totalRetail = sum(rows.map(row => getRetailAmount(row)));
  return totalRetail ? (totalMargin / totalRetail) * 100 : null;
}

export function card(title, value, sub = '') {
  return `<div class="kpi-card"><div class="kpi-label">${title}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
}

export function chartCard(title, canvasId, height = 300) {
  return `<div class="chart-card"><div class="chart-title">${title}</div><canvas id="${canvasId}" height="${height}"></canvas></div>`;
}

export function tableHtml(headers, rows, emptyMsg = 'No data') {
  if (!rows.length) return `<p class="empty">${emptyMsg}</p>`;
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function resetCharts() {
  Object.values(charts).forEach(chart => chart.destroy());
  Object.keys(charts).forEach(key => delete charts[key]);
}

function isPieLikeChart(chart) {
  const chartType = chart?.config?.type;
  return chartType === 'pie' || chartType === 'doughnut' || chartType === 'polarArea';
}

function inferTextColor(backgroundColor) {
  const color = Array.isArray(backgroundColor) ? backgroundColor[0] : backgroundColor;
  if (typeof color !== 'string' || !color.startsWith('#')) return '#0F172A';

  const normalized = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
  const hex = normalized.slice(1, 7);
  if (hex.length !== 6) return '#0F172A';

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma < 0.6 ? '#FFFFFF' : '#0F172A';
}

function getParsedValue(element, chart) {
  const parsed = element?.$context?.parsed;
  if (parsed == null) return null;

  if (typeof parsed === 'number') return parsed;

  if (isPieLikeChart(chart)) {
    return Number(parsed.r ?? parsed.y ?? parsed.x);
  }

  const isHorizontal = chart?.options?.indexAxis === 'y';
  return Number(isHorizontal ? (parsed.x ?? parsed.y) : (parsed.y ?? parsed.x));
}

function formatPersistentValue({ value, unit }) {
  if (!Number.isFinite(value)) return null;

  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === '₹') return `₹${Math.round(value).toLocaleString('en-IN')}`;

  const rounded = Math.round(value).toLocaleString('en-IN');
  return unit ? `${rounded} ${unit}` : rounded;
}

function inferDatasetUnit(dataset, configuredUnit) {
  if (configuredUnit) return configuredUnit;
  const label = String(dataset?.label || '').toLowerCase();
  if (label.includes('%') || label.includes('percent') || label.includes('rate')) return '%';
  if (
    label.includes('₹')
    || label.includes('margin')
    || label.includes('discount')
    || label.includes('amount')
    || label.includes('retail')
    || label.includes('purchase')
    || label.includes('profit')
    || label.includes('vas')
  ) {
    return '₹';
  }
  return '';
}

const alwaysVisibleValueLabelsPlugin = {
  id: 'alwaysVisibleValueLabels',
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const options = pluginOptions || {};
    if (options.enabled === false) return;

    const isPieLike = isPieLikeChart(chart);
    const datasets = chart?.data?.datasets || [];
    const configuredUnit = typeof options.unit === 'string' ? options.unit : '';
    const isHorizontal = chart?.options?.indexAxis === 'y';

    const { ctx } = chart;
    const setFontSize = size => {
      ctx.font = `600 ${size}px "Segoe UI", sans-serif`;
    };
    const fitFontSize = ({ text, maxWidth, maxHeight, preferred = 11, min = 7 }) => {
      for (let size = preferred; size >= min; size -= 1) {
        setFontSize(size);
        const width = ctx.measureText(text).width;
        if (width <= maxWidth && size <= maxHeight) return size;
      }
      return null;
    };

    ctx.save();
    setFontSize(11);

    datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (!meta || meta.hidden) return;

      // Keep permanent labels for bars and pie-like charts, but avoid clutter on line series.
      if (meta.type === 'line') return;

      const total = isPieLike
        ? (dataset.data || []).reduce((sum, item) => {
            const num = Number(item);
            return Number.isFinite(num) ? sum + num : sum;
          }, 0)
        : 0;

      meta.data.forEach((element, itemIndex) => {
        const value = getParsedValue(element, chart);
        if (!Number.isFinite(value)) return;

        const datasetUnit = inferDatasetUnit(dataset, configuredUnit);
        const formattedValue = formatPersistentValue({ value, unit: datasetUnit });
        if (!formattedValue) return;

        let labelText = formattedValue;
        if (isPieLike) {
          const percent = total > 0 ? (value / total) * 100 : 0;
          labelText = `${formattedValue} (${percent.toFixed(1)}%)`;
        }

        const point = element.tooltipPosition();
        let x = point.x;
        let y = point.y;
        const isBarElement = meta.type === 'bar';

        if (isBarElement && !isPieLike) {
          const backgroundColor = Array.isArray(dataset.backgroundColor)
            ? dataset.backgroundColor[itemIndex]
            : dataset.backgroundColor;
          ctx.fillStyle = inferTextColor(backgroundColor);

          if (isHorizontal) {
            const barWidth = Math.abs((element.x ?? 0) - (element.base ?? 0));
            const barHeight = Math.abs(element.height ?? 0);
            const fontSize = fitFontSize({
              text: labelText,
              maxWidth: Math.max(0, barWidth - 8),
              maxHeight: Math.max(0, barHeight - 4),
            });
            if (!fontSize) return;
            setFontSize(fontSize);

            x = (element.x + element.base) / 2;
            y = element.y;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, x, y);
            return;
          }

          const barLength = Math.abs((element.base ?? 0) - (element.y ?? 0));
          const barThickness = Math.abs(element.width ?? 0);
          const fontSize = fitFontSize({
            text: labelText,
            maxWidth: Math.max(0, barLength - 8),
            maxHeight: Math.max(0, barThickness - 4),
          });
          if (!fontSize) return;
          setFontSize(fontSize);

          x = element.x;
          y = (element.y + element.base) / 2;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(labelText, 0, 0);
          ctx.restore();
          return;
        }

        if (!isPieLike && isHorizontal) {
          x += 6;
          ctx.textAlign = 'left';
          ctx.fillStyle = '#0F172A';
        } else if (!isPieLike) {
          y -= 8;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#0F172A';
        } else {
          const backgroundColor = Array.isArray(dataset.backgroundColor)
            ? dataset.backgroundColor[itemIndex]
            : dataset.backgroundColor;
          ctx.textAlign = 'center';
          ctx.fillStyle = inferTextColor(backgroundColor);
        }

        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, x, y);
      });
    });

    ctx.restore();
  },
};

if (typeof Chart !== 'undefined' && !Chart.registry.plugins.get('alwaysVisibleValueLabels')) {
  Chart.register(alwaysVisibleValueLabelsPlugin);
  Chart.defaults.plugins.alwaysVisibleValueLabels = { enabled: true, unit: '' };
}

export function createChart(id, config) {
  const existing = charts[id];
  if (existing) {
    existing.destroy();
    delete charts[id];
  }
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  charts[id] = new Chart(canvas.getContext('2d'), config);
  return charts[id];
}

export function chartDefaults(unit = '') {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      alwaysVisibleValueLabels: { enabled: true, unit },
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const parsed = ctx.parsed;
            const isHorizontal = ctx.chart?.options?.indexAxis === 'y';
            const value = parsed && typeof parsed === 'object'
              ? (isHorizontal ? (parsed.x ?? parsed.y) : (parsed.y ?? parsed.x))
              : parsed;
            const chartType = ctx.chart?.config?.type;
            const isPieLike = chartType === 'pie' || chartType === 'doughnut';

            if (isPieLike) {
              const data = ctx.dataset?.data || [];
              const total = data.reduce((sum, item) => {
                const num = Number(item);
                return Number.isFinite(num) ? sum + num : sum;
              }, 0);
              const percent = total > 0 ? ((Number(value) / total) * 100) : 0;
              const baseLabel = unit === '₹'
                ? `₹${Math.round(value).toLocaleString('en-IN')}`
                : `${Math.round(value).toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;
              return ` ${baseLabel} (${percent.toFixed(1)}%)`;
            }

            if (unit === '₹') return ` ₹${Math.round(value).toLocaleString('en-IN')}`;
            return ` ${Math.round(value).toLocaleString('en-IN')}${unit ? ` ${unit}` : ''}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
      y: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
    },
  };
}

export function showLoading(visible) {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  el.style.display = visible ? 'flex' : 'none';
}

export function showError(message) {
  const msg = document.getElementById('error-message');
  const banner = document.getElementById('error-banner');
  if (!msg || !banner) return;
  msg.textContent = message;
  banner.style.display = 'flex';
}

export async function loadData(year) {
  if (dataCache[year] && Date.now() - dataCache[year].fetchedAt < CACHE_TTL) {
    return dataCache[year].data;
  }

  showLoading(true);
  try {
    const response = await fetch(`/api/data/${year}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      if (error.code === 'REAUTH_REQUIRED') {
        window.location.assign('/auth/google');
        throw new Error('Re-authenticating with Google...');
      }
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    dataCache[year] = { data, fetchedAt: Date.now() };
    return data;
  } finally {
    showLoading(false);
  }
}

function getInitialYear() {
  const fromQuery = parseInt(new URLSearchParams(window.location.search).get('year'), 10);
  if (!Number.isNaN(fromQuery) && [2025, 2026, 2027].includes(fromQuery)) return fromQuery;
  return 2025;
}

function setActiveYearButton(year) {
  document.querySelectorAll('.year-tab').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.year, 10) === year);
  });
}

function updateYearInUrl(year) {
  const url = new URL(window.location.href);
  url.searchParams.set('year', String(year));
  window.history.replaceState({}, '', url.toString());
}

export async function initReportPage({ render, usesYear = true }) {
  const main = document.getElementById('main-content');
  let activeYear = getInitialYear();

  const errorClose = document.getElementById('error-close');
  if (errorClose) {
    errorClose.addEventListener('click', () => {
      const banner = document.getElementById('error-banner');
      if (banner) banner.style.display = 'none';
    });
  }

  try {
    const me = await fetch('/api/me').then(r => r.json());
    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.textContent = `Hi, ${me.displayName}`;
  } catch {
    const greeting = document.getElementById('user-greeting');
    if (greeting) greeting.textContent = '';
  }

  const runRender = async () => {
    resetCharts();
    if (main) main.innerHTML = '';

    try {
      await render({ year: activeYear, main });
    } catch (error) {
      showError(error.message || 'Failed to render report.');
      if (main) {
        main.innerHTML = `<div class="empty-state"><p>Could not load report data.<br><small>${error.message || 'Unknown error'}</small></p></div>`;
      }
    }
  };

  if (usesYear) {
    setActiveYearButton(activeYear);
    updateYearInUrl(activeYear);

    const yearTabs = document.getElementById('year-tabs');
    if (yearTabs) {
      yearTabs.addEventListener('click', async event => {
        const button = event.target.closest('.year-tab');
        if (!button) return;
        activeYear = parseInt(button.dataset.year, 10);
        setActiveYearButton(activeYear);
        updateYearInUrl(activeYear);
        await runRender();
      });
    }
  }

  await runRender();
}
