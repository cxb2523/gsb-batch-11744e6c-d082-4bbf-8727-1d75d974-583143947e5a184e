import * as errors from '../../src/errors.ts';
import type { ScrapflyClient } from '../../src/client.ts';
import { CrawlerConfig } from '../../src/crawlerconfig.ts';
import { CrawlerArtifact, CrawlerStatus } from '../../src/crawlerresult.ts';
import type { CrawlerArtifactType } from '../../src/crawlerresult.ts';
import { Crawl } from '../../src/crawl.ts';
import { assert, assertEquals, assertRejects, assertStrictEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// ----- fakes ---------------------------------------------------------------

function statusData(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    crawler_uuid: 'fake-uuid',
    status: 'RUNNING',
    is_finished: false,
    is_success: null,
    state: {
      urls_visited: 0,
      urls_extracted: 0,
      urls_failed: 0,
      urls_skipped: 0,
      urls_to_crawl: 10,
      api_credit_used: 0,
      duration: 0,
      start_time: null,
      stop_time: null,
      stop_reason: null,
    },
    search: null,
    refresh: null,
    ...overrides,
  };
}

function running(): CrawlerStatus {
  return new CrawlerStatus(statusData());
}

function done(): CrawlerStatus {
  return new CrawlerStatus(
    statusData({ status: 'DONE', is_finished: true, is_success: true, state: { ...statusData().state, stop_time: 1 } }),
  );
}

function failed(): CrawlerStatus {
  return new CrawlerStatus(
    statusData({
      status: 'DONE',
      is_finished: true,
      is_success: false,
      state: { ...statusData().state, stop_reason: 'PAGE_LIMIT_REACHED', stop_time: 1 },
    }),
  );
}

function cancelled(): CrawlerStatus {
  return new CrawlerStatus(
    statusData({
      status: 'CANCELLED',
      is_finished: true,
      is_success: false,
      state: { ...statusData().state, stop_reason: 'CANCELLED_BY_USER', stop_time: 1 },
    }),
  );
}

/**
 * Minimal stand-in for ScrapflyClient — only the methods Crawl actually calls.
 * `statusQueue` is shifted on every crawlStatus call; once empty, `fallback`
 * (default: RUNNING) is returned forever.
 */
class FakeClient {
  statusQueue: CrawlerStatus[] = [];
  fallback: () => CrawlerStatus = running;
  statusCalls = 0;
  artifactCalls: Record<string, number> = { warc: 0, har: 0 };
  artifactDelayMs = 0;

  async crawl(_config: CrawlerConfig): Promise<{ crawler_uuid: string; status: string }> {
    return { crawler_uuid: 'fake-uuid', status: 'PENDING' };
  }

  async crawlStatus(_uuid: string): Promise<CrawlerStatus> {
    this.statusCalls++;
    const next = this.statusQueue.shift();
    return next ?? this.fallback();
  }

  async crawlArtifact(_uuid: string, type: CrawlerArtifactType = 'warc'): Promise<CrawlerArtifact> {
    this.artifactCalls[type]++;
    if (this.artifactDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.artifactDelayMs));
    }
    // Distinct payload per download so tests can tell a refresh apart.
    return new CrawlerArtifact(type, new Uint8Array([this.artifactCalls[type]]));
  }
}

function makeCrawl(client: FakeClient): Crawl {
  return new Crawl(client as unknown as ScrapflyClient, new CrawlerConfig({ url: 'https://example.com' }));
}

async function startedCrawl(client: FakeClient): Promise<Crawl> {
  const crawl = makeCrawl(client);
  await crawl.start();
  return crawl;
}

// ----- waitResumable ---------------------------------------------------------

Deno.test('waitResumable: completes and reports polls, onPoll fires per poll', async () => {
  const client = new FakeClient();
  client.statusQueue = [running(), running(), done()];
  const crawl = await startedCrawl(client);

  const seen: Array<[string, number]> = [];
  const result = await crawl.waitResumable({
    pollInterval: 0,
    onPoll: (status, polls) => seen.push([status.status, polls]),
  });

  assertEquals(result.completed, true);
  assertEquals(result.reason, 'completed');
  assertEquals(result.polls, 3);
  assertEquals(result.lastStatus?.status, 'DONE');
  assertEquals(seen, [['RUNNING', 1], ['RUNNING', 2], ['DONE', 3]]);
  assertEquals(client.statusCalls, 3);
});

Deno.test('waitResumable: maxPolls truncates without throwing, next call resumes the count', async () => {
  const client = new FakeClient();
  client.statusQueue = [running(), running(), running(), done()];
  const crawl = await startedCrawl(client);

  const first = await crawl.waitResumable({ pollInterval: 0, maxPolls: 2 });
  assertEquals(first.completed, false);
  assertEquals(first.reason, 'max_polls');
  assertEquals(first.polls, 2);
  assertEquals(first.lastStatus?.status, 'RUNNING');

  // Same budget again: the cumulative counter is already exhausted, so no new poll.
  const again = await crawl.waitResumable({ pollInterval: 0, maxPolls: 2 });
  assertEquals(again.reason, 'max_polls');
  assertEquals(again.polls, 2);
  assertEquals(again.lastStatus, undefined);
  assertEquals(client.statusCalls, 2);

  // Raise the budget: polling resumes where it stopped and completes.
  const second = await crawl.waitResumable({ pollInterval: 0, maxPolls: 4 });
  assertEquals(second.completed, true);
  assertEquals(second.reason, 'completed');
  assertEquals(second.polls, 4);
  assertEquals(client.statusCalls, 4);
});

Deno.test('waitResumable: maxWait truncates without throwing', async () => {
  const client = new FakeClient(); // fallback: RUNNING forever
  const crawl = await startedCrawl(client);

  const result = await crawl.waitResumable({ pollInterval: 0.001, maxWait: 0 });
  assertEquals(result.completed, false);
  assertEquals(result.reason, 'max_wait');
  assertEquals(result.polls, 1);
  assertEquals(result.lastStatus?.status, 'RUNNING');
});

Deno.test('waitResumable: failed crawl throws ScrapflyCrawlerError code FAILED', async () => {
  const client = new FakeClient();
  client.statusQueue = [running(), failed()];
  const crawl = await startedCrawl(client);

  const err = await assertRejects(
    () => crawl.waitResumable({ pollInterval: 0 }),
    errors.ScrapflyCrawlerError,
  );
  assertEquals(err.args.code, 'FAILED');
});

Deno.test('waitResumable: cancelled crawl throws code CANCELLED unless allowCancelled', async () => {
  const client = new FakeClient();
  client.statusQueue = [cancelled()];
  const crawl = await startedCrawl(client);

  const err = await assertRejects(
    () => crawl.waitResumable({ pollInterval: 0 }),
    errors.ScrapflyCrawlerError,
  );
  assertEquals(err.args.code, 'CANCELLED');

  const client2 = new FakeClient();
  client2.statusQueue = [cancelled()];
  const crawl2 = await startedCrawl(client2);
  const result = await crawl2.waitResumable({ pollInterval: 0, allowCancelled: true });
  assertEquals(result.completed, false);
  assertEquals(result.reason, 'cancelled');
  assertEquals(result.polls, 1);
  assertEquals(result.lastStatus?.status, 'CANCELLED');
});

Deno.test('waitResumable: throws NOT_STARTED before start()', async () => {
  const client = new FakeClient();
  const crawl = makeCrawl(client);

  const err = await assertRejects(
    () => crawl.waitResumable({ pollInterval: 0 }),
    errors.ScrapflyCrawlerError,
  );
  assertEquals(err.args.code, 'NOT_STARTED');
  assertEquals(client.statusCalls, 0);
});

Deno.test('waitResumable: rejects a non-positive-integer maxPolls', async () => {
  const client = new FakeClient();
  const crawl = await startedCrawl(client);

  await assertRejects(() => crawl.waitResumable({ pollInterval: 0, maxPolls: 0 }), errors.ScrapflyCrawlerError);
  await assertRejects(() => crawl.waitResumable({ pollInterval: 0, maxPolls: 1.5 }), errors.ScrapflyCrawlerError);
  assertEquals(client.statusCalls, 0);
});

// ----- artifact caching ------------------------------------------------------

Deno.test('warc/har: concurrent calls trigger a single crawlArtifact download', async () => {
  const client = new FakeClient();
  client.artifactDelayMs = 20; // widen the race window
  const crawl = await startedCrawl(client);

  const [a, b, c] = await Promise.all([crawl.warc(), crawl.warc(), crawl.warc()]);
  assertEquals(client.artifactCalls.warc, 1);
  assertStrictEquals(a, b);
  assertStrictEquals(b, c);

  const [h1, h2] = await Promise.all([crawl.har(), crawl.har()]);
  assertEquals(client.artifactCalls.har, 1);
  assertStrictEquals(h1, h2);

  // Cached: no further downloads.
  await crawl.warc();
  await crawl.har();
  assertEquals(client.artifactCalls.warc, 1);
  assertEquals(client.artifactCalls.har, 1);
});

Deno.test('warc/har: refresh replaces the cached artifact', async () => {
  const client = new FakeClient();
  const crawl = await startedCrawl(client);

  const first = await crawl.warc();
  const refreshed = await crawl.warc({ refresh: true });
  assertEquals(client.artifactCalls.warc, 2);
  assert(first !== refreshed, 'refresh must return a newly downloaded artifact');
  assertEquals(Array.from(first.data), [1]);
  assertEquals(Array.from(refreshed.data), [2]);

  // The cache now holds the refreshed artifact.
  const after = await crawl.warc();
  assertStrictEquals(after, refreshed);
  assertEquals(client.artifactCalls.warc, 2);

  const harFirst = await crawl.har();
  const harRefreshed = await crawl.har({ refresh: true });
  assertEquals(client.artifactCalls.har, 2);
  assert(harFirst !== harRefreshed);
});

Deno.test('warc: concurrent refresh calls also share one download', async () => {
  const client = new FakeClient();
  client.artifactDelayMs = 20;
  const crawl = await startedCrawl(client);

  await crawl.warc();
  const [r1, r2] = await Promise.all([crawl.warc({ refresh: true }), crawl.warc({ refresh: true })]);
  assertEquals(client.artifactCalls.warc, 2);
  assertStrictEquals(r1, r2);
});
