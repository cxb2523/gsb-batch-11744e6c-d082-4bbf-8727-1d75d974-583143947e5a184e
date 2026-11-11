/**
 * Tests for scripts/audit.js
 *
 * Uses only Node's built-in test runner and locally fabricated sample data.
 * No network access, no real credentials, no file system fixtures.
 *
 * Run with: node --test scripts/audit.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { auditSnapshot } from './audit.js';
import { generateHistoricalComparison, generateInsights } from './utils.js';

// ---------------------------------------------------------------------------
// Sample data builders (pure local fixtures)
// ---------------------------------------------------------------------------

function makeRepo(owner, name, overrides = {}) {
  return {
    owner,
    name,
    language: 'JavaScript',
    stars: 1000,
    starsToday: 100,
    growth: 50,
    ...overrides
  };
}

const PREVIOUS_REPOS = [
  makeRepo('alpha', 'one', { stars: 5000, starsToday: 200, growth: 120 }),
  makeRepo('beta', 'two', { stars: 4000, starsToday: 150, growth: 90 }),
  makeRepo('gamma', 'three', { stars: 3000, starsToday: 120, growth: 60 }),
  makeRepo('delta', 'four', { stars: 2000, starsToday: 80, growth: 40 })
];

// Current run: gamma jumps to #1 (up 2), alpha drops to #3 (down 2),
// delta stays out, and epsilon/five is a brand-new entrant.
const CURRENT_REPOS = [
  makeRepo('gamma', 'three', { stars: 3600, starsToday: 300, growth: 200 }),
  makeRepo('beta', 'two', { stars: 4100, starsToday: 140, growth: 85 }),
  makeRepo('alpha', 'one', { stars: 5200, starsToday: 180, growth: 110 }),
  makeRepo('epsilon', 'five', { language: 'Rust', stars: 1500, starsToday: 400, growth: 350 }),
  makeRepo('delta', 'four', { stars: 2100, starsToday: 70, growth: 30, isHistorical: true })
];

// ---------------------------------------------------------------------------
// Normal path: new entrants + rank movement, results match utils item-for-item
// ---------------------------------------------------------------------------

test('normal path: comparison and insights match utils functions exactly', () => {
  const maxRepos = 25;
  const report = auditSnapshot({
    currentRepos: CURRENT_REPOS,
    previousRepos: PREVIOUS_REPOS,
    maxRepos,
    historyDays: 7,
    runDate: new Date('2026-11-11T00:00:00.000Z')
  });

  const truncated = CURRENT_REPOS.slice(0, maxRepos);
  const expectedComparison = generateHistoricalComparison(truncated, PREVIOUS_REPOS);
  const expectedInsights = generateInsights(truncated);

  // Item-for-item equality with utils.generateHistoricalComparison
  assert.deepStrictEqual(report.newEntrants, expectedComparison.newEntrants);
  assert.deepStrictEqual(report.moversUp, expectedComparison.movers.up);
  assert.deepStrictEqual(report.moversDown, expectedComparison.movers.down);

  // Item-for-item equality with utils.generateInsights
  assert.deepStrictEqual(report.risingStar, expectedInsights.risingStar);
  assert.deepStrictEqual(report.topLanguages, expectedInsights.topLanguages);

  // Sanity: the fixture really contains a new entrant and rank movement
  assert.ok(report.newEntrants.some(r => r.owner === 'epsilon' && r.name === 'five'));
  assert.ok(report.moversUp.some(m => m.key === 'gamma/three'));
  assert.ok(report.moversDown.some(m => m.key === 'alpha/one'));

  // Counts and checks
  assert.equal(report.totalCount, CURRENT_REPOS.length);
  assert.equal(report.truncatedCount, Math.min(CURRENT_REPOS.length, maxRepos));
  assert.equal(report.hasBaseline, true);
  assert.deepStrictEqual(report.duplicates, []);
  assert.deepStrictEqual(report.invalidItems, []);
  assert.ok(report.checks.every(c => c.passed), 'all checks should pass on clean input');

  // Output must be JSON serializable
  assert.doesNotThrow(() => JSON.stringify(report));
});

test('normal path: truncation count respects maxRepos', () => {
  const report = auditSnapshot({
    currentRepos: CURRENT_REPOS,
    previousRepos: PREVIOUS_REPOS,
    maxRepos: 3,
    historyDays: 7,
    runDate: '2026-11-11'
  });

  assert.equal(report.totalCount, CURRENT_REPOS.length);
  assert.equal(report.truncatedCount, 3);

  const truncated = CURRENT_REPOS.slice(0, 3);
  const expectedInsights = generateInsights(truncated);
  assert.deepStrictEqual(report.risingStar, expectedInsights.risingStar);
  assert.deepStrictEqual(report.topLanguages, expectedInsights.topLanguages);
});

// ---------------------------------------------------------------------------
// Negative path: duplicates + non-numeric stars reported, no throw
// ---------------------------------------------------------------------------

test('negative path: duplicates and invalid items are reported without throwing', () => {
  const dirtyRepos = [
    makeRepo('alpha', 'one'),
    makeRepo('alpha', 'one', { stars: 9999 }),          // duplicate owner/name
    makeRepo('beta', 'two', { stars: 'lots' }),          // stars not a number
    { language: 'Go', stars: 100, starsToday: 5, growth: 5 }, // missing owner & name
    makeRepo('gamma', 'three')
  ];

  let report;
  assert.doesNotThrow(() => {
    report = auditSnapshot({
      currentRepos: dirtyRepos,
      previousRepos: PREVIOUS_REPOS,
      maxRepos: 25,
      historyDays: 7,
      runDate: '2026-11-11'
    });
  });

  // Duplicates reported
  assert.equal(report.duplicates.length, 1);
  assert.equal(report.duplicates[0].key, 'alpha/one');
  assert.equal(report.duplicates[0].count, 2);
  assert.deepStrictEqual(report.duplicates[0].indices, [0, 1]);

  // Invalid items reported with readable reasons
  assert.equal(report.invalidItems.length, 2);
  const starsInvalid = report.invalidItems.find(i => i.index === 2);
  assert.ok(starsInvalid.reasons.some(r => r.includes('stars')));
  const missingIdentity = report.invalidItems.find(i => i.index === 3);
  assert.ok(missingIdentity.reasons.some(r => r.includes('owner')));
  assert.ok(missingIdentity.reasons.some(r => r.includes('name')));

  // Data-quality checks fail with readable reasons
  const dupCheck = report.checks.find(c => c.name === 'data-quality-no-duplicates');
  const invalidCheck = report.checks.find(c => c.name === 'data-quality-no-invalid-items');
  assert.equal(dupCheck.passed, false);
  assert.equal(dupCheck.status, 'failed');
  assert.ok(typeof dupCheck.reason === 'string' && dupCheck.reason.length > 0);
  assert.equal(invalidCheck.passed, false);
  assert.ok(typeof invalidCheck.reason === 'string' && invalidCheck.reason.length > 0);

  // Input arrays must not be mutated
  assert.equal(dirtyRepos.length, 5);
  assert.equal(dirtyRepos[1].stars, 9999);

  assert.doesNotThrow(() => JSON.stringify(report));
});

// ---------------------------------------------------------------------------
// Edge paths: null baseline, empty repos, historyDays = 0
// ---------------------------------------------------------------------------

test('edge path: null previous snapshot marks comparison checks as no-baseline, not failed', () => {
  const report = auditSnapshot({
    currentRepos: CURRENT_REPOS,
    previousRepos: null,
    maxRepos: 25,
    historyDays: 7,
    runDate: '2026-11-11'
  });

  assert.equal(report.hasBaseline, false);
  assert.equal(report.newEntrants, null);
  assert.equal(report.moversUp, null);
  assert.equal(report.moversDown, null);

  const baselineCheck = report.checks.find(c => c.name === 'historical-comparison-baseline');
  const movementCheck = report.checks.find(c => c.name === 'rank-movement-computed');
  assert.equal(baselineCheck.status, 'no-baseline');
  assert.equal(baselineCheck.passed, true, 'no-baseline is not a failure');
  assert.equal(movementCheck.status, 'no-baseline');

  // Insights still computed on current data
  assert.ok(report.risingStar);
  assert.ok(Array.isArray(report.topLanguages));

  assert.doesNotThrow(() => JSON.stringify(report));
});

test('edge path: empty repos array returns a readable report without throwing', () => {
  let report;
  assert.doesNotThrow(() => {
    report = auditSnapshot({
      currentRepos: [],
      previousRepos: [],
      maxRepos: 25,
      historyDays: 7,
      runDate: '2026-11-11'
    });
  });

  assert.equal(report.totalCount, 0);
  assert.equal(report.truncatedCount, 0);
  assert.deepStrictEqual(report.duplicates, []);
  assert.deepStrictEqual(report.invalidItems, []);
  assert.deepStrictEqual(report.newEntrants, []);
  assert.deepStrictEqual(report.moversUp, []);
  assert.deepStrictEqual(report.moversDown, []);

  // Matches utils on the same empty input
  const expectedInsights = generateInsights([]);
  assert.deepStrictEqual(report.risingStar, expectedInsights.risingStar);
  assert.deepStrictEqual(report.topLanguages, expectedInsights.topLanguages);

  assert.doesNotThrow(() => JSON.stringify(report));
});

test('edge path: historyDays of 0 fails the history retention check readably', () => {
  const report = auditSnapshot({
    currentRepos: CURRENT_REPOS,
    previousRepos: PREVIOUS_REPOS,
    maxRepos: 25,
    historyDays: 0,
    runDate: '2026-11-11'
  });

  const historyCheck = report.checks.find(c => c.name === 'history-retention-days-valid');
  assert.equal(historyCheck.passed, false);
  assert.equal(historyCheck.status, 'failed');
  assert.ok(typeof historyCheck.reason === 'string' && historyCheck.reason.includes('historyDays'));

  // Everything else still computed normally
  assert.equal(report.totalCount, CURRENT_REPOS.length);
  assert.ok(Array.isArray(report.newEntrants));

  assert.doesNotThrow(() => JSON.stringify(report));
});
