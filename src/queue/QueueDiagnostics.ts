import type { RepeatMode } from "../types/internal.ts";

/**
 * A plain-data snapshot of a queue's cursor state. Mirrors the shape of
 * {@link import("./Queue.ts").SerializedQueue} plus the `maxHistorySize`
 * option needed to validate history capping.
 */
export interface QueueSnapshot<T> {
  tracks: readonly T[];
  history: readonly T[];
  currentIndex: number;
  repeatMode: RepeatMode;
  /** Track removed from the queue but still playing on the node, if any. */
  detachedCurrent?: T | null;
  /** History cap used by the real queue (defaults to 50, like Queue). */
  maxHistorySize?: number;
}

/** Operation to simulate against the snapshot. */
export type QueueOperation<T> =
  | { type: "advance"; forceAdvance?: boolean }
  | { type: "previous" }
  | { type: "remove"; startIndex: number; deleteCount?: number }
  | { type: "skipTo"; index: number }
  | { type: "unique"; keyFn?: (track: T) => unknown };

/** Cursor state at one point in time, with tracks mapped to string ids. */
export interface CursorStateReport {
  /** Identifier of the current track (e.g. "tracks[0]", "detachedCurrent") or null. */
  currentTrack: string | null;
  currentIndex: number;
  tracksLength: number;
  historyLength: number;
  /** True while a removed-but-still-playing track is the current track. */
  detached: boolean;
}

export interface DiagnosticCheck {
  name: string;
  passed: boolean;
  /** Human-readable reason, present only when the check failed. */
  reason?: string;
}

export interface QueueDiagnosticReport {
  /** JSON-serializable description of the simulated operation. */
  operation: Record<string, unknown>;
  before: CursorStateReport;
  after: CursorStateReport;
  /** Identifiers of tracks removed from the queue (remove/unique/consumed). */
  removedTracks: string[];
  /** Ordered list of invariant checks. */
  checks: DiagnosticCheck[];
  /**
   * Present when the pre-operation state is detached: the current track was
   * removed while still playing (播放中已移除), and the next advance records
   * it into history before moving on.
   */
  detachedNote?: string;
}

const DEFAULT_MAX_HISTORY_SIZE = 50;

/** Internal mutable cursor state used by the pure simulation. */
interface SimState<T> {
  tracks: T[];
  history: T[];
  currentIndex: number;
  detachedCurrent: T | null;
  maxHistorySize: number;
  repeatMode: RepeatMode;
}

function currentTrackOf<T>(state: SimState<T>): T | null {
  if (state.detachedCurrent != null) return state.detachedCurrent;
  if (state.currentIndex < 0 || state.currentIndex >= state.tracks.length) {
    return null;
  }
  return state.tracks[state.currentIndex] as T;
}

function addToHistory<T>(state: SimState<T>, entry: T): void {
  state.history.push(entry);
  if (state.history.length > state.maxHistorySize) {
    state.history.shift();
  }
}

function addCurrentToHistory<T>(state: SimState<T>): void {
  if (state.currentIndex >= 0 && state.currentIndex < state.tracks.length) {
    addToHistory(state, state.tracks[state.currentIndex] as T);
  }
}

/**
 * Pure re-implementation of Queue's cursor operations. Must stay behaviorally
 * identical to Queue.next/previous/remove/skipTo/unique — it never touches a
 * Queue instance, the disk, or the network.
 */
function simulate<T>(state: SimState<T>, operation: QueueOperation<T>, removed: T[]): void {
  switch (operation.type) {
    case "advance": {
      let forceAdvance = operation.forceAdvance ?? false;
      if (state.tracks.length === 0 && state.detachedCurrent == null) return;

      // A removed-but-playing track is never repeated; record it and move on.
      if (state.detachedCurrent != null) {
        addToHistory(state, state.detachedCurrent);
        state.detachedCurrent = null;
        forceAdvance = true;
      }

      const repeatMode = state.repeatMode;
      if (repeatMode === "track" && !forceAdvance && currentTrackOf(state) != null) {
        return;
      }

      addCurrentToHistory(state);

      if (repeatMode === "queue") {
        if (state.tracks.length === 0) {
          state.currentIndex = -1;
          return;
        }
        state.currentIndex = state.currentIndex < 0 ? 0 : (state.currentIndex + 1) % state.tracks.length;
        return;
      }

      if (state.currentIndex >= 0) {
        removed.push(...state.tracks.splice(0, state.currentIndex + 1));
      }
      state.currentIndex = state.tracks.length > 0 ? 0 : -1;
      return;
    }

    case "previous": {
      if (state.detachedCurrent != null) return;

      if (state.repeatMode === "queue") {
        // Never re-insert history copies in queue-repeat mode.
        if (state.tracks.length === 0) return;
        if (state.currentIndex < 0) {
          state.currentIndex = state.tracks.length - 1;
        } else {
          state.currentIndex = (state.currentIndex - 1 + state.tracks.length) % state.tracks.length;
        }
        return;
      }

      const historyTrack = state.history.pop() ?? null;
      if (historyTrack != null) {
        const insertAt = state.currentIndex >= 0 ? state.currentIndex : 0;
        state.tracks.splice(insertAt, 0, historyTrack);
        state.currentIndex = insertAt;
        return;
      }

      if (state.currentIndex > 0) {
        state.currentIndex--;
      }
      return;
    }

    case "remove": {
      const startIndex = operation.startIndex;
      const deleteCount = operation.deleteCount ?? 1;
      if (startIndex < 0 || startIndex >= state.tracks.length) return;
      const removedTracks = state.tracks.splice(startIndex, deleteCount);
      removed.push(...removedTracks);

      const removedCurrent =
        state.currentIndex >= startIndex && state.currentIndex < startIndex + removedTracks.length;

      if (removedCurrent) {
        // Keep the still-playing track as detached current until it ends.
        state.detachedCurrent = removedTracks[state.currentIndex - startIndex] ?? null;
        state.currentIndex = -1;
      } else if (state.currentIndex >= startIndex + deleteCount) {
        state.currentIndex -= removedTracks.length;
      }
      return;
    }

    case "skipTo": {
      const index = operation.index;
      if (index < 0 || index >= state.tracks.length) return;

      if (state.repeatMode === "queue") {
        state.currentIndex = index;
        return;
      }

      if (index > 0) {
        const dropped = state.tracks.splice(0, index);
        removed.push(...dropped);
        for (const track of dropped) {
          addToHistory(state, track);
        }
      }

      state.currentIndex = 0;
      state.detachedCurrent = null;
      return;
    }

    case "unique": {
      const keyOf =
        operation.keyFn ??
        ((track: T): unknown => {
          const t = track as { encoded?: string; info?: { identifier?: string } };
          return t.encoded ?? t.info?.identifier ?? track;
        });

      const seen = new Set<unknown>();
      const current = currentTrackOf(state);
      if (current != null) seen.add(keyOf(current));

      for (let i = 0; i < state.tracks.length; i++) {
        if (i === state.currentIndex) continue; // never remove the playing track
        const key = keyOf(state.tracks[i] as T);
        if (seen.has(key)) {
          removed.push(...state.tracks.splice(i, 1));
          if (state.currentIndex > i) state.currentIndex--;
          i--;
        } else {
          seen.add(key);
        }
      }
      return;
    }
  }
}

/**
 * Runs a pure diagnostic of one queue cursor operation against a snapshot.
 * The result is a JSON-serializable report; no Queue instance is created and
 * no I/O is performed. Invalid snapshots are reported via failed checks
 * instead of throwing.
 */
export function diagnoseQueue<T>(
  snapshot: QueueSnapshot<T>,
  operation: QueueOperation<T>,
): QueueDiagnosticReport {
  const maxHistorySize = snapshot.maxHistorySize ?? DEFAULT_MAX_HISTORY_SIZE;
  const repeatMode = snapshot.repeatMode;

  // Map each track object reference to a stable string identifier so the
  // report never embeds track objects themselves.
  const ids = new Map<unknown, string>();
  snapshot.tracks.forEach((track, i) => {
    if (!ids.has(track)) ids.set(track, `tracks[${i}]`);
  });
  snapshot.history.forEach((track, i) => {
    if (!ids.has(track)) ids.set(track, `history[${i}]`);
  });
  const detachedCurrent = snapshot.detachedCurrent ?? null;
  if (detachedCurrent != null && !ids.has(detachedCurrent)) {
    ids.set(detachedCurrent, "detachedCurrent");
  }
  const identify = (track: T | null): string | null => {
    if (track == null) return null;
    return ids.get(track) ?? "unknown";
  };

  const state: SimState<T> = {
    tracks: [...snapshot.tracks],
    history: [...snapshot.history],
    currentIndex: snapshot.currentIndex,
    detachedCurrent,
    maxHistorySize,
    repeatMode,
  };

  const capture = () => ({
    currentTrack: currentTrackOf(state),
    currentIndex: state.currentIndex,
    tracksLength: state.tracks.length,
    historyLength: state.history.length,
    detached: state.detachedCurrent != null,
    detachedCurrent: state.detachedCurrent,
  });

  const beforeRaw = capture();
  const removed: T[] = [];
  simulate(state, operation, removed);
  const afterRaw = capture();

  const toReport = (raw: typeof beforeRaw): CursorStateReport => ({
    currentTrack: identify(raw.currentTrack),
    currentIndex: raw.currentIndex,
    tracksLength: raw.tracksLength,
    historyLength: raw.historyLength,
    detached: raw.detached,
  });

  const checks: DiagnosticCheck[] = [];
  const check = (name: string, passed: boolean, reason?: string): void => {
    checks.push(passed ? { name, passed } : { name, passed, reason: reason ?? "check failed" });
  };

  const checkState = (label: string, raw: typeof beforeRaw): void => {
    const inRange = raw.currentIndex === -1 || (raw.currentIndex >= 0 && raw.currentIndex < raw.tracksLength);
    check(
      `${label}.currentIndex-in-range`,
      inRange,
      `currentIndex ${raw.currentIndex} 越界：合法值为 -1 或 0..${raw.tracksLength - 1}（tracks 长度 ${raw.tracksLength}）`,
    );

    const detachedOk = !raw.detached || (raw.currentIndex === -1 && raw.currentTrack === raw.detachedCurrent);
    const detachedReason =
      raw.currentIndex !== -1
        ? `detached 状态下 currentIndex 必须为 -1，实际为 ${raw.currentIndex}`
        : "detached 状态下 currentTrack 必须来自 detachedCurrent";
    check(`${label}.detached-consistency`, detachedOk, detachedReason);

    check(
      `${label}.history-within-max`,
      raw.historyLength <= maxHistorySize,
      `history 长度 ${raw.historyLength} 超过 maxHistorySize ${maxHistorySize}`,
    );
  };

  checkState("before", beforeRaw);
  checkState("after", afterRaw);

  const isPrevious = operation.type === "previous";
  check(
    "queue-repeat-previous-no-copy",
    !(isPrevious && repeatMode === "queue") || afterRaw.tracksLength === beforeRaw.tracksLength,
    `repeatMode 为 queue 时 previous 不得复制曲目进 tracks（${beforeRaw.tracksLength} -> ${afterRaw.tracksLength}）`,
  );

  const isPlainTrackRepeatAdvance =
    operation.type === "advance" &&
    repeatMode === "track" &&
    !(operation.forceAdvance ?? false) &&
    !beforeRaw.detached &&
    beforeRaw.currentTrack != null;
  check(
    "track-repeat-advance-keeps-current",
    !isPlainTrackRepeatAdvance || afterRaw.currentTrack === beforeRaw.currentTrack,
    "repeatMode 为 track 且非强制前进时 advance 不应改变 currentTrack",
  );

  const report: QueueDiagnosticReport = {
    operation: describeOperation(operation),
    before: toReport(beforeRaw),
    after: toReport(afterRaw),
    removedTracks: removed.map((track) => identify(track) ?? "unknown"),
    checks,
  };

  if (beforeRaw.detached) {
    report.detachedNote =
      "当前曲目播放中已移除（detached）：它不在 tracks 中但仍是当前曲目；下一次 advance 会先把它记入 history 再前进。";
  }

  return report;
}

function describeOperation<T>(operation: QueueOperation<T>): Record<string, unknown> {
  switch (operation.type) {
    case "advance":
      return { type: "advance", forceAdvance: operation.forceAdvance ?? false };
    case "previous":
      return { type: "previous" };
    case "remove":
      return {
        type: "remove",
        startIndex: operation.startIndex,
        deleteCount: operation.deleteCount ?? 1,
      };
    case "skipTo":
      return { type: "skipTo", index: operation.index };
    case "unique":
      return { type: "unique" };
  }
}
