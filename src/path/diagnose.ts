/**
 * Diagnostics for the hit-testing and intersection engines.
 *
 * The functions here do not reimplement {@link hitTest} or {@link intersections}: they run the
 * same primitives the engines use and call the engines themselves for their authoritative
 * results, then describe every stage of the decision as plain, JSON-serializable data. Nothing
 * here touches the DOM, the canvas or the network, and the paths passed in are never mutated.
 */
import {Rect} from 'geome'
import {vec2} from 'linearly'

import {type Path, Segment} from '../index'
import {analyzeSegmentIntersections, nearestTime} from './intersections'
import {unlinearSegmentIndex} from './location'
import {segments} from './metrics'
import {of, type PathLike} from './primitives'
import {
	contains,
	defaultTolerance,
	type FillRule,
	hitTest,
	type HitTestOptions,
	type HitTestResult,
	intersections,
	type IntersectionsOptions,
} from './queries'

/** Why a diagnostic could not run the full pipeline. */
export type DiagnoseDegradedReason =
	| 'empty-path'
	| 'zero-tolerance'
	| 'negative-tolerance'

/** A candidate examined by one stage of a hit test. */
export interface HitTestStageCandidate {
	/** The point of the candidate (the vertex, handle or nearest stroke point). */
	point: vec2
	/** Distance from the query point to the candidate. */
	distance: number
	/** Whether this is the candidate the stage ultimately selected. */
	selected: boolean
	/** Curve the candidate belongs to, when it has one. */
	curveIndex?: number
	/** Vertex the candidate belongs to, when it has one. */
	vertexIndex?: number
	/** `in` for the handle arriving at the vertex, `out` for the one leaving it. */
	side?: 'in' | 'out'
	/** The in-curve segment index of a stroke candidate. */
	segmentIndex?: number
	/** The segment-time of a stroke candidate. */
	time?: number
}

/** One stage of the hit-test pipeline, in the order the engine runs it. */
export interface HitTestStageReport {
	/** `vertex`, `handle`, `stroke` or `fill`. */
	stage: 'vertex' | 'handle' | 'stroke' | 'fill'
	/** Whether the stage produced a hit. */
	hit: boolean
	/** True when the stage was not run at all (for example the fill with `fillRule: null`). */
	skipped: boolean
	/** Every candidate the stage considered, the selected one marked with `selected: true`. */
	candidates: HitTestStageCandidate[]
	/** A short textual description of what the stage found when it hit. */
	description: string | null
}

/** The structured result of diagnosing a {@link hitTest} call. */
export interface HitTestDiagnosis {
	/** `degraded` when the inputs did not allow the full pipeline, otherwise `ok`. */
	status: 'ok' | 'degraded'
	/** What forced the degraded status, when {@link status} is `degraded`. */
	reason: DiagnoseDegradedReason | null
	/** The query point the diagnosis was run for. */
	query: vec2
	/** The tolerance actually used. */
	tolerance: number
	/** The fill rule actually used (`null` means the fill stage is disabled). */
	fillRule: FillRule | null
	/** The final hit type, identical to the `type` of the real {@link hitTest} result. */
	hitType: HitTestResult['type'] | null
	/** Curve index of the final hit, when it has one. */
	curveIndex: number | null
	/** Vertex index of the final hit, when it has one. */
	vertexIndex: number | null
	/** Handle side of the final hit, when it is a handle. */
	handleSide: 'in' | 'out' | null
	/** Distance to the stroke of the final hit, when it is a stroke hit. */
	strokeDistance: number | null
	/** Whether the query point hit anything. */
	hit: boolean
	/** The stages in the exact order the engine evaluates them. */
	stages: HitTestStageReport[]
	/** The exact object {@link hitTest} returns, embedded as plain data. */
	result: HitTestResult | null
}

/** The report for one pair of candidate segments during an intersection search. */
export interface IntersectionPairReport {
	/** Linear segment index on the first path. */
	segmentIndexA: number
	/** Linear segment index on the second path. */
	segmentIndexB: number
	/** Curve index on the first path. */
	curveIndexA: number
	/** Curve index on the second path. */
	curveIndexB: number
	/** In-curve segment index on the first path. */
	segmentInCurveA: number
	/** In-curve segment index on the second path. */
	segmentInCurveB: number
	/** Whether the widened bounding boxes overlap, i.e. the pair passed the coarse filter. */
	boundsFilterPassed: boolean
	/** Whether the solver classified the pair as sharing a stretch of curve. */
	overlap: boolean
	/** How many intersections the solver returned for this pair, before sorting/deduping. */
	intersectionCount: number
	/** The intersections of this pair, as segment times plus the shared point. */
	intersections: {t1: number; t2: number; point: vec2}[]
}

/** One intersection in the final, sorted output. */
export interface DiagnosedIntersection {
	point: vec2
	a: {curveIndex: number; segmentIndex: number; time: number}
	b: {curveIndex: number; segmentIndex: number; time: number}
}

/** The structured result of diagnosing an {@link intersections} call. */
export interface IntersectionsDiagnosis {
	/** `degraded` when the inputs did not allow the full pipeline, otherwise `ok`. */
	status: 'ok' | 'degraded'
	/** What forced the degraded status, when {@link status} is `degraded`. */
	reason: DiagnoseDegradedReason | null
	/** The tolerance actually used. */
	tolerance: number
	/** True when the two paths have no intersection at all. */
	disjoint: boolean
	/** One entry per candidate segment pair, in iteration order. */
	pairs: IntersectionPairReport[]
	/** How many pairs passed the bounding-box coarse filter. */
	pairsPassedBoundsFilter: number
	/** How many pairs were classified as overlapping curves. */
	overlappingPairs: number
	/** The final intersection count, identical to the real {@link intersections} result. */
	intersectionCount: number
	/** The final intersections ordered along the first path, identical to the real result. */
	intersections: DiagnosedIntersection[]
}

/** The options of {@link diagnoseHitTest}. */
export type DiagnoseHitTestOptions = HitTestOptions

/** The options of {@link diagnoseIntersections}. */
export type DiagnoseIntersectionsOptions = IntersectionsOptions

function emptyHitTestDiagnosis(
	query: vec2,
	tolerance: number,
	fillRule: FillRule | null,
	reason: DiagnoseDegradedReason
): HitTestDiagnosis {
	return {
		status: 'degraded',
		reason,
		query: [query[0], query[1]],
		tolerance,
		fillRule,
		hitType: null,
		curveIndex: null,
		vertexIndex: null,
		handleSide: null,
		strokeDistance: null,
		hit: false,
		stages: [],
		result: null,
	}
}

function emptyIntersectionsDiagnosis(
	tolerance: number,
	reason: DiagnoseDegradedReason | null
): IntersectionsDiagnosis {
	return {
		status: reason ? 'degraded' : 'ok',
		reason,
		tolerance,
		disjoint: true,
		pairs: [],
		pairsPassedBoundsFilter: 0,
		overlappingPairs: 0,
		intersectionCount: 0,
		intersections: [],
	}
}

/**
 * Runs the vertex and handle stages of {@link hitTest} as the engine does, recording every
 * candidate within the tolerance instead of only the winner.
 */
function collectPointCandidates(
	path: Path,
	query: vec2,
	tolerance: number,
	stage: 'vertex' | 'handle'
): {report: HitTestStageReport; winner: HitTestResult | null} {
	const candidates: HitTestStageCandidate[] = []
	// Boxed because TypeScript does not track assignments made inside forEach callbacks when
	// narrowing a `let` binding.
	const state: {winner: HitTestResult | null; closestDistance: number} = {
		winner: null,
		closestDistance: tolerance,
	}

	if (stage === 'vertex') {
		path.curves.forEach(({vertices}, curveIndex) => {
			vertices.forEach((vertex, vertexIndex) => {
				const distance = vec2.distance(vertex.point, query)
				if (distance <= state.closestDistance) {
					state.closestDistance = distance
					state.winner = {
						type: 'vertex',
						curveIndex,
						vertexIndex,
						point: vertex.point,
					}
				}
				if (distance <= tolerance) {
					candidates.push({
						point: [vertex.point[0], vertex.point[1]],
						distance,
						selected: false,
						curveIndex,
						vertexIndex,
					})
				}
			})
		})
	} else {
		path.curves.forEach(({vertices, closed}, curveIndex) => {
			vertices.forEach((vertex, vertexIndex) => {
				if (vertex.command !== 'C') return
				const [c1, c2] = vertex.args
				// The first handle belongs to the previous vertex
				const prevIndex =
					vertexIndex === 0
						? closed
							? vertices.length - 1
							: -1
						: vertexIndex - 1
				const handles: [vec2, number, 'in' | 'out'][] = [
					[c2, vertexIndex, 'in'],
				]
				if (prevIndex >= 0) handles.push([c1, prevIndex, 'out'])
				for (const [handle, index, side] of handles) {
					const distance = vec2.distance(handle, query)
					if (distance <= state.closestDistance) {
						state.closestDistance = distance
						state.winner = {
							type: 'handle',
							curveIndex,
							vertexIndex: index,
							side,
							point: handle,
						}
					}
					if (distance <= tolerance) {
						candidates.push({
							point: [handle[0], handle[1]],
							distance,
							selected: false,
							curveIndex,
							vertexIndex: index,
							side,
						})
					}
				}
			})
		})
	}

	const {winner, closestDistance} = state
	let description: string | null = null
	if (winner) {
		if (winner.type === 'vertex') {
			const selected = candidates.find(
				c =>
					c.curveIndex === winner.curveIndex &&
					c.vertexIndex === winner.vertexIndex
			)
			if (selected) selected.selected = true
			description = `vertex curve ${winner.curveIndex} index ${winner.vertexIndex} at distance ${closestDistance}`
		} else if (winner.type === 'handle') {
			const selected = candidates.find(
				c =>
					c.curveIndex === winner.curveIndex &&
					c.vertexIndex === winner.vertexIndex &&
					c.side === winner.side
			)
			if (selected) selected.selected = true
			description = `handle (${winner.side}) of vertex ${winner.vertexIndex} on curve ${winner.curveIndex} at distance ${closestDistance}`
		}
	}

	return {
		report: {
			stage,
			hit: winner !== null,
			skipped: false,
			candidates,
			description,
		},
		winner,
	}
}

/**
 * Diagnoses what {@link hitTest} finds under a point, describing every stage of the decision.
 * The final fields are taken from the real {@link hitTest}, so they match it exactly.
 * @param pathLike The path to test against
 * @param point The query point
 * @param options The same options as {@link hitTest}
 * @returns A plain, JSON-serializable diagnostic object
 */
export function diagnoseHitTest(
	pathLike: PathLike,
	point: vec2,
	{tolerance = 4, fillRule = 'nonzero'}: DiagnoseHitTestOptions = {}
): HitTestDiagnosis {
	const path = of(pathLike)
	const query: vec2 = [point[0], point[1]]

	if (path.curves.length === 0) {
		return emptyHitTestDiagnosis(query, tolerance, fillRule, 'empty-path')
	}
	if (tolerance < 0) {
		return emptyHitTestDiagnosis(
			query,
			tolerance,
			fillRule,
			'negative-tolerance'
		)
	}

	const stages: HitTestStageReport[] = []

	const vertex = collectPointCandidates(path, query, tolerance, 'vertex')
	stages.push(vertex.report)

	if (!vertex.winner) {
		const handle = collectPointCandidates(path, query, tolerance, 'handle')
		stages.push(handle.report)
	} else {
		stages.push({
			stage: 'handle',
			hit: false,
			skipped: true,
			candidates: [],
			description: null,
		})
	}

	// The stroke and fill stages are only reached when neither vertices nor handles hit.
	const earlierHit = vertex.winner || stages[1]!.hit
	let strokeReport: HitTestStageReport
	if (earlierHit) {
		strokeReport = {
			stage: 'stroke',
			hit: false,
			skipped: true,
			candidates: [],
			description: null,
		}
	} else {
		const strokeCandidates: HitTestStageCandidate[] = []
		const segs = segments(path)
		let nearestDistance = Infinity
		let nearestLinearIndex = -1
		let nearestT = 0
		segs.forEach((seg, linearIndex) => {
			const {t, distance} = nearestTime(seg, query)
			if (distance < nearestDistance) {
				nearestDistance = distance
				nearestLinearIndex = linearIndex
				nearestT = t
			}
			if (distance <= tolerance) {
				const {curveIndex, segmentIndex} = unlinearSegmentIndex(
					path,
					linearIndex
				)
				const p = Segment.point(seg, {time: t})
				strokeCandidates.push({
					point: [p[0], p[1]],
					distance,
					selected: false,
					curveIndex,
					segmentIndex,
					time: t,
				})
			}
		})
		const strokeHit = nearestLinearIndex >= 0 && nearestDistance <= tolerance
		if (strokeHit) {
			const nearestLoc = unlinearSegmentIndex(path, nearestLinearIndex)
			const selected = strokeCandidates.find(
				c =>
					c.curveIndex === nearestLoc.curveIndex &&
					c.segmentIndex === nearestLoc.segmentIndex &&
					c.time === nearestT
			)
			if (selected) selected.selected = true
		}
		strokeReport = {
			stage: 'stroke',
			hit: strokeHit,
			skipped: false,
			candidates: strokeCandidates,
			description: strokeHit
				? `nearest point at distance ${nearestDistance} on segment ${nearestLinearIndex} at time ${nearestT}`
				: null,
		}
	}
	stages.push(strokeReport)

	if (fillRule === null) {
		stages.push({
			stage: 'fill',
			hit: false,
			skipped: true,
			candidates: [],
			description: null,
		})
	} else if (earlierHit || strokeReport.hit) {
		stages.push({
			stage: 'fill',
			hit: false,
			skipped: true,
			candidates: [],
			description: null,
		})
	} else {
		const inside = contains(path, query, {fillRule})
		stages.push({
			stage: 'fill',
			hit: inside,
			skipped: false,
			candidates: inside
				? [
						{
							point: [query[0], query[1]],
							distance: 0,
							selected: true,
						},
					]
				: [],
			description: inside
				? `point lies inside the path under the ${fillRule} rule`
				: null,
		})
	}

	// The authoritative result: identical to what the real engine returns for these inputs.
	const result = hitTest(path, query, {tolerance, fillRule})
	const addressed =
		result && (result.type === 'vertex' || result.type === 'handle')
			? result
			: null

	return {
		status: tolerance === 0 ? 'degraded' : 'ok',
		reason: tolerance === 0 ? 'zero-tolerance' : null,
		query,
		tolerance,
		fillRule,
		hitType: result ? result.type : null,
		curveIndex: addressed ? addressed.curveIndex : null,
		vertexIndex: addressed ? addressed.vertexIndex : null,
		handleSide: result && result.type === 'handle' ? result.side : null,
		strokeDistance: result && result.type === 'stroke' ? result.distance : null,
		hit: result !== null,
		stages,
		result,
	}
}

/**
 * Diagnoses where two paths intersect, reporting for every candidate segment pair whether it
 * passed the bounding-box coarse filter, whether it was treated as overlapping, and what the
 * solver found. The final intersection list is the exact output of the real {@link intersections}.
 * @param a The first path
 * @param b The second path
 * @param options The same options as {@link intersections}
 * @returns A plain, JSON-serializable diagnostic object
 */
export function diagnoseIntersections(
	a: PathLike,
	b: PathLike,
	{tolerance}: DiagnoseIntersectionsOptions = {}
): IntersectionsDiagnosis {
	const pathA = of(a)
	const pathB = of(b)

	if (pathA.curves.length === 0 || pathB.curves.length === 0) {
		const eps = tolerance ?? defaultTolerance(pathA, pathB)
		return emptyIntersectionsDiagnosis(eps, 'empty-path')
	}

	const eps = tolerance ?? defaultTolerance(pathA, pathB)
	if (eps < 0) {
		return emptyIntersectionsDiagnosis(eps, 'negative-tolerance')
	}

	const segsA = segments(pathA)
	const segsB = segments(pathB).map(seg => ({
		seg,
		bounds: Rect.offset(Segment.bounds(seg), eps),
	}))

	const pairs: IntersectionPairReport[] = []
	let pairsPassedBoundsFilter = 0
	let overlappingPairs = 0

	segsA.forEach((segA, ia) => {
		const boundsA = Rect.offset(Segment.bounds(segA), eps)
		const locA = unlinearSegmentIndex(pathA, ia)
		segsB.forEach(({seg: segB, bounds: boundsB}, ib) => {
			const locB = unlinearSegmentIndex(pathB, ib)
			const passed = Rect.intersects(boundsA, boundsB)
			const analysis = passed
				? analyzeSegmentIntersections(segA, segB, eps)
				: {boundsIntersect: false, overlap: false, intersections: []}

			if (passed) pairsPassedBoundsFilter++
			if (analysis.overlap) overlappingPairs++

			pairs.push({
				segmentIndexA: ia,
				segmentIndexB: ib,
				curveIndexA: locA.curveIndex,
				segmentInCurveA: locA.segmentIndex,
				curveIndexB: locB.curveIndex,
				segmentInCurveB: locB.segmentIndex,
				boundsFilterPassed: passed,
				overlap: analysis.overlap,
				intersectionCount: analysis.intersections.length,
				intersections: analysis.intersections.map(({t1, t2, point}) => ({
					t1,
					t2,
					point: [point[0], point[1]],
				})),
			})
		})
	})

	// The authoritative output: sorting and deduping included, identical to the real engine.
	const real = intersections(pathA, pathB, {tolerance: eps})

	return {
		status: eps === 0 ? 'degraded' : 'ok',
		reason: eps === 0 ? 'zero-tolerance' : null,
		tolerance: eps,
		disjoint: real.length === 0,
		pairs,
		pairsPassedBoundsFilter,
		overlappingPairs,
		intersectionCount: real.length,
		intersections: real.map(({point, a: locA, b: locB}) => ({
			point: [point[0], point[1]],
			a: {
				curveIndex: locA.curveIndex,
				segmentIndex: locA.segmentIndex,
				time: locA.time,
			},
			b: {
				curveIndex: locB.curveIndex,
				segmentIndex: locB.segmentIndex,
				time: locB.time,
			},
		})),
	}
}
