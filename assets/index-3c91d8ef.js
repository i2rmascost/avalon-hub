const params = new URLSearchParams(location.search);
const restoredPath = params.get('p');
if (restoredPath) {
  history.replaceState(null, '', restoredPath);
}

const root = document.getElementById('root');

const data = {
  title: 'Avalon Hub Lottery SPA',
  status: 'Live Build',
  draw: 'Daily',
  top3: '---',
  bottom2: '--',
};

root.innerHTML = `
  <main class="app">
    <h1>${data.title}</h1>
    <p>GitHub Pages root now serves the built SPA entrypoint.</p>
    <div class="grid">
      <section class="card"><div class="label">Status</div><div class="value">${data.status}</div></section>
      <section class="card"><div class="label">Draw</div><div class="value">${data.draw}</div></section>
      <section class="card"><div class="label">Top 3</div><div class="value">${data.top3}</div></section>
      <section class="card"><div class="label">Bottom 2</div><div class="value">${data.bottom2}</div></section>
    </div>
  </main>
`;
