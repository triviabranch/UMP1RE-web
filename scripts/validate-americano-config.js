#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'americano', 'config.json');

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
  { a: [0, 1], b: [4, 5], sit: [2, 3] },
  { a: [0, 3], b: [2, 4], sit: [1, 5] },
];

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const errors = [];
let checked = 0;

validateRange('playerOptions', config.playerOptions, 4, 16);
validateRange('courtOptions', config.courtOptions, 1, 4);
validateRange('pointOptions', config.pointOptions, 16, 24);
validateRange('rotationOptions', config.rotationOptions, 1, 12);

for (const points of config.pointOptions || []) {
  const minutes = Number(config.minutesPerGame?.[points]);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    errors.push(`minutesPerGame.${points} must be a positive number`);
  }
}

for (const players of config.playerOptions || []) {
  for (const courts of config.courtOptions || []) {
    for (const points of config.pointOptions || []) {
      for (const rotations of config.rotationOptions || []) {
        validateTournament({ players, courts, points, rotations });
        checked += 1;
      }
    }
  }
}

if (errors.length) {
  console.error(`Americano config validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Americano config validation passed: ${checked} combinations checked.`);

function validateRange(key, values, min, max) {
  if (!Array.isArray(values) || !values.length) {
    errors.push(`${key} must contain at least one value`);
    return;
  }

  for (const value of values) {
    if (!Number.isInteger(value) || value < min || value > max) {
      errors.push(`${key} contains unsupported value ${value}; expected ${min}-${max}`);
    }
  }
}

function validateTournament({ players, courts, points, rotations }) {
  const schedule = buildAmericanoSchedule(players, rotations, courts);
  const context = `${players} players, ${courts} courts, ${points} points, ${rotations} rotations`;
  if (!schedule.length) {
    errors.push(`${context}: schedule is empty`);
    return;
  }

  const maxPossibleCourts = Math.max(1, Math.floor(players / 4));
  schedule.forEach((round, idx) => {
    if (!round.matches.length) {
      errors.push(`${context}, round ${idx + 1}: no matches`);
    }
    if (round.matches.length > courts) {
      errors.push(`${context}, round ${idx + 1}: uses more courts than selected`);
    }
    if (round.matches.length > maxPossibleCourts) {
      errors.push(`${context}, round ${idx + 1}: uses impossible court count`);
    }

    const seen = new Set();
    for (const match of round.matches) {
      if (!Array.isArray(match.a) || !Array.isArray(match.b) || match.a.length !== 2 || match.b.length !== 2) {
        errors.push(`${context}, round ${idx + 1}: every match must have two doubles teams`);
        continue;
      }

      for (const player of [...match.a, ...match.b]) {
        if (!Number.isInteger(player) || player < 0 || player >= players) {
          errors.push(`${context}, round ${idx + 1}: player index ${player} is out of range`);
        }
        if (seen.has(player)) {
          errors.push(`${context}, round ${idx + 1}: player ${player + 1} appears more than once`);
        }
        seen.add(player);
      }
    }

    for (const player of round.sitOut || []) {
      if (!Number.isInteger(player) || player < 0 || player >= players) {
        errors.push(`${context}, round ${idx + 1}: sit-out player index ${player} is out of range`);
      }
      if (seen.has(player)) {
        errors.push(`${context}, round ${idx + 1}: player ${player + 1} both plays and sits out`);
      }
      seen.add(player);
    }

    if (seen.size !== players) {
      errors.push(`${context}, round ${idx + 1}: accounts for ${seen.size}/${players} players`);
    }

    if (idx > 0) {
      validateConsecutiveSitOuts(context, schedule[idx - 1], round, idx + 1);
    }
  });

  if (!Number.isInteger(points) || points < 16 || points > 24) {
    errors.push(`${context}: points must be 16-24`);
  }
}

function validateConsecutiveSitOuts(context, previousRound, round, roundNumber) {
  const previousSitOut = previousRound.sitOut || [];
  const currentSitOut = new Set(round.sitOut || []);
  const repeated = previousSitOut.filter(player => currentSitOut.has(player));
  const activeSlots = (round.matches || []).length * 4;

  if (repeated.length && previousSitOut.length <= activeSlots) {
    errors.push(`${context}, round ${roundNumber}: player(s) ${repeated.map(player => player + 1).join(', ')} sit out twice in a row`);
  }
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
    let previousSitOut = [];
    const playCounts = new Array(numPlayers).fill(0);
    const schedule = [];
    for (let i = 0; i < totalRounds * cycles; i += 1) {
      const round = buildDynamicRound(numPlayers, i, maxCourts, previousSitOut, playCounts);
      schedule.push(round);
      for (const match of round.matches) {
        for (const player of [...match.a, ...match.b]) {
          playCounts[player] += 1;
        }
      }
      previousSitOut = round.sitOut;
    }
    return schedule;
  }

  const schedule = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const entry of base) {
      schedule.push(entry);
    }
  }
  return schedule;
}

function rawToRound(entry) {
  return { matches: [{ a: entry.a, b: entry.b }], sitOut: entry.sit };
}

function buildDynamicRound(numPlayers, roundIdx, maxCourts, previousSitOut = [], playCounts = []) {
  const courtCount = Math.min(Math.max(1, maxCourts || 1), Math.floor(numPlayers / 4), 4);
  const activeCount = courtCount * 4;
  const previous = new Set(previousSitOut);
  const active = [];
  const activeSet = new Set();

  const candidates = Array.from({ length: numPlayers }, (_, player) => player)
    .sort((a, b) => {
      const previousDiff = Number(previous.has(b)) - Number(previous.has(a));
      if (previousDiff) return previousDiff;
      const playDiff = (playCounts[a] || 0) - (playCounts[b] || 0);
      if (playDiff) return playDiff;
      return rotateTie(a, roundIdx, numPlayers) - rotateTie(b, roundIdx, numPlayers);
    });

  for (const player of candidates) {
    if (active.length >= activeCount) break;
    active.push(player);
    activeSet.add(player);
  }

  const ordered = active
    .slice()
    .sort((a, b) => rotateTie(a, roundIdx, numPlayers) - rotateTie(b, roundIdx, numPlayers));
  const matches = [];
  for (let i = 0; i < ordered.length; i += 4) {
    const group = ordered.slice(i, i + 4);
    matches.push({
      a: [group[0], group[3]],
      b: [group[1], group[2]],
    });
  }

  const sitOut = Array.from({ length: numPlayers }, (_, player) => player)
    .filter(player => !activeSet.has(player));
  return { matches, sitOut };
}

function rotateTie(player, roundIdx, numPlayers) {
  return ((player - roundIdx) % numPlayers + numPlayers) % numPlayers;
}
