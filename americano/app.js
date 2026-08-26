'use strict';

const FIXED_4 = [
  { a: [0, 1], b: [2, 3], sit: [] },
  { a: [0, 2], b: [1, 3], sit: [] },
  { a: [0, 3], b: [1, 2], sit: [] },
];

const FIXED_5 = [
  { a: [0, 1], b: [2, 3], sit: [4] },
  { a: [0, 2], b: [1, 4], sit: [3] },
  { a: [0, 3], b: [2, 4], sit: [1] },
  { a: [0, 4], b: [1, 3], sit: [2] },
  { a: [1, 2], b: [3, 4], sit: [0] },
];

const FIXED_6 = [
  { a: [1, 4], b: [2, 5], sit: [0, 3] },
  { a: [0, 5], b: [1, 3], sit: [2, 4] },
  { a: [0, 3], b: [2, 4], sit: [1, 5] },
  { a: [0, 2], b: [1, 5], sit: [3, 4] },
  { a: [0, 4], b: [2, 3], sit: [1, 5] },
  { a: [1, 5], b: [3, 4], sit: [0, 2] },
  { a: [0, 1], b: [2, 5], sit: [3, 4] },
  { a: [1, 4], b: [3, 5], sit: [0, 2] },
  { a: [0, 4], b: [2, 3], sit: [1, 5] },
  { a: [1, 2], b: [4, 5], sit: [0, 3] },
  { a: [0, 2], b: [1, 3], sit: [4, 5] },
  { a: [0, 5], b: [3, 4], sit: [1, 2] },
  { a: [1, 2], b: [3, 5], sit: [0, 4] },
  { a: [0, 3], b: [2, 4], sit: [1, 5] },
  { a: [0, 1], b: [4, 5], sit: [2, 3] },
];

const DEFAULT_CONFIG = {
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

let config = normalizeConfig(DEFAULT_CONFIG);

const state = {
  numPlayers: DEFAULT_CONFIG.playerOptions[0],
  courts: DEFAULT_CONFIG.courtOptions[0],
  pointsPerGame: DEFAULT_CONFIG.pointOptions[0],
  rotations: DEFAULT_CONFIG.rotationOptions[0],
  players: [],
  schedule: [],
  fixtures: [],
  scores: [],
  drafts: new Map(),
  pageIndex: 0,
  currentRoundIndex: 0,
  activeFixtureIndex: null,
  returnPageIndex: 0,
  pendingSkipRoundIndex: null,
  setupStep: 0,
  built: false,
};

const els = {};

document.addEventListener('DOMContentLoaded', async () => {
  config = await loadAmericanoConfig();
  cacheElements();
  initDefaults();
  bindEvents();
  render();
});

function cacheElements() {
  [
    'screen-root',
    'leaderboard-modal',
    'leaderboard-body',
    'leaderboard-close',
    'leaderboard-subtitle',
    'skip-modal',
    'skip-modal-body',
    'skip-modal-close',
    'skip-modal-cancel',
    'skip-modal-confirm',
    'topbar-copy',
  ].forEach(id => {
    els[id] = document.getElementById(id);
  });
}

async function loadAmericanoConfig() {
  try {
    const response = await fetch('/americano/config.json', { cache: 'no-store' });
    if (response.ok) {
      return normalizeConfig(await response.json());
    }
  } catch (_) {
  }
  return normalizeConfig(DEFAULT_CONFIG);
}

function normalizeConfig(raw) {
  const next = {
    playerOptions: normalizeNumberList(raw?.playerOptions, DEFAULT_CONFIG.playerOptions, 4, 32),
    courtOptions: normalizeNumberList(raw?.courtOptions, DEFAULT_CONFIG.courtOptions, 1, 8),
    pointOptions: normalizeNumberList(raw?.pointOptions, DEFAULT_CONFIG.pointOptions, 1, 99),
    rotationOptions: normalizeNumberList(raw?.rotationOptions, DEFAULT_CONFIG.rotationOptions, 1, 12),
    minutesPerGame: {},
  };

  for (const points of next.pointOptions) {
    const configured = Number(raw?.minutesPerGame?.[points]);
    const defaultMinutes = DEFAULT_CONFIG.minutesPerGame[points] ?? Math.round(10 * (points / 16));
    next.minutesPerGame[points] = Number.isFinite(configured) && configured > 0
      ? configured
      : defaultMinutes;
  }

  return next;
}

function normalizeNumberList(value, fallback, min, max) {
  const source = Array.isArray(value) ? value : fallback;
  const numbers = source
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item >= min && item <= max);
  const unique = Array.from(new Set(numbers)).sort((a, b) => a - b);
  return unique.length ? unique : fallback;
}

function applyConfigDefaults() {
  state.numPlayers = pickConfiguredValue(state.numPlayers, config.playerOptions);
  state.courts = pickConfiguredValue(state.courts, config.courtOptions);
  state.pointsPerGame = pickConfiguredValue(state.pointsPerGame, config.pointOptions);
  state.rotations = pickConfiguredValue(state.rotations, config.rotationOptions);
}

function pickConfiguredValue(value, options) {
  return options.includes(value) ? value : options[0];
}

function initDefaults() {
  applyConfigDefaults();
  state.players = Array.from({ length: state.numPlayers }, (_, i) => `Player ${i + 1}`);
}

function bindEvents() {
  const brand = document.querySelector('.brand');
  if (brand) {
    brand.addEventListener('click', e => {
      e.preventDefault();
      resetTournament();
    });
  }

  if (els['leaderboard-btn']) {
    els['leaderboard-btn'].addEventListener('click', openLeaderboard);
  }
  els['leaderboard-close'].addEventListener('click', closeLeaderboard);
  els['skip-modal-close'].addEventListener('click', closeSkipModal);
  els['skip-modal-cancel'].addEventListener('click', closeSkipModal);
  els['skip-modal-confirm'].addEventListener('click', confirmSkipRound);

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (isSkipModalOpen()) {
      closeSkipModal();
      return;
    }
    if (isLeaderboardOpen()) {
      closeLeaderboard();
    }
  });
}

function isLeaderboardOpen() {
  return els['leaderboard-modal'].classList.contains('open');
}

function isSkipModalOpen() {
  return els['skip-modal'].classList.contains('open');
}

function openLeaderboard() {
  state.returnPageIndex = state.pageIndex;
  els['leaderboard-modal'].classList.add('open');
  els['leaderboard-modal'].setAttribute('aria-hidden', 'false');
  renderLeaderboard();
}

function closeLeaderboard() {
  const returnFocus = document.querySelector('[data-action="leaderboard"]');
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
  els['leaderboard-modal'].classList.remove('open');
  els['leaderboard-modal'].setAttribute('aria-hidden', 'true');
  state.pageIndex = state.returnPageIndex;
  render();
  if (returnFocus && !returnFocus.hidden) {
    queueMicrotask(() => returnFocus.focus());
  }
}

function openSkipModal(fixtureIndex) {
  state.pendingSkipRoundIndex = fixtureIndex;
  const fixture = state.fixtures[fixtureIndex];
  if (!fixture) return;
  const teamA = teamLabel(fixture.match.a, ' & ');
  const teamB = teamLabel(fixture.match.b, ' & ');
  els['skip-modal-body'].innerHTML = `
    <div class="notice">
      No score has been selected for this match.
    </div>
    <div class="skip-summary">
      <div><strong>${escapeHtml(fixtureLabel(fixture))}</strong></div>
      <div>${escapeHtml(teamA)} vs ${escapeHtml(teamB)}</div>
      <div class="skip-note">Save as 0-0 and continue?</div>
    </div>
  `;
  els['skip-modal'].classList.add('open');
  els['skip-modal'].setAttribute('aria-hidden', 'false');
}

function closeSkipModal() {
  state.pendingSkipRoundIndex = null;
  els['skip-modal'].classList.remove('open');
  els['skip-modal'].setAttribute('aria-hidden', 'true');
}

function confirmSkipRound() {
  const fixtureIndex = state.pendingSkipRoundIndex;
  const fixture = state.fixtures[fixtureIndex];
  if (!Number.isInteger(fixtureIndex) || !fixture) {
    closeSkipModal();
    return;
  }

  state.scores[fixtureIndex] = {
    fixtureIndex,
    round: fixture.roundIndex,
    matchIndex: fixture.matchIndex,
    scoreA: 0,
    scoreB: 0,
    skipped: true,
  };
  state.drafts.set(fixtureIndex, { a: 0, b: 0 });
  closeSkipModal();

  if (allFixturesSaved()) {
    openLeaderboard();
    return;
  }

  state.activeFixtureIndex = null;
  render();
}

function resetTournament() {
  state.numPlayers = config.playerOptions[0];
  state.courts = config.courtOptions[0];
  state.pointsPerGame = config.pointOptions[0];
  state.rotations = config.rotationOptions[0];
  state.players = Array.from({ length: state.numPlayers }, (_, i) => `Player ${i + 1}`);
  state.schedule = [];
  state.fixtures = [];
  state.scores = [];
  state.drafts = new Map();
  state.pageIndex = 0;
  state.currentRoundIndex = 0;
  state.activeFixtureIndex = null;
  state.pendingSkipRoundIndex = null;
  state.setupStep = 0;
  state.built = false;
  render();
}

function render() {
  if (isLeaderboardOpen()) {
    renderLeaderboard();
  }

  updateLayoutMode();
  if (els['leaderboard-btn']) {
    els['leaderboard-btn'].hidden = !state.built;
  }
  els['screen-root'].innerHTML = renderPage();
  attachPageHandlers();
  updateTopbarCopy();
}

function renderPage() {
  if (state.pageIndex === 0) return renderIntroPage();
  if (state.pageIndex === 1) return renderSetupWizardPage();
  if (state.pageIndex === 2) return renderSetupNamesPage();
  if (!state.built) return renderIntroPage();
  if (state.activeFixtureIndex !== null && state.activeFixtureIndex !== undefined) {
    return renderScorePage(state.activeFixtureIndex);
  }
  return renderRoundOverviewPage(state.currentRoundIndex);
}

function renderIntroPage() {
  return `
    <section class="screen active">
      <div class="landing">
        <div class="landing-card">
          <img class="landing-logo" src="/assets/logo.png" alt="Ump1re">
          <h2>Americano</h2>
        </div>
        <div class="landing-actions">
          <button class="btn primary" data-action="start">Start an Americano</button>
        </div>
      </div>
    </section>
  `;
}

function renderSetupWizardPage() {
  const steps = getSetupSteps();
  const step = steps[state.setupStep] || steps[0];
  const isLastStep = state.setupStep >= steps.length - 1;
  const stepDots = steps.map((entry, idx) => `
    <button class="setup-step-dot ${idx === state.setupStep ? 'active' : ''}" type="button" data-setup-step="${idx}" aria-label="Go to ${escapeHtml(entry.title)}">
      <span>${idx + 1}</span>
    </button>
  `).join('');

  return `
    <section class="screen active">
      <div class="setup-modal-shell">
        <div class="setup-modal-card">
          <div class="setup-modal-head">
            <div class="setup-kicker">Setup</div>
            <h2>${escapeHtml(step.title)}</h2>
            <p>${escapeHtml(step.copy)}</p>
            <div class="setup-stepper" aria-label="Setup progress">
              ${stepDots}
            </div>
          </div>
          <div class="setup-modal-body">
            ${step.html}
          </div>
          <div class="setup-modal-actions">
            <button class="btn ghost" data-action="back">Back</button>
            <button class="btn ${isLastStep ? 'primary' : 'secondary'}" data-action="setup-next">
              ${isLastStep ? 'Next: names' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function getSetupSteps() {
  const roundsPerRotation = roundsPerRotationFor(state.numPlayers, state.courts);
  const estimate = estimateTournamentTime();
  return [
    {
      key: 'players',
      title: 'Players',
      copy: 'Choose how many players are joining this Americano.',
      html: `
        <div class="choice-group">
          <div class="choice-grid">
            ${config.playerOptions.map(value => `
              <button class="choice-card ${state.numPlayers === value ? 'active' : ''}" type="button" data-player-choice="${value}">
                <span class="choice-value">${value}</span>
                <span class="choice-sub">players</span>
              </button>
            `).join('')}
          </div>
        </div>
      `,
    },
    {
      key: 'courts',
      title: 'Courts',
      copy: 'Select how many courts can run at the same time.',
      html: `
        <div class="choice-group">
          <div class="choice-grid">
            ${config.courtOptions.map(value => `
              <button class="choice-card ${state.courts === value ? 'active' : ''}" type="button" data-courts-choice="${value}">
                <span class="choice-value">${value}</span>
                <span class="choice-sub">${value === 1 ? 'court' : 'courts'}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `,
    },
    {
      key: 'points',
      title: 'Points',
      copy: 'Set the fixed total points available in each match.',
      html: `
        <div class="points-step">
          <div class="choice-group">
            <div class="choice-grid">
              ${config.pointOptions.map(value => `
                <button class="choice-card ${state.pointsPerGame === value ? 'active' : ''}" type="button" data-points-choice="${value}">
                  <span class="choice-value">${value}</span>
                  <span class="choice-sub">points</span>
                </button>
              `).join('')}
            </div>
          </div>
          <div class="per-game-estimate">
            <span>Estimated time per game:</span>
            <strong>${escapeHtml(estimate.perGameLabel)}</strong>
          </div>
        </div>
      `,
    },
    {
      key: 'rotations',
      title: 'Rotations',
      copy: 'Choose how many times to cycle through the generated fixtures.',
      html: `
        <div class="rotations-step">
          <div class="choice-group">
            <div class="choice-grid">
              ${config.rotationOptions.map(value => `
                <button class="choice-card ${state.rotations === value ? 'active' : ''}" type="button" data-rotations-choice="${value}">
                  <span class="choice-value">${value}</span>
                  <span class="choice-sub">${roundsPerRotation * value} rounds</span>
                </button>
              `).join('')}
            </div>
          </div>
          <div class="overall-estimate">
            <span>Estimated overall Americano time:</span>
            <strong>${escapeHtml(estimate.totalLabel)}</strong>
            <em>${escapeHtml(estimate.meta)}</em>
          </div>
        </div>
      `,
    },
  ];
}

function renderSetupNamesPage() {
  const players = state.players.map((name, i) => `
    <div class="player-row">
      <div class="player-index">Player ${i + 1}</div>
      <input type="text" maxlength="24" value="${escapeHtml(name)}" data-player-index="${i}" aria-label="Player ${i + 1} name">
    </div>
  `).join('');

  return `
    <section class="screen active">
      <div class="screen-head">
        <div>
          <h2>Names</h2>
          <p>Name the players before the first round starts.</p>
        </div>
      </div>
      <div class="content names-flow">
        <div class="card names-panel">
          <div class="card-head">
            <div class="title">Player names</div>
            <div class="meta">Edit all ${state.numPlayers}</div>
          </div>
          <div class="card-body names-body">
            <div class="player-grid">
              ${players}
            </div>
          </div>
          <div class="names-actions">
            <button class="btn ghost" data-action="back">Back</button>
            <button class="btn secondary" data-action="fill" type="button">Reset names</button>
            <button class="btn primary" data-action="build">Start tournament</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderScorePage(fixtureIndex) {
  const fixture = state.fixtures[fixtureIndex];
  if (!fixture) return renderIntroPage();
  const draft = getDraft(fixtureIndex);
  const cols = scoreCols(state.pointsPerGame);
  const teamA = teamLabel(fixture.match.a, ' & ');
  const teamB = teamLabel(fixture.match.b, ' & ');
  const roundLabel = fixtureLabel(fixture);
  const scoreA = Number.isInteger(draft.a) ? draft.a : '—';
  const scoreB = Number.isInteger(draft.b) ? draft.b : '—';

  return `
    <section class="screen active">
      <div class="screen-head">
        <div>
          <h2>${roundLabel}</h2>
          <p>Enter the final score and save the round.</p>
        </div>
      </div>
      <div class="content round-grid">
        <div class="card score-card">
          <div class="card-body">
            <div class="score-strip" aria-label="Current score">
              <span class="score-strip-value a">${scoreA}</span>
              <span class="score-strip-separator">-</span>
              <span class="score-strip-value b">${scoreB}</span>
            </div>
            <div class="scoreboard">
              <div class="score-side a">
                <div class="head">
                  <div class="tag">${escapeHtml(teamA)}</div>
                </div>
                <div class="score-grid" style="--score-cols:${cols};" data-score-grid="a"></div>
              </div>
              <div class="score-side b">
                <div class="head">
                  <div class="tag">${escapeHtml(teamB)}</div>
                </div>
                <div class="score-grid" style="--score-cols:${cols};" data-score-grid="b"></div>
              </div>
            </div>
            <div class="round-actions score-actions">
              <button class="btn ghost" data-action="back">Back</button>
              <button class="btn secondary" data-action="leaderboard" type="button">Leaderboard</button>
              <button class="btn primary" data-action="save">Next round</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderRoundOverviewPage(roundIndex = 0) {
  if (!state.schedule.length) return renderIntroPage();

  const safeRoundIndex = Math.max(0, Math.min(roundIndex, state.schedule.length - 1));
  const round = state.schedule[safeRoundIndex];
  const roundLabel = `Round ${safeRoundIndex + 1}/${state.schedule.length}`;
  const roundFixtures = state.fixtures.filter((fixture) => fixture.roundIndex === safeRoundIndex);
  const sit = round.sitOut.length ? round.sitOut.map(i => state.players[i]).join(', ') : 'None';

  const roundTabs = state.schedule.map((entry, idx) => {
    const fixtures = state.fixtures.filter((fixture) => fixture.roundIndex === idx);
    const saved = fixtures.filter((fixture) => state.scores[fixture.fixtureIndex]).length;
    return `
      <button class="round-tab ${idx === safeRoundIndex ? 'active' : ''}" type="button" data-round-choice="${idx}">
        Round ${idx + 1}
        <span class="round-tab-count">${saved}/${fixtures.length}</span>
      </button>
    `;
  }).join('');

  const fixtureCards = roundFixtures.map((fixture) => {
    const saved = state.scores[fixture.fixtureIndex];
    const teamA = teamLabel(fixture.match.a, ' & ');
    const teamB = teamLabel(fixture.match.b, ' & ');
    return `
      <button class="schedule-item fixture-card ${saved ? 'completed' : ''}" type="button" data-open-fixture="${fixture.fixtureIndex}">
        <div class="fixture-card-court">Court ${fixture.courtIndex + 1}</div>
        <div class="fixture-card-team">${escapeHtml(teamA)}</div>
        <div class="fixture-card-vs">vs</div>
        <div class="fixture-card-team">${escapeHtml(teamB)}</div>
        <div class="fixture-card-status">${saved ? `Saved ${saved.scoreA} - ${saved.scoreB}` : 'Open scoring'}</div>
      </button>
    `;
  }).join('');

  return `
    <section class="screen active">
      <div class="screen-head">
        <div>
          <h2>${escapeHtml(roundLabel)}</h2>
          <p>Tap a court to open scoring.</p>
        </div>
      </div>
      <div class="content leaderboard-page">
        <div class="round-nav">
          ${roundTabs}
        </div>
        <div class="round-sitout">
          <span>Sitting out</span>
          <strong>${escapeHtml(sit)}</strong>
        </div>
        <div class="schedule-list">
          ${fixtureCards}
        </div>
      </div>
      <div class="round-actions">
        <button class="btn ghost" data-action="back">Back</button>
        <button class="btn secondary" data-action="leaderboard" type="button">Leaderboard</button>
        <button class="btn primary" data-action="next-round">Next round</button>
      </div>
    </section>
  `;
}

function renderLeaderboard() {
  if (!state.built || !state.schedule.length) {
    els['leaderboard-body'].innerHTML = `
      <div class="notice">Build a tournament first.</div>
    `;
    els['leaderboard-subtitle'].textContent = 'No results yet';
    return;
  }

  const standings = calcAmericanoStandings(state.numPlayers, state.fixtures, state.scores);
  const completed = countSavedFixtures();
  const maxPts = standings[0]?.points ?? 0;
  const missed = getMissedFixtures();

  const missedHtml = missed.length
    ? `
      <div class="missed-fixtures">
        <div class="missed-fixtures-title">Missed fixtures</div>
        <div class="missed-fixtures-list">
          ${missed.map(item => `
            <div class="missed-fixture">
              <div class="missed-fixture-round">${item.roundLabel}</div>
              <div class="missed-fixture-teams">${escapeHtml(item.teamA)} vs ${escapeHtml(item.teamB)}</div>
              <div class="missed-fixture-score">0 - 0</div>
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '';

  els['leaderboard-subtitle'].textContent = `${completed} / ${state.fixtures.length} matches saved`;
  els['leaderboard-body'].innerHTML = `
    ${missedHtml}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Points</th>
            <th>Wins</th>
            <th>Played</th>
            <th>Avg</th>
          </tr>
        </thead>
        <tbody>
          ${standings.map((row, idx) => {
            const avg = row.played ? (row.points / row.played).toFixed(1) : '0.0';
            return `
              <tr class="${idx === 0 && completed ? 'current-row' : ''}">
                <td class="rank">${idx + 1}${row.points === maxPts && maxPts > 0 ? ' ▲' : ''}</td>
                <td>${escapeHtml(state.players[row.playerIdx])}</td>
                <td>${row.points}</td>
                <td>${row.wins}</td>
                <td>${row.played}</td>
                <td>${avg}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function attachPageHandlers() {
  const startBtn = document.querySelector('[data-action="start"]');
  if (startBtn) startBtn.addEventListener('click', () => {
    state.pageIndex = 1;
    state.setupStep = 0;
    render();
  });

  const backBtn = document.querySelector('[data-action="back"]');
  if (backBtn) backBtn.addEventListener('click', () => {
    if (Number.isInteger(state.activeFixtureIndex)) {
      closeFixture();
      return;
    }
    if (state.pageIndex === 2) {
      state.pageIndex = 1;
      state.setupStep = getSetupSteps().length - 1;
      render();
      return;
    }
    if (state.pageIndex === 1 && state.setupStep > 0) {
      state.setupStep -= 1;
      render();
      return;
    }
    if (state.pageIndex > 0) {
      state.pageIndex -= 1;
      render();
    }
  });

  const leaderboardBtn = document.querySelector('[data-action="leaderboard"]');
  if (leaderboardBtn) leaderboardBtn.addEventListener('click', openLeaderboard);

  const buildBtn = document.querySelector('[data-action="build"]');
  if (buildBtn) buildBtn.addEventListener('click', buildTournament);

  const setupNextBtn = document.querySelector('[data-action="setup-next"]');
  if (setupNextBtn) setupNextBtn.addEventListener('click', () => {
    const lastStep = getSetupSteps().length - 1;
    if (state.setupStep >= lastStep) {
      state.pageIndex = 2;
    } else {
      state.pageIndex = 1;
      state.setupStep += 1;
    }
    render();
  });

  document.querySelectorAll('[data-setup-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = Number(btn.dataset.setupStep);
      if (!Number.isInteger(next)) return;
      state.pageIndex = 1;
      state.setupStep = Math.max(0, Math.min(next, getSetupSteps().length - 1));
      render();
    });
  });

  const fillBtn = document.querySelector('[data-action="fill"]');
  if (fillBtn) fillBtn.addEventListener('click', resetNames);

  const saveBtn = document.querySelector('[data-action="save"]');
  if (saveBtn) saveBtn.addEventListener('click', saveRound);

  const nextRoundBtn = document.querySelector('[data-action="next-round"]');
  if (nextRoundBtn) nextRoundBtn.addEventListener('click', () => {
    state.activeFixtureIndex = null;
    if (state.currentRoundIndex < state.schedule.length - 1) {
      state.currentRoundIndex += 1;
      render();
      return;
    }
    if (allFixturesSaved()) {
      openLeaderboard();
      return;
    }
    render();
  });

  document.querySelectorAll('input[data-player-index]').forEach(input => {
    input.addEventListener('click', () => {
      if (input.dataset.cleared === 'true') return;
      input.value = '';
      const idx = Number(input.dataset.playerIndex);
      state.players[idx] = '';
      input.dataset.cleared = 'true';
    });
    input.addEventListener('input', () => {
      const idx = Number(input.dataset.playerIndex);
      input.dataset.cleared = 'true';
      state.players[idx] = input.value.trim() || `Player ${idx + 1}`;
    });
  });

  document.querySelectorAll('[data-player-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextCount = Number(btn.dataset.playerChoice);
      if (nextCount === state.numPlayers) return;
      state.numPlayers = nextCount;
      state.players = Array.from({ length: state.numPlayers }, (_, i) => state.players[i] ?? `Player ${i + 1}`);
      state.schedule = [];
      state.fixtures = [];
      state.scores = [];
      state.drafts = new Map();
      state.built = false;
      state.pageIndex = 1;
      render();
    });
  });

  document.querySelectorAll('[data-courts-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextCount = Number(btn.dataset.courtsChoice);
      if (nextCount === state.courts) return;
      state.courts = nextCount;
      state.schedule = [];
      state.fixtures = [];
      state.scores = [];
      state.drafts = new Map();
      state.built = false;
      state.pageIndex = 1;
      render();
    });
  });

  document.querySelectorAll('[data-points-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = Number(btn.dataset.pointsChoice);
      if (next === state.pointsPerGame) return;
      state.pointsPerGame = next;
      state.schedule = [];
      state.scores = [];
      state.drafts = new Map();
      state.built = false;
      state.pageIndex = 1;
      render();
    });
  });

  document.querySelectorAll('[data-rotations-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = Number(btn.dataset.rotationsChoice);
      if (next === state.rotations) return;
      state.rotations = next;
      state.schedule = [];
      state.scores = [];
      state.drafts = new Map();
      state.built = false;
      state.pageIndex = 1;
      render();
    });
  });

  document.querySelectorAll('[data-score-grid]').forEach(grid => {
    const side = grid.getAttribute('data-score-grid');
    const fixtureIndex = state.activeFixtureIndex;
    if (!Number.isInteger(fixtureIndex)) return;
    const draft = getDraft(fixtureIndex);
    grid.innerHTML = scoreButtonsHtml(side, draft);
    grid.querySelectorAll('button[data-value]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = Number(btn.dataset.value);
        setDraftScore(fixtureIndex, side, value);
      });
    });
  });

  document.querySelectorAll('[data-round-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextIndex = Number(btn.dataset.roundChoice);
      if (!Number.isInteger(nextIndex)) return;
      state.currentRoundIndex = Math.max(0, Math.min(nextIndex, state.schedule.length - 1));
      state.activeFixtureIndex = null;
      render();
    });
  });

  document.querySelectorAll('[data-open-fixture]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fixtureIndex = Number(btn.dataset.openFixture);
      if (!Number.isInteger(fixtureIndex)) return;
      openFixture(fixtureIndex);
    });
  });
}

function buildTournament() {
  state.schedule = buildAmericanoSchedule(state.numPlayers, state.rotations, state.courts);
  state.fixtures = buildFixtureOrder(state.schedule);
  state.scores = Array.from({ length: state.fixtures.length }, () => null);
  state.drafts = new Map();
  state.fixtures.forEach((_, fixtureIdx) => {
    state.drafts.set(fixtureIdx, { a: null, b: null });
  });
  state.built = true;
  state.currentRoundIndex = 0;
  state.activeFixtureIndex = null;
  state.setupStep = 0;
  state.pageIndex = 3;
  render();
}

function resetNames() {
  state.players = Array.from({ length: state.numPlayers }, (_, i) => `Player ${i + 1}`);
  render();
}

function saveRound() {
  const fixtureIndex = state.activeFixtureIndex;
  const fixture = state.fixtures[fixtureIndex];
  if (!fixture) return;
  const draft = getDraft(fixtureIndex);
  if (!Number.isInteger(draft.a) || !Number.isInteger(draft.b)) {
    openSkipModal(fixtureIndex);
    return;
  }

  const err = validateScore(draft.a, draft.b, state.pointsPerGame);
  if (err) {
    window.alert(err);
    return;
  }

  state.scores[fixtureIndex] = {
    fixtureIndex,
    round: fixture.roundIndex,
    matchIndex: fixture.matchIndex,
    scoreA: draft.a,
    scoreB: draft.b,
  };

  state.activeFixtureIndex = null;

  if (allFixturesSaved()) {
    openLeaderboard();
    return;
  }

  render();
}

function setDraftScore(fixtureIndex, side, value) {
  const draft = getDraft(fixtureIndex);
  if (side === 'a') {
    draft.a = value;
    draft.b = state.pointsPerGame - value;
  } else {
    draft.b = value;
    draft.a = state.pointsPerGame - value;
  }
  state.drafts.set(fixtureIndex, draft);
  render();
}

function getDraft(fixtureIndex) {
  if (!state.drafts.has(fixtureIndex)) {
    const saved = state.scores[fixtureIndex];
    state.drafts.set(fixtureIndex, saved ? { a: saved.scoreA, b: saved.scoreB } : { a: null, b: null });
  }
  return state.drafts.get(fixtureIndex);
}

function openFixture(fixtureIndex) {
  const fixture = state.fixtures[fixtureIndex];
  if (!fixture) return;
  state.currentRoundIndex = fixture.roundIndex;
  state.activeFixtureIndex = fixtureIndex;
  render();
}

function closeFixture() {
  state.activeFixtureIndex = null;
  render();
}

function scoreButtonsHtml(side, draft) {
  const activeClass = side === 'a' ? 'a' : 'b';
  return Array.from({ length: state.pointsPerGame + 1 }, (_, value) => `
    <button class="score-btn ${draft[side] === value ? `active ${activeClass}` : ''}" type="button" data-value="${value}">${value}</button>
  `).join('');
}

function updateTopbarCopy() {
  if (!els['topbar-copy']) return;
  if (!state.built) {
    if (state.pageIndex === 2) {
      els['topbar-copy'].textContent = 'Names';
      return;
    }
    const step = getSetupSteps()[state.setupStep];
    els['topbar-copy'].textContent = step
      ? step.title
      : 'Set up the Americano tournament.';
    return;
  }
  if (Number.isInteger(state.activeFixtureIndex)) {
    els['topbar-copy'].textContent = fixtureLabel(state.fixtures[state.activeFixtureIndex]);
    return;
  }
  const round = state.schedule[state.currentRoundIndex];
  els['topbar-copy'].textContent = `Round ${state.currentRoundIndex + 1} · ${round?.matches?.length || 0} courts`;
}

function countSavedFixtures() {
  return state.scores.filter(Boolean).length;
}

function allFixturesSaved() {
  return state.fixtures.length > 0 && countSavedFixtures() === state.fixtures.length;
}

function getMissedFixtures() {
  return state.scores
    .map((entry) => {
      if (!entry || !entry.skipped) return null;
      const fixture = state.fixtures[entry.fixtureIndex];
      if (!fixture) return null;
      return {
        roundLabel: fixtureLabel(fixture),
        teamA: teamLabel(fixture.match.a, ' & '),
        teamB: teamLabel(fixture.match.b, ' & '),
      };
    })
    .filter(Boolean);
}

function buildAmericanoSchedule(numPlayers, rotations, courts = 1) {
  const cycles = Math.max(1, Number(rotations) || 1);
  const maxCourts = Math.max(1, Number(courts) || 1);
  let base;

  if (numPlayers <= 4) {
    base = FIXED_4.map(rawToRound);
  } else if (numPlayers === 5) {
    base = FIXED_5.map(rawToRound);
  } else if (numPlayers === 6) {
    base = FIXED_6.map(rawToRound);
  } else {
    const totalRounds = numPlayers % 2 === 0 ? numPlayers - 1 : numPlayers;
    base = Array.from({ length: totalRounds }, (_, i) => buildCircleRound(numPlayers, i, maxCourts));
  }

  const schedule = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const entry of base) {
      schedule.push(entry);
    }
  }
  return schedule;
}

function baseRoundsForPlayers(numPlayers) {
  if (numPlayers === 4) return FIXED_4.length;
  if (numPlayers === 5) return FIXED_5.length;
  return FIXED_6.length;
}

function roundsPerRotationFor(numPlayers, courts) {
  return buildAmericanoSchedule(numPlayers, 1, courts).length;
}

function estimateTournamentTime() {
  const schedule = buildAmericanoSchedule(state.numPlayers, state.rotations, state.courts);
  const minutesPerRound = gameMinutesForPoints(state.pointsPerGame);
  const totalMinutes = Math.max(1, Math.round(schedule.length * minutesPerRound));
  const roundedMinutesPerRound = Math.max(1, Math.round(minutesPerRound));
  const rounds = schedule.length;
  const courtLabel = state.courts === 1 ? 'court' : 'courts';
  const roundLabel = rounds === 1 ? 'round' : 'rounds';

  return {
    minutes: totalMinutes,
    perGameLabel: formatMinutes(roundedMinutesPerRound),
    totalLabel: formatMinutes(totalMinutes),
    meta: `${formatMinutes(totalMinutes)} total, ${rounds} ${roundLabel} at ${state.pointsPerGame} points, ${state.courts} ${courtLabel}`,
  };
}

function gameMinutesForPoints(points) {
  const configured = Number(config.minutesPerGame[points]);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return 10 * (points / 16);
}

function formatMinutes(minutes) {
  if (minutes < 60) return `~${minutes} mins`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `~${hours} hr${hours === 1 ? '' : 's'}`;
  return `~${hours} hr ${remainder} mins`;
}

function rawToRound(entry) {
  return { matches: [{ a: entry.a, b: entry.b }], sitOut: entry.sit };
}

function buildCircleRound(numPlayers, roundIdx, maxCourts) {
  const hasGhost = numPlayers % 2 !== 0;
  const totalPlayers = hasGhost ? numPlayers + 1 : numPlayers;
  const ghost = hasGhost ? numPlayers : -1;
  const rotation = roundIdx % (totalPlayers - 1);

  const pos = [0];
  for (let i = 1; i < totalPlayers; i += 1) {
    pos.push(((i - 1 + rotation) % (totalPlayers - 1)) + 1);
  }

  const allPairs = [];
  for (let i = 0; i < totalPlayers / 2; i += 1) {
    allPairs.push([pos[i], pos[totalPlayers - 1 - i]]);
  }

  const sitOut = [];
  const realPairs = [];
  for (const [a, b] of allPairs) {
    if (a === ghost || b === ghost) {
      sitOut.push(a === ghost ? b : a);
    } else {
      realPairs.push([a, b]);
    }
  }

  const matches = [];
  const courtCount = Math.min(Math.max(1, maxCourts || 1), Math.floor(realPairs.length / 2), 3);
  for (let i = 0; i < courtCount * 2; i += 2) {
    matches.push({ a: realPairs[i], b: realPairs[i + 1] });
  }

  if (realPairs.length > matches.length * 2) {
    for (let i = matches.length * 2; i < realPairs.length; i += 1) {
      const [a, b] = realPairs[i];
      sitOut.push(a, b);
    }
  }

  sitOut.sort((a, b) => a - b);
  return { matches, sitOut };
}

function buildFixtureOrder(schedule) {
  const fixtures = [];
  schedule.forEach((round, roundIndex) => {
    (round.matches || []).forEach((match, matchIndex) => {
      fixtures.push({
        fixtureIndex: fixtures.length,
        roundIndex,
        matchIndex,
        courtIndex: matchIndex,
        courtCount: round.matches.length,
        round,
        match,
      });
    });
  });
  return fixtures;
}

function fixtureLabel(fixture) {
  if (!fixture) return 'Fixture';
  const round = fixture.roundIndex + 1;
  const totalRounds = state.schedule.length || 1;
  const court = fixture.courtIndex + 1;
  const totalCourts = fixture.courtCount || 1;
  return `Round ${round}/${totalRounds} · Court ${court}/${totalCourts}`;
}

function calcAmericanoStandings(numPlayers, fixtures, scores) {
  const pts = new Array(numPlayers).fill(0);
  const wins = new Array(numPlayers).fill(0);
  const played = new Array(numPlayers).fill(0);

  for (const [fixtureIndex, entry] of scores.entries()) {
    if (!entry) continue;
    const fixture = fixtures[fixtureIndex];
    if (!fixture) continue;
    const match = fixture.match;
    if (!match) continue;

    for (const p of match.a) {
      pts[p] += entry.scoreA;
      played[p] += 1;
      if (entry.scoreA > entry.scoreB) wins[p] += 1;
    }

    for (const p of match.b) {
      pts[p] += entry.scoreB;
      played[p] += 1;
      if (entry.scoreB > entry.scoreA) wins[p] += 1;
    }
  }

  return Array.from({ length: numPlayers }, (_, i) => ({
    playerIdx: i,
    points: pts[i],
    wins: wins[i],
    played: played[i],
  })).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function validateScore(scoreA, scoreB, target) {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return 'Select a score before saving.';
  if (scoreA < 0 || scoreB < 0) return 'Scores cannot be negative.';
  if (scoreA + scoreB !== target) return `The final score must total ${target}.`;
  return null;
}

function updateLayoutMode() {
  const pageMode = state.pageIndex === 0
    ? 'landing'
    : state.pageIndex === 2 && !state.built
      ? 'names'
      : state.pageIndex === 1 && !state.built
      ? 'setup'
      : (state.pageIndex >= 3 && state.built
        ? (Number.isInteger(state.activeFixtureIndex) ? 'match' : 'overview')
        : 'setup');
  document.body.classList.remove('require-landscape');
  document.body.dataset.pageMode = pageMode;
  document.body.dataset.points = String(state.pointsPerGame);
}

function scoreCols(pointsPerGame) {
  if (pointsPerGame <= 16) return 4;
  return 3;
}

function calcCoverage(numPlayers, schedule) {
  const seen = new Map();
  for (const round of schedule) {
    for (const match of round.matches || []) {
      for (const pair of [match.a, match.b]) {
        const key = sortedPair(pair[0], pair[1]);
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }

  const totalPairs = numPlayers * (numPlayers - 1) / 2;
  return { totalPairs, uniquePairs: seen.size };
}

function teamLabel(indices, separator = ' / ') {
  return indices.map(i => state.players[i] ?? `Player ${i + 1}`).join(separator);
}

function sortedPair(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
