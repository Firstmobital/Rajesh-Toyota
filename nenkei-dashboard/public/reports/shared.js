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
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => {
            const parsed = ctx.parsed;
            const isHorizontal = ctx.chart?.options?.indexAxis === 'y';
            const value = parsed && typeof parsed === 'object'
              ? (isHorizontal ? (parsed.x ?? parsed.y) : (parsed.y ?? parsed.x))
              : parsed;
            if (unit === '₹') return ` ₹${Math.round(value).toLocaleString('en-IN')}`;
            return ` ${Math.round(value).toLocaleString('en-IN')} ${unit}`;
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
