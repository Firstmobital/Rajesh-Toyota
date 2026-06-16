import {
  avg,
  fmt,
  groupBy,
  initReportPage,
  loadData,
  sortedEntries,
  tableHtml,
} from './shared.js';

function renderSalesTeam(data, main) {
  const { joined } = data;

  function leaderboard(groupKey, label) {
    const grouped = groupBy(joined, row => row[groupKey] || 'Unknown');
    const rows = sortedEntries(grouped, entries => entries.length)
      .slice(0, 20)
      .map(([name, entries], i) => {
        const avgNM = avg(entries.filter(entry => entry.netMargin != null).map(entry => entry.netMargin));
        return [`#${i + 1}`, name, entries.length, fmt(avgNM)];
      });

    return `<div class="leaderboard-block"><h3 class="leaderboard-title">${label}</h3>${tableHtml(['#', 'Name', 'Units', 'Avg Net Margin'], rows, `No ${label} data`)}</div>`;
  }

  main.innerHTML = `
    <section class="section-block leaderboard-row">
      ${leaderboard('SM', 'Sales Manager (SM)')}
      ${leaderboard('T.L.', 'Team Leader (TL)')}
      ${leaderboard('S.O.', 'Sales Officer (SO)')}
    </section>`;
}

initReportPage({
  usesYear: true,
  render: async ({ year, main }) => {
    const data = await loadData(year);
    renderSalesTeam(data, main);
  },
});
