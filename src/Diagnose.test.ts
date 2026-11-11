import {describe, expect, it} from 'vitest'

import {Path} from './index'
import {
	diagnoseHitTest,
	diagnoseIntersections,
	type HitTestDiagnosis,
	type IntersectionsDiagnosis,
} from './path/diagnose'
import {hitTest, intersections} from './path/queries'

/** A path mixing a straight segment and a cubic Bézier in one open curve. */
function mixedPath() {
	const pen = new Path.Pen()
	pen.moveTo([0, 0])
	pen.lineTo([100, 0])
	pen.cubicBezierTo([100, 100], [200, 100], [200, 0])
	return pen.get()
}

/** Recursively asserts a value holds nothing but JSON data. */
function expectJsonSafe(value: unknown, seen = new Set<object>()): void {
	if (value === null || typeof value !== 'object') {
		expect(typeof value === 'function').toBe(false)
		return
	}
	if (seen.has(value))
		throw new Error('diagnostic contains a circular reference')
	seen.add(value)
	expect(value.constructor === Object || Array.isArray(value)).toBe(true)
	for (const item of Array.isArray(value) ? value : Object.values(value)) {
		expect(typeof item).not.toBe('function')
		if (item !== null && typeof item === 'object') {
			expectJsonSafe(item, seen)
		}
	}
}

describe('diagnoseHitTest', () => {
	const path = mixedPath()

	it('matches hitTest item by item and keeps the stage order', () => {
		const queries: vec2ish[] = [
			// Exactly on the first vertex
			[0, 0],
			// Near the first vertex, within the default tolerance
			[2, 1],
			// On the straight stroke, away from vertices
			[50, 2],
			// Near the cubic's second control handle (the `in` handle of vertex 2)
			[198, 98],
			// Near the cubic's first control handle (the `out` handle of vertex 1)
			[102, 98],
			// Far away from everything
			[400, 400],
		]

		for (const query of queries) {
			const expected = hitTest(path, query)
			const diag = diagnoseHitTest(path, query)

			// The flattened final fields must equal the real result item by item
			expect(diag.hitType).toEqual(expected ? expected.type : null)
			if (
				expected &&
				(expected.type === 'vertex' || expected.type === 'handle')
			) {
				expect(diag.curveIndex).toBe(expected.curveIndex)
				expect(diag.vertexIndex).toBe(expected.vertexIndex)
			} else {
				expect(diag.curveIndex).toBeNull()
				expect(diag.vertexIndex).toBeNull()
			}
			if (expected && expected.type === 'handle') {
				expect(diag.handleSide).toBe(expected.side)
			} else {
				expect(diag.handleSide).toBeNull()
			}
			if (expected && expected.type === 'stroke') {
				expect(diag.strokeDistance).toBeCloseTo(expected.distance, 12)
			} else {
				expect(diag.strokeDistance).toBeNull()
			}
			expect(diag.hit).toBe(expected !== null)
			// The embedded object is exactly what hitTest returns
			expect(diag.result).toEqual(expected)

			// Stages are listed in the engine's fixed evaluation order
			expect(diag.stages.map(s => s.stage)).toEqual([
				'vertex',
				'handle',
				'stroke',
				'fill',
			])

			// Exactly one stage (at most) is the deciding hit
			const hittingStages = diag.stages.filter(s => s.hit)
			expect(hittingStages.length).toBe(expected ? 1 : 0)
			if (expected) expect(hittingStages[0]!.stage).toBe(expected.type)

			// Every hit stage carries a candidate description and a selected candidate
			for (const stage of diag.stages) {
				if (stage.hit) {
					expect(stage.description).not.toBeNull()
					expect(stage.candidates.some(c => c.selected)).toBe(true)
				} else if (!stage.skipped) {
					expect(stage.candidates.every(c => !c.selected)).toBe(true)
				}
			}
		}
	})

	it('reports the fill stage for a closed path and honors the fill rule', () => {
		const square = Path.rect([0, 0], [100, 100])
		const diag = diagnoseHitTest(square, [50, 50])
		expect(diag.hitType).toBe('fill')
		const fillStage = diag.stages.find(s => s.stage === 'fill')!
		expect(fillStage.hit).toBe(true)
		expect(fillStage.skipped).toBe(false)
		expect(fillStage.candidates).toHaveLength(1)

		// fillRule: null disables the fill stage
		const disabled = diagnoseHitTest(square, [50, 50], {fillRule: null})
		expect(disabled.hitType).toBeNull()
		const skippedFill = disabled.stages.find(s => s.stage === 'fill')!
		expect(skippedFill.skipped).toBe(true)
		expect(skippedFill.hit).toBe(false)

		// evenodd on a doubled square cancels the fill
		const doubled = Path.merge([square, square])
		const evenodd = diagnoseHitTest(doubled, [50, 50], {fillRule: 'evenodd'})
		expect(evenodd.hitType).toBeNull()
		expect(evenodd.stages.find(s => s.stage === 'fill')!.hit).toBe(false)
	})

	it('marks skipped stages once an earlier stage wins', () => {
		const diag = diagnoseHitTest(path, [0, 0])
		expect(diag.hitType).toBe('vertex')
		const [, handle, stroke, fill] = diag.stages
		expect(handle!.skipped).toBe(true)
		expect(stroke!.skipped).toBe(true)
		expect(fill!.skipped).toBe(true)
	})

	it('agrees with hitTest under a custom tolerance for many points', () => {
		for (let x = -10; x <= 210; x += 15) {
			for (let y = -10; y <= 110; y += 15) {
				const diag = diagnoseHitTest(path, [x, y], {tolerance: 6})
				const expected = hitTest(path, [x, y], {tolerance: 6})
				expect(diag.hitType).toEqual(expected ? expected.type : null)
				expect(diag.result).toEqual(expected)
			}
		}
	})

	it('agrees with hitTest for randomized paths, points and tolerances', () => {
		// A deterministic pseudo-random generator so the sample needs no network or credentials.
		let seed = 0x2f6e2b1
		const rand = () => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff
			return seed / 0x7fffffff
		}
		const point = (): vec2ish => [rand() * 200 - 50, rand() * 200 - 50]

		for (let trial = 0; trial < 40; trial++) {
			const pen = new Path.Pen()
			pen.moveTo(point())
			const steps = 2 + Math.floor(rand() * 4)
			for (let i = 0; i < steps; i++) {
				if (rand() > 0.5) {
					pen.cubicBezierTo(point(), point(), point())
				} else {
					pen.lineTo(point())
				}
			}
			if (rand() > 0.5) pen.close()
			const sample = pen.get()
			const tolerance = [0, 0.5, 2, 8, 20][Math.floor(rand() * 5)]!

			for (let k = 0; k < 12; k++) {
				const query = point()
				const diag = diagnoseHitTest(sample, query, {tolerance})
				const expected = hitTest(sample, query, {tolerance})

				expect(diag.hitType).toEqual(expected ? expected.type : null)
				expect(diag.hit).toBe(expected !== null)
				expect(diag.result).toEqual(expected)
				if (
					expected &&
					(expected.type === 'vertex' || expected.type === 'handle')
				) {
					expect(diag.curveIndex).toBe(expected.curveIndex)
					expect(diag.vertexIndex).toBe(expected.vertexIndex)
				}
				if (expected && expected.type === 'handle') {
					expect(diag.handleSide).toBe(expected.side)
				}
				if (expected && expected.type === 'stroke') {
					expect(diag.strokeDistance).toBeCloseTo(expected.distance, 12)
				}
				expect(diag.stages.map(s => s.stage)).toEqual([
					'vertex',
					'handle',
					'stroke',
					'fill',
				])
			}
		}
	})

	it('returns a degraded status for an empty path without throwing', () => {
		const diag = diagnoseHitTest(Path.empty, [10, 10])
		expect(diag.status).toBe('degraded')
		expect(diag.reason).toBe('empty-path')
		expect(diag.hitType).toBeNull()
		expect(diag.stages).toEqual([])
		expect(diag.result).toBeNull()
		expect(() => JSON.stringify(diag)).not.toThrow()
	})

	it('returns a degraded status for zero and negative tolerance without throwing', () => {
		const zero = diagnoseHitTest(path, [0, 0], {tolerance: 0})
		expect(zero.status).toBe('degraded')
		expect(zero.reason).toBe('zero-tolerance')
		expect(zero.hitType).toBe('vertex')
		expect(zero.result).toEqual(hitTest(path, [0, 0], {tolerance: 0}))

		const negative = diagnoseHitTest(path, [0, 0], {tolerance: -1})
		expect(negative.status).toBe('degraded')
		expect(negative.reason).toBe('negative-tolerance')
		expect(negative.hitType).toBeNull()
	})

	it('never mutates the path it diagnoses', () => {
		const snapshot = JSON.parse(JSON.stringify(path))
		diagnoseHitTest(path, [50, 2])
		diagnoseHitTest(path, [198, 98], {tolerance: 8})
		expect(JSON.parse(JSON.stringify(path))).toEqual(snapshot)
	})

	it('produces JSON-serializable output with no functions or class instances', () => {
		for (const query of [
			[0, 0],
			[50, 2],
			[198, 98],
			[400, 400],
		] as vec2ish[]) {
			const diag = diagnoseHitTest(path, query)
			expectJsonSafe(diag)
			const roundTripped: HitTestDiagnosis = JSON.parse(JSON.stringify(diag))
			expect(roundTripped).toEqual(diag)
		}
	})
})

describe('diagnoseIntersections', () => {
	it('matches the real intersections count and ordering for crossing paths', () => {
		const a = Path.line([-50, 50], [250, 50])
		const b = mixedPath()

		const expected = intersections(a, b)
		const diag = diagnoseIntersections(a, b)

		expect(diag.status).toBe('ok')
		expect(diag.intersectionCount).toBe(expected.length)
		expect(diag.disjoint).toBe(expected.length === 0)
		expect(diag.intersections).toHaveLength(expected.length)

		// Point-for-point and location-for-location equality with the real result
		diag.intersections.forEach((got, i) => {
			const want = expected[i]!
			expect(got.point[0]).toBeCloseTo(want.point[0], 12)
			expect(got.point[1]).toBeCloseTo(want.point[1], 12)
			expect(got.a.curveIndex).toBe(want.a.curveIndex)
			expect(got.a.segmentIndex).toBe(want.a.segmentIndex)
			expect(got.a.time).toBeCloseTo(want.a.time, 12)
			expect(got.b.curveIndex).toBe(want.b.curveIndex)
			expect(got.b.segmentIndex).toBe(want.b.segmentIndex)
			expect(got.b.time).toBeCloseTo(want.b.time, 12)
		})

		// The output is ordered along the first path
		const alongA = diag.intersections.map(x => x.a)
		const sorted = [...alongA].sort(
			(p, q) =>
				p.curveIndex - q.curveIndex ||
				p.segmentIndex - q.segmentIndex ||
				p.time - q.time
		)
		expect(alongA).toEqual(sorted)

		// Every segment pair of both paths is accounted for
		const segsA = Path.segments(a).length
		const segsB = Path.segments(b).length
		expect(diag.pairs).toHaveLength(segsA * segsB)
		expect(
			diag.pairs.every(
				p =>
					typeof p.boundsFilterPassed === 'boolean' &&
					typeof p.overlap === 'boolean' &&
					p.intersectionCount === p.intersections.length
			)
		).toBe(true)
		expect(diag.pairsPassedBoundsFilter).toBe(
			diag.pairs.filter(p => p.boundsFilterPassed).length
		)
		expect(diag.overlappingPairs).toBe(diag.pairs.filter(p => p.overlap).length)
	})

	it('reports zero intersections and every coarse filter rejected for separated paths', () => {
		const a = Path.rect([0, 0], [50, 50])
		const b = Path.rect([300, 300], [400, 400])

		const expected = intersections(a, b)
		expect(expected).toHaveLength(0)

		const diag = diagnoseIntersections(a, b)
		expect(diag.intersectionCount).toBe(0)
		expect(diag.disjoint).toBe(true)
		expect(diag.intersections).toEqual([])
		expect(diag.pairs.length).toBeGreaterThan(0)
		expect(diag.pairs.every(p => p.boundsFilterPassed === false)).toBe(true)
		expect(diag.pairsPassedBoundsFilter).toBe(0)
		expect(diag.pairs.every(p => p.overlap === false)).toBe(true)
		expect(diag.pairs.every(p => p.intersectionCount === 0)).toBe(true)
	})

	it('flags an overlapping segment pair as overlap', () => {
		// Two identical cubic Béziers share a whole stretch of curve. Line pairs take the
		// closed-form path in the engine and are never classified as overlaps, so the overlap
		// branch needs a curved pair.
		const a = Path.cubicBezier([0, 0], [40, 100], [160, 100], [200, 0])
		const b = Path.cubicBezier([0, 0], [40, 100], [160, 100], [200, 0])
		const diag = diagnoseIntersections(a, b, {tolerance: 1e-6})
		expect(diag.overlappingPairs).toBeGreaterThan(0)
		expect(diag.pairs.some(p => p.overlap && p.boundsFilterPassed)).toBe(true)
		// The diagnosis still agrees with the real engine on the final count
		expect(diag.intersectionCount).toBe(
			intersections(a, b, {tolerance: 1e-6}).length
		)
	})

	it('returns degraded statuses for empty paths and bad tolerances', () => {
		const line = Path.line([0, 0], [10, 10])

		const emptyA = diagnoseIntersections(Path.empty, line)
		expect(emptyA.status).toBe('degraded')
		expect(emptyA.reason).toBe('empty-path')
		expect(emptyA.intersectionCount).toBe(0)
		expect(emptyA.pairs).toEqual([])

		const emptyB = diagnoseIntersections(line, Path.empty)
		expect(emptyB.status).toBe('degraded')
		expect(emptyB.reason).toBe('empty-path')

		const negative = diagnoseIntersections(line, line, {tolerance: -1})
		expect(negative.status).toBe('degraded')
		expect(negative.reason).toBe('negative-tolerance')
		expect(negative.intersectionCount).toBe(0)

		const zero = diagnoseIntersections(line, line, {tolerance: 0})
		expect(zero.status).toBe('degraded')
		expect(zero.reason).toBe('zero-tolerance')
	})

	it('never mutates either path and stays in sync with intersections for varied pairs', () => {
		const a = mixedPath()
		const b = Path.rect([-20, -20], [120, 120])
		const snapshotA = JSON.parse(JSON.stringify(a))
		const snapshotB = JSON.parse(JSON.stringify(b))

		const tolerances = [undefined, 1e-9, 1e-6, 0.01]
		for (const tolerance of tolerances) {
			const options = tolerance === undefined ? {} : {tolerance}
			const diag = diagnoseIntersections(a, b, options)
			const expected = intersections(a, b, options)
			expect(diag.intersectionCount).toBe(expected.length)
			expect(
				diag.intersections.map(x => [
					x.a.curveIndex,
					x.a.segmentIndex,
					x.a.time,
				])
			).toEqual(expected.map(x => [x.a.curveIndex, x.a.segmentIndex, x.a.time]))
		}

		expect(JSON.parse(JSON.stringify(a))).toEqual(snapshotA)
		expect(JSON.parse(JSON.stringify(b))).toEqual(snapshotB)
	})

	it('agrees with intersections for randomized path pairs and tolerances', () => {
		let seed = 0x8d7a41c3
		const rand = () => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff
			return seed / 0x7fffffff
		}
		const point = (): vec2ish => [rand() * 240 - 60, rand() * 240 - 60]
		const makePath = () => {
			const pen = new Path.Pen()
			pen.moveTo(point())
			for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) {
				if (rand() > 0.5) pen.cubicBezierTo(point(), point(), point())
				else pen.lineTo(point())
			}
			return pen.get()
		}

		for (let trial = 0; trial < 30; trial++) {
			const a = makePath()
			const b = makePath()
			const tolerance = [undefined, 1e-9, 1e-6, 0.1][Math.floor(rand() * 4)]
			const options = tolerance === undefined ? {} : {tolerance}

			const diag = diagnoseIntersections(a, b, options)
			const expected = intersections(a, b, options)

			expect(diag.intersectionCount).toBe(expected.length)
			expect(diag.disjoint).toBe(expected.length === 0)
			expect(diag.intersections).toHaveLength(expected.length)
			diag.intersections.forEach((got, i) => {
				const want = expected[i]!
				expect(got.a.curveIndex).toBe(want.a.curveIndex)
				expect(got.a.segmentIndex).toBe(want.a.segmentIndex)
				expect(got.a.time).toBeCloseTo(want.a.time, 12)
				expect(got.b.curveIndex).toBe(want.b.curveIndex)
				expect(got.b.segmentIndex).toBe(want.b.segmentIndex)
				expect(got.b.time).toBeCloseTo(want.b.time, 12)
				expect(got.point[0]).toBeCloseTo(want.point[0], 12)
				expect(got.point[1]).toBeCloseTo(want.point[1], 12)
			})
			expect(diag.pairs).toHaveLength(
				Path.segments(a).length * Path.segments(b).length
			)
			expect(
				diag.pairs.every(p => p.intersectionCount === p.intersections.length)
			).toBe(true)
		}
	})

	it('produces JSON-serializable output with no functions or class instances', () => {
		const diag = diagnoseIntersections(
			Path.line([-50, 50], [250, 50]),
			mixedPath()
		)
		expectJsonSafe(diag)
		const roundTripped: IntersectionsDiagnosis = JSON.parse(
			JSON.stringify(diag)
		)
		expect(roundTripped).toEqual(diag)

		const disjoint = diagnoseIntersections(
			Path.rect([0, 0], [10, 10]),
			Path.rect([90, 90], [100, 100])
		)
		expect(() => JSON.stringify(disjoint)).not.toThrow()
		expectJsonSafe(disjoint)
	})
})

type vec2ish = [number, number]
