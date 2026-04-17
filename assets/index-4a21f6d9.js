const API_BASE = 'https://lottomind-backend-6ic9.onrender.com/api/v1';
const PROJECT_BASE = '/avalon-hub';
const ROOT = document.getElementById('app');

const state = {
  entities: [],
  latestById: {},
  historyById: {},
  predictions: null,
  source: 'initializing',
  message: 'Loading…',
  loading: false,
};

const params = new URLSearchParams(location.search);
const pendingPath = params.get('p');
if (pendingPath) {
  const normalizedPath = pendingPath.startsWith(PROJECT_BASE)
    ? pendingPath
    : `${PROJECT_BASE}${pendingPath.startsWith('/') ? '' : '/'}${pendingPath}`;
  history.replaceState(null, '', normalizedPath);
}

const safe = (value, fallback = '-') => (value == null || value === '' ? fallback : String(value));
const safeNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const fetchJson = async (url) => {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const unwrapArray = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.entities)) return payload.entities;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
};

const unwrapObject = (payload) => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) return payload.data;
    if (payload.result && typeof payload.result === 'object' && !Array.isArray(payload.result)) return payload.result;
    return payload;
  }
  return null;
};

const normalizeEntity = (raw) => {
  const id = safe(raw?.id || raw?.code || raw?.slug || raw?.name, '').toLowerCase();
  return {
    id,
    name: safe(raw?.name || raw?.displayName || raw?.label || raw?.id, id.toUpperCase()),
    category: safe(raw?.categoryId || raw?.category || raw?.group, 'general'),
    status: safe(raw?.status || raw?.risk || 'active').toUpperCase(),
  };
};

const normalizeLatest = (raw = {}) => ({
  top3: safe(raw.top3 || raw.top_3 || raw.resultTop3 || raw.result?.top3, '---'),
  bottom2: safe(raw.bottom2 || raw.bottom_2 || raw.resultBottom2 || raw.result?.bottom2, '--'),
  time: safe(raw.time || raw.drawTime || raw.updatedAt || raw.updated_at, '--:--'),
  round: safe(raw.round || raw.drawNo || raw.id, '-'),
});

const normalizeHistoryRows = (rows = []) => rows.map((row, idx) => {
  const latest = normalizeLatest(row);
  return {
    key: safe(row.id, `row-${idx}`),
    top3: latest.top3,
    bottom2: latest.bottom2,
    time: latest.time,
    round: latest.round,
  };
});

const pathAfterBase = (path) => {
  if (!path.startsWith(PROJECT_BASE)) return '/';
  const relative = path.slice(PROJECT_BASE.length);
  return relative || '/';
};

const matchRoute = (path) => {
  if (path === '/' || path === '') return { view: 'home' };
  const statsMatch = path.match(/^\/lottery\/([^/]+)\/stats\/?$/);
  if (statsMatch) return { view: 'stats', entityId: decodeURIComponent(statsMatch[1]).toLowerCase() };
  const entityMatch = path.match(/^\/lottery\/([^/]+)\/?$/);
  if (entityMatch) return { view: 'entity', entityId: decodeURIComponent(entityMatch[1]).toLowerCase() };
  return { view: 'notfound' };
};

const navigate = (to) => {
  history.pushState({}, '', `${PROJECT_BASE}${to}`);
  void refreshForRoute();
};

window.addEventListener('popstate', () => {
  void refreshForRoute();
});

document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[data-route]');
  if (!anchor) return;
  event.preventDefault();
  navigate(anchor.getAttribute('href'));
});

const entityById = (id) => state.entities.find((e) => e.id === id);

const ensureEntities = async () => {
  if (state.entities.length) return;

  try {
    const payload = await fetchJson(`${API_BASE}/entities`);
    const entities = unwrapArray(payload).map(normalizeEntity).filter((e) => e.id);
    state.entities = entities;
    state.source = `${API_BASE}/entities`;
    state.message = entities.length ? 'Entities loaded.' : 'No entities returned by API.';
  } catch (_) {
    const fallback = await fetchJson(`${PROJECT_BASE}/api/v1/dashboard.json`);
    const rows = unwrapArray(fallback?.lotteries ? fallback.lotteries : fallback);
    state.entities = rows.map((x) => normalizeEntity(x)).filter((e) => e.id);
    for (const row of rows) {
      const id = safe(row?.id, '').toLowerCase();
      if (!id) continue;
      state.latestById[id] = normalizeLatest(row);
      state.historyById[id] = normalizeHistoryRows([row]);
    }
    state.source = `${PROJECT_BASE}/api/v1/dashboard.json fallback`;
    state.message = 'Live entities endpoint unavailable; fallback list loaded.';
  }
};

const ensureEntityData = async (entityId) => {
  await ensureEntities();

  const latestMissing = !state.latestById[entityId];
  const historyMissing = !state.historyById[entityId];
  if (!latestMissing && !historyMissing) return;

  const [latestResult, historyResult] = await Promise.allSettled([
    fetchJson(`${API_BASE}/entities/${encodeURIComponent(entityId)}/latest`),
    fetchJson(`${API_BASE}/entities/${encodeURIComponent(entityId)}/history`),
  ]);

  if (latestResult.status === 'fulfilled') {
    state.latestById[entityId] = normalizeLatest(unwrapObject(latestResult.value) || latestResult.value || {});
  }

  if (historyResult.status === 'fulfilled') {
    state.historyById[entityId] = normalizeHistoryRows(unwrapArray(historyResult.value));
  }

  if (latestMissing && !state.latestById[entityId]) {
    state.latestById[entityId] = { top3: '---', bottom2: '--', time: '--:--', round: '-' };
  }

  if (historyMissing && !state.historyById[entityId]) {
    state.historyById[entityId] = [];
  }

  if (latestResult.status === 'rejected' && historyResult.status === 'rejected') {
    state.message = `Unable to load live data for ${entityId}.`;
  }
};

const ensurePredictions = async () => {
  if (state.predictions) return;
  try {
    const payload = await fetchJson(`${API_BASE}/predictions`);
    state.predictions = unwrapArray(payload);
  } catch (_) {
    state.predictions = [];
  }
};

const card = (entity) => {
  const latest = state.latestById[entity.id] || { top3: '---', bottom2: '--', time: '--:--', round: '-' };
  return `
    <article class="card">
      <h3>${safe(entity.name, entity.id.toUpperCase())}</h3>
      <p class="meta">ID: ${entity.id} • ${safe(entity.category)}</p>
      <div class="numbers">
        <div><span>Top 3</span><strong>${safe(latest.top3, '---')}</strong></div>
        <div><span>Bottom 2</span><strong>${safe(latest.bottom2, '--')}</strong></div>
      </div>
      <p class="meta">Round ${safe(latest.round)} • ${safe(latest.time, '--:--')}</p>
      <div class="actions">
        <a data-route href="/lottery/${encodeURIComponent(entity.id)}">Details</a>
        <a data-route href="/lottery/${encodeURIComponent(entity.id)}/stats">Stats</a>
      </div>
    </article>
  `;
};

const computeStats = (historyRows) => {
  const digits = historyRows
    .flatMap((row) => `${safe(row.top3, '')}${safe(row.bottom2, '')}`.replace(/\D/g, '').split(''));

  const frequency = Object.fromEntries(Array.from({ length: 10 }, (_, n) => [String(n), 0]));
  digits.forEach((d) => { frequency[d] += 1; });

  const hottest = Object.entries(frequency).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
  return {
    totalRows: historyRows.length,
    totalDigits: digits.length,
    hottestDigit: hottest[0],
    hottestCount: hottest[1],
    frequency,
  };
};

const renderHome = () => {
  if (!state.entities.length) {
    return '<section class="panel"><h2>Lotteries</h2><p>No entities available.</p></section>';
  }

  const list = state.entities.map(card).join('');
  return `
    <section class="panel">
      <h2>Lotteries (${state.entities.length})</h2>
      <p>Source endpoint: <code>${API_BASE}/entities</code></p>
      <div class="cards">${list}</div>
    </section>
  `;
};

const renderHistoryTable = (rows) => {
  if (!rows.length) return '<p>No history data available.</p>';
  const tr = rows.slice(0, 20).map((row) => `
    <tr>
      <td>${safe(row.round)}</td>
      <td>${safe(row.time)}</td>
      <td>${safe(row.top3, '---')}</td>
      <td>${safe(row.bottom2, '--')}</td>
    </tr>
  `).join('');

  return `
    <table>
      <thead><tr><th>Round</th><th>Time</th><th>Top 3</th><th>Bottom 2</th></tr></thead>
      <tbody>${tr}</tbody>
    </table>
  `;
};

const renderEntity = (entityId) => {
  const entity = entityById(entityId);
  if (!entity) {
    return `
      <section class="panel error">
        <h2>Entity not found</h2>
        <p>No entity returned by <code>${API_BASE}/entities</code> for id <code>${entityId}</code>.</p>
        <a data-route href="/">Back home</a>
      </section>
    `;
  }

  const latest = state.latestById[entityId] || {};
  const history = state.historyById[entityId] || [];

  return `
    <section class="panel">
      <h2>${safe(entity.name, entity.id)}</h2>
      <p>Endpoints: <code>${API_BASE}/entities/${encodeURIComponent(entity.id)}/latest</code> and <code>${API_BASE}/entities/${encodeURIComponent(entity.id)}/history</code></p>
      <div class="entity-grid">
        <div><span>ID</span><strong>${safe(entity.id)}</strong></div>
        <div><span>Round</span><strong>${safe(latest.round, '-')}</strong></div>
        <div><span>Top 3</span><strong>${safe(latest.top3, '---')}</strong></div>
        <div><span>Bottom 2</span><strong>${safe(latest.bottom2, '--')}</strong></div>
        <div><span>Time</span><strong>${safe(latest.time, '--:--')}</strong></div>
        <div><span>History rows</span><strong>${history.length}</strong></div>
      </div>
      <h3>Recent History</h3>
      ${renderHistoryTable(history)}
      <div class="actions">
        <a data-route href="/lottery/${encodeURIComponent(entity.id)}/stats">View stats</a>
        <a data-route href="/">Back home</a>
      </div>
    </section>
  `;
};

const pickPredictionForEntity = (entityId) => {
  if (!Array.isArray(state.predictions) || !state.predictions.length) return null;
  const lower = entityId.toLowerCase();
  return state.predictions.find((x) => String(x.entityId || x.id || x.entity || '').toLowerCase() === lower) || null;
};

const renderStats = (entityId) => {
  const entity = entityById(entityId);
  if (!entity) {
    return `
      <section class="panel error">
        <h2>Stats unavailable</h2>
        <p>Unknown entity id <code>${entityId}</code>.</p>
        <a data-route href="/">Back home</a>
      </section>
    `;
  }

  const history = state.historyById[entityId] || [];
  const stats = computeStats(history);
  const frequencyRows = Object.entries(stats.frequency)
    .map(([digit, count]) => `<li><span>${digit}</span><div class="bar"><i style="width:${safeNum(count) * 8}%"></i></div><strong>${count}</strong></li>`)
    .join('');

  const prediction = pickPredictionForEntity(entityId);

  return `
    <section class="panel">
      <h2>${safe(entity.name, entity.id)} Stats</h2>
      <p>Primary endpoint: <code>${API_BASE}/entities/${encodeURIComponent(entity.id)}/history</code></p>
      <div class="stats-grid">
        <div><span>History rows</span><strong>${stats.totalRows}</strong></div>
        <div><span>Digits analyzed</span><strong>${stats.totalDigits}</strong></div>
        <div><span>Hottest digit</span><strong>${stats.hottestDigit}</strong></div>
        <div><span>Hits</span><strong>${stats.hottestCount}</strong></div>
      </div>
      <ul class="bars">${frequencyRows}</ul>
      <section class="prediction-box">
        <h3>Prediction (from <code>${API_BASE}/predictions</code>)</h3>
        ${prediction ? `<pre>${JSON.stringify(prediction, null, 2)}</pre>` : '<p>No prediction data available for this entity.</p>'}
      </section>
      <div class="actions">
        <a data-route href="/lottery/${encodeURIComponent(entity.id)}">Back to details</a>
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
        <p>Unknown route <code>${location.pathname}</code>.</p>
        <a data-route href="/">Back home</a>
      </section>
    `;
  }

  ROOT.innerHTML = `
    <main class="shell">
      <header>
        <h1>Avalon Hub Lottery Frontend</h1>
        <p>Backend base: <code>${API_BASE}</code></p>
        <nav>
          <a data-route href="/">Home</a>
          <a data-route href="/lottery/baac">/lottery/baac</a>
          <a data-route href="/lottery/baac/stats">/lottery/baac/stats</a>
        </nav>
      </header>
      ${body}
      <footer>${state.loading ? 'Loading…' : state.message} • Source: <code>${state.source}</code></footer>
    </main>
  `;
}

const refreshForRoute = async () => {
  const route = matchRoute(pathAfterBase(location.pathname));
  state.loading = true;
  render();

  try {
    await ensureEntities();
    if (route.view === 'entity' || route.view === 'stats') {
      await ensureEntityData(route.entityId);
    }
    if (route.view === 'stats') {
      await ensurePredictions();
    }
  } catch (error) {
    state.message = `Data loading error: ${safe(error?.message, 'unknown error')}`;
  }

  state.loading = false;
  render();
};

void refreshForRoute();
