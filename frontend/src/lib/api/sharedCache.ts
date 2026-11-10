/**
 * A tiny read-through cache for data that belongs to a project rather than to a
 * screen: its statuses, members, labels, epics and sprints.
 *
 * Those five are the same for every ticket in a project and change rarely, but
 * each screen fetched its own copy. Opening the board read all five; clicking a
 * card made the ticket modal read the same five again; opening the create form
 * read them a third time. Ten tickets meant fifty requests for data that had
 * not changed.
 *
 * This sits inside the API clients, so call sites are unchanged - they still
 * call `workflowAPI.getStatuses(projectId)` and still get a promise. What
 * changes is that the second caller gets the first caller's answer.
 *
 * Two behaviours matter:
 *
 * - Concurrent callers share one request. The board and the modal asking at the
 *   same moment produce one round trip, not two, because the in-flight promise
 *   is handed to the second caller rather than a new request being started.
 * - A stored answer is reused until it expires or is invalidated. Writes
 *   invalidate explicitly (adding a member, renaming a status), and the TTL is
 *   the backstop for changes made elsewhere - another tab, another person - so
 *   a stale list corrects itself within seconds rather than persisting until
 *   reload.
 *
 * Each caller gets its own copy of the array, because a caller that sorts or
 * splices what it is given must not reach into everyone else's data.
 */

/** How long an answer stays usable. Short: this trades staleness for traffic. */
const DEFAULT_TTL_MS = 30_000;

interface Entry<T> {
  value?: T;
  storedAt: number;
  inflight?: Promise<T>;
}

export class SharedResource<T> {
  private entries = new Map<string, Entry<T>>();

  constructor(
    /** For debugging: shows up in the devtools timeline as the cache's name. */
    private readonly name: string,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  async get(key: string | number, load: () => Promise<T>): Promise<T> {
    const id = String(key);
    const entry = this.entries.get(id);
    const now = Date.now();

    if (entry?.inflight) return copy(await entry.inflight);
    if (entry && entry.value !== undefined && now - entry.storedAt < this.ttlMs) {
      return copy(entry.value);
    }

    const inflight = load();
    this.entries.set(id, { inflight, storedAt: now });
    try {
      const value = await inflight;
      this.entries.set(id, { value, storedAt: Date.now() });
      return copy(value);
    } catch (error) {
      // A failure is not an answer: drop the entry so the next caller retries
      // rather than waiting out a TTL on nothing.
      this.entries.delete(id);
      throw error;
    }
  }

  /** Forget one project's answer, or every project's. Called after a write. */
  invalidate(key?: string | number): void {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(String(key));
  }
}

/**
 * A shallow copy, so one caller's sort or splice cannot reach another's.
 * Shallow is enough: the elements are treated as read-only everywhere, and a
 * deep clone on every read would cost more than the request we are saving.
 */
function copy<T>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}
