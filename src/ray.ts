import {mat2d, vec2} from 'linearly'

/**
 * A half-line given by its origin and the angle, in degrees, of its direction.
 *
 * geome 0.3 no longer ships a `Ray` namespace, so Pave keeps the small surface it needs here:
 * a plain, JSON-serializable value plus the two factories the rest of the library uses.
 */
export type Ray = {
	origin: vec2
	angle: number
}

export namespace Ray {
	/** Creates a ray from an origin and a direction angle in degrees. */
	export function of(origin: vec2, angle: number): Ray {
		return {origin, angle}
	}

	/**
	 * The frame of the ray as a 2D affine matrix: the x-axis points along the ray, the y-axis
	 * along its normal, and the translation sits at the origin.
	 */
	export function toMat2d(ray: Ray): mat2d {
		const rotation = mat2d.fromRotation(ray.angle)
		const translation = mat2d.fromTranslation(ray.origin)
		return mat2d.multiply(translation, rotation)
	}
}
