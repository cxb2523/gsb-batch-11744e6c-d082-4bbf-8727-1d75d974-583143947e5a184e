/**
 * src/core/line-audit.test.ts
 *
 * Tests for the pure line-progress audit module. The "real Line behaviour"
 * reference is obtained by constructing an actual Line instance against a
 * mock graph, stubbing Path2D with a recording fake, and inspecting the path
 * operations that Line.draw() emits — no DOM, network, credentials or GPU.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Line from "./line";
import Point from "./point";
import type BasicGraph from "../basic.graph";
import { auditLineProgress, LineAuditSnapshot } from "./line-audit";

/* ------------------------------------------------------------------------- */
/* Recording Path2D fake                                                      */
/* ------------------------------------------------------------------------- */

type RecordedOp = { op: string; args: number[] };

class RecordingPath2D {
    ops: RecordedOp[] = [];

    constructor() {
        createdPaths.push(this);
    }

    moveTo(x: number, y: number) {
        this.ops.push({ op: "moveTo", args: [x, y] });
    }
    lineTo(x: number, y: number) {
        this.ops.push({ op: "lineTo", args: [x, y] });
    }
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
        this.ops.push({ op: "quadraticCurveTo", args: [cpx, cpy, x, y] });
    }
    bezierCurveTo(
        cp1x: number,
        cp1y: number,
        cp2x: number,
        cp2y: number,
        x: number,
        y: number
    ) {
        this.ops.push({
            op: "bezierCurveTo",
            args: [cp1x, cp1y, cp2x, cp2y, x, y],
        });
    }
    closePath() {
        this.ops.push({ op: "closePath", args: [] });
    }
}

let createdPaths: RecordingPath2D[] = [];
const originalPath2D = (globalThis as Record<string, unknown>).Path2D;

beforeEach(() => {
    createdPaths = [];
    (globalThis as Record<string, unknown>).Path2D = RecordingPath2D;
});

afterEach(() => {
    if (originalPath2D === undefined) {
        delete (globalThis as Record<string, unknown>).Path2D;
    } else {
        (globalThis as Record<string, unknown>).Path2D = originalPath2D;
    }
});

/* ------------------------------------------------------------------------- */
/* Mock graph + real Line construction                                       */
/* ------------------------------------------------------------------------- */

const mockCtx = {
    lineJoin: "round",
    lineWidth: 1,
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    setLineDash: () => {},
    fill: () => {},
    stroke: () => {},
};

/**
 * Minimal graph stand-in providing exactly what Point / Line read:
 * lengths, gridRectSize, axisManager axes and a drawer context.
 */
function createMockGraph(): BasicGraph {
    const xAxis = {
        roundedMin: 0,
        scaleStep: 1,
        yStart: 300,
        min: 0,
        max: 3,
        start: 0,
    };
    const yAxis = {
        roundedMin: 0,
        scaleStep: 1,
        yStart: 300,
        min: 0,
        max: 10,
        start: 0,
    };

    return {
        lengths: {
            xBegin: 0,
            yBegin: 0,
            xEnd: 300,
            yEnd: 300,
            xCenter: 150,
            yCenter: 150,
            xLength: 300,
            yLength: 300,
        },
        gridRectSize: { x: 100, y: 30 },
        axisManager: { xAxis, yAxis },
        drawer: { ctx: mockCtx },
    } as unknown as BasicGraph;
}

/** Canvas y of the area baseline (data y = yAxis.start = 0). */
const BASELINE_Y = 300;

function createCubicLine(data: number[]): Line {
    return new Line(new Float64Array(data), createMockGraph(), {
        colour: "#ff6782",
        interpolation: "cubic",
        area: { fill: true },
        annotatePoints: false,
    });
}

/** Read the (TS-private) points/control points a real Line computed. */
function lineInternals(line: Line) {
    const internals = line as unknown as {
        points: Point[];
        controlPoints: { prev: Point; next: Point }[];
    };
    return {
        points: internals.points.map((p) => ({
            x: p.x,
            y: p.y,
            dataX: p.data.x,
        })),
        controlPoints: internals.controlPoints.map((cp) => ({
            prev: { x: cp.prev.x, y: cp.prev.y },
            next: { x: cp.next.x, y: cp.next.y },
        })),
    };
}

function snapshotFromLine(line: Line, progress: number): LineAuditSnapshot {
    const { points, controlPoints } = lineInternals(line);
    return {
        points,
        interpolation: "cubic",
        areaFill: true,
        baselineY: BASELINE_Y,
        progress,
        controlPoints,
    };
}

/* ------------------------------------------------------------------------- */
/* Real Line draw() -> recorded segment extraction                           */
/* ------------------------------------------------------------------------- */

type RealSegment = {
    kind: "linear" | "quadratic" | "cubic";
    from: { x: number; y: number };
    to: { x: number; y: number };
};

/** Reconstruct the stroke segments a real Line drew from recorded path ops. */
function realStrokeSegments(path: RecordingPath2D): RealSegment[] {
    const segments: RealSegment[] = [];
    let current: { x: number; y: number } | null = null;

    for (const op of path.ops) {
        if (op.op === "moveTo") {
            current = { x: op.args[0], y: op.args[1] };
        } else if (op.op === "lineTo" && current) {
            segments.push({
                kind: "linear",
                from: current,
                to: { x: op.args[0], y: op.args[1] },
            });
            current = null;
        } else if (op.op === "quadraticCurveTo" && current) {
            segments.push({
                kind: "quadratic",
                from: current,
                to: { x: op.args[2], y: op.args[3] },
            });
            current = null;
        } else if (op.op === "bezierCurveTo" && current) {
            segments.push({
                kind: "cubic",
                from: current,
                to: { x: op.args[4], y: op.args[5] },
            });
            current = null;
        }
    }

    return segments;
}

/**
 * Reconstruct area segments (curve + the two baseline closure points) from
 * recorded area-path ops.
 */
function realAreaSegments(path: RecordingPath2D) {
    const segments: {
        kind: RealSegment["kind"];
        baselineEnd: { x: number; y: number };
        baselineStart: { x: number; y: number };
    }[] = [];

    let current: { x: number; y: number } | null = null;
    let pendingKind: RealSegment["kind"] | null = null;
    const baselinePoints: { x: number; y: number }[] = [];

    const flush = () => {
        if (pendingKind !== null && baselinePoints.length === 2) {
            segments.push({
                kind: pendingKind,
                baselineEnd: baselinePoints[0],
                baselineStart: baselinePoints[1],
            });
        }
        pendingKind = null;
        baselinePoints.length = 0;
    };

    for (const op of path.ops) {
        if (op.op === "moveTo") {
            flush();
            current = { x: op.args[0], y: op.args[1] };
        } else if (op.op === "lineTo" && current !== null) {
            if (pendingKind === null) {
                // linear curve segment
                pendingKind = "linear";
            } else {
                baselinePoints.push({ x: op.args[0], y: op.args[1] });
            }
        } else if (op.op === "quadraticCurveTo") {
            pendingKind = "quadratic";
        } else if (op.op === "bezierCurveTo") {
            pendingKind = "cubic";
        } else if (op.op === "closePath") {
            flush();
            current = null;
        }
    }
    flush();

    return segments;
}

/* ------------------------------------------------------------------------- */
/* Tests                                                                      */
/* ------------------------------------------------------------------------- */

describe("auditLineProgress", () => {
    describe("normal path: 4-point cubic line at progress = 0.5", () => {
        it("matches real Line segment count, types and endpoints, all checks pass", () => {
            const line = createCubicLine([2, 5, 3, 8]);
            const audit = auditLineProgress(snapshotFromLine(line, 0.5));

            // Reference: what the real Line actually drew.
            line.draw(0.5);
            expect(createdPaths.length).toBe(2); // stroke path + area path
            const realStroke = realStrokeSegments(createdPaths[0]);
            const realArea = realAreaSegments(createdPaths[1]);

            // Draw state: 0.5 * 3 segments = 1.5 -> 1 complete + half segment.
            expect(audit.segments).toBe(1);
            expect(audit.segmentProgress).toBe(0.5);
            expect(audit.degraded).toBe(false);

            // Segment counts match the real Line.
            expect(audit.strokeSegments.length).toBe(realStroke.length);
            expect(audit.areaSegments.length).toBe(realArea.length);

            // Segment type sequence matches the real build branches:
            // complete first quadratic + partial middle cubic.
            expect(audit.strokeSegments.map((s) => s.kind)).toEqual(
                realStroke.map((s) => s.kind)
            );
            expect(audit.strokeSegments.map((s) => s.kind)).toEqual([
                "quadratic",
                "cubic",
            ]);

            // Every segment start/end matches the real Line bit-for-bit.
            audit.strokeSegments.forEach((seg, i) => {
                expect(seg.from.x).toBe(realStroke[i].from.x);
                expect(seg.from.y).toBe(realStroke[i].from.y);
                expect(seg.to.x).toBe(realStroke[i].to.x);
                expect(seg.to.y).toBe(realStroke[i].to.y);
            });

            // The audit endpoint equals Line's #computeDrawState endpoint,
            // which evaluates the cubic bezier directly (de Casteljau
            // polynomial form). Recompute it independently here from the
            // line's own points/control points and compare bit-for-bit.
            const { points, controlPoints } = lineInternals(line);
            const t = 0.5;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;
            const expectedEndpoint = {
                x:
                    mt3 * points[1].x +
                    3 * mt2 * t * controlPoints[0].next.x +
                    3 * mt * t2 * controlPoints[1].prev.x +
                    t3 * points[2].x,
                y:
                    mt3 * points[1].y +
                    3 * mt2 * t * controlPoints[0].next.y +
                    3 * mt * t2 * controlPoints[1].prev.y +
                    t3 * points[2].y,
            };
            expect(audit.endpoint).not.toBeNull();
            expect(audit.endpoint!.x).toBe(expectedEndpoint.x);
            expect(audit.endpoint!.y).toBe(expectedEndpoint.y);

            // The real Line *draws* the partial endpoint via splitCubicAt
            // (lerp-based), which differs from #computeDrawState's polynomial
            // evaluation by ~1 ulp in the source itself; compare closely.
            const realEndpoint = realStroke[realStroke.length - 1].to;
            expect(audit.endpoint!.x).toBeCloseTo(realEndpoint.x, 10);
            expect(audit.endpoint!.y).toBeCloseTo(realEndpoint.y, 10);

            // Area segments: curve kinds and baseline closure points match.
            audit.areaSegments.forEach((seg, i) => {
                expect(seg.curve.kind).toBe(realArea[i].kind);
                expect(seg.baselineEnd.x).toBe(realArea[i].baselineEnd.x);
                expect(seg.baselineEnd.y).toBe(realArea[i].baselineEnd.y);
                expect(seg.baselineStart.x).toBe(realArea[i].baselineStart.x);
                expect(seg.baselineStart.y).toBe(realArea[i].baselineStart.y);
                expect(seg.baselineEnd.y).toBe(BASELINE_Y);
                expect(seg.baselineStart.y).toBe(BASELINE_Y);
            });

            // All checks pass.
            expect(audit.checks.length).toBeGreaterThan(0);
            expect(
                audit.checks.every((check) => check.passed),
                JSON.stringify(audit.checks.filter((c) => !c.passed))
            ).toBe(true);
        });
    });

    describe("negative path: invalid inputs degrade without throwing", () => {
        const baseSnapshot: LineAuditSnapshot = {
            points: [
                { x: 0, y: 240, dataX: 0 },
                { x: 100, y: 150, dataX: 1 },
                { x: 200, y: 210, dataX: 2 },
                { x: 300, y: 60, dataX: 3 },
            ],
            interpolation: "cubic",
            areaFill: true,
            baselineY: BASELINE_Y,
            progress: 0.5,
            controlPoints: [
                { prev: { x: 70, y: 157 }, next: { x: 133, y: 145 } },
                { prev: { x: 176, y: 221 }, next: { x: 217, y: 193 } },
            ],
        };

        it("returns a degraded result when cubic control points are too few", () => {
            const snapshot: LineAuditSnapshot = {
                ...baseSnapshot,
                controlPoints: baseSnapshot.controlPoints!.slice(0, 1),
            };

            let audit: ReturnType<typeof auditLineProgress> | undefined;
            expect(() => {
                audit = auditLineProgress(snapshot);
            }).not.toThrow();

            expect(audit!.degraded).toBe(true);
            expect(audit!.degradationReasons.length).toBeGreaterThan(0);
            expect(audit!.degradationReasons[0]).toContain("control point");
            expect(audit!.affectedFields).toContain("strokeSegments");
            expect(audit!.affectedFields).toContain("areaSegments");
            expect(audit!.strokeSegments).toEqual([]);
            expect(audit!.areaSegments).toEqual([]);
            expect(audit!.endpoint).toBeNull();

            const failed = audit!.checks.filter((c) => !c.passed);
            expect(
                failed.some(
                    (c) => c.name === "cubic-control-points-match-point-count"
                )
            ).toBe(true);
            expect(failed[0].reason).toBeTruthy();
        });

        it("returns a degraded result when fewer than 2 points are given", () => {
            const audit = auditLineProgress({
                ...baseSnapshot,
                points: [{ x: 0, y: 240, dataX: 0 }],
                controlPoints: [],
            });

            expect(audit.degraded).toBe(true);
            expect(audit.affectedFields).toContain("segments");
            expect(audit.strokeSegments).toEqual([]);
            expect(
                audit.checks.some(
                    (c) =>
                        c.name === "input-has-at-least-two-points" && !c.passed
                )
            ).toBe(true);
        });

        it("returns a degraded result for a non-finite baseline but keeps the stroke", () => {
            const audit = auditLineProgress({
                ...baseSnapshot,
                baselineY: Infinity,
            });

            expect(audit.degraded).toBe(true);
            expect(audit.affectedFields).toContain("areaSegments");
            expect(audit.areaSegments).toEqual([]);
            // Stroke is unaffected by the bad baseline.
            expect(audit.strokeSegments.length).toBeGreaterThan(0);
            expect(
                audit.checks.some(
                    (c) => c.name === "area-baseline-y-is-finite" && !c.passed
                )
            ).toBe(true);
        });
    });

    describe("boundary path: progress 0, 1 and > 1", () => {
        const line = createCubicLine([2, 5, 3, 8]);

        it("progress = 0 produces no segments at all", () => {
            const audit = auditLineProgress(snapshotFromLine(line, 0));

            expect(audit.progress.clamped).toBe(0);
            expect(audit.segments).toBe(0);
            expect(audit.segmentProgress).toBe(0);
            expect(audit.endpoint).toBeNull();
            expect(audit.strokeSegments).toEqual([]);
            expect(audit.areaSegments).toEqual([]);
            expect(
                audit.checks.find(
                    (c) => c.name === "no-segments-when-progress-not-positive"
                )!.passed
            ).toBe(true);
        });

        it("progress = 1 produces all complete segments and no partial segment", () => {
            const audit = auditLineProgress(snapshotFromLine(line, 1));

            expect(audit.progress.clamped).toBe(1);
            expect(audit.segments).toBe(3); // points.length - 1
            expect(audit.segmentProgress).toBe(0);
            expect(audit.endpoint).toEqual({ x: 300, y: 60 });
            expect(audit.strokeSegments.map((s) => s.kind)).toEqual([
                "quadratic",
                "cubic",
                "quadratic",
            ]);
            expect(audit.areaSegments.length).toBe(3);
            expect(
                audit.checks.find(
                    (c) =>
                        c.name === "complete-coverage-when-progress-reaches-one"
                )!.passed
            ).toBe(true);
            expect(audit.checks.every((c) => c.passed)).toBe(true);
        });

        it("progress > 1 is clamped to 1 and matches the progress = 1 result", () => {
            const atOne = auditLineProgress(snapshotFromLine(line, 1));
            const beyond = auditLineProgress(snapshotFromLine(line, 2.5));

            expect(beyond.progress.raw).toBe(2.5);
            expect(beyond.progress.clamped).toBe(1);
            expect(beyond.segments).toBe(atOne.segments);
            expect(beyond.segmentProgress).toBe(atOne.segmentProgress);
            expect(beyond.endpoint).toEqual(atOne.endpoint);
            expect(beyond.strokeSegments).toEqual(atOne.strokeSegments);
            expect(beyond.areaSegments).toEqual(atOne.areaSegments);
        });
    });

    describe("output shape", () => {
        it("is JSON-serialisable and survives a stringify/parse round-trip", () => {
            const line = createCubicLine([2, 5, 3, 8]);
            const audit = auditLineProgress(snapshotFromLine(line, 0.5));

            let json = "";
            expect(() => {
                json = JSON.stringify(audit);
            }).not.toThrow();

            const revived = JSON.parse(json);
            expect(revived).toEqual(audit);

            // No functions or class instances anywhere in the output.
            expect(json).not.toContain("function");
            for (const value of Object.values(revived)) {
                expect(typeof value).not.toBe("function");
            }
        });

        it("produces empty area segments when fill is disabled", () => {
            const line = createCubicLine([2, 5, 3, 8]);
            const snapshot = snapshotFromLine(line, 0.5);
            const audit = auditLineProgress({ ...snapshot, areaFill: false });

            expect(audit.areaSegments).toEqual([]);
            expect(audit.strokeSegments.length).toBeGreaterThan(0);
            expect(
                audit.checks.find(
                    (c) => c.name === "area-empty-when-fill-disabled"
                )!.passed
            ).toBe(true);
        });
    });
});
