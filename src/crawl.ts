import * as errors from './errors.ts';
import { log } from './logger.ts';
import type { ScrapflyClient } from './client.ts';
import type { CrawlerConfig, CrawlerContentFormat } from './crawlerconfig.ts';
import type {
  CrawlerArtifact,
  CrawlerArtifactType,
  CrawlerContents,
  CrawlerExtractResponse,
  CrawlerPromptAnswer,
  CrawlerPromptEvent,
  CrawlerRefreshEntry,
  CrawlerRefreshState,
  CrawlerSearchMode,
  CrawlerSearchResponse,
  CrawlerStatus,
  CrawlerUrls,
} from './crawlerresult.ts';

/** Terminal reason reported by {@link Crawl.waitResumable}. */
export type CrawlWaitReason = 'completed' | 'cancelled' | 'max_polls' | 'max_wait';

/**
 * Outcome of a {@link Crawl.waitResumable} call.
 *
 * Unlike {@link Crawl.wait}, reaching the poll/wait budget is not an error —
 * it is reported here so the caller can persist progress and resume later by
 * calling `waitResumable` again on the same instance.
 */
export interface CrawlWaitResult {
  /** True only when the crawl reached a successful terminal state. */
  completed: boolean;
  /**
   * Total number of status polls performed by this instance, cumulative
   * across all `waitResumable` calls (the counter is never reset).
   */
  polls: number;
  /** Last status observed during this call, or undefined if no poll ran. */
  lastStatus?: CrawlerStatus;
  /** Why the call returned. */
  reason: CrawlWaitReason;
}

/**
 * High-level fluent wrapper around a single crawler job lifecycle.
 *
 * Mirrors the Python SDK's `Crawl` class. Internally calls into `ScrapflyClient`'s
 * lower-level crawler methods, but adds:
 *
 * - polling helpers (`wait()`)
 * - per-instance caching of the most recent status and downloaded artifacts
 * - convenience methods that pre-fill the crawler UUID
 *
 * Use this when you want a simple `start → wait → read` flow. Use the lower-level
 * `client.crawl*` methods directly if you need finer control (e.g. polling at
 * irregular intervals or reusing a status response across calls).
 *
 * @example
 * ```ts
 * const crawl = new Crawl(client, new CrawlerConfig({
 *   url: 'https://web-scraping.dev/products',
 *   page_limit: 10,
 *   content_formats: ['markdown'],
 * }));
 *
 * await crawl.start();
 * await crawl.wait({ pollInterval: 2 });
 *
 * for (const entry of (await crawl.urls({ status: 'visited' })).urls) {
 *   const md = await crawl.read(entry.url, 'markdown');
 *   console.log(entry.url, md?.length);
 * }
 * ```
 */
export class Crawl {
  private _uuid?: string;
  private _status?: CrawlerStatus;
  private _pollCount = 0;
  private readonly _artifactCache: Map<CrawlerArtifactType, Promise<CrawlerArtifact>> = new Map();
  private readonly _artifactInFlight: Map<CrawlerArtifactType, Promise<CrawlerArtifact>> = new Map();

  /**
   * @param client Configured {@link ScrapflyClient} that performs the HTTP calls.
   * @param config Crawler configuration to submit on {@link Crawl.start}.
   */
  constructor(private readonly client: ScrapflyClient, private readonly config: CrawlerConfig) {}

  /** The crawler UUID returned by the API after `start()`, or undefined before. */
  get uuid(): string | undefined {
    return this._uuid;
  }

  /** True once `start()` has been called and the crawler has a UUID. */
  get started(): boolean {
    return this._uuid !== undefined;
  }

  /**
   * Schedule the crawl on the Scrapfly API.
   *
   * Returns `this` for chaining. Throws `ScrapflyCrawlerError` if `start()` has
   * already been called on this instance.
   */
  async start(): Promise<this> {
    if (this._uuid) {
      throw new errors.ScrapflyCrawlerError('Crawl already started', { code: 'ALREADY_STARTED' });
    }
    const response = await this.client.crawl(this.config);
    this._uuid = response.crawler_uuid;
    log.debug('crawl started', { crawler_uuid: this._uuid });
    return this;
  }

  private requireUuid(): string {
    if (!this._uuid) {
      throw new errors.ScrapflyCrawlerError(
        'Crawl has not been started yet. Call start() first.',
        { code: 'NOT_STARTED' },
      );
    }
    return this._uuid;
  }

  /**
   * Fetch (or return cached) status for this crawl.
   *
   * @param refresh — when true (default), always re-query the API. When false,
   *   return the cached status from the previous call (or fetch fresh if none).
   */
  async status(refresh = true): Promise<CrawlerStatus> {
    const uuid = this.requireUuid();
    if (refresh || !this._status) {
      this._status = await this.client.crawlStatus(uuid);
    }
    return this._status;
  }

  /**
   * Block until the crawler reaches a terminal state, polling status periodically.
   *
   * Returns `this` for chaining when the job completes successfully. Throws
   * `ScrapflyCrawlerError` if the job fails, is cancelled, or `maxWait` is exceeded.
   *
   * @param opts.pollInterval — seconds between polls (default 5)
   * @param opts.maxWait — maximum total seconds to wait (default: no limit)
   * @param opts.verbose — log progress on every poll
   * @param opts.allowCancelled — when `true`, return normally if the crawler
   *   reaches CANCELLED instead of throwing. Useful for the cancel-then-wait
   *   pattern where the caller already triggered the cancellation. Defaults
   *   to `false`, preserving the prior throw-on-cancel behavior for callers
   *   that observe external interrupts.
   */
  async wait(opts?: {
    pollInterval?: number;
    maxWait?: number;
    verbose?: boolean;
    allowCancelled?: boolean;
  }): Promise<this> {
    const pollInterval = opts?.pollInterval ?? 5;
    const maxWait = opts?.maxWait;
    const verbose = opts?.verbose ?? false;
    const allowCancelled = opts?.allowCancelled ?? false;
    const start = Date.now();

    while (true) {
      const status = await this.status(true);
      if (verbose) {
        log.info(
          `crawl ${this._uuid} status=${status.status} visited=${status.state.urls_visited}/${status.state.urls_extracted}`,
        );
      }
      if (status.is_finished || status.status === 'CANCELLED') {
        if (status.isFailed) {
          throw new errors.ScrapflyCrawlerError(
            `Crawl ${this._uuid} failed: ${status.state.stop_reason ?? 'unknown reason'}`,
            { code: 'FAILED', stop_reason: status.state.stop_reason, status },
          );
        }
        if (status.isCancelled) {
          if (allowCancelled) {
            if (verbose) {
              log.info(`crawl ${this._uuid} was cancelled (allowCancelled=true)`);
            }
            return this;
          }
          throw new errors.ScrapflyCrawlerError(
            `Crawl ${this._uuid} was cancelled (reason: ${status.state.stop_reason ?? 'unknown'})`,
            { code: 'CANCELLED', stop_reason: status.state.stop_reason, status },
          );
        }
        // status.isComplete
        return this;
      }

      if (maxWait !== undefined) {
        const elapsedSeconds = (Date.now() - start) / 1000;
        if (elapsedSeconds + pollInterval > maxWait) {
          throw new errors.ScrapflyCrawlerError(
            `Timed out waiting for crawl ${this._uuid} after ${maxWait}s`,
            { code: 'TIMEOUT', status },
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));
    }
  }

  /**
   * Poll until a terminal state like {@link Crawl.wait}, but with a resumable,
   * budgeted contract: reaching `maxPolls` or `maxWait` returns a
   * {@link CrawlWaitResult} instead of throwing, and calling `waitResumable`
   * again on the same instance continues where the previous call stopped —
   * the poll counter is cumulative and never reset.
   *
   * Failure semantics match `wait()`: a failed crawl throws
   * `ScrapflyCrawlerError` with code `FAILED`, and a cancelled crawl throws
   * code `CANCELLED` unless `allowCancelled` is true (then it returns with
   * reason `'cancelled'`). Calling before `start()` throws code
   * `NOT_STARTED`.
   *
   * @param opts.pollInterval — seconds between polls (default 5)
   * @param opts.maxWait — maximum seconds to wait in this call (default: no limit)
   * @param opts.verbose — log progress on every poll
   * @param opts.allowCancelled — return reason `'cancelled'` instead of
   *   throwing when the crawl was cancelled
   * @param opts.maxPolls — maximum total polls for this instance (positive
   *   integer, cumulative across calls); when reached, returns with reason
   *   `'max_polls'`
   * @param opts.onPoll — invoked after every poll with the latest status and
   *   the cumulative poll count
   */
  async waitResumable(opts?: {
    pollInterval?: number;
    maxWait?: number;
    verbose?: boolean;
    allowCancelled?: boolean;
    maxPolls?: number;
    onPoll?: (status: CrawlerStatus, polls: number) => void;
  }): Promise<CrawlWaitResult> {
    this.requireUuid();
    const pollInterval = opts?.pollInterval ?? 5;
    const maxWait = opts?.maxWait;
    const verbose = opts?.verbose ?? false;
    const allowCancelled = opts?.allowCancelled ?? false;
    const maxPolls = opts?.maxPolls;
    const onPoll = opts?.onPoll;
    if (maxPolls !== undefined && (!Number.isInteger(maxPolls) || maxPolls < 1)) {
      throw new errors.ScrapflyCrawlerError('maxPolls must be a positive integer', {
        code: 'INVALID_OPTIONS',
      });
    }
    const start = Date.now();
    let lastStatus: CrawlerStatus | undefined;

    while (true) {
      if (maxPolls !== undefined && this._pollCount >= maxPolls) {
        return { completed: false, polls: this._pollCount, lastStatus, reason: 'max_polls' };
      }

      const status = await this.status(true);
      this._pollCount += 1;
      lastStatus = status;
      if (verbose) {
        log.info(
          `crawl ${this._uuid} status=${status.status} visited=${status.state.urls_visited}/${status.state.urls_extracted}`,
        );
      }
      onPoll?.(status, this._pollCount);

      if (status.is_finished || status.status === 'CANCELLED') {
        if (status.isFailed) {
          throw new errors.ScrapflyCrawlerError(
            `Crawl ${this._uuid} failed: ${status.state.stop_reason ?? 'unknown reason'}`,
            { code: 'FAILED', stop_reason: status.state.stop_reason, status },
          );
        }
        if (status.isCancelled) {
          if (!allowCancelled) {
            throw new errors.ScrapflyCrawlerError(
              `Crawl ${this._uuid} was cancelled (reason: ${status.state.stop_reason ?? 'unknown'})`,
              { code: 'CANCELLED', stop_reason: status.state.stop_reason, status },
            );
          }
          if (verbose) {
            log.info(`crawl ${this._uuid} was cancelled (allowCancelled=true)`);
          }
          return { completed: false, polls: this._pollCount, lastStatus, reason: 'cancelled' };
        }
        // status.isComplete
        return { completed: true, polls: this._pollCount, lastStatus, reason: 'completed' };
      }

      if (maxWait !== undefined) {
        const elapsedSeconds = (Date.now() - start) / 1000;
        if (elapsedSeconds + pollInterval > maxWait) {
          return { completed: false, polls: this._pollCount, lastStatus, reason: 'max_wait' };
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));
    }
  }

  /** Cancel the crawl. Returns `true` on success. */
  async cancel(): Promise<boolean> {
    const uuid = this.requireUuid();
    return await this.client.crawlCancel(uuid);
  }

  /**
   * List crawled URLs (paginated, optionally filtered by status).
   *
   * Convenience wrapper around `client.crawlUrls(uuid, opts)`. **New endpoint** —
   * not available in the Python SDK as of 0.8.27.
   */
  async urls(opts?: {
    status?: 'visited' | 'pending' | 'failed';
    page?: number;
    per_page?: number;
  }): Promise<CrawlerUrls> {
    const uuid = this.requireUuid();
    return await this.client.crawlUrls(uuid, opts);
  }

  /**
   * Search this crawl's index.
   *
   * Sugar over `client.crawlSearch([uuid], ...)`. The cross-crawl call is the
   * real endpoint; both share its implementation so single and multi-crawl
   * search cannot drift.
   *
   * Requires the crawl to have been started with `search: true` and its index
   * to have reached `READY`/`PARTIAL`; poll `CrawlerStatus.search` or
   * subscribe to the `crawler_search_ready` webhook. An index that is not
   * ready yet is reported in the response's `skipped` list, not as an error.
   */
  async search(
    query: string,
    opts?: { limit?: number; mode?: CrawlerSearchMode; filters?: Record<string, any>; cursor?: string },
  ): Promise<CrawlerSearchResponse> {
    const uuid = this.requireUuid();
    return await this.client.crawlSearch([uuid], query, opts);
  }

  /**
   * Ask a question answered from this crawl's content.
   *
   * Sugar over `client.crawlPrompt([uuid], ...)`; yields the same frames.
   */
  prompt(
    prompt: string,
    opts?: {
      search?: { limit?: number; mode?: CrawlerSearchMode; filters?: Record<string, any> };
      model?: string;
    },
  ): AsyncGenerator<CrawlerPromptEvent, void, undefined> {
    const uuid = this.requireUuid();
    return this.client.crawlPrompt([uuid], prompt, opts);
  }

  /**
   * Ask a question answered from this crawl's content, the whole answer at once.
   *
   * Sugar over `client.crawlPromptAnswer([uuid], ...)`.
   */
  async promptAnswer(
    prompt: string,
    opts?: {
      search?: { limit?: number; mode?: CrawlerSearchMode; filters?: Record<string, any> };
      model?: string;
    },
  ): Promise<CrawlerPromptAnswer> {
    const uuid = this.requireUuid();
    return this.client.crawlPromptAnswer([uuid], prompt, opts);
  }

  /**
   * Extract a structured object from this crawl's content, shaped by `schema`.
   *
   * Sugar over `client.crawlExtract([uuid], ...)`.
   */
  async extract<T = any>(
    prompt: string,
    schema: Record<string, any>,
    opts?: { search?: { limit?: number; mode?: CrawlerSearchMode; filters?: Record<string, any> } },
  ): Promise<CrawlerExtractResponse<T>> {
    const uuid = this.requireUuid();
    return this.client.crawlExtract<T>([uuid], prompt, schema, opts);
  }

  /**
   * Re-scrape this crawl's URLs in place, right now.
   *
   * Sugar over `client.crawlRefreshNow(uuid)`. The crawl keeps its uuid, its
   * artifacts and its search index; only pages whose content changed are
   * re-indexed and pages that disappeared are dropped.
   */
  async refreshNow(): Promise<CrawlerRefreshState> {
    const uuid = this.requireUuid();
    return await this.client.crawlRefreshNow(uuid);
  }

  /**
   * Change this crawl's refresh schedule.
   *
   * Sugar over `client.crawlRefreshSettings(uuid, ...)`; only what is passed
   * is changed.
   */
  async refreshSettings(settings: { enabled?: boolean; interval_seconds?: number }): Promise<CrawlerRefreshState> {
    const uuid = this.requireUuid();
    return await this.client.crawlRefreshSettings(uuid, settings);
  }

  /**
   * Read this crawl's refresh timeline, newest last.
   *
   * Sugar over `client.crawlRefreshHistory(uuid, ...)`.
   */
  async refreshHistory(opts?: { limit?: number }): Promise<CrawlerRefreshEntry[]> {
    const uuid = this.requireUuid();
    return await this.client.crawlRefreshHistory(uuid, opts);
  }

  /**
   * Read raw content for a single crawled URL using `plain=true` mode.
   *
   * Returns `null` if the URL has no content for that format. Throws
   * `ScrapflyCrawlerError` for any non-404 error. **New mode** — not available in
   * the Python SDK as of 0.8.27.
   */
  async read(url: string, format: CrawlerContentFormat = 'html'): Promise<string | null> {
    const uuid = this.requireUuid();
    try {
      const result = await this.client.crawlContents(uuid, { url, format, plain: true });
      // crawlContents in plain mode always returns string
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (e) {
      // Treat 404 as "no content for this URL" rather than re-throwing
      if (e instanceof errors.ScrapflyError && (e.args?.http_status_code === 404)) {
        return null;
      }
      throw e;
    }
  }

  /**
   * Batch-read content for multiple URLs in one round-trip.
   *
   * Convenience wrapper around `client.crawlContentsBatch`. Limited to 100 URLs.
   */
  async readBatch(
    urls: string[],
    formats: CrawlerContentFormat[] = ['html'],
  ): Promise<Record<string, Record<string, string>>> {
    const uuid = this.requireUuid();
    return await this.client.crawlContentsBatch(uuid, urls, formats);
  }

  /**
   * Download an artifact, caching the in-flight/resolved promise so
   * concurrent callers share a single `crawlArtifact` request.
   *
   * With `refresh: true` the cached entry is discarded and replaced by a
   * fresh download — unless one is already in flight, in which case the
   * caller joins it. Failed downloads are evicted so a later call can retry.
   */
  private artifact(type: CrawlerArtifactType, refresh: boolean): Promise<CrawlerArtifact> {
    const uuid = this.requireUuid();
    if (!refresh) {
      const cached = this._artifactCache.get(type);
      if (cached) return cached;
    }
    const inFlight = this._artifactInFlight.get(type);
    if (inFlight) return inFlight;
    const pending = this.client.crawlArtifact(uuid, type);
    this._artifactInFlight.set(type, pending);
    this._artifactCache.set(type, pending);
    const settle = () => {
      // Only evict entries that still point at this exact promise — a
      // refresh may already have replaced them.
      if (this._artifactInFlight.get(type) === pending) {
        this._artifactInFlight.delete(type);
      }
    };
    pending.then(settle, () => {
      settle();
      // Don't cache failures: a later call should retry the download.
      if (this._artifactCache.get(type) === pending) {
        this._artifactCache.delete(type);
      }
    });
    return pending;
  }

  /**
   * Download the WARC artifact (cached after first call).
   *
   * Concurrent calls share a single download. Pass `{ refresh: true }` to
   * discard the cached artifact and replace it with a fresh download.
   */
  warc(opts?: { refresh?: boolean }): Promise<CrawlerArtifact> {
    return this.artifact('warc', opts?.refresh ?? false);
  }

  /**
   * Download the HAR artifact (cached after first call).
   *
   * Concurrent calls share a single download. Pass `{ refresh: true }` to
   * discard the cached artifact and replace it with a fresh download.
   */
  har(opts?: { refresh?: boolean }): Promise<CrawlerArtifact> {
    return this.artifact('har', opts?.refresh ?? false);
  }
}
