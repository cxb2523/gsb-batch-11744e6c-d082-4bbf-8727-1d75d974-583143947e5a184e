/**
 * OpenSerial-Studio Framebuffer & Compute Cluster Graphics Library (v3.1.0)
 * 
 * Supports high-speed pixel ingestion (JSON & 8-byte binary packets),
 * 64-core RISC-V workload heatmap coloring, and analytical 3D Raymarching.
 */

export interface PixelData {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  coreId: number;
}

export type CanvasViewMode = 'rgb' | 'heatmap';

export interface ResolutionPreset {
  width: number;
  height: number;
  label: string;
}

export const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { width: 160, height: 120, label: '160×120 (QQVGA · 4:3)' },
  { width: 80, height: 60, label: '80x60 (Ultra-Fast)' },
  { width: 320, height: 240, label: '320x240 (HQ Raymarch)' },
];

export const BINARY_PIXEL_MAGIC_0 = 0xaa;
export const BINARY_PIXEL_MAGIC_1 = 0x55;
export const BINARY_PIXEL_PACKET_LEN = 8; // [0xAA, 0x55, X_low, Y_low, R, G, B, CORE_AND_XY_HIGH]

/**
 * Encodes a PixelData object into an 8-byte binary frame with bit-packed 9-bit X/Y coordinates (0..511):
 * Byte 0: 0xAA (Magic 0)
 * Byte 1: 0x55 (Magic 1)
 * Byte 2: X & 0xFF
 * Byte 3: Y & 0xFF
 * Byte 4: R & 0xFF
 * Byte 5: G & 0xFF
 * Byte 6: B & 0xFF
 * Byte 7: (coreId & 0x3F) | (((X >> 8) & 0x01) << 6) | (((Y >> 8) & 0x01) << 7)
 */
export function encodeBinaryPixelPacket(px: PixelData): Uint8Array {
  const x = Math.max(0, Math.min(511, Math.floor(px.x)));
  const y = Math.max(0, Math.min(511, Math.floor(px.y)));
  const r = Math.max(0, Math.min(255, Math.floor(px.r)));
  const g = Math.max(0, Math.min(255, Math.floor(px.g)));
  const b = Math.max(0, Math.min(255, Math.floor(px.b)));
  const coreId = Math.max(0, Math.min(63, Math.floor(px.coreId)));

  const packedCoreAndXYHigh =
    (coreId & 0x3f) | (((x >> 8) & 0x01) << 6) | (((y >> 8) & 0x01) << 7);

  return new Uint8Array([
    BINARY_PIXEL_MAGIC_0,
    BINARY_PIXEL_MAGIC_1,
    x & 0xff,
    y & 0xff,
    r,
    g,
    b,
    packedCoreAndXYHigh,
  ]);
}

/**
 * Converts HSL color to RGB [0..255, 0..255, 0..255]
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (h >= 0 && h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h >= 60 && h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h >= 120 && h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h >= 180 && h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h >= 240 && h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/**
 * Pre-computed distinct RGB colors for 64 RISC-V Worker Cores (Golden Ratio Hue distribution)
 */
export const CORE_PALETTE: Array<[number, number, number]> = (() => {
  const palette: Array<[number, number, number]> = [];
  const totalCores = 64;
  for (let c = 0; c < totalCores; c++) {
    // Golden ratio hue angle jump to maximize contrast between adjacent core IDs
    const hue = (c * 137.508) % 360;
    palette.push(hslToRgb(hue, 0.88, 0.52));
  }
  return palette;
})();

/**
 * Returns distinct RGB representation for a specific core ID (0..63)
 */
export function getCoreHeatmapRgb(coreId: number): [number, number, number] {
  const idx = Math.max(0, Math.min(63, Math.floor(coreId)));
  return CORE_PALETTE[idx] || [128, 128, 128];
}

/**
 * Parses binary byte stream chunks looking for 8-byte pixel packets:
 * Format: [0xAA, 0x55, X_low, Y_low, R, G, B, CORE_AND_XY_HIGH]
 * Bit 0..5 of byte[7] = coreId (0..63)
 * Bit 6 of byte[7] = X bit 8 (extends X to 0..511)
 * Bit 7 of byte[7] = Y bit 8 (extends Y to 0..511)
 */
export function parseBinaryPixelChunk(bytes: Uint8Array): PixelData[] {
  const pixels: PixelData[] = [];
  const len = bytes.length;

  for (let i = 0; i <= len - BINARY_PIXEL_PACKET_LEN; i++) {
    if (bytes[i] === BINARY_PIXEL_MAGIC_0 && bytes[i + 1] === BINARY_PIXEL_MAGIC_1) {
      const packed = bytes[i + 7];
      const x = bytes[i + 2] | (((packed >> 6) & 0x01) << 8);
      const y = bytes[i + 3] | (((packed >> 7) & 0x01) << 8);
      const r = bytes[i + 4];
      const g = bytes[i + 5];
      const b = bytes[i + 6];
      const coreId = packed & 0x3f;

      pixels.push({ x, y, r, g, b, coreId });
      i += BINARY_PIXEL_PACKET_LEN - 1; // Advance loop to end of packet
    }
  }

  return pixels;
}

export interface DemuxedStreamResult {
  pixels: PixelData[];
  cleanTextBytes: Uint8Array;
}

/**
 * Stateful Stream Demuxer (v3.2)
 * Safely separates 8-byte [0xAA, 0x55, ...] binary pixel packets from interleaved
 * UTF-8 text telemetry across arbitrary USB CDC / UART transfer chunk boundaries.
 * Prevents 0x0A (10) bytes inside binary coordinates/colors from triggering false
 * newline breaks in text parsers.
 */
export class StatefulBinaryDemuxer {
  private remainder: Uint8Array = new Uint8Array(0);

  public push(chunk: Uint8Array): DemuxedStreamResult {
    if (chunk.length === 0) {
      return { pixels: [], cleanTextBytes: new Uint8Array(0) };
    }

    const combined = new Uint8Array(this.remainder.length + chunk.length);
    combined.set(this.remainder, 0);
    combined.set(chunk, this.remainder.length);

    const pixels: PixelData[] = [];
    const textBytes: number[] = [];
    let i = 0;
    const len = combined.length;

    while (i < len) {
      if (combined[i] === BINARY_PIXEL_MAGIC_0) {
        // Case 1: 0xAA is at the very last byte of the chunk -> could be start of [0xAA, 0x55]
        if (i + 1 >= len) {
          this.remainder = combined.slice(i);
          return { pixels, cleanTextBytes: new Uint8Array(textBytes) };
        }
        // Case 2: [0xAA, 0x55] matched
        if (combined[i + 1] === BINARY_PIXEL_MAGIC_1) {
          if (i + BINARY_PIXEL_PACKET_LEN <= len) {
            const packed = combined[i + 7];
            const x = combined[i + 2] | (((packed >> 6) & 0x01) << 8);
            const y = combined[i + 3] | (((packed >> 7) & 0x01) << 8);
            const r = combined[i + 4];
            const g = combined[i + 5];
            const b = combined[i + 6];
            const coreId = packed & 0x3f;
            pixels.push({ x, y, r, g, b, coreId });
            i += BINARY_PIXEL_PACKET_LEN;
            continue;
          } else {
            // Incomplete 8-byte packet at end of USB transfer chunk -> carry over to next push()
            this.remainder = combined.slice(i);
            return { pixels, cleanTextBytes: new Uint8Array(textBytes) };
          }
        }
      }
      textBytes.push(combined[i]);
      i++;
    }

    this.remainder = new Uint8Array(0);
    return { pixels, cleanTextBytes: new Uint8Array(textBytes) };
  }

  public reset(): void {
    this.remainder = new Uint8Array(0);
  }
}

/**
 * Extracts pixel packets from incoming parsed JSON telemetry objects
 */
export function extractPixelsFromJson(payload: Record<string, any>): PixelData[] {
  const pixels: PixelData[] = [];

  // Format 1: Single pixel object {"type":"px", "x":10, "y":20, "r":255, "g":128, "b":0, "core":5}
  if (
    typeof payload.x === 'number' &&
    typeof payload.y === 'number' &&
    typeof payload.r === 'number' &&
    typeof payload.g === 'number' &&
    typeof payload.b === 'number'
  ) {
    pixels.push({
      x: Math.floor(payload.x),
      y: Math.floor(payload.y),
      r: Math.max(0, Math.min(255, Math.floor(payload.r))),
      g: Math.max(0, Math.min(255, Math.floor(payload.g))),
      b: Math.max(0, Math.min(255, Math.floor(payload.b))),
      coreId: typeof payload.core === 'number' ? Math.floor(payload.core) : (typeof payload.coreId === 'number' ? Math.floor(payload.coreId) : 0),
    });
    return pixels;
  }

  // Format 2: Batch array of pixels {"type":"px_batch", "pixels": [[x, y, r, g, b, core], ...]}
  if (Array.isArray(payload.pixels)) {
    for (const px of payload.pixels) {
      if (Array.isArray(px) && px.length >= 5) {
        pixels.push({
          x: Math.floor(px[0]),
          y: Math.floor(px[1]),
          r: Math.max(0, Math.min(255, Math.floor(px[2]))),
          g: Math.max(0, Math.min(255, Math.floor(px[3]))),
          b: Math.max(0, Math.min(255, Math.floor(px[4]))),
          coreId: px.length >= 6 ? Math.floor(px[5]) : 0,
        });
      } else if (typeof px === 'object' && px !== null && typeof px.x === 'number' && typeof px.y === 'number') {
        pixels.push({
          x: Math.floor(px.x),
          y: Math.floor(px.y),
          r: Math.max(0, Math.min(255, Math.floor(px.r ?? 0))),
          g: Math.max(0, Math.min(255, Math.floor(px.g ?? 0))),
          b: Math.max(0, Math.min(255, Math.floor(px.b ?? 0))),
          coreId: Math.floor(px.core ?? px.coreId ?? 0),
        });
      }
    }
  }

  return pixels;
}

/**
 * Analytical 3D Raymarching Shader for synthetic cluster simulation
 * Computes the color and computing core ID for a given coordinate (px, py)
 */
export function raymarchPixel(
  px: number,
  py: number,
  width = 160,
  height = 120,
  rotXDeg = 0,
  rotYDeg = 0,
  lightIntensity = 1.0
): PixelData {
  // Normalize UV coords to [-1, 1], aspect-ratio corrected
  const u = (2.0 * px - width) / height;
  const v = -(2.0 * py - height) / height;

  const rotXRad = (rotXDeg * Math.PI) / 180.0;
  const rotYRad = (rotYDeg * Math.PI) / 180.0;

  // Camera ray setup
  const cosY = Math.cos(rotYRad);
  const sinY = Math.sin(rotYRad);
  const cosX = Math.cos(rotXRad);
  const sinX = Math.sin(rotXRad);

  // Unrotated ray direction
  let rdx = u;
  let rdy = v;
  let rdz = 1.5; // Focal length

  // Normalize
  const len = Math.hypot(rdx, rdy, rdz);
  rdx /= len;
  rdy /= len;
  rdz /= len;

  // Apply Camera Rotation (Orbit camera around origin at radius R = 2.6)
  // Camera origin rotated by (rotXRad, rotYRad)
  const dist = 2.6;
  const rox = -dist * sinY * cosX;
  const roy = dist * sinX;
  const roz = -dist * cosY * cosX;

  // Rotate camera ray direction into world space
  // 1. Pitch X
  const rdy1 = rdy * cosX - rdz * sinX;
  const rdz1 = rdy * sinX + rdz * cosX;
  // 2. Yaw Y
  const rdx2 = rdx * cosY + rdz1 * sinY;
  const rdz2 = -rdx * sinY + rdz1 * cosY;

  // Raymarch against a sphere of radius 1.0 at origin with procedural surface bands
  let t = 0.0;
  let hit = false;
  const maxSteps = 28;
  const maxDist = 8.0;

  for (let i = 0; i < maxSteps; i++) {
    const curX = rox + t * rdx2;
    const curY = roy + t * rdy1;
    const curZ = roz + t * rdz2;

    // Signed Distance Field (SDF) of Sphere with subtle latitude/longitude geometric ribbing
    const distToCenter = Math.hypot(curX, curY, curZ);
    const rib = 0.03 * Math.sin(curY * 14.0) * Math.cos(curX * 14.0);
    const d = distToCenter - 1.0 + rib;

    if (d < 0.005) {
      hit = true;
      break;
    }
    t += d * 0.85;
    if (t > maxDist) break;
  }

  let r = 18;
  let g = 24;
  let b = 38; // Dark navy background gradient
  const bgGrad = Math.max(0, 1.0 - Math.hypot(u, v) * 0.5);
  r = Math.floor(r * bgGrad);
  g = Math.floor(g * bgGrad);
  b = Math.floor(b * bgGrad);

  if (hit) {
    const hx = rox + t * rdx2;
    const hy = roy + t * rdy1;
    const hz = roz + t * rdz2;

    // Surface normal of sphere
    const nx = hx;
    const ny = hy;
    const nz = hz;

    // Light direction
    let lx = 0.577;
    let ly = 0.577;
    let lz = -0.577;
    const diffuse = Math.max(0.08, (nx * lx + ny * ly + nz * lz) * lightIntensity);

    // Specular highlight
    const vx = -rdx2;
    const vy = -rdy1;
    const vz = -rdz2;
    const hlx = lx + vx;
    const hly = ly + vy;
    const hlz = lz + vz;
    const hlen = Math.hypot(hlx, hly, hlz) || 1;
    const spec = Math.pow(Math.max(0, (nx * hlx + ny * hly + nz * hlz) / hlen), 16) * 0.6 * lightIntensity;

    // Material base color: Metallic cyan-emerald
    r = Math.min(255, Math.floor((30 * diffuse + spec * 255)));
    g = Math.min(255, Math.floor((190 * diffuse + spec * 255)));
    b = Math.min(255, Math.floor((240 * diffuse + spec * 255)));
  }

  // Workload core partition: 64 cores split across an 8x8 tiled grid on screen
  const tileX = Math.floor((px / width) * 8);
  const tileY = Math.floor((py / height) * 8);
  const coreId = Math.max(0, Math.min(63, tileY * 8 + tileX));

  return { x: px, y: py, r, g, b, coreId };
}

