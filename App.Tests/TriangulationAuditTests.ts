import { Test, TestSuite } from "xunit.ts";

import AccessPoint from "../App/AccessPoint";
import ColorConverter from "../App/ColorConverter";
import { Mode } from "../App/Mode";
import Point from "../App/Point";
import Reading from "../App/Reading";
import Signal from "../App/Signal";
import Triangulation from "../App/Triangulation";
import {
	type AuditReading,
	auditTriangulation,
	type TriangulationAuditResult,
	type TriangulationAuditSnapshot
} from "../App/TriangulationAudit";

export default class TriangulationAuditTests extends TestSuite {
	private static readonly selectedSsid = "selected";
	private static readonly otherSsid = "neighbor";

	/**
	 * Builds the plain-data audit snapshot from the same local sample data
	 * used to construct the real domain objects, so the two can be compared
	 * item by item.
	 */
	private static buildSnapshot(
		mode: Mode,
		readings: Reading[],
		accessPoint: AccessPoint | null
	): TriangulationAuditSnapshot {
		return {
			mode,
			// Flatten the domain object into the pure-data identity the audit contract requires.
			accessPoint: accessPoint == null
				? null
				: {
					ssid: accessPoint.ssid,
					frequency: accessPoint.frequency,
					mac: accessPoint.mac
				},
			readings: readings.map(reading => TriangulationAuditTests.toAuditReading(reading))
		};
	}

	private static toAuditReading(reading: Reading): AuditReading {
		return {
			id: reading.id,
			x: reading.location.x,
			y: reading.location.y,
			observations: reading.signals.map(signal => ({
				ssid: signal.ssid,
				frequency: signal.frequency,
				mac: signal.mac,
				strength: signal.strength,
				noise: signal.noise(reading.signals)
			}))
		};
	}

	/**
	 * Five spread-out readings, each containing the selected access point plus
	 * same-band neighbors so that both signal and SNR (noise) paths are
	 * exercised.
	 */
	private static buildReadings(): Reading[] {
		const selectedMac = "aa:bb:cc:dd:ee:01";
		const neighborMac = "aa:bb:cc:dd:ee:02";
		return [
			new Reading(10, new Point(0, 0), [
				new Signal(selectedMac, TriangulationAuditTests.selectedSsid, 2, 1, -40),
				new Signal(neighborMac, TriangulationAuditTests.otherSsid, 2, 2, -70)
			]),
			new Reading(20, new Point(10, 0), [
				new Signal(selectedMac, TriangulationAuditTests.selectedSsid, 2, 1, -55),
				new Signal(neighborMac, TriangulationAuditTests.otherSsid, 2, 2, -75)
			]),
			new Reading(30, new Point(10, 10), [
				new Signal(selectedMac, TriangulationAuditTests.selectedSsid, 2, 1, -65),
				new Signal(neighborMac, TriangulationAuditTests.otherSsid, 2, 2, -85)
			]),
			new Reading(40, new Point(0, 10), [
				new Signal(selectedMac, TriangulationAuditTests.selectedSsid, 2, 1, -85),
				new Signal(neighborMac, TriangulationAuditTests.otherSsid, 2, 2, -90)
			]),
			new Reading(50, new Point(5, 5), [
				new Signal(selectedMac, TriangulationAuditTests.selectedSsid, 2, 1, -30),
				new Signal(neighborMac, TriangulationAuditTests.otherSsid, 2, 2, -60)
			])
		];
	}

	private assertAllChecksPassed(result: TriangulationAuditResult): void {
		for (const checkResult of result.checks) {
			this.assert.true(checkResult.passed, `${checkResult.name}: ${checkResult.reason ?? ""}`);
		}
	}

	private assertMatchesTriangulation(result: TriangulationAuditResult, triangulation: Triangulation): void {
		// Flat output arrays must be item-for-item identical to the real class.
		this.assert.equal(triangulation.vertex_coordinates, result.vertexCoordinates);
		this.assert.equal(triangulation.vertex_color_parts, result.vertexColorParts);

		// Vertex objects must carry the same coordinates and color parts, in order.
		this.assert.equal(result.vertexCoordinates.length / 2, result.vertices.length);
		result.vertices.forEach((vertex, index) => {
			this.assert.equal(result.vertexCoordinates[index * 2], vertex.x);
			this.assert.equal(result.vertexCoordinates[index * 2 + 1], vertex.y);
			this.assert.equal(result.vertexColorParts[index * 4], vertex.color.red);
			this.assert.equal(result.vertexColorParts[index * 4 + 1], vertex.color.green);
			this.assert.equal(result.vertexColorParts[index * 4 + 2], vertex.color.blue);
			this.assert.equal(result.vertexColorParts[index * 4 + 3], vertex.color.alpha);
		});

		// Triangles must be groupings of the same flat Delaunator indices,
		// all of which reference readings that exist in the snapshot.
		const flatTriangleIds = result.triangles.flatMap(triangle => triangle.readingIds);
		this.assert.equal(result.triangleReadingIds.length, flatTriangleIds.length);
		result.triangleReadingIds.forEach((readingIndex, index) => {
			this.assert.equal(result.vertices[index].readingId, flatTriangleIds[index]);
			this.assert.true(readingIndex >= 0 && readingIndex < result.readingCount);
		});
	}

	@Test()
	auditMatchesTriangulationInSignalMode() {
		//arrange
		const readings = TriangulationAuditTests.buildReadings();
		const accessPoint = new AccessPoint(TriangulationAuditTests.selectedSsid);
		const snapshot = TriangulationAuditTests.buildSnapshot(Mode.Signal, readings, accessPoint);

		//act
		const triangulation = new Triangulation(Mode.Signal, readings, accessPoint);
		const result = auditTriangulation(snapshot);

		//assert
		this.assert.equal(Mode.Signal, result.mode);
		this.assert.true(result.triangleCount >= 1);
		this.assertMatchesTriangulation(result, triangulation);
		this.assertAllChecksPassed(result);
		this.assert.true(result.lengths.coordinatesMatchSixTimesTriangleCount);
		this.assert.true(result.lengths.colorPartsMatchTwelveTimesTriangleCount);
		this.assert.equal(result.triangleCount * 6, result.vertexCoordinates.length);
		this.assert.equal(result.triangleCount * 12, result.vertexColorParts.length);
	}

	@Test()
	auditMatchesTriangulationInSnrMode() {
		//arrange
		const readings = TriangulationAuditTests.buildReadings();
		const accessPoint = new AccessPoint(TriangulationAuditTests.selectedSsid);
		const snapshot = TriangulationAuditTests.buildSnapshot(Mode.SNR, readings, accessPoint);

		//act
		const triangulation = new Triangulation(Mode.SNR, readings, accessPoint);
		const result = auditTriangulation(snapshot);

		//assert
		this.assert.equal(Mode.SNR, result.mode);
		this.assert.true(result.triangleCount >= 1);
		this.assertMatchesTriangulation(result, triangulation);
		this.assertAllChecksPassed(result);
	}

	@Test()
	auditUsesColorConverterForColors() {
		//arrange
		const readings = TriangulationAuditTests.buildReadings();
		const accessPoint = new AccessPoint(TriangulationAuditTests.selectedSsid);
		const snapshot = TriangulationAuditTests.buildSnapshot(Mode.Signal, readings, accessPoint);

		//act
		const result = auditTriangulation(snapshot);

		//assert - every color is exactly what ColorConverter would produce,
		//including the documented alpha transform.
		result.vertices.forEach(vertex => {
			const reading = readings.find(candidate => candidate.id == vertex.readingId);
			this.assert.notNull(reading);
			const expected = ColorConverter.fromSignal(reading?.signalFor(accessPoint) ?? null);
			const expectedAlpha = (expected.alpha > 0 ? expected.alpha + 1 : expected.alpha) * 0.75
				- (expected.alpha > 0 ? 1 : 0);
			this.assert.equal(expected.red, vertex.color.red);
			this.assert.equal(expected.green, vertex.color.green);
			this.assert.equal(expected.blue, vertex.color.blue);
			this.assert.equal(expectedAlpha, vertex.color.alpha);
		});
	}

	@Test()
	auditReportsInsufficientSamplesWithoutThrowing() {
		//arrange
		const readings = [
			new Reading(1, new Point(0, 0), []),
			new Reading(2, new Point(4, 0), [])
		];
		const snapshot = TriangulationAuditTests.buildSnapshot(
			Mode.Signal,
			readings,
			new AccessPoint(TriangulationAuditTests.selectedSsid)
		);

		//act
		let audit: TriangulationAuditResult | undefined;
		this.assert.doesNotThrow(() => {
			audit = auditTriangulation(snapshot);
		});
		if (audit == null) {
			throw new Error("auditTriangulation returned no result");
		}

		//assert
		this.assert.equal(0, audit.triangleCount);
		this.assert.empty(audit.triangles);
		this.assert.empty(audit.vertexCoordinates);
		this.assert.empty(audit.vertexColorParts);
		this.assert.empty(audit.triangleReadingIds);
		const sampleCheck = audit.checks[0];
		this.assert.equal("样本充足性", sampleCheck.name);
		this.assert.false(sampleCheck.passed);
		this.assert.true(sampleCheck.reason?.includes("样本不足") ?? false);
		this.assert.true(audit.checks[1].passed);
		this.assert.true(audit.checks.slice(2).every(checkResult => checkResult.passed));
	}

	@Test()
	auditHandlesNullAccessPointWithReadingSemantics() {
		//arrange
		const readings = TriangulationAuditTests.buildReadings();
		const snapshot = TriangulationAuditTests.buildSnapshot(Mode.Signal, readings, null);

		//act
		const triangulation = new Triangulation(Mode.Signal, readings, null);
		const result = auditTriangulation(snapshot);

		//assert - Reading.signalFor(null) always resolves to null, so
		//ColorConverter emits the default color (0, 0, 0) with alpha 127 -> 95.
		readings.forEach(reading => this.assert.null(reading.signalFor(null)));
		this.assert.equal(triangulation.vertex_coordinates, result.vertexCoordinates);
		this.assert.equal(triangulation.vertex_color_parts, result.vertexColorParts);
		result.vertices.forEach(vertex => {
			this.assert.equal(0, vertex.color.red);
			this.assert.equal(0, vertex.color.green);
			this.assert.equal(0, vertex.color.blue);
			this.assert.equal(95, vertex.color.alpha);
		});
		this.assert.true(result.diagnostics.some(message => message.includes("无选定接入点")));
		this.assert.true(result.checks.every(checkResult => checkResult.passed));
	}

	@Test()
	auditReportsMissingAccessPointSignalWithReadingSemantics() {
		//arrange - the fourth reading simply never observed the selected AP.
		const readings = TriangulationAuditTests.buildReadings();
		readings[3] = new Reading(40, new Point(0, 10), [
			new Signal("ff:ff:ff:ff:ff:ff", TriangulationAuditTests.otherSsid, 5, 36, -70)
		]);
		const accessPoint = new AccessPoint(TriangulationAuditTests.selectedSsid);
		const snapshot = TriangulationAuditTests.buildSnapshot(Mode.Signal, readings, accessPoint);

		//act - must not throw even though a signal is missing.
		let audit: TriangulationAuditResult | undefined;
		this.assert.doesNotThrow(() => {
			audit = auditTriangulation(snapshot);
		});
		if (audit == null) {
			throw new Error("auditTriangulation returned no result");
		}
		const triangulation = new Triangulation(Mode.Signal, readings, accessPoint);

		//assert - parity still holds, and the gap is reported readably.
		this.assert.equal(triangulation.vertex_coordinates, audit.vertexCoordinates);
		this.assert.equal(triangulation.vertex_color_parts, audit.vertexColorParts);
		this.assert.null(readings[3].signalFor(accessPoint));
		this.assert.true(audit.diagnostics.some(message => message.includes("40")));
		const coverageCheck = audit.checks.find(checkResult => checkResult.name == "信号覆盖完整性");
		if (coverageCheck == null) {
			throw new Error("missing signal coverage check");
		}
		this.assert.false(coverageCheck.passed);
		this.assert.true(coverageCheck.reason?.includes("40") ?? false);
		const missingVertices = audit.vertices.filter(vertex => vertex.readingId == 40);
		this.assert.true(missingVertices.length > 0);
		missingVertices.forEach(vertex => {
			this.assert.equal(0, vertex.color.red);
			this.assert.equal(0, vertex.color.green);
			this.assert.equal(0, vertex.color.blue);
			this.assert.equal(95, vertex.color.alpha);
		});
	}

	@Test()
	auditResultIsJsonSerializable() {
		//arrange
		const readings = TriangulationAuditTests.buildReadings();
		const snapshot = TriangulationAuditTests.buildSnapshot(
			Mode.Signal,
			readings,
			new AccessPoint(TriangulationAuditTests.selectedSsid)
		);
		const result = auditTriangulation(snapshot);

		//act
		const roundTripped = JSON.parse(JSON.stringify(result)) as TriangulationAuditResult;

		//assert - no class instances, functions or other non-JSON values survive.
		this.assert.equal(result, roundTripped);
		this.assert.equal(result.vertexCoordinates, roundTripped.vertexCoordinates);
		this.assert.equal(result.vertexColorParts, roundTripped.vertexColorParts);
		this.assert.equal(result.triangles, roundTripped.triangles);
		this.assert.equal(result.vertices, roundTripped.vertices);
		this.assert.equal(result.checks, roundTripped.checks);
		this.assert.equal(result.diagnostics, roundTripped.diagnostics);
	}

	@Test()
	auditResultWithNoReadingsIsJsonSerializable() {
		//arrange
		const snapshot: TriangulationAuditSnapshot = {
			mode: Mode.Signal,
			accessPoint: null,
			readings: []
		};

		//act
		const result = auditTriangulation(snapshot);
		const roundTripped = JSON.parse(JSON.stringify(result)) as TriangulationAuditResult;

		//assert
		this.assert.equal(result, roundTripped);
		this.assert.equal(0, result.triangleCount);
		const sampleCheck = result.checks[0];
		this.assert.false(sampleCheck.passed);
		this.assert.true(sampleCheck.reason?.includes("样本不足") ?? false);
		this.assert.true(result.diagnostics.some(message => message.includes("无选定接入点")));
	}
}
