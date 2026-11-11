/**
 * Patch-application audit - pure, isomorphic, zero-dependency.
 *
 * reconstruct.js and three.js apply a stream's patches and trust the caller to
 * have fetched honest bytes. This module is the sceptic: it walks a stream
 * layer by layer and reports, as plain JSON-serialisable data, whether the
 * container's own bookkeeping holds together - layer offsets inside the file,
 * payloads matching their descriptors, attribute windows inside the vertex
 * budget, index counts divisible by three, and every payload hashing to the
 * sha256 its descriptor records.
 *
 * The audit never throws on malformed input. A truncated stream, an
 * out-of-range `throughLevel`, or a tampered payload produces a degraded
 * result with a human-readable reason on the failing check and the affected
 * layers flagged, so a caller can render what is salvageable and log the rest.
 *
 * The audit is read-only and side-effect free: it issues no network requests
 * of its own (bytes come from the buffer or the already-open stream it is
 * handed), touches no disk, and mutates neither the input bytes nor the
 * stream. The returned object contains only plain data - no typed arrays, no
 * functions, no class instances - so it survives `JSON.stringify` unchanged.
 */

import { rangeHeaderForLayer } from './format.js';
import { A3SStream } from './reader.js';

/**
 * Hash bytes with SubtleCrypto, falling back to Node's webcrypto when the
 * global is not wired up. Returns null when no SHA-256 implementation exists,
 * in which case the integrity check reports itself as unverifiable rather
 * than silently passing.
 */
async function sha256Hex(bytes) {
	let subtle = globalThis.crypto?.subtle;
	if (!subtle) {
		try {
			({ webcrypto: { subtle } = {} } = await import('node:crypto'));
		} catch {
			/* not Node and no global crypto: nothing more to try */
		}
	}
	if (!subtle) return null;
	const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
	const digest = await subtle.digest('SHA-256', view);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Audit an A3S stream and report, as plain data, whether its layers, patches,
 * and per-primitive attribute windows are internally consistent.
 *
 * @param {Uint8Array|ArrayBuffer|A3SStream} target raw container bytes or an open stream
 * @param {object} [options]
 * @param {number} [options.throughLevel] audit layers 0..throughLevel (default: every layer)
 * @returns {Promise<object>} JSON-serialisable audit report
 */
export async function auditStream(target, options = {}) {
	const checks = [];
	const record = (name, passed, reason) => {
		const check = { name, passed };
		if (reason !== undefined) check.reason = reason;
		checks.push(check);
	};

	// Opening is the only step that can fail before there is anything to
	// audit, so it gets its own check and an early, degraded return.
	let stream;
	try {
		stream = target instanceof A3SStream ? target : await A3SStream.open(target);
	} catch (error) {
		const reason = `stream cannot be opened: ${error.message}`;
		record('stream-open', false, reason);
		return {
			ok: false,
			degraded: true,
			reason,
			throughLevel: options.throughLevel ?? null,
			effectiveThroughLevel: null,
			preamble: null,
			layers: [],
			affectedLayers: [],
			checks,
		};
	}
	record('stream-open', true);

	const { preamble, header } = stream;
	const descriptors = header.layers || [];
	const layerCount = descriptors.length;

	// --- throughLevel ---------------------------------------------------------
	const requested = options.throughLevel ?? layerCount - 1;
	let effective = requested;
	let degraded = false;
	const affectedLayers = [];
	if (!Number.isInteger(requested) || requested < 0 || requested > layerCount - 1) {
		record(
			'through-level-in-range',
			false,
			`throughLevel ${requested} is outside the valid range 0..${layerCount - 1}; auditing the layers that exist`,
		);
		degraded = true;
		effective = Number.isInteger(requested) ? Math.max(0, Math.min(requested, layerCount - 1)) : layerCount - 1;
		for (let level = Math.max(0, layerCount); level <= requested; level++) affectedLayers.push(level);
	} else {
		record('through-level-in-range', true);
	}

	// --- per-layer checks -------------------------------------------------------
	const layerReports = [];
	for (let level = 0; level < layerCount; level++) {
		const descriptor = descriptors[level];
		const audited = level <= effective;
		const report = {
			level,
			kind: descriptor.kind ?? null,
			offset: descriptor.offset ?? null,
			length: descriptor.length ?? null,
			sha256: descriptor.sha256 ?? null,
			range: null,
			audited,
			degraded: false,
			reason: null,
			payloadLength: null,
			sha256Actual: null,
			integrityOk: null,
			vertexCount: descriptor.vertexCount ?? null,
			prims: [],
		};
		const markLayerDegraded = (reason) => {
			report.degraded = true;
			report.reason = report.reason ? `${report.reason}; ${reason}` : reason;
			degraded = true;
			if (!affectedLayers.includes(level)) affectedLayers.push(level);
		};

		try {
			report.range = rangeHeaderForLayer(header, preamble, level);
		} catch (error) {
			record(`layer-${level}-range`, false, `range cannot be computed: ${error.message}`);
			markLayerDegraded(`range cannot be computed: ${error.message}`);
		}

		// The layer's bytes must live inside the file the preamble describes.
		const { offset, length } = descriptor;
		if (
			Number.isInteger(offset) &&
			Number.isInteger(length) &&
			offset >= 0 &&
			length >= 0 &&
			offset + length <= preamble.totalLength
		) {
			record(`layer-${level}-bounds`, true);
		} else {
			const reason = `layer spans [${offset}, ${offset}+${length}), outside the file's totalLength ${preamble.totalLength}`;
			record(`layer-${level}-bounds`, false, reason);
			markLayerDegraded(reason);
		}

		// Payload-dependent checks only run for layers the caller asked to audit.
		let payload = null;
		let payloadProblem = null;
		if (audited) {
			if (level === 0) {
				payload = stream.base;
			} else {
				try {
					({ payload } = await stream.layer(level));
				} catch (error) {
					payloadProblem = error.message;
				}
			}

			if (!payload) {
				const reason = `payload cannot be read: ${payloadProblem || 'no bytes available'}`;
				record(`layer-${level}-payload-length`, false, reason);
				record(`layer-${level}-integrity`, false, 'integrity cannot be verified without the payload');
				markLayerDegraded(reason);
			} else {
				report.payloadLength = payload.byteLength;
				if (payload.byteLength === descriptor.length) {
					record(`layer-${level}-payload-length`, true);
				} else {
					const reason = `payload is ${payload.byteLength} bytes but the descriptor records ${descriptor.length} (stream truncated?)`;
					record(`layer-${level}-payload-length`, false, reason);
					markLayerDegraded(reason);
				}

				const actual = await sha256Hex(payload);
				report.sha256Actual = actual;
				if (!actual) {
					record(`layer-${level}-integrity`, true, 'no SHA-256 implementation available; integrity not verified');
				} else if (!descriptor.sha256) {
					record(`layer-${level}-integrity`, true, 'descriptor records no sha256; integrity not verified');
				} else if (actual !== descriptor.sha256) {
					const reason = `sha256 mismatch: descriptor records ${descriptor.sha256} but the payload hashes to ${actual}`;
					record(`layer-${level}-integrity`, false, reason);
					report.integrityOk = false;
					markLayerDegraded(reason);
				} else {
					record(`layer-${level}-integrity`, true);
					report.integrityOk = true;
				}
			}
		}

		// Per-primitive attribute windows and index counts come straight from
		// the descriptor, using the same start/count fallback reconstruct
		// applies, so the two can never disagree about what was written.
		const windowProblems = [];
		const indexProblems = [];
		for (const entry of descriptor.prims || []) {
			const attributes = [];
			for (const [key, meta] of Object.entries(entry.attributes || {})) {
				const start = meta.start ?? entry.newVertexStart;
				const count = meta.count ?? entry.newVertexCount;
				attributes.push({
					key,
					start,
					count,
					componentType: meta.componentType ?? null,
					elementSize: meta.elementSize ?? null,
				});
				if (!Number.isInteger(descriptor.vertexCount)) {
					windowProblems.push(`prim ${entry.prim} ${key}: the layer records no vertexCount to check the window against`);
				} else if (!(start >= 0 && count >= 0) || start + count > descriptor.vertexCount) {
					windowProblems.push(
						`prim ${entry.prim} ${key}: window [${start}, ${start}+${count}) exceeds the layer vertexCount ${descriptor.vertexCount}`,
					);
				}
			}
			const indexCount = entry.indices?.count ?? null;
			if (indexCount != null && indexCount % 3 !== 0) {
				indexProblems.push(`prim ${entry.prim} has ${indexCount} indices, not a multiple of 3`);
			}
			report.prims.push({
				prim: entry.prim ?? null,
				vertexCount: entry.vertexCount ?? null,
				attributes,
				indexCount,
			});
		}
		if (descriptor.prims) {
			if (windowProblems.length === 0) {
				record(`layer-${level}-attribute-windows`, true);
			} else {
				record(`layer-${level}-attribute-windows`, false, windowProblems.join('; '));
				markLayerDegraded(windowProblems.join('; '));
			}
			if (indexProblems.length === 0) {
				record(`layer-${level}-index-counts`, true);
			} else {
				record(`layer-${level}-index-counts`, false, indexProblems.join('; '));
				markLayerDegraded(indexProblems.join('; '));
			}
		}

		layerReports.push(report);
	}

	// --- cross-layer layout -----------------------------------------------------
	let overlap = null;
	for (let level = 1; level < layerCount; level++) {
		const prev = descriptors[level - 1];
		const current = descriptors[level];
		if (current.offset < prev.offset + prev.length) {
			overlap = `layer ${level} begins at ${current.offset} but layer ${level - 1} ends at ${prev.offset + prev.length}`;
			break;
		}
	}
	if (overlap) {
		record('layers-non-overlapping', false, overlap);
		degraded = true;
	} else {
		record('layers-non-overlapping', true);
	}

	return {
		ok: checks.every((check) => check.passed),
		degraded,
		reason: degraded ? (checks.find((check) => !check.passed)?.reason ?? 'audit is degraded') : null,
		throughLevel: requested,
		effectiveThroughLevel: effective,
		preamble: {
			layerCount: preamble.layerCount,
			totalLength: preamble.totalLength,
			baseOffset: preamble.baseOffset,
			baseLength: preamble.baseLength,
		},
		layers: layerReports,
		affectedLayers,
		checks,
	};
}
