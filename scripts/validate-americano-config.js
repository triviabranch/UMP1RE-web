#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'americano', 'config.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const errors = [];
let checked = 0;

validateRange('playerOptions', config.playerOptions, 4, 16);
validateRange('courtOptions', config.courtOptions, 1, 4);
validateRange('pointOptions', config.pointOptions, 16, 24);
validateRange('rotationOptions', config.rotationOptions, 1, 4);

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

  const courtCount = Math.min(Math.max(1, Number(courts) || 1), Math.floor(players / 4), 4);
  const expectedPairCount = players * (players - 1) / 2;
  const seenPairs = new Set();

  schedule.forEach((round, idx) => {
    if (!round.matches.length) {
      errors.push(`${context}, round ${idx + 1}: no matches`);
    }
    if (round.matches.length > courtCount) {
      errors.push(`${context}, round ${idx + 1}: uses more courts than selected`);
    }

    const seenPlayers = new Set();
    for (const match of round.matches) {
      if (!Array.isArray(match.a) || !Array.isArray(match.b) || match.a.length !== 2 || match.b.length !== 2) {
        errors.push(`${context}, round ${idx + 1}: every match must have two doubles teams`);
        continue;
      }

      for (const player of [...match.a, ...match.b]) {
        if (!Number.isInteger(player) || player < 0 || player >= players) {
          errors.push(`${context}, round ${idx + 1}: player index ${player} is out of range`);
        }
        if (seenPlayers.has(player)) {
          errors.push(`${context}, round ${idx + 1}: player ${player + 1} appears more than once`);
        }
        seenPlayers.add(player);
      }

      seenPairs.add(pairKey(match.a[0], match.a[1]));
      seenPairs.add(pairKey(match.b[0], match.b[1]));
    }

    for (const player of round.sitOut || []) {
      if (!Number.isInteger(player) || player < 0 || player >= players) {
        errors.push(`${context}, round ${idx + 1}: sit-out player index ${player} is out of range`);
      }
      if (seenPlayers.has(player)) {
        errors.push(`${context}, round ${idx + 1}: player ${player + 1} both plays and sits out`);
      }
      seenPlayers.add(player);
    }

    if (seenPlayers.size !== players) {
      errors.push(`${context}, round ${idx + 1}: accounts for ${seenPlayers.size}/${players} players`);
    }

  });

  if (seenPairs.size < expectedPairCount) {
    errors.push(`${context}: only covered ${seenPairs.size}/${expectedPairCount} partner pairings`);
  }

  if (!Number.isInteger(points) || points < 16 || points > 24) {
    errors.push(`${context}: points must be 16-24`);
  }
}

function buildAmericanoSchedule(numPlayers, rotations, courts = 1) {
  const cycles = Math.max(1, Number(rotations) || 1);
  const courtCount = Math.min(Math.max(1, Number(courts) || 1), Math.floor(numPlayers / 4), 4);
  const base = buildAmericanoRoundSet(numPlayers, courtCount);
  const schedule = [];

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const entry of base) {
      schedule.push(cloneRound(entry));
    }
  }
  return schedule;
}

function buildAmericanoRoundSet(numPlayers, courtCount) {
  if (numPlayers < 4) return [];

  const pairCount = Math.max(1, courtCount * 2);
  const matchings = buildPartnerMatchings(numPlayers);
  if (!matchings.length) return [];

  const matchingSize = matchings[0].length || 1;
  const blockSize = pairCount / gcd(matchingSize, pairCount);
  const rounds = [];
  const seenPairs = [];

  for (let blockStart = 0; blockStart < matchings.length; blockStart += blockSize) {
    const block = matchings.slice(blockStart, blockStart + blockSize);
    const blockPairs = block.flat();
    const isFinalPartialBlock = blockStart + blockSize >= matchings.length
      && blockPairs.length % pairCount !== 0;

    for (let i = 0; i < blockPairs.length; i += pairCount) {
      const chunk = blockPairs.slice(i, i + pairCount);
      const finalChunk = isFinalPartialBlock && i + pairCount >= blockPairs.length;
      const selected = finalChunk
        ? fillRoundWithRepeatPairs(chunk, pairCount - chunk.length, seenPairs)
        : chunk;
      rounds.push(pairsToRound(selected, numPlayers));
    }

    seenPairs.push(...blockPairs);
  }

  return rounds;
}

function buildPartnerMatchings(numPlayers) {
  const players = Array.from({ length: numPlayers }, (_, index) => index);
  const lineup = numPlayers % 2 === 1 ? [...players, null] : [...players];
  const matchCount = lineup.length - 1;
  const half = lineup.length / 2;
  const matchings = [];
  let current = lineup.slice();

  for (let roundIndex = 0; roundIndex < matchCount; roundIndex += 1) {
    const matches = [];
    for (let i = 0; i < half; i += 1) {
      const a = current[i];
      const b = current[current.length - 1 - i];
      if (a == null || b == null) continue;
      matches.push({ a, b, key: pairKey(a, b) });
    }
    matchings.push(matches);

    const fixed = current[0];
    const rest = current.slice(1);
    rest.unshift(rest.pop());
    current = [fixed, ...rest];
  }

  return matchings;
}

function fillRoundWithRepeatPairs(chunk, needed, seenPairs) {
  if (needed <= 0) return chunk;

  const selected = chunk.slice();
  const blocked = new Set();
  for (const pair of selected) {
    blocked.add(pair.a);
    blocked.add(pair.b);
  }

  for (const pair of seenPairs) {
    if (selected.length >= chunk.length + needed) break;
    if (selected.some(entry => entry.key === pair.key)) continue;
    if (blocked.has(pair.a) || blocked.has(pair.b)) continue;
    selected.push(pair);
    blocked.add(pair.a);
    blocked.add(pair.b);
  }

  return selected;
}

function pairsToRound(pairs, numPlayers) {
  const matches = [];
  const activePlayers = new Set();
  for (let i = 0; i < pairs.length; i += 2) {
    const first = pairs[i];
    const second = pairs[i + 1];
    if (!first || !second) continue;
    activePlayers.add(first.a);
    activePlayers.add(first.b);
    activePlayers.add(second.a);
    activePlayers.add(second.b);
    matches.push({
      a: [first.a, first.b],
      b: [second.a, second.b],
    });
  }
  const sitOut = Array.from({ length: numPlayers }, (_, player) => player)
    .filter(player => !activePlayers.has(player));
  return { matches, sitOut };
}

function cloneRound(round) {
  return {
    matches: (round.matches || []).map(match => ({
      a: [...match.a],
      b: [...match.b],
    })),
    sitOut: [...(round.sitOut || [])],
  };
}

function pairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}
