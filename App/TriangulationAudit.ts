import Delaunator from "delaunator";

import ColorConverter from "./ColorConverter";
import { Mode } from "./Mode";

/**
 * Pure-data identity of an access point, mirroring the filter fields of
 * `App/AccessPoint.ts`. A value of `null` means no access point is selected.
 */
export interface AuditAccessPoint {
	ssid: string;
	frequency: number | null;
	mac: string | null;
}

/**
 * A single observed radio value at a reading location, captured as plain
 * data (no `Signal` instance): the measured signal strength in dBm and the
 * locally computed noise floor in dBm (so SNR = strength - noise).
 */
export interface AuditSignalObservation {
	ssid: string;
	frequency: number;
	mac: string;
	strength: number;
	noise: number;
}

/**
 * One reading location in the audit snapshot, expressed entirely as plain
 * JSON-compatible data (no `Reading` or `Point` instances).
 */
export interface AuditReading {
	id: number;
	x: number;
	y: number;
	observations: AuditSignalObservation[];
}

/**
 * The immutable, pure-data input snapshot for an audit run.
 */
export interface TriangulationAuditSnapshot {
	mode: Mode;
	accessPoint: AuditAccessPoint | null;
	readings: AuditReading[];
}

/**
 * The RGBA color of one triangulation vertex, with the alpha value already
 * run through the same transform that `Triangulation` applies before writing
 * `vertex_color_parts`.
 */
export interface AuditVertexColor {
	red: number;
	green: number;
	blue: number;
	alpha: number;
}

/**
 * One vertex of the triangulation, in the exact order in which
 * `Triangulation` pushes values into its output arrays.
 */
export interface AuditVertex {
	readingId: number;
	x: number;
	y: number;
	color: AuditVertexColor;
}

/**
 * One Delaunay triangle, expressed as the three reading ids that form its
 * vertices, in the counter-clockwise order returned by Delaunator.
 */
export interface AuditTriangle {
	readingIds: [number, number, number];
}

/**
 * One ordered audit check. Every check is always present; a failed check
 * carries a human-readable `reason`, a passed one leaves `reason` empty.
 */
export interface AuditCheck {
	name: string;
	passed: boolean;
	reason: string | null;
}

/**
 * The length relationships between the flat output arrays, as required by
 * the WebGL vertex layout (two coordinates and four color parts per vertex,
 * three vertices per triangle).
 */
export interface AuditLengths {
	readingCount: number;
	triangleCount: number;
	vertexCoordinateCount: number;
	vertexColorPartCount: number;
	expectedVertexCoordinateCount: number;
	expectedVertexColorPartCount: number;
	coordinatesMatchSixTimesTriangleCount: boolean;
	colorPartsMatchTwelveTimesTriangleCount: boolean;
}

/**
 * The complete structured audit result. Every field is plain data, so the
 * whole object survives `JSON.stringify`/`JSON.parse` unchanged.
 */
export interface TriangulationAuditResult {
	mode: Mode;
	accessPoint: AuditAccessPoint | null;
	readingCount: number;
	triangleCount: number;
	vertexCoordinates: number[];
	triangleReadingIds: number[];
	vertexColorParts: number[];
	triangles: AuditTriangle[];
	vertices: AuditVertex[];
	lengths: AuditLengths;
	diagnostics: string[];
	checks: AuditCheck[];
}

/**
 * Replicates `Reading.mapValue` over plain snapshot data: when no access
 * point is selected the semantics of `Reading.signalFor(null)` apply and
 * `null` is returned unconditionally; otherwise observations matching the
 * selected ssid/frequency/mac are reduced with `Math.max`, again returning
 * `null` when nothing matches.
 */
function resolveValue(
	reading: AuditReading,
	accessPoint: AuditAccessPoint | null,
	mode: Mode
): number | null {
	if (accessPoint == null) {
		return null;
	}

	const values = reading.observations
		.filter(observation => (observation.ssid == accessPoint.ssid)
			&& (accessPoint.frequency == null || observation.frequency == accessPoint.frequency)
			&& (accessPoint.mac == null || observation.mac == accessPoint.mac))
		.map(observation => mode == Mode.Signal
			? observation.strength
			: observation.strength - observation.noise);

	return values.length > 0 ? Math.max(...values) : null;
}

function check(name: string, passed: boolean, reason: string | null): AuditCheck {
	return { name, passed, reason: passed ? null : reason };
}

/**
 * Pure "heat map triangulation audit".
 *
 * Rebuilds exactly what `new Triangulation(mode, readings, accessPoint)`
 * would produce, but starting from a plain-data snapshot and returning a
 * plain-data, JSON-serializable result augmented with structural checks and
 * human-readable diagnostics.
 *
 * Colors are always obtained from `ColorConverter.fromSignal`/
 * `ColorConverter.fromSNR` (never a re-implemented formula), and the only
 * non-relative import is `delaunator`, plus the domain enum/converter.
 * The function touches no `window`/`document`, performs no I/O, and never
 * returns a class instance or function reference.
 */
export function auditTriangulation(snapshot: TriangulationAuditSnapshot): TriangulationAuditResult {
	const mode = snapshot.mode;
	const accessPoint = snapshot.accessPoint;
	const readings = snapshot.readings;

	const diagnostics: string[] = [];
	if (accessPoint == null) {
		diagnostics.push("无选定接入点：依据 Reading.signalFor(null) 语义，所有读数取值均为 null，顶点使用 ColorConverter 的缺省颜色。");
	}

	// Mirror `new Triangulation(...)` exactly: Delaunator over the reading
	// locations, then one output entry per triangle-vertex index.
	const delaunay = Delaunator.from(readings, reading => reading.x, reading => reading.y);
	const triangleIndices = Array.from(delaunay.triangles);

	const vertexCoordinates: number[] = [];
	const vertexColorParts: number[] = [];
	const vertices: AuditVertex[] = [];
	const triangles: AuditTriangle[] = [];

	const missingSignalReadingIds: number[] = [];
	const outOfRangeIndices: number[] = [];

	// Iterating the flat Delaunator index array in groups of three preserves
	// the exact per-vertex order in which the Triangulation constructor pushes
	// coordinates and color parts, while keeping triangle grouping explicit.
	for (let i = 0; i < triangleIndices.length; i += 3) {
		const groupIds: number[] = [];

		for (let j = i; j < i + 3; j++) {
			const index = triangleIndices[j];
			if (index < 0 || index >= readings.length) {
				outOfRangeIndices.push(index);
				continue;
			}

			const reading = readings[index];
			const value = resolveValue(reading, accessPoint, mode);
			if (value == null && accessPoint != null) {
				missingSignalReadingIds.push(reading.id);
			}

			const color = mode == Mode.Signal
				? ColorConverter.fromSignal(value)
				: ColorConverter.fromSNR(value);

			vertexCoordinates.push(reading.x, reading.y);

			// The exact transform applied inside the Triangulation constructor.
			const alpha = (color.alpha > 0 ? color.alpha + 1 : color.alpha) * 0.75 - (color.alpha > 0 ? 1 : 0);
			vertexColorParts.push(color.red, color.green, color.blue, alpha);

			vertices.push({
				readingId: reading.id,
				x: reading.x,
				y: reading.y,
				color: {
					red: color.red,
					green: color.green,
					blue: color.blue,
					alpha
				}
			});

			groupIds.push(reading.id);
		}

		if (groupIds.length == 3) {
			triangles.push({
				readingIds: [groupIds[0], groupIds[1], groupIds[2]]
			});
		}
	}

	const uniqueMissingIds = Array.from(new Set(missingSignalReadingIds));
	if (accessPoint != null && uniqueMissingIds.length > 0) {
		diagnostics.push(`以下读数缺少选定接入点的信号，按 Reading 语义取值为 null 并使用缺省颜色：${uniqueMissingIds.join(", ")}。`);
	}

	const triangleCount = triangleIndices.length / 3;
	const lengths: AuditLengths = {
		readingCount: readings.length,
		triangleCount,
		vertexCoordinateCount: vertexCoordinates.length,
		vertexColorPartCount: vertexColorParts.length,
		expectedVertexCoordinateCount: triangleCount * 6,
		expectedVertexColorPartCount: triangleCount * 12,
		coordinatesMatchSixTimesTriangleCount: vertexCoordinates.length == triangleCount * 6,
		colorPartsMatchTwelveTimesTriangleCount: vertexColorParts.length == triangleCount * 12
	};

	const checks: AuditCheck[] = [
		check(
			"样本充足性",
			readings.length >= 3,
			`样本不足：仅有 ${readings.length} 个读数，至少需要 3 个读数才能进行三角化。`
		),
		check(
			"无三角形（样本不足）",
			readings.length >= 3 || triangleCount == 0,
			`样本不足时不得产生三角形，但实际生成了 ${triangleCount} 个三角形。`
		),
		check(
			"三角形索引范围",
			outOfRangeIndices.length == 0,
			`存在超出读数范围（0..${readings.length - 1}）的三角形索引：${outOfRangeIndices.join(", ")}。`
		),
		check(
			"顶点坐标长度为三角形数的 6 倍",
			lengths.coordinatesMatchSixTimesTriangleCount,
			`顶点坐标分量数 ${vertexCoordinates.length} 不等于三角形数 ${triangleCount} 的 6 倍（${triangleCount * 6}）。`
		),
		check(
			"颜色分量长度为三角形数的 12 倍",
			lengths.colorPartsMatchTwelveTimesTriangleCount,
			`颜色分量数 ${vertexColorParts.length} 不等于三角形数 ${triangleCount} 的 12 倍（${triangleCount * 12}）。`
		),
		check(
			"信号覆盖完整性",
			accessPoint == null || uniqueMissingIds.length == 0,
			`读数 ${uniqueMissingIds.join(", ")} 无法解析出选定接入点的信号，已按 null 使用缺省颜色。`
		)
	];

	return {
		mode,
		accessPoint,
		readingCount: readings.length,
		triangleCount,
		vertexCoordinates,
		triangleReadingIds: triangleIndices,
		vertexColorParts,
		triangles,
		vertices,
		lengths,
		diagnostics,
		checks
	};
}

export default auditTriangulation;
