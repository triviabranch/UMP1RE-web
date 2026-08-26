#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'americano', 'config.json');
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || '127.0.0.1';

const optionCatalog = {
  playerOptions: [4, 5, 6, 8, 10, 12, 14, 16],
  courtOptions: [1, 2, 3, 4],
  pointOptions: [8, 12, 16, 21, 24, 32],
  rotationOptions: [1, 2, 3, 4, 5, 6],
};

const defaultConfig = {
  playerOptions: [4, 5, 6, 8, 10, 12],
  courtOptions: [1, 2, 3],
  pointOptions: [16, 21, 24],
  rotationOptions: [1, 2, 3],
  minutesPerGame: {
    16: 10,
    21: 13,
    24: 15,
  },
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      sendHtml(res, renderEditor(readConfig()));
      return;
    }

    if (req.method === 'GET' && req.url === '/config.json') {
      sendJson(res, readConfig());
      return;
    }

    if (req.method === 'POST' && req.url === '/save') {
      const body = await readBody(req);
      const form = new URLSearchParams(body);
      const next = normalizeConfig({
        playerOptions: form.getAll('playerOptions'),
        courtOptions: form.getAll('courtOptions'),
        pointOptions: form.getAll('pointOptions'),
        rotationOptions: form.getAll('rotationOptions'),
        minutesPerGame: Object.fromEntries(
          Array.from(form.entries())
            .filter(([key]) => key.startsWith('minutesPerGame.'))
            .map(([key, value]) => [key.replace('minutesPerGame.', ''), value])
        ),
      });
      fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
      sendHtml(res, renderEditor(next, 'Config saved to americano/config.json'));
      return;
    }

    if (req.method === 'POST' && req.url === '/reset') {
      const next = normalizeConfig(defaultConfig);
      fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
      sendHtml(res, renderEditor(next, 'Defaults restored in americano/config.json'));
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(error.stack || String(error));
  }
});

server.listen(port, host, () => {
  console.log(`Americano config editor: http://${host}:${port}/`);
});

function readConfig() {
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  } catch (_) {
    return normalizeConfig(defaultConfig);
  }
}

function normalizeConfig(raw) {
  const next = {
    playerOptions: normalizeNumberList(raw.playerOptions, defaultConfig.playerOptions),
    courtOptions: normalizeNumberList(raw.courtOptions, defaultConfig.courtOptions),
    pointOptions: normalizeNumberList(raw.pointOptions, defaultConfig.pointOptions),
    rotationOptions: normalizeNumberList(raw.rotationOptions, defaultConfig.rotationOptions),
    minutesPerGame: {},
  };

  for (const points of next.pointOptions) {
    const configured = Number(raw.minutesPerGame?.[points]);
    const fallback = defaultConfig.minutesPerGame[points] ?? Math.round(10 * (points / 16));
    next.minutesPerGame[points] = Number.isFinite(configured) && configured > 0
      ? Math.round(configured)
      : fallback;
  }

  return next;
}

function normalizeNumberList(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const numbers = source
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item > 0);
  const unique = Array.from(new Set(numbers)).sort((a, b) => a - b);
  return unique.length ? unique : fallback;
}

function renderEditor(config, status = '') {
  const points = Array.from(new Set([...optionCatalog.pointOptions, ...config.pointOptions])).sort((a, b) => a - b);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Americano config editor</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --bg: #24262e;
    --panel: rgba(7, 7, 13, 0.78);
    --line: rgba(255,255,255,0.12);
    --text: #f4f6ff;
    --muted: rgba(244,246,255,0.68);
    --lime: #d9ff33;
  }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--text);
    background: radial-gradient(circle at top left, rgba(217,255,51,0.14), transparent 26rem), var(--bg);
  }
  .shell { width: min(1040px, 100%); margin: 0 auto; padding: 1rem; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
  h1, h2 { margin: 0; }
  h1 { color: var(--lime); font-size: clamp(2rem, 6vw, 4rem); line-height: 1; }
  h2 { font-size: 1.1rem; }
  p { color: var(--muted); line-height: 1.5; }
  form { display: grid; gap: 0.85rem; }
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; }
  .panel { border: 1px solid var(--line); border-radius: 14px; background: var(--panel); overflow: hidden; }
  .panel.full { grid-column: 1 / -1; }
  .panel-head { padding: 0.9rem 1rem; border-bottom: 1px solid var(--line); }
  .panel-body { padding: 1rem; }
  .options, .times { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.55rem; }
  label.option, .time {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 3rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.65rem;
    background: rgba(255,255,255,0.04);
    font-weight: 800;
  }
  input[type="checkbox"] { accent-color: var(--lime); }
  .time { display: grid; }
  .time span { color: var(--muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; }
  .time input {
    width: 100%;
    min-height: 2.5rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #101120;
    color: var(--text);
    padding: 0.55rem 0.65rem;
    font: inherit;
  }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.6rem; }
  button, a.button {
    min-height: 42px;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.72rem 1rem;
    background: rgba(255,255,255,0.04);
    color: var(--text);
    cursor: pointer;
    text-decoration: none;
    font: inherit;
    font-weight: 800;
  }
  button.primary { border-color: transparent; background: var(--lime); color: var(--bg); }
  .status { color: var(--lime); font-weight: 800; min-height: 1.5rem; }
  @media (max-width: 760px) {
    header, .actions { align-items: stretch; flex-direction: column; }
    .grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<main class="shell">
  <header>
    <div>
      <h1>Americano Config</h1>
      <p>Edit the shared JSON config without touching the file by hand.</p>
    </div>
    <a class="button" href="/config.json" target="_blank" rel="noreferrer">View JSON</a>
  </header>
  <form method="post" action="/save">
    <section class="grid">
      ${renderOptionPanel('Players', 'playerOptions', config)}
      ${renderOptionPanel('Courts', 'courtOptions', config)}
      ${renderOptionPanel('Rounds', 'rotationOptions', config)}
      ${renderOptionPanel('Points', 'pointOptions', config)}
      <article class="panel full">
        <div class="panel-head">
          <h2>Time Estimates</h2>
          <p>Minutes per game for each points option. Americano total time is calculated from this and rotations.</p>
        </div>
        <div class="panel-body times">
          ${points.map(point => `
            <label class="time">
              <span>${point} points</span>
              <input type="number" min="1" step="1" name="minutesPerGame.${point}" value="${escapeHtml(config.minutesPerGame[point] ?? Math.round(10 * (point / 16)))}">
            </label>
          `).join('')}
        </div>
      </article>
    </section>
    <div class="actions">
      <span class="status">${escapeHtml(status)}</span>
      <button type="submit" formaction="/reset">Reset defaults</button>
      <button class="primary" type="submit">Save config.json</button>
    </div>
  </form>
</main>
</body>
</html>`;
}

function renderOptionPanel(title, key, config) {
  const values = Array.from(new Set([...optionCatalog[key], ...config[key]])).sort((a, b) => a - b);
  return `<article class="panel">
    <div class="panel-head">
      <h2>${title}</h2>
      <p>Options shown in the Americano setup flow.</p>
    </div>
    <div class="panel-body options">
      ${values.map(value => `
        <label class="option">
          <input type="checkbox" name="${key}" value="${value}" ${config[key].includes(value) ? 'checked' : ''}>
          <span>${value}</span>
        </label>
      `).join('')}
    </div>
  </article>`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendHtml(res, html) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendJson(res, value) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(`${JSON.stringify(value, null, 2)}\n`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
