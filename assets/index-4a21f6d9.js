const API_BASE = 'https://lottomind-backend-6ic9.onrender.com/api/v1';
const PROJECT_BASE = '/avalon-hub';
const ROOT = document.getElementById('app');

const state = {
  lotteries: [],
  fetchedFrom: API_BASE,
  message: 'Loading dashboard…',
};

const params = new URLSearchParams(location.search);
const pendingPath = params.get('p');
if (pendingPath) {
  const normalizedPath = pendingPath.startsWith(PROJECT_BASE)
    ? pendingPath
    : `${PROJECT_BASE}${pendingPath.startsWith('/') ? '' : '/'}${pendingPath}`;
  history.replaceState(null, '', normalizedPath);
}

const pathAfterBase = (path) => {
  if (!path.startsWith(PROJECT_BASE)) return '/';
  const relative = path.slice(PROJECT_BASE.length);
  return relative || '/';
};

const matchRoute = (path) => {
  if (path === '/' || path === '') return { view: 'home' };

  const statsMatch = path.match(/^\/lottery\/([^/]+)\/stats\/?$/);
  if (statsMatch) return { view: 'stats', entityId: decodeURIComponent(statsMatch[1]) };

  const entityMatch = path.match(/^\/lottery\/([^/]+)\/?$/);
  if (entityMatch) return { view: 'entity', entityId: decodeURIComponent(entityMatch[1]) };

  return { view: 'notfound' };
};

const navigate = (to) => {
  history.pushState({}, '', `${PROJECT_BASE}${to}`);
  render();
};

window.addEventListener('popstate', render);

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[data-route]');
  if (!anchor) return;
  event.preventDefault();
  navigate(anchor.getAttribute('href'));
});

const byId = (entityId) => state.lotteries.find((x) => String(x.id).toLowerCase() === String(entityId).toLowerCase());

const safe = (value, fallback = '-') => (value == null || value === '' ? fallback : String(value));

const scoreRisk = (risk) => (String(risk).toUpperCase() === 'OK' ? 'ok' : 'wait');

const card = (item) => `
  <article class="card">
    <h3>${safe(item.name, item.id)}</h3>
    <p class="meta">${safe(item.time, '--:--')} • ${safe(item.categoryId, 'uncategorized')}</p>
    <div class="numbers">
      <div><span>Top 3</span><strong>${safe(item.top3, '---')}</strong></div>
      <div><span>Bottom 2</span><strong>${safe(item.bottom2, '--')}</strong></div>
    </div>
    <p class="risk ${scoreRisk(item.risk)}">${safe(item.risk, 'WAIT')}</p>
    <div class="actions">
      <a data-route href="/lottery/${encodeURIComponent(item.id)}">Details</a>
      <a data-route href="/lottery/${encodeURIComponent(item.id)}/stats">Stats</a>
    </div>
  </article>
`;

const computeStats = (lottery) => {
  const digits = `${safe(lottery.top3, '')}${safe(lottery.bottom2, '')}`.replace(/\D/g, '').split('');
  const freq = Object.fromEntries(Array.from({ length: 10 }, (_, n) => [String(n), 0]));
  digits.forEach((d) => { freq[d] += 1; });
  const hottest = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];

  return {
    length: digits.length,
    hottestDigit: hottest?.[0] ?? '-',
    hottestCount: hottest?.[1] ?? 0,
    frequency: freq,
  };
};

const renderHome = () => {
  if (!state.lotteries.length) {
    return '<section class="panel"><h2>Lotteries</h2><p>No lotteries found.</p></section>';
  }

  const rows = state.lotteries.map(card).join('');
  return `
    <section class="panel">
      <h2>Lotteries (${state.lotteries.length})</h2>
      <div class="cards">${rows}</div>
    </section>
  `;
};

const renderEntity = (entityId) => {
  const lottery = byId(entityId);
  if (!lottery) {
    return `
      <section class="panel error">
        <h2>Entity not found</h2>
        <p>No lottery found for <code>${entityId}</code>.</p>
        <a data-route href="/">Back home</a>
      </section>
    `;
  }

  return `
    <section class="panel">
      <h2>${safe(lottery.name, lottery.id)}</h2>
      <p>Route: <code>/avalon-hub/lottery/${encodeURIComponent(lottery.id)}</code></p>
      <div class="entity-grid">
        <div><span>ID</span><strong>${safe(lottery.id)}</strong></div>
        <div><span>Time</span><strong>${safe(lottery.time, '--:--')}</strong></div>
        <div><span>Top 3</span><strong>${safe(lottery.top3, '---')}</strong></div>
        <div><span>Bottom 2</span><strong>${safe(lottery.bottom2, '--')}</strong></div>
        <div><span>Risk</span><strong>${safe(lottery.risk, 'WAIT')}</strong></div>
        <div><span>Category</span><strong>${safe(lottery.categoryId)}</strong></div>
      </div>
      <div class="actions">
        <a data-route href="/lottery/${encodeURIComponent(lottery.id)}/stats">View stats</a>
        <a data-route href="/">Back home</a>
      </div>
    </section>
  `;
};

const renderStats = (entityId) => {
  const lottery = byId(entityId);
  if (!lottery) {
    return `
      <section class="panel error">
        <h2>Stats unavailable</h2>
        <p>No lottery found for <code>${entityId}</code>.</p>
        <a data-route href="/">Back home</a>
      </section>
    `;
  }

  const stats = computeStats(lottery);
  const bars = Object.entries(stats.frequency)
    .map(([digit, count]) => `<li><span>${digit}</span><div class="bar"><i style="width:${count * 20}%"></i></div><strong>${count}</strong></li>`)
    .join('');

  return `
    <section class="panel">
      <h2>${safe(lottery.name, lottery.id)} Stats</h2>
      <p>Route: <code>/avalon-hub/lottery/${encodeURIComponent(lottery.id)}/stats</code></p>
      <div class="stats-grid">
        <div><span>Digits analyzed</span><strong>${stats.length}</strong></div>
        <div><span>Hottest digit</span><strong>${stats.hottestDigit}</strong></div>
        <div><span>Hits</span><strong>${stats.hottestCount}</strong></div>
      </div>
      <ul class="bars">${bars}</ul>
      <div class="actions">
        <a data-route href="/lottery/${encodeURIComponent(lottery.id)}">Back to details</a>
        <a data-route href="/">Back home</a>
      </div>
    </section>
  `;
};

function render() {
  const route = matchRoute(pathAfterBase(location.pathname));

  let body = renderHome();
  if (route.view === 'entity') body = renderEntity(route.entityId);
  if (route.view === 'stats') body = renderStats(route.entityId);
  if (route.view === 'notfound') {
    body = `
      <section class="panel error">
        <h2>Route not found</h2>
        <p>Unknown route <code>${location.pathname}</code></p>
        <a data-route href="/">Back home</a>
      </section>
    `;
  }

  ROOT.innerHTML = `
    <main class="shell">
      <header>
        <h1>Avalon Hub Lottery Frontend</h1>
        <p>Backend target: <code>${API_BASE}</code></p>
        <nav>
          <a data-route href="/">Home</a>
          <a data-route href="/lottery/baac">/lottery/baac</a>
          <a data-route href="/lottery/baac/stats">/lottery/baac/stats</a>
        </nav>
      </header>
      ${body}
      <footer>${state.message} • Source: <code>${state.fetchedFrom}</code></footer>
    </main>
  `;
}

const extractLotteries = (payload) => payload?.lotteries || payload?.data?.lotteries || [];

const load = async () => {
  render();
  try {
    const res = await fetch(`${API_BASE}/dashboard`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    state.lotteries = extractLotteries(payload);
    state.fetchedFrom = `${API_BASE}/dashboard`;
    state.message = 'Live data loaded successfully.';
  } catch (_) {
    const localRes = await fetch(`${PROJECT_BASE}/api/v1/dashboard.json`);
    const localPayload = await localRes.json();
    state.lotteries = extractLotteries(localPayload);
    state.fetchedFrom = `${PROJECT_BASE}/api/v1/dashboard.json (fallback)`;
    state.message = 'Live API unavailable; fallback data loaded.';
  }

  render();
};

load();
