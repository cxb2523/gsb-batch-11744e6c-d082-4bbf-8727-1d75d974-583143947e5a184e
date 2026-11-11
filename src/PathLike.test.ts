import {describe, expect, it} from 'vitest'

import {Path} from './index'

describe('PathLike', () => {
	it('reads a rect as a rectangle from its min to its max', () => {
		const rect = [
			[0, 0],
			[10, 20],
		] as const
		expect(Path.of(rect)).toEqual(Path.rectangle([0, 0], [10, 20]))
		expect(Path.length(rect)).toBeCloseTo(60)
		expect(Path.bounds(Path.offset(rect, 5))).toEqual([
			[-5, -5],
			[15, 25],
		])
	})

	it('reads a circle as a circle', () => {
		const circle = {center: [0, 0], radius: 10} as const
		expect(Path.of(circle)).toEqual(Path.circle([0, 0], 10))
		expect(Path.length(circle)).toBeCloseTo(2 * Math.PI * 10, 1)
	})

	it('leaves a path as it is', () => {
		const path = Path.line([0, 0], [10, 0])
		expect(Path.of(path)).toBe(path)
		expect(Path.length(Path.trim(path, 0, 0.5))).toBeCloseTo(5)
	})
})
