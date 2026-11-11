import { describe, it, expect } from "vitest";
import { Queue } from "./Queue.ts";
import type { SerializedQueue } from "./Queue.ts";
import { diagnoseQueue } from "./QueueDiagnostics.ts";
import type { DiagnosticCheck, QueueOperation, QueueSnapshot } from "./QueueDiagnostics.ts";

type Track = { encoded: string; info: { identifier: string; title: string } };

const track = (id: string): Track => ({
  encoded: `enc-${id}`,
  info: { identifier: id, title: `Track ${id}` },
});

/** Maps a track object reference to the same identifier scheme the diagnostics use. */
const idOf = (t: Track | null, snapshot: QueueSnapshot<Track>): string | null => {
  if (t == null) return null;
  const ti = snapshot.tracks.indexOf(t);
  if (ti >= 0) return `tracks[${ti}]`;
  const hi = snapshot.history.indexOf(t);
  if (hi >= 0) return `history[${hi}]`;
  if (snapshot.detachedCurrent === t) return "detachedCurrent";
  return "unknown";
};

const toSnapshot = (q: Queue<Track>, maxHistorySize?: number): QueueSnapshot<Track> => ({
  ...q.export(),
  ...(maxHistorySize !== undefined ? { maxHistorySize } : {}),
});

const checkByName = (checks: DiagnosticCheck[], name: string): DiagnosticCheck => {
  const found = checks.find((c) => c.name === name);
  expect(found, `check "${name}" should exist`).toBeDefined();
  return found as DiagnosticCheck;
};

/** Asserts the diagnostic after-state matches the real Queue state item by item. */
const expectConsistentWithQueue = (
  report: ReturnType<typeof diagnoseQueue<Track>>,
  queue: Queue<Track>,
  snapshot: QueueSnapshot<Track>,
): void => {
  expect(report.after.currentTrack).toBe(idOf(queue.currentTrack, snapshot));
  expect(report.after.currentIndex).toBe(queue.currentIndexInQueue);
  expect(report.after.tracksLength).toBe(queue.size);
  expect(report.after.historyLength).toBe(queue.historyList.length);
  expect(report.after.detached).toBe(queue.export().detachedCurrent != null);
};

describe("QueueDiagnostics", () => {
  describe("normal path", () => {
    it("advance with detachedCurrent matches the real Queue item by item", () => {
      const t0 = track("removed-current");
      const t1 = track("a");
      const t2 = track("b");
      const t3 = track("c");

      const queue = new Queue<Track>();
      queue.import({
        tracks: [t1, t2, t3],
        history: [track("old")],
        currentIndex: -1,
        repeatMode: "none",
        detachedCurrent: t0,
      });

      const snapshot = toSnapshot(queue);
      const report = diagnoseQueue<Track>(snapshot, { type: "advance" });
      queue.next();

      // before-state: detached, cursor parked at -1
      expect(report.before.detached).toBe(true);
      expect(report.before.currentIndex).toBe(-1);
      expect(report.before.currentTrack).toBe("detachedCurrent");

      // after-state matches the real queue exactly
      expectConsistentWithQueue(report, queue, snapshot);
      expect(report.after.detached).toBe(false);
      expect(report.after.currentIndex).toBe(0);
      expect(report.after.currentTrack).toBe("tracks[0]");
      // the detached track was recorded into history before advancing
      expect(report.after.historyLength).toBe(2);

      // detached checks pass and the note explains the semantics
      expect(checkByName(report.checks, "before.detached-consistency").passed).toBe(true);
      expect(checkByName(report.checks, "after.detached-consistency").passed).toBe(true);
      expect(report.detachedNote).toContain("播放中已移除");
      expect(report.detachedNote).toContain("history");

      // every check passed on a legal snapshot
      expect(report.checks.every((c) => c.passed)).toBe(true);

      // output is JSON-serializable and contains no track objects
      const roundTripped = JSON.parse(JSON.stringify(report)) as typeof report;
      expect(roundTripped.after).toEqual(report.after);
    });

    it("remove of the playing range detaches the current track like the real Queue", () => {
      const tracks = [track("a"), track("b"), track("c"), track("d")];
      const queue = new Queue<Track>();
      queue.import({ tracks, history: [], currentIndex: 1, repeatMode: "none" });

      const snapshot = toSnapshot(queue);
      const report = diagnoseQueue<Track>(snapshot, {
        type: "remove",
        startIndex: 1,
        deleteCount: 2,
      });
      queue.remove(1, 2);

      expectConsistentWithQueue(report, queue, snapshot);
      expect(report.after.detached).toBe(true);
      expect(report.after.currentIndex).toBe(-1);
      expect(report.removedTracks).toEqual(["tracks[1]", "tracks[2]"]);
    });

    it("skipTo matches the real Queue and reports consumed tracks", () => {
      const tracks = [track("a"), track("b"), track("c"), track("d")];
      const queue = new Queue<Track>();
      queue.import({ tracks, history: [], currentIndex: 0, repeatMode: "none" });

      const snapshot = toSnapshot(queue);
      const report = diagnoseQueue<Track>(snapshot, { type: "skipTo", index: 2 });
      queue.skipTo(2);

      expectConsistentWithQueue(report, queue, snapshot);
      expect(report.after.currentIndex).toBe(0);
      expect(report.removedTracks).toEqual(["tracks[0]", "tracks[1]"]);
    });

    it("unique matches the real Queue and lists deduplicated tracks", () => {
      const a = track("a");
      const b = track("b");
      const tracks = [a, b, track("a"), track("c"), track("b")];
      const queue = new Queue<Track>();
      queue.import({ tracks, history: [], currentIndex: 0, repeatMode: "none" });

      const snapshot = toSnapshot(queue);
      const report = diagnoseQueue<Track>(snapshot, { type: "unique" });
      queue.unique();

      expectConsistentWithQueue(report, queue, snapshot);
      expect(report.removedTracks).toEqual(["tracks[2]", "tracks[4]"]);
      expect(report.after.tracksLength).toBe(3);
    });
  });

  describe("negative path", () => {
    it("reports out-of-range currentIndex without throwing", () => {
      const snapshot: QueueSnapshot<Track> = {
        tracks: [track("a"), track("b")],
        history: [],
        currentIndex: 5,
        repeatMode: "none",
      };

      let report: ReturnType<typeof diagnoseQueue<Track>> | undefined;
      expect(() => {
        report = diagnoseQueue<Track>(snapshot, { type: "advance" });
      }).not.toThrow();

      const failed = report!.checks.filter((c) => !c.passed);
      expect(failed.length).toBeGreaterThan(0);
      const rangeCheck = checkByName(report!.checks, "before.currentIndex-in-range");
      expect(rangeCheck.passed).toBe(false);
      expect(rangeCheck.reason).toContain("5");
    });

    it("reports detached state with currentIndex other than -1", () => {
      const snapshot: QueueSnapshot<Track> = {
        tracks: [track("a"), track("b")],
        history: [],
        currentIndex: 1,
        repeatMode: "none",
        detachedCurrent: track("ghost"),
      };

      const report = diagnoseQueue<Track>(snapshot, { type: "previous" });
      const check = checkByName(report.checks, "before.detached-consistency");
      expect(check.passed).toBe(false);
      expect(check.reason).toContain("-1");
      // still produces a full, readable report
      expect(report.before.detached).toBe(true);
      expect(report.detachedNote).toContain("播放中已移除");
    });

    it("reports history exceeding maxHistorySize", () => {
      const snapshot: QueueSnapshot<Track> = {
        tracks: [track("a")],
        history: [track("h1"), track("h2"), track("h3")],
        currentIndex: 0,
        repeatMode: "none",
        maxHistorySize: 2,
      };

      const report = diagnoseQueue<Track>(snapshot, { type: "previous" });
      const check = checkByName(report.checks, "before.history-within-max");
      expect(check.passed).toBe(false);
      expect(check.reason).toContain("maxHistorySize");
    });
  });

  describe("edge cases", () => {
    it("handles empty tracks for advance and previous", () => {
      const empty: QueueSnapshot<Track> = {
        tracks: [],
        history: [],
        currentIndex: -1,
        repeatMode: "none",
      };

      const advanceReport = diagnoseQueue<Track>(empty, { type: "advance" });
      expect(advanceReport.after.currentTrack).toBeNull();
      expect(advanceReport.after.currentIndex).toBe(-1);
      expect(advanceReport.after.tracksLength).toBe(0);
      expect(advanceReport.checks.every((c) => c.passed)).toBe(true);

      const previousReport = diagnoseQueue<Track>(empty, { type: "previous" });
      expect(previousReport.after.currentTrack).toBeNull();
      expect(previousReport.checks.every((c) => c.passed)).toBe(true);
    });

    it("previous in queue-repeat mode steps back without copying tracks", () => {
      const tracks = [track("a"), track("b"), track("c")];
      const queue = new Queue<Track>();
      queue.import({
        tracks,
        history: [track("h1")],
        currentIndex: 0,
        repeatMode: "queue",
      });

      const snapshot = toSnapshot(queue);
      const report = diagnoseQueue<Track>(snapshot, { type: "previous" });
      queue.previous();

      expectConsistentWithQueue(report, queue, snapshot);
      // wraps around to the last track, array untouched
      expect(report.after.currentIndex).toBe(2);
      expect(report.after.tracksLength).toBe(3);
      expect(checkByName(report.checks, "queue-repeat-previous-no-copy").passed).toBe(true);
    });

    it("track-repeat advance keeps the current track", () => {
      const tracks = [track("a"), track("b")];
      const queue = new Queue<Track>();
      queue.import({ tracks, history: [], currentIndex: 0, repeatMode: "track" });

      const snapshot = toSnapshot(queue);
      const report = diagnoseQueue<Track>(snapshot, { type: "advance" });
      queue.next();

      expectConsistentWithQueue(report, queue, snapshot);
      expect(report.after.currentTrack).toBe(report.before.currentTrack);
      expect(checkByName(report.checks, "track-repeat-advance-keeps-current").passed).toBe(true);
    });

    it("maxHistorySize 0 keeps history empty and stays readable", () => {
      const tracks = [track("a"), track("b")];
      const queue = new Queue<Track>({ maxHistorySize: 0 });
      queue.import({ tracks, history: [], currentIndex: 0, repeatMode: "none" });

      const snapshot = toSnapshot(queue, 0);
      let report: ReturnType<typeof diagnoseQueue<Track>> | undefined;
      expect(() => {
        report = diagnoseQueue<Track>(snapshot, { type: "advance" });
      }).not.toThrow();
      queue.next();

      expectConsistentWithQueue(report!, queue, snapshot);
      expect(report!.after.historyLength).toBe(0);
      expect(checkByName(report!.checks, "after.history-within-max").passed).toBe(true);
    });
  });

  describe("consistency sweep", () => {
    it("diagnostics match the real Queue across operations and repeat modes", () => {
      const operations: QueueOperation<Track>[] = [
        { type: "advance" },
        { type: "advance", forceAdvance: true },
        { type: "previous" },
        { type: "remove", startIndex: 1, deleteCount: 2 },
        { type: "skipTo", index: 2 },
        { type: "unique" },
      ];

      for (const repeatMode of ["none", "track", "queue"] as const) {
        for (const operation of operations) {
          const base: SerializedQueue<Track> = {
            tracks: [track("a"), track("b"), track("c"), track("b")],
            history: [track("h1")],
            currentIndex: 1,
            repeatMode,
          };
          const queue = new Queue<Track>();
          queue.import(base);

          const snapshot = toSnapshot(queue);
          const report = diagnoseQueue<Track>(snapshot, operation);
          switch (operation.type) {
            case "advance":
              queue.next(operation.forceAdvance ?? false);
              break;
            case "previous":
              queue.previous();
              break;
            case "remove":
              queue.remove(operation.startIndex, operation.deleteCount ?? 1);
              break;
            case "skipTo":
              queue.skipTo(operation.index);
              break;
            case "unique":
              queue.unique();
              break;
          }

          expectConsistentWithQueue(report, queue, snapshot);
        }
      }
    });
  });
});
