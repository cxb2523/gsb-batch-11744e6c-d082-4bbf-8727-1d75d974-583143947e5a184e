import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { Document, NodeIO } from '@gltf-transform/core';

import { VERSION_TAG, align4, decodeHeader, decodePreamble, encodeContainer, rangeHeaderForLayer } from '../src/format.js';
import { A3SStream } from '../src/reader.js';
import { reconstruct } from '../src/reconstruct.js';
import { auditStream } from '../src/audit.js';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * A minimal but real base GLB: two indexed triangle primitives, tagged with
 * the packer's `a3sPrim` ordinals so reconstruct keys them the same way the
 * hand-built patch descriptors below do.
 */
async function makeBaseGlb() {
	const doc = new Document();
	const buffer = doc.createBuffer();

	const positions0 = doc
		.createAccessor()
		.setType('VEC3')
		.setArray(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]))
		.setBuffer(buffer);
	const indices0 = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2, 0, 2, 3])).setBuffer(buffer);
	const prim0 = doc.createPrimitive().setAttribute('POSITION', positions0).setIndices(indices0);
	prim0.setExtras({ a3sPrim: 0 });

	const positions1 = doc
		.createAccessor()
		.setType('VEC3')
		.setArray(new Float32Array([2, 0, 0, 3, 0, 0, 2.5, 1, 0]))
		.setBuffer(buffer);
	const indices1 = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2])).setBuffer(buffer);
	const prim1 = doc.createPrimitive().setAttribute('POSITION', positions1).setIndices(indices1);
	prim1.setExtras({ a3sPrim: 1 });

	const mesh = doc.createMesh('mesh').addPrimitive(prim0).addPrimitive(prim1);
	const node = doc.createNode('node').setMesh(mesh);
	doc.createScene('scene').addChild(node);

	const io = new NodeIO();
	return new Uint8Array(await io.writeBinary(doc));
}

/**
 * Build one patch payload and its descriptor entries, mirroring the packer's
 * layout: attribute chunks then the index chunk, each 4-byte aligned, offsets
 * relative to the start of the payload.
 */
function makePatch(entries) {
	const chunks = [];
	const prims = [];
	let cursor = 0;
	for (const entry of entries) {
		const attributes = {};
		for (const [key, attribute] of Object.entries(entry.attributes)) {
			const bytes = new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
			attributes[key] = {
				offset: cursor,
				length: bytes.byteLength,
				componentType: 5126,
				elementSize: 3,
				start: attribute.start,
				count: attribute.count,
			};
			chunks.push(bytes);
			cursor = align4(cursor + bytes.byteLength);
		}
		const indexBytes = new Uint8Array(entry.indices.buffer, entry.indices.byteOffset, entry.indices.byteLength);
		prims.push({
			prim: entry.prim,
			newVertexStart: entry.newVertexStart,
			newVertexCount: entry.newVertexCount,
			vertexCount: entry.vertexCount,
			attributes,
			indices: { offset: cursor, length: indexBytes.byteLength, componentType: 5123, count: entry.indices.length },
		});
		chunks.push(indexBytes);
		cursor = align4(cursor + indexBytes.byteLength);
	}
	const payload = new Uint8Array(cursor);
	let write = 0;
	for (const chunk of chunks) {
		payload.set(chunk, write);
		write = align4(write + chunk.byteLength);
	}
	return { payload, prims };
}

/**
 * A three-layer synthetic stream. Layer 0 has 4 + 3 vertices; layer 1 grows
 * prim 0 to 6 vertices and prim 1 to 4; layer 2 grows prim 0 to 7 and swaps in
 * a finer index buffer. Every number is small enough to check by hand.
 */
async function makeStream() {
	const baseGlb = await makeBaseGlb();

	const layer1 = makePatch([
		{
			prim: 0,
			newVertexStart: 4,
			newVertexCount: 2,
			vertexCount: 6,
			attributes: { POSITION: { array: new Float32Array([0, 0, 1, 1, 0, 1]), start: 4, count: 2 } },
			indices: new Uint16Array([0, 1, 2, 0, 2, 3, 2, 4, 5, 2, 5, 3]),
		},
		{
			prim: 1,
			newVertexStart: 3,
			newVertexCount: 1,
			vertexCount: 4,
			attributes: { POSITION: { array: new Float32Array([3, 1, 0]), start: 3, count: 1 } },
			indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
		},
	]);

	const layer2 = makePatch([
		{
			prim: 0,
			newVertexStart: 6,
			newVertexCount: 1,
			vertexCount: 7,
			attributes: { POSITION: { array: new Float32Array([0.5, 0.5, 1]), start: 6, count: 1 } },
			indices: new Uint16Array([0, 1, 2, 0, 2, 3, 2, 4, 5, 2, 5, 3, 4, 6, 5]),
		},
	]);

	const header = {
		version: VERSION_TAG,
		generator: 'audit-test',
		source: { name: 'synthetic.glb', sha256: '0'.repeat(64), byteLength: 1 },
		geometry: { vertexCount: 11, triangleCount: 7, primitiveCount: 2 },
		levels: [0.3, 0.7, 1],
		layers: [
			{ level: 0, kind: 'base', sha256: sha256(baseGlb), vertexCount: 7, triangleCount: 3 },
			{ level: 1, kind: 'patch', sha256: sha256(layer1.payload), vertexCount: 10, triangleCount: 6, prims: layer1.prims },
			{ level: 2, kind: 'patch', sha256: sha256(layer2.payload), vertexCount: 11, triangleCount: 7, prims: layer2.prims },
		],
	};
	const container = encodeContainer({ header, baseGlb, patches: [layer1.payload, layer2.payload] });
	return { container, layerCount: 3 };
}

test('a valid stream passes every check and agrees with the reader and reconstruct', async () => {
	const { container } = await makeStream();
	const stream = await A3SStream.open(container);
	const audit = await auditStream(container);

	assert.equal(audit.ok, true, JSON.stringify(audit.checks.filter((c) => !c.passed)));
	assert.equal(audit.degraded, false);
	assert.deepEqual(audit.affectedLayers, []);
	for (const check of audit.checks) assert.equal(check.passed, true, check.name);

	// Preamble summary.
	assert.deepEqual(audit.preamble, {
		layerCount: stream.preamble.layerCount,
		totalLength: stream.preamble.totalLength,
		baseOffset: stream.preamble.baseOffset,
		baseLength: stream.preamble.baseLength,
	});

	// Every layer's Range string and payload length must match the reader exactly.
	assert.equal(audit.layers.length, stream.layerCount);
	for (let level = 0; level < stream.layerCount; level++) {
		const report = audit.layers[level];
		assert.equal(report.range, rangeHeaderForLayer(stream.header, stream.preamble, level), `range for layer ${level}`);
		const { payload } = await stream.layer(level);
		assert.equal(report.payloadLength, payload.byteLength, `payload length for layer ${level}`);
		assert.equal(report.integrityOk, true, `integrity for layer ${level}`);
		assert.equal(report.sha256Actual, stream.header.layers[level].sha256);
	}

	// Attribute windows must be the windows reconstruct actually writes.
	const position = (report, prim) => report.prims.find((p) => p.prim === prim).attributes.find((a) => a.key === 'POSITION');
	assert.deepEqual(position(audit.layers[1], 0), { key: 'POSITION', start: 4, count: 2, componentType: 5126, elementSize: 3 });
	assert.deepEqual(position(audit.layers[1], 1), { key: 'POSITION', start: 3, count: 1, componentType: 5126, elementSize: 3 });
	assert.deepEqual(position(audit.layers[2], 0), { key: 'POSITION', start: 6, count: 1, componentType: 5126, elementSize: 3 });
	assert.equal(audit.layers[1].prims.find((p) => p.prim === 0).indexCount, 12);
	assert.equal(audit.layers[2].prims.find((p) => p.prim === 0).indexCount, 15);

	// After a full replay, each attribute's length is (start + count) * stride
	// of the last window that touched it, and indices come from the last patch.
	const { primitives } = await reconstruct(container);
	assert.equal(primitives.get(0).attributes.POSITION.array.length, (6 + 1) * 3);
	assert.equal(primitives.get(1).attributes.POSITION.array.length, (3 + 1) * 3);
	assert.equal(primitives.get(0).indices.length, 15);
	assert.equal(primitives.get(1).indices.length, 6);

	// A partial replay stops at the layer-1 windows.
	const partial = await reconstruct(container, { throughLevel: 1 });
	assert.equal(partial.primitives.get(0).attributes.POSITION.array.length, (4 + 2) * 3);
	assert.equal(partial.primitives.get(0).indices.length, 12);

	// The report is plain JSON-serialisable data.
	assert.deepEqual(JSON.parse(JSON.stringify(audit)), audit);
});

test('the audit accepts an already-open stream', async () => {
	const { container } = await makeStream();
	const stream = await A3SStream.open(container);
	const audit = await auditStream(stream);
	assert.equal(audit.ok, true, JSON.stringify(audit.checks.filter((c) => !c.passed)));
	assert.equal(audit.layers[0].payloadLength, stream.base.byteLength);
});

test('a tampered layer fails its integrity check with a readable reason', async () => {
	const { container } = await makeStream();
	const damaged = container.slice();
	const preamble = decodePreamble(damaged);
	const header = decodeHeader(damaged, preamble);
	const target = header.layers[1];
	damaged[target.offset + 8] ^= 0xff;

	const audit = await auditStream(damaged);
	assert.equal(audit.ok, false);
	assert.equal(audit.degraded, true);
	assert.ok(audit.affectedLayers.includes(1));

	const integrity = audit.checks.find((c) => c.name === 'layer-1-integrity');
	assert.equal(integrity.passed, false);
	assert.match(integrity.reason, /sha256 mismatch/);
	assert.match(integrity.reason, new RegExp(target.sha256));

	const report = audit.layers[1];
	assert.equal(report.degraded, true);
	assert.equal(report.integrityOk, false);
	assert.match(report.reason, /sha256 mismatch/);
	// The tamper changed bytes, not the layout, so the other layers still pass.
	assert.equal(audit.checks.find((c) => c.name === 'layer-0-integrity').passed, true);
	assert.equal(audit.checks.find((c) => c.name === 'layer-2-integrity').passed, true);
});

test('throughLevel at the last layer audits everything and passes', async () => {
	const { container, layerCount } = await makeStream();
	const audit = await auditStream(container, { throughLevel: layerCount - 1 });
	assert.equal(audit.ok, true, JSON.stringify(audit.checks.filter((c) => !c.passed)));
	assert.equal(audit.effectiveThroughLevel, layerCount - 1);
	assert.equal(audit.layers.every((layer) => layer.audited), true);
});

test('an out-of-range throughLevel degrades instead of throwing', async () => {
	const { container, layerCount } = await makeStream();
	const audit = await auditStream(container, { throughLevel: layerCount + 3 });
	assert.equal(audit.degraded, true);
	const check = audit.checks.find((c) => c.name === 'through-level-in-range');
	assert.equal(check.passed, false);
	assert.match(check.reason, /outside the valid range/);
	// The layers that exist are still audited; the missing ones are flagged.
	assert.equal(audit.effectiveThroughLevel, layerCount - 1);
	assert.deepEqual(audit.affectedLayers, [layerCount, layerCount + 1, layerCount + 2, layerCount + 3]);
	assert.equal(audit.layers.length, layerCount);
	assert.deepEqual(JSON.parse(JSON.stringify(audit)), audit);
});

test('a stream truncated before the preamble degrades instead of throwing', async () => {
	const { container } = await makeStream();
	const audit = await auditStream(container.subarray(0, 16));
	assert.equal(audit.ok, false);
	assert.equal(audit.degraded, true);
	assert.equal(audit.preamble, null);
	assert.deepEqual(audit.layers, []);
	const open = audit.checks.find((c) => c.name === 'stream-open');
	assert.equal(open.passed, false);
	assert.match(open.reason, /shorter than a preamble/);
	assert.deepEqual(JSON.parse(JSON.stringify(audit)), audit);
});

test('a stream truncated inside a layer flags that layer without throwing', async () => {
	const { container } = await makeStream();
	const preamble = decodePreamble(container);
	const header = decodeHeader(container, preamble);
	const cut = header.layers[1].offset + 8;
	const audit = await auditStream(container.subarray(0, cut));

	assert.equal(audit.ok, false);
	assert.equal(audit.degraded, true);
	assert.ok(audit.affectedLayers.includes(1));
	const lengthCheck = audit.checks.find((c) => c.name === 'layer-1-payload-length');
	assert.equal(lengthCheck.passed, false);
	assert.match(lengthCheck.reason, /descriptor records/);
	assert.equal(audit.layers[1].degraded, true);
	// The base layer survived the cut and still verifies.
	assert.equal(audit.checks.find((c) => c.name === 'layer-0-integrity').passed, true);
});

test('the audit does not mutate the bytes it is handed', async () => {
	const { container } = await makeStream();
	const before = container.slice();
	await auditStream(container);
	assert.deepEqual(container, before);
});
