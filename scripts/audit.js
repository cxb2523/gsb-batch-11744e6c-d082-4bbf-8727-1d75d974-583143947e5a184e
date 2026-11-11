/**
 * Trend Snapshot Audit
 *
 * Pure-function module that audits a single trending-repos snapshot run.
 * Given plain data (current repos, previous snapshot repos, config values,
 * run date) it produces a structured, JSON-serializable audit report.
 *
 * Guarantees:
 *  - No file system access, no network requests, no side effects.
 *  - Input arrays/objects are never mutated.
 *  - Comparison and insights results are computed by delegating to
 *    utils.generateHistoricalComparison / utils.generateInsights on the
 *    same (truncated) input, so they match update.js behavior item-for-item.
 */

import { generateHistoricalComparison, generateInsights } from './utils.js';

/**
 * Normalize the run date into an ISO string (or null if unusable).
 */
function normalizeRunDate(runDate) {
  if (runDate instanceof Date && !isNaN(runDate.getTime())) {
    return runDate.toISOString();
  }
  if (typeof runDate === 'string' && runDate.length > 0) {
    return runDate;
  }
  return null;
}

/**
 * Find duplicate repos keyed by `owner/name`.
 * Only items that have both owner and name participate in dedup detection.
 */
function findDuplicates(repos) {
  const seen = new Map();
  repos.forEach((repo, index) => {
    if (!repo || !repo.owner || !repo.name) return;
    const key = `${repo.owner}/${repo.name}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(index);
  });

  const duplicates = [];
  for (const [key, indices] of seen) {
    if (indices.length > 1) {
      duplicates.push({ key, count: indices.length, indices: [...indices] });
    }
  }
  return duplicates;
}

/**
 * Find invalid repos: missing owner, missing name, or non-numeric stars.
 */
function findInvalidItems(repos) {
  const invalid = [];
  repos.forEach((repo, index) => {
    const reasons = [];
    if (!repo || typeof repo !== 'object') {
      invalid.push({ index, repo: null, reasons: ['item is not an object'] });
      return;
    }
    if (!repo.owner) reasons.push('missing owner');
    if (!repo.name) reasons.push('missing name');
    if (typeof repo.stars !== 'number' || isNaN(repo.stars)) {
      reasons.push('stars is not a number');
    }
    if (reasons.length > 0) {
      invalid.push({
        index,
        key: repo.owner && repo.name ? `${repo.owner}/${repo.name}` : null,
        reasons
      });
    }
  });
  return invalid;
}

/**
 * Audit a trending snapshot run.
 *
 * @param {object} input
 * @param {Array}  input.currentRepos   - repos collected this run (pre-truncation)
 * @param {Array|null} input.previousRepos - repos from the previous snapshot, or null
 * @param {number} input.maxRepos       - CONFIG.maxRepos
 * @param {number} input.historyDays    - CONFIG.historyDays
 * @param {Date|string} input.runDate   - date of this run
 * @returns {object} JSON-serializable audit report
 */
export function auditSnapshot(input = {}) {
  const {
    currentRepos = [],
    previousRepos = null,
    maxRepos,
    historyDays,
    runDate
  } = input;

  const repos = Array.isArray(currentRepos) ? currentRepos : [];
  const previous = Array.isArray(previousRepos) ? previousRepos : null;

  const totalCount = repos.length;
  const maxReposValid = Number.isInteger(maxRepos) && maxRepos > 0;
  const truncatedRepos = maxReposValid ? repos.slice(0, maxRepos) : [...repos];
  const truncatedCount = truncatedRepos.length;

  const duplicates = findDuplicates(repos);
  const invalidItems = findInvalidItems(repos);

  // Comparison & insights — delegated to utils on the same truncated input,
  // mirroring scripts/update.js. No baseline => comparison fields are null.
  let newEntrants = null;
  let moversUp = null;
  let moversDown = null;
  if (previous) {
    const comparison = generateHistoricalComparison(truncatedRepos, previous);
    newEntrants = comparison.newEntrants;
    moversUp = comparison.movers.up;
    moversDown = comparison.movers.down;
  }

  const insights = generateInsights(truncatedRepos);
  const risingStar = insights.risingStar;
  const topLanguages = insights.topLanguages;

  // Ordered check list. Each: { name, status, passed, reason? }
  // status: 'passed' | 'failed' | 'no-baseline'
  const checks = [];
  const addCheck = (name, status, reason) => {
    const check = { name, status, passed: status !== 'failed' };
    if (reason) check.reason = reason;
    checks.push(check);
  };

  // 1. Baseline availability for comparison-type checks
  if (previous) {
    addCheck('historical-comparison-baseline', 'passed');
  } else {
    addCheck(
      'historical-comparison-baseline',
      'no-baseline',
      'No previous snapshot available; comparison checks skipped (no baseline).'
    );
  }

  // 2. Rank-movement sanity (comparison-type check)
  if (previous) {
    addCheck('rank-movement-computed', 'passed');
  } else {
    addCheck(
      'rank-movement-computed',
      'no-baseline',
      'No previous snapshot available; rank movement cannot be computed (no baseline).'
    );
  }

  // 3. Data quality: duplicates
  if (duplicates.length === 0) {
    addCheck('data-quality-no-duplicates', 'passed');
  } else {
    addCheck(
      'data-quality-no-duplicates',
      'failed',
      `Found ${duplicates.length} duplicate owner/name key(s): ${duplicates.map(d => `${d.key} (x${d.count})`).join(', ')}`
    );
  }

  // 4. Data quality: invalid items
  if (invalidItems.length === 0) {
    addCheck('data-quality-no-invalid-items', 'passed');
  } else {
    addCheck(
      'data-quality-no-invalid-items',
      'failed',
      `Found ${invalidItems.length} invalid item(s): ${invalidItems.map(i => `index ${i.index} (${i.reasons.join('; ')})`).join(', ')}`
    );
  }

  // 5. Truncation within maxRepos
  if (!maxReposValid) {
    addCheck(
      'truncation-within-max-repos',
      'failed',
      `maxRepos (${String(maxRepos)}) is not a positive integer; truncation cannot be verified.`
    );
  } else if (truncatedCount <= maxRepos) {
    addCheck('truncation-within-max-repos', 'passed');
  } else {
    addCheck(
      'truncation-within-max-repos',
      'failed',
      `Truncated count ${truncatedCount} exceeds maxRepos ${maxRepos}.`
    );
  }

  // 6. History retention: historyDays must be a positive integer
  if (Number.isInteger(historyDays) && historyDays > 0) {
    addCheck('history-retention-days-valid', 'passed');
  } else {
    addCheck(
      'history-retention-days-valid',
      'failed',
      `historyDays (${String(historyDays)}) is not a positive integer; history retention policy is invalid.`
    );
  }

  return {
    runDate: normalizeRunDate(runDate),
    totalCount,
    truncatedCount,
    maxRepos: maxRepos === undefined ? null : maxRepos,
    historyDays: historyDays === undefined ? null : historyDays,
    hasBaseline: previous !== null,
    duplicates,
    invalidItems,
    newEntrants,
    moversUp,
    moversDown,
    risingStar,
    topLanguages,
    checks
  };
}

export default auditSnapshot;
