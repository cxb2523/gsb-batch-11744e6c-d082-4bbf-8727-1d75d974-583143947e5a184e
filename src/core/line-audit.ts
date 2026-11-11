/**
 * src/core/line-audit.ts
 *
 * Module description:
 *
 * Pure "line progress audit" module. Given a plain-data snapshot of the inputs
 * that Line.draw(progress) consumes (canvas-mapped points, interpolation kind,
 * area-fill flag, area baseline, pre-computed cubic control points and a
 * progress value), it reproduces — with the exact same arithmetic and branch
 * structure as Line's private #computeDrawState / #buildLinearLinePath /
 * #buildCubicLinePath / #buildLinearAreaPath / #buildCubicAreaPath — a
 * structured, JSON-serialisable description of what would be drawn, plus an
 * ordered list of sanity checks.
 *
 * The module never touches the DOM, never creates Path2D instances and never
 * performs I/O. Invalid inputs (too few points, mismatched cubic control
 * points, non-finite baseline, non-finite progress) never throw; they produce
 * a degraded result with human-readable reasons and a list of the affected
 * output fields.
 */

import { splitCubicAt, splitQuadraticAt, Vec2 } from "./animation";
import type { InterpolationKind } from "./interpolation";

/** A single plottable point: canvas coordinates plus the original data x. */
export type AuditPoint = {
    /** Canvas x-coordinate (already converted from data space). */
    x: number;
    /** Canvas y-coordinate (already converted from data space). */
    y: number;
    /** Original data-space x value. */
    dataX: number;
};

/** Cubic control points for one interior knot, as plain vectors. */
export type AuditControlPoint = {
    prev: Vec2;
    next: Vec2;
};

/** Plain-data snapshot consumed by the audit. */
export type LineAuditSnapshot = {
    /** Plottable points in draw order (canvas x/y + original data x). */
    points: AuditPoint[];

    /** Interpolation kind used by the line. */
    interpolation: InterpolationKind;

    /** Whether the area under the line is filled. */
    areaFill: boolean;

    /** Canvas y-coordinate of the area-fill baseline. */
    baselineY: number;

    /** Draw progress, as passed to Line.draw(). */
    progress: number;

    /**
     * Control points computed with the existing rules (one entry per interior
     * knot, i.e. `points.length - 2` entries). Required for cubic
     * interpolation, ignored otherwise.
     */
    controlPoints?: AuditControlPoint[];
};

/** Description of one stroke-path segment. */
export type StrokeSegmentDesc =
    | { kind: "linear"; segment: number; from: Vec2; to: Vec2 }
    | {
          kind: "quadratic";
          segment: number;
          from: Vec2;
          control: Vec2;
          to: Vec2;
      }
    | {
          kind: "cubic";
          segment: number;
          from: Vec2;
          control1: Vec2;
          control2: Vec2;
          to: Vec2;
      };

/**
 * Description of one area-path segment: the curve along the line plus the two
 * baseline closure points (the `lineTo` targets before `closePath`).
 */
export type AreaSegmentDesc = {
    curve: StrokeSegmentDesc;
    /** Baseline point directly below/above the curve end. */
    baselineEnd: Vec2;
    /** Baseline point directly below/above the curve start. */
    baselineStart: Vec2;
};

/** A single named audit check. */
export type AuditCheck = {
    /** Stable machine-readable check name. */
    name: string;
    /** Whether the check passed. */
    passed: boolean;
    /** Human-readable explanation, present only when the check failed. */
    reason?: string;
};

/** Structured, JSON-serialisable audit output. */
export type LineAuditResult = {
    /** True when any input was invalid and part of the output is degraded. */
    degraded: boolean;

    /** Human-readable reasons for the degradation (empty when not degraded). */
    degradationReasons: string[];

    /** Names of the output fields affected by the degradation. */
    affectedFields: string[];

    /** Raw and clamped progress values. */
    progress: { raw: number; clamped: number };

    /** Number of complete segments (matches Line's DrawState.segments). */
    segments: number;

    /** Progress within the partial segment (matches DrawState.segmentProgress). */
    segmentProgress: number;

    /** Interpolated endpoint of the partial segment (matches DrawState.endpoint). */
    endpoint: Vec2 | null;

    /** Ordered stroke-path segment descriptions. */
    strokeSegments: StrokeSegmentDesc[];

    /** Ordered area-path segment descriptions (empty when fill is disabled). */
    areaSegments: AreaSegmentDesc[];

    /** Ordered list of audit checks. */
    checks: AuditCheck[];
};

/** Internal mirror of Line's private DrawState. */
type AuditDrawState = {
    segments: number;
    segmentProgress: number;
    endpoint: Vec2;
};

/** Output fields that depend on the point/control-point/progress inputs. */
const DRAW_OUTPUT_FIELDS = [
    "segments",
    "segmentProgress",
    "endpoint",
    "strokeSegments",
    "areaSegments",
];

/** Copy a vector-like object into a fresh plain {x, y}. */
function vec(p: { x: number; y: number }): Vec2 {
    return { x: p.x, y: p.y };
}

function makeCheck(name: string, passed: boolean, reason?: string): AuditCheck {
    return passed ? { name, passed } : { name, passed, reason };
}

/**
 * Exact replica of Line.#interpolateLinearAt.
 */
function interpolateLinearAt(
    points: AuditPoint[],
    segment: number,
    t: number
): Vec2 {
    const p0 = points[segment];
    const p1 = points[segment + 1];

    return {
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t,
    };
}

/**
 * Exact replica of Line.#interpolateCubicAt (de Casteljau evaluation of the
 * quadratic end segments and cubic middle segments).
 */
function interpolateCubicAt(
    points: AuditPoint[],
    controlPoints: AuditControlPoint[],
    segment: number,
    t: number
): Vec2 {
    const totalSegments = points.length - 1;

    if (segment === 0) {
        // First segment: quadratic curve
        const p0 = points[0];
        const cp = controlPoints[0].prev;
        const p1 = points[1];

        const mt = 1 - t;
        return {
            x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
            y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
        };
    } else if (segment === totalSegments - 1) {
        // Last segment: quadratic curve
        const p0 = points[segment];
        const cp = controlPoints[controlPoints.length - 1].next;
        const p1 = points[segment + 1];

        const mt = 1 - t;
        return {
            x: mt * mt * p0.x + 2 * mt * t * cp.x + t * t * p1.x,
            y: mt * mt * p0.y + 2 * mt * t * cp.y + t * t * p1.y,
        };
    } else {
        // Middle segments: cubic bezier
        const p0 = points[segment];
        const cp1 = controlPoints[segment - 1].next;
        const cp2 = controlPoints[segment].prev;
        const p1 = points[segment + 1];

        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;

        return {
            x:
                mt3 * p0.x +
                3 * mt2 * t * cp1.x +
                3 * mt * t2 * cp2.x +
                t3 * p1.x,
            y:
                mt3 * p0.y +
                3 * mt2 * t * cp1.y +
                3 * mt * t2 * cp2.y +
                t3 * p1.y,
        };
    }
}

/**
 * Exact replica of Line.#computeDrawState.
 */
function computeDrawState(
    points: AuditPoint[],
    interpolation: InterpolationKind,
    controlPoints: AuditControlPoint[],
    progress: number
): AuditDrawState {
    const totalSegments = points.length - 1;
    const exactSegment = progress * totalSegments;
    const segments = Math.floor(exactSegment);
    const segmentProgress = exactSegment - segments;

    let endpoint: Vec2;

    if (segments >= totalSegments) {
        const lastPoint = points[points.length - 1];
        endpoint = { x: lastPoint.x, y: lastPoint.y };
    } else if (interpolation === "cubic") {
        endpoint = interpolateCubicAt(
            points,
            controlPoints,
            segments,
            segmentProgress
        );
    } else {
        endpoint = interpolateLinearAt(points, segments, segmentProgress);
    }

    return {
        segments: Math.min(segments, totalSegments),
        segmentProgress,
        endpoint,
    };
}

/**
 * Mirrors the branch structure of Line.#buildLinearLinePath.
 */
function buildLinearStrokeSegments(
    points: AuditPoint[],
    state?: AuditDrawState
): StrokeSegmentDesc[] {
    const out: StrokeSegmentDesc[] = [];
    const segmentCount = state ? state.segments : points.length - 1;

    for (let p = 0; p < segmentCount; p++) {
        out.push({
            kind: "linear",
            segment: p,
            from: vec(points[p]),
            to: vec(points[p + 1]),
        });
    }

    if (
        state &&
        state.segmentProgress > 0 &&
        state.segments < points.length - 1
    ) {
        out.push({
            kind: "linear",
            segment: state.segments,
            from: vec(points[state.segments]),
            to: vec(state.endpoint),
        });
    }

    return out;
}

/**
 * Mirrors the branch structure of Line.#buildCubicLinePath.
 */
function buildCubicStrokeSegments(
    points: AuditPoint[],
    controlPoints: AuditControlPoint[],
    state?: AuditDrawState
): StrokeSegmentDesc[] {
    const out: StrokeSegmentDesc[] = [];
    const totalSegments = points.length - 1;
    const segmentCount = state ? state.segments : totalSegments;

    // First quadratic curve: from point 0 to point 1 (segment 0)
    if (segmentCount >= 1) {
        out.push({
            kind: "quadratic",
            segment: 0,
            from: vec(points[0]),
            control: vec(controlPoints[0].prev),
            to: vec(points[1]),
        });
    } else if (state && state.segments === 0 && state.segmentProgress > 0) {
        // Partial first segment - split the quadratic curve
        const partial = splitQuadraticAt(
            vec(points[0]),
            vec(controlPoints[0].prev),
            vec(points[1]),
            state.segmentProgress
        );
        out.push({
            kind: "quadratic",
            segment: 0,
            from: partial.p0,
            control: partial.cp,
            to: partial.p1,
        });
    }

    // Middle bezier curves (segments 1 to length-3)
    const middleEnd = Math.min(segmentCount, totalSegments - 1);
    for (let i = 1; i < middleEnd; i++) {
        out.push({
            kind: "cubic",
            segment: i,
            from: vec(points[i]),
            control1: vec(controlPoints[i - 1].next),
            control2: vec(controlPoints[i].prev),
            to: vec(points[i + 1]),
        });
    }

    // Partial middle segment - split the cubic curve
    if (
        state &&
        state.segmentProgress > 0 &&
        state.segments >= 1 &&
        state.segments < totalSegments - 1
    ) {
        const seg = state.segments;
        const partial = splitCubicAt(
            vec(points[seg]),
            vec(controlPoints[seg - 1].next),
            vec(controlPoints[seg].prev),
            vec(points[seg + 1]),
            state.segmentProgress
        );
        out.push({
            kind: "cubic",
            segment: seg,
            from: partial.p0,
            control1: partial.cp1,
            control2: partial.cp2,
            to: partial.p1,
        });
    }

    // Last quadratic curve: from second-to-last point to last point
    if (segmentCount >= totalSegments) {
        out.push({
            kind: "quadratic",
            segment: totalSegments - 1,
            from: vec(points[points.length - 2]),
            control: vec(controlPoints[controlPoints.length - 1].next),
            to: vec(points[points.length - 1]),
        });
    } else if (
        state &&
        state.segmentProgress > 0 &&
        state.segments === totalSegments - 1
    ) {
        // Partial last segment - split the quadratic curve
        const partial = splitQuadraticAt(
            vec(points[state.segments]),
            vec(controlPoints[controlPoints.length - 1].next),
            vec(points[points.length - 1]),
            state.segmentProgress
        );
        out.push({
            kind: "quadratic",
            segment: state.segments,
            from: partial.p0,
            control: partial.cp,
            to: partial.p1,
        });
    }

    return out;
}

/**
 * Mirrors the branch structure of Line.#buildLinearAreaPath. The canvas x of a
 * baseline point created from data x = i is identical to points[i].x, since
 * both map the same data value through the same scale.
 */
function buildLinearAreaSegments(
    points: AuditPoint[],
    baselineY: number,
    state?: AuditDrawState
): AreaSegmentDesc[] {
    const out: AreaSegmentDesc[] = [];
    const segmentCount = state ? state.segments : points.length - 1;

    for (let i = 0; i < segmentCount; i++) {
        out.push({
            curve: {
                kind: "linear",
                segment: i,
                from: vec(points[i]),
                to: vec(points[i + 1]),
            },
            baselineEnd: { x: points[i + 1].x, y: baselineY },
            baselineStart: { x: points[i].x, y: baselineY },
        });
    }

    if (
        state &&
        state.segmentProgress > 0 &&
        state.segments < points.length - 1
    ) {
        // Interpolate the baseline x position (same expression as the source)
        const baselineEndX =
            points[state.segments].x +
            (state.endpoint.x - points[state.segments].x);

        out.push({
            curve: {
                kind: "linear",
                segment: state.segments,
                from: vec(points[state.segments]),
                to: vec(state.endpoint),
            },
            baselineEnd: { x: baselineEndX, y: baselineY },
            baselineStart: { x: points[state.segments].x, y: baselineY },
        });
    }

    return out;
}

/**
 * Mirrors the branch structure of Line.#buildCubicAreaPath.
 */
function buildCubicAreaSegments(
    points: AuditPoint[],
    controlPoints: AuditControlPoint[],
    baselineY: number,
    state?: AuditDrawState
): AreaSegmentDesc[] {
    const out: AreaSegmentDesc[] = [];
    const totalSegments = points.length - 1;
    const segmentCount = state ? state.segments : totalSegments;

    // First section: quadratic from point 0 to point 1
    if (segmentCount >= 1) {
        out.push({
            curve: {
                kind: "quadratic",
                segment: 0,
                from: vec(points[0]),
                control: vec(controlPoints[0].prev),
                to: vec(points[1]),
            },
            baselineEnd: { x: points[1].x, y: baselineY },
            baselineStart: { x: points[0].x, y: baselineY },
        });
    } else if (state && state.segments === 0 && state.segmentProgress > 0) {
        // Partial first segment area - use split quadratic curve
        const partial = splitQuadraticAt(
            vec(points[0]),
            vec(controlPoints[0].prev),
            vec(points[1]),
            state.segmentProgress
        );
        const baselineEndX = points[0].x + (partial.p1.x - points[0].x);

        out.push({
            curve: {
                kind: "quadratic",
                segment: 0,
                from: partial.p0,
                control: partial.cp,
                to: partial.p1,
            },
            baselineEnd: { x: baselineEndX, y: baselineY },
            baselineStart: { x: points[0].x, y: baselineY },
        });
    }

    // Middle sections: bezier curves
    const middleEnd = Math.min(segmentCount, totalSegments - 1);
    for (let i = 1; i < middleEnd; i++) {
        out.push({
            curve: {
                kind: "cubic",
                segment: i,
                from: vec(points[i]),
                control1: vec(controlPoints[i - 1].next),
                control2: vec(controlPoints[i].prev),
                to: vec(points[i + 1]),
            },
            baselineEnd: { x: points[i + 1].x, y: baselineY },
            baselineStart: { x: points[i].x, y: baselineY },
        });
    }

    // Partial middle segment area - use split cubic curve
    if (
        state &&
        state.segmentProgress > 0 &&
        state.segments >= 1 &&
        state.segments < totalSegments - 1
    ) {
        const seg = state.segments;
        const partial = splitCubicAt(
            vec(points[seg]),
            vec(controlPoints[seg - 1].next),
            vec(controlPoints[seg].prev),
            vec(points[seg + 1]),
            state.segmentProgress
        );
        const baselineEndX = points[seg].x + (partial.p1.x - points[seg].x);

        out.push({
            curve: {
                kind: "cubic",
                segment: seg,
                from: partial.p0,
                control1: partial.cp1,
                control2: partial.cp2,
                to: partial.p1,
            },
            baselineEnd: { x: baselineEndX, y: baselineY },
            baselineStart: { x: points[seg].x, y: baselineY },
        });
    }

    // Last section: quadratic from second-to-last point to last point
    if (segmentCount >= totalSegments) {
        out.push({
            curve: {
                kind: "quadratic",
                segment: totalSegments - 1,
                from: vec(points[points.length - 2]),
                control: vec(controlPoints[controlPoints.length - 1].next),
                to: vec(points[points.length - 1]),
            },
            baselineEnd: { x: points[points.length - 1].x, y: baselineY },
            baselineStart: { x: points[points.length - 2].x, y: baselineY },
        });
    } else if (
        state &&
        state.segmentProgress > 0 &&
        state.segments === totalSegments - 1
    ) {
        // Partial last segment area - use split quadratic curve
        const partial = splitQuadraticAt(
            vec(points[state.segments]),
            vec(controlPoints[controlPoints.length - 1].next),
            vec(points[points.length - 1]),
            state.segmentProgress
        );
        const baselineEndX =
            points[state.segments].x +
            (partial.p1.x - points[state.segments].x);

        out.push({
            curve: {
                kind: "quadratic",
                segment: state.segments,
                from: partial.p0,
                control: partial.cp,
                to: partial.p1,
            },
            baselineEnd: { x: baselineEndX, y: baselineY },
            baselineStart: { x: points[state.segments].x, y: baselineY },
        });
    }

    return out;
}

/** Whether `value` lies between `a` and `b` (inclusive, small epsilon). */
function isBetween(value: number, a: number, b: number): boolean {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const eps = 1e-9 * Math.max(1, Math.abs(lo), Math.abs(hi));
    return value >= lo - eps && value <= hi + eps;
}

/** Validate the shape of one control point entry. */
function isValidControlPoint(entry: unknown): entry is AuditControlPoint {
    if (typeof entry !== "object" || entry === null) return false;
    const cp = entry as AuditControlPoint;
    const validVec = (v: Vec2) =>
        typeof v === "object" &&
        v !== null &&
        Number.isFinite(v.x) &&
        Number.isFinite(v.y);
    return validVec(cp.prev) && validVec(cp.next);
}

/**
 * Audit what Line.draw(progress) would draw for a given plain-data snapshot.
 *
 * The returned segments/segmentProgress/endpoint are computed with the exact
 * same arithmetic as Line's private #computeDrawState, and the segment
 * descriptions follow the same branches as the private path builders, so they
 * can be compared item-by-item (at source precision) against real Line output.
 *
 * This function never throws on invalid input; it returns a degraded result
 * with readable reasons instead.
 */
export function auditLineProgress(
    snapshot: LineAuditSnapshot
): LineAuditResult {
    const input = snapshot ?? ({} as LineAuditSnapshot);
    const points: AuditPoint[] = Array.isArray(input.points)
        ? input.points
        : [];
    const cubicMode = input.interpolation === "cubic";
    const areaFill = input.areaFill === true;
    const rawProgress =
        typeof input.progress === "number" ? input.progress : NaN;

    const degradationReasons: string[] = [];
    const affectedFields = new Set<string>();
    const checks: AuditCheck[] = [];

    // --- Input validation -------------------------------------------------

    const hasEnoughPoints = points.length >= 2;
    if (!hasEnoughPoints) {
        const reason = `expected at least 2 points, received ${points.length}`;
        degradationReasons.push(reason);
        DRAW_OUTPUT_FIELDS.forEach((f) => affectedFields.add(f));
    }
    checks.push(
        makeCheck(
            "input-has-at-least-two-points",
            hasEnoughPoints,
            `expected at least 2 points, received ${points.length}`
        )
    );

    let controlPointsValid = true;
    let controlPointReason: string | undefined;
    const controlPoints: AuditControlPoint[] = cubicMode
        ? Array.isArray(input.controlPoints)
            ? input.controlPoints
            : []
        : [];

    if (cubicMode) {
        const expected = points.length - 2;
        if (points.length >= 2 && points.length < 3) {
            controlPointsValid = false;
            controlPointReason =
                "cubic interpolation requires at least 3 points " +
                `(received ${points.length})`;
        } else if (controlPoints.length !== expected) {
            controlPointsValid = false;
            controlPointReason =
                `cubic interpolation requires ${expected} control point ` +
                `entries for ${points.length} points, received ` +
                `${controlPoints.length}`;
        } else if (!controlPoints.every(isValidControlPoint)) {
            controlPointsValid = false;
            controlPointReason =
                "one or more control point entries are missing finite " +
                "prev/next coordinates";
        }

        if (!controlPointsValid) {
            degradationReasons.push(controlPointReason!);
            DRAW_OUTPUT_FIELDS.forEach((f) => affectedFields.add(f));
        }
        checks.push(
            makeCheck(
                "cubic-control-points-match-point-count",
                controlPointsValid,
                controlPointReason
            )
        );
    }

    const progressValid = Number.isFinite(rawProgress);
    if (!progressValid) {
        const reason = `progress must be a finite number, received ${String(
            input.progress
        )}`;
        degradationReasons.push(reason);
        affectedFields.add("progress");
        DRAW_OUTPUT_FIELDS.forEach((f) => affectedFields.add(f));
    }
    checks.push(
        makeCheck(
            "progress-is-finite",
            progressValid,
            `progress must be a finite number, received ${String(input.progress)}`
        )
    );

    const baselineValid = Number.isFinite(input.baselineY);
    if (!baselineValid) {
        const reason = `area baseline y must be finite, received ${String(
            input.baselineY
        )}`;
        degradationReasons.push(reason);
        affectedFields.add("areaSegments");
    }
    checks.push(
        makeCheck(
            "area-baseline-y-is-finite",
            baselineValid,
            `area baseline y must be finite, received ${String(input.baselineY)}`
        )
    );

    // --- Draw-state & path computation ------------------------------------

    const canDraw = hasEnoughPoints && controlPointsValid && progressValid;

    let clamped = 0;
    let segments = 0;
    let segmentProgress = 0;
    let endpoint: Vec2 | null = null;
    let strokeSegments: StrokeSegmentDesc[] = [];
    let areaSegments: AreaSegmentDesc[] = [];

    if (canDraw && rawProgress > 0) {
        // Line.draw: `if (progress <= 0) return; progress = Math.min(1, progress);`
        clamped = Math.min(1, rawProgress);

        // Line.draw only computes a draw state when progress < 1.
        const state =
            clamped < 1
                ? computeDrawState(
                      points,
                      input.interpolation,
                      controlPoints,
                      clamped
                  )
                : undefined;

        if (state) {
            segments = state.segments;
            segmentProgress = state.segmentProgress;
            endpoint = state.endpoint;
        } else {
            const lastPoint = points[points.length - 1];
            segments = points.length - 1;
            segmentProgress = 0;
            endpoint = { x: lastPoint.x, y: lastPoint.y };
        }

        strokeSegments = cubicMode
            ? buildCubicStrokeSegments(points, controlPoints, state)
            : buildLinearStrokeSegments(points, state);

        if (areaFill && baselineValid) {
            areaSegments = cubicMode
                ? buildCubicAreaSegments(
                      points,
                      controlPoints,
                      input.baselineY,
                      state
                  )
                : buildLinearAreaSegments(points, input.baselineY, state);
        }
    }

    // --- Behavioural checks ------------------------------------------------

    const totalSegments = Math.max(0, points.length - 1);

    // 1. progress <= 0 must not produce any segments.
    {
        const applicable = canDraw && rawProgress <= 0;
        const passed =
            !applicable ||
            (strokeSegments.length === 0 && areaSegments.length === 0);
        checks.push(
            makeCheck(
                "no-segments-when-progress-not-positive",
                passed,
                `progress ${rawProgress} <= 0 but ${strokeSegments.length} ` +
                    `stroke and ${areaSegments.length} area segments were produced`
            )
        );
    }

    // 2. progress >= 1 must yield points.length - 1 complete segments and no
    //    partial segment.
    {
        const applicable = canDraw && rawProgress >= 1;
        const passed =
            !applicable ||
            (segments === totalSegments && segmentProgress === 0);
        checks.push(
            makeCheck(
                "complete-coverage-when-progress-reaches-one",
                passed,
                `progress ${rawProgress} >= 1 but segments=${segments} ` +
                    `(expected ${totalSegments}) and segmentProgress=${segmentProgress}`
            )
        );
    }

    // 3. The partial-segment endpoint must lie between the current segment's
    //    start and end points.
    {
        const applicable =
            canDraw &&
            clamped > 0 &&
            clamped < 1 &&
            segmentProgress > 0 &&
            segments < totalSegments &&
            endpoint !== null;
        let passed = true;
        let reason: string | undefined;
        if (applicable && endpoint) {
            const p0 = points[segments];
            const p1 = points[segments + 1];
            passed =
                isBetween(endpoint.x, p0.x, p1.x) &&
                isBetween(endpoint.y, p0.y, p1.y);
            if (!passed) {
                reason =
                    `partial endpoint (${endpoint.x}, ${endpoint.y}) is not ` +
                    `between segment ${segments} endpoints (${p0.x}, ${p0.y}) ` +
                    `and (${p1.x}, ${p1.y})`;
            }
        }
        checks.push(
            makeCheck("partial-endpoint-within-current-segment", passed, reason)
        );
    }

    // 4. Every area baseline closure point must sit exactly on the baseline.
    {
        const offBaseline = areaSegments.filter(
            (seg) =>
                seg.baselineEnd.y !== input.baselineY ||
                seg.baselineStart.y !== input.baselineY
        );
        checks.push(
            makeCheck(
                "area-baseline-closure-matches-baseline",
                offBaseline.length === 0,
                `${offBaseline.length} area segment(s) have baseline closure ` +
                    `points with y != ${input.baselineY}`
            )
        );
    }

    // 5. Cubic lines: the first and last line segments must be quadratic, all
    //    middle segments must be cubic (checked by segment index, so partial
    //    draws that never reach the last segment still validate correctly).
    if (cubicMode) {
        let passed = true;
        let reason: string | undefined;
        for (const seg of strokeSegments) {
            const expected =
                seg.segment === 0 || seg.segment === totalSegments - 1
                    ? "quadratic"
                    : "cubic";
            if (seg.kind !== expected) {
                passed = false;
                reason =
                    `stroke segment ${seg.segment} is "${seg.kind}", ` +
                    `expected "${expected}"`;
                break;
            }
        }
        checks.push(makeCheck("cubic-segment-type-sequence", passed, reason));
    }

    // 6. When area fill is disabled the area segment list must be empty.
    {
        const applicable = !areaFill;
        const passed = !applicable || areaSegments.length === 0;
        checks.push(
            makeCheck(
                "area-empty-when-fill-disabled",
                passed,
                `area fill is disabled but ${areaSegments.length} area segments were produced`
            )
        );
    }

    return {
        degraded: degradationReasons.length > 0,
        degradationReasons,
        affectedFields: Array.from(affectedFields),
        progress: { raw: rawProgress, clamped },
        segments,
        segmentProgress,
        endpoint,
        strokeSegments,
        areaSegments,
        checks,
    };
}
