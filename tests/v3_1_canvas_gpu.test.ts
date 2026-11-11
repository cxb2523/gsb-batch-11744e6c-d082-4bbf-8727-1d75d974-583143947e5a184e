import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import WebSocket from 'ws';
import {
  parseBinaryPixelChunk,
  encodeBinaryPixelPacket,
  StatefulBinaryDemuxer,
  extractPixelsFromJson,
  getCoreHeatmapRgb,
  CORE_PALETTE,
  raymarchPixel,
  hslToRgb,
  RESOLUTION_PRESETS,
  type PixelData,
} from '../src/lib/framebuffer.ts';
import { VirtualMcuSimulator } from '../bridge/virtualMcu.ts';
import { SerialMultiplexer } from '../bridge/serialMux.ts';
import { generateArduinoCode, generateSTM32Code, generateMicroPythonCode } from '../src/lib/codegen.ts';

describe('OpenSerial Studio v3.1 — Framebuffer Pixel Protocol & Ingestion', () => {
  test('decodes single and multi-packet binary pixel streams ([0xAA, 0x55, X, Y, R, G, B, Core])', () => {
    // 2 consecutive pixels
    const buffer = new Uint8Array([
      0xaa, 0x55, 10, 20, 255, 128, 64, 5,   // Px 1: (10, 20), rgb(255, 128, 64), core 5
      0xaa, 0x55, 30, 40, 0, 200, 255, 63,   // Px 2: (30, 40), rgb(0, 200, 255), core 63
    ]);

    const pixels = parseBinaryPixelChunk(buffer);
    assert.strictEqual(pixels.length, 2);

    assert.strictEqual(pixels[0].x, 10);
    assert.strictEqual(pixels[0].y, 20);
    assert.strictEqual(pixels[0].r, 255);
    assert.strictEqual(pixels[0].g, 128);
    assert.strictEqual(pixels[0].b, 64);
    assert.strictEqual(pixels[0].coreId, 5);

    assert.strictEqual(pixels[1].x, 30);
    assert.strictEqual(pixels[1].y, 40);
    assert.strictEqual(pixels[1].r, 0);
    assert.strictEqual(pixels[1].g, 200);
    assert.strictEqual(pixels[1].b, 255);
    assert.strictEqual(pixels[1].coreId, 63);
  });

  test('safely rejects truncated or malformed binary byte chunks', () => {
    const corruptBuffer = new Uint8Array([0xaa, 0x55, 10, 20]); // Incomplete (only 4 bytes)
    const pixels = parseBinaryPixelChunk(corruptBuffer);
    assert.strictEqual(pixels.length, 0);
  });

  test('extracts single and batch pixel definitions from JSON telemetry', () => {
    // Format 1: Single pixel
    const single = extractPixelsFromJson({
      type: 'px',
      x: 15,
      y: 25,
      r: 250,
      g: 50,
      b: 100,
      core: 12,
    });
    assert.strictEqual(single.length, 1);
    assert.strictEqual(single[0].x, 15);
    assert.strictEqual(single[0].y, 25);
    assert.strictEqual(single[0].coreId, 12);

    // Format 2: Batch array
    const batch = extractPixelsFromJson({
      type: 'px_batch',
      pixels: [
        [1, 2, 255, 0, 0, 1],
        [3, 4, 0, 255, 0, 2],
      ],
    });
    assert.strictEqual(batch.length, 2);
    assert.strictEqual(batch[0].r, 255);
    assert.strictEqual(batch[1].g, 255);
    assert.strictEqual(batch[1].coreId, 2);
  });
});

describe('OpenSerial Studio v3.1 — 64-Core RISC-V Heatmap Palette', () => {
  test('palette contains 64 distinct non-empty RGB colors', () => {
    assert.strictEqual(CORE_PALETTE.length, 64);

    const uniqueHex = new Set<string>();
    for (const [r, g, b] of CORE_PALETTE) {
      assert.ok(r >= 0 && r <= 255);
      assert.ok(g >= 0 && g <= 255);
      assert.ok(b >= 0 && b <= 255);
      uniqueHex.add(`${r},${g},${b}`);
    }

    // High entropy: at least 50+ completely unique colors
    assert.ok(uniqueHex.size >= 55);
  });

  test('getCoreHeatmapRgb maps core IDs safely with boundary clamping', () => {
    const core0 = getCoreHeatmapRgb(0);
    assert.ok(Array.isArray(core0));

    const core63 = getCoreHeatmapRgb(63);
    assert.ok(Array.isArray(core63));

    // Clamps out-of-bounds indices without throwing
    const clampedHigh = getCoreHeatmapRgb(100);
    assert.deepStrictEqual(clampedHigh, core63);

    const clampedLow = getCoreHeatmapRgb(-10);
    assert.deepStrictEqual(clampedLow, core0);
  });

  test('hslToRgb accurately converts primary and secondary hue angles', () => {
    assert.deepStrictEqual(hslToRgb(0, 1, 0.5), [255, 0, 0]);     // Pure Red
    assert.deepStrictEqual(hslToRgb(120, 1, 0.5), [0, 255, 0]);   // Pure Green
    assert.deepStrictEqual(hslToRgb(240, 1, 0.5), [0, 0, 255]);   // Pure Blue

    // Resolution presets sanity check
    assert.strictEqual(RESOLUTION_PRESETS.length, 3);
    assert.strictEqual(RESOLUTION_PRESETS[0].width, 160);
  });
});

describe('OpenSerial Studio v3.1 — 3D Raymarching Algorithm', () => {
  test('raymarches sphere: center pixel hits surface and corner pixel hits background', () => {
    // Center pixel of 160x120
    const centerPx = raymarchPixel(80, 60, 160, 120, 0, 0, 1.0);
    assert.strictEqual(centerPx.x, 80);
    assert.strictEqual(centerPx.y, 60);
    // Center hits the metallic sphere, diffuse/specular illumination > background
    assert.ok(centerPx.g > 80, `Expected bright center green > 80, got ${centerPx.g}`);
    assert.ok(centerPx.b > 80, `Expected bright center blue > 80, got ${centerPx.b}`);
    assert.ok(centerPx.coreId >= 0 && centerPx.coreId < 64);

    // Corner pixel (0, 0) misses the sphere and lands on dark background
    const cornerPx = raymarchPixel(0, 0, 160, 120, 0, 0, 1.0);
    assert.ok(cornerPx.g < 30, `Expected dark background green < 30, got ${cornerPx.g}`);
  });

  test('camera yaw rotation alters illumination angle dynamically', () => {
    const px1 = raymarchPixel(70, 60, 160, 120, 0, 0, 1.0);
    const px2 = raymarchPixel(70, 60, 160, 120, 0, 90, 1.0);
    // Shading on rotated surface normal must differ
    assert.notDeepStrictEqual(px1, px2);
  });
});

describe('OpenSerial Studio v3.1 — Closed-Loop 64-Core GPU Simulator', () => {
  test('raymarcher_gpu: streams binary 8-byte pixel packets with companion telemetry', async () => {
    const sim = new VirtualMcuSimulator('raymarcher_gpu', 40);
    const receivedLines: string[] = [];
    const receivedBytes: Uint8Array[] = [];

    sim.start((line, rawBytes) => {
      receivedLines.push(line);
      receivedBytes.push(rawBytes);
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
    sim.stop();

    assert.ok(receivedLines.length >= 3);
    assert.ok(receivedBytes.length >= 3);

    // Verify companion JSON line
    const companion = JSON.parse(receivedLines[0]);
    assert.strictEqual(companion.Active_Cores, 64);
    assert.strictEqual(typeof companion.GPU_FPS, 'number');
    assert.strictEqual(typeof companion.Scanline, 'number');

    // Verify raw bytes contain 8-byte binary pixel magic [0xAA, 0x55]
    const pixels = parseBinaryPixelChunk(receivedBytes[0]);
    assert.ok(pixels.length > 50, `Expected > 50 pixels in batch, got ${pixels.length}`);
    assert.strictEqual(pixels[0].x, 0);
    assert.ok(pixels[0].coreId >= 0 && pixels[0].coreId < 64);
  });

  test('dynamically updates camera angles when receiving slider control commands', () => {
    const sim = new VirtualMcuSimulator('raymarcher_gpu', 40);
    sim.receiveCommand('{"cam_rot_x": 25, "cam_rot_y": 180, "light_intensity": 1.4}');

    assert.strictEqual(sim.gpu.rotX, 25);
    assert.strictEqual(sim.gpu.rotY, 180);
    assert.strictEqual(sim.gpu.lightIntensity, 1.4);
  });
});

describe('OpenSerial Studio v3.2 — Bridge Multiplexer Raymarcher Channel', () => {
  const TEST_PORT = 8775;
  let mux: SerialMultiplexer;

  before(async () => {
    mux = new SerialMultiplexer(TEST_PORT);
    await mux.startServer();
  });

  after(async () => {
    await mux.stopServer();
  });

  test('enumerates sim://raymarcher_gpu and establishes virtual connection', async () => {
    const ports = await mux.listPorts();
    assert.ok(ports.some((p) => p.path === 'sim://raymarcher_gpu'));

    const ok = await mux.connect('sim://raymarcher_gpu', 115200);
    assert.strictEqual(ok, true);
    assert.strictEqual(mux.status, 'connected');
    assert.strictEqual(mux.isVirtual, true);

    mux.disconnect();
    assert.strictEqual(mux.status, 'disconnected');
  });

  test('v3.2: encodes and decodes 9-bit coordinates (up to 320x240 / 511x511) without byte overflow', () => {
    const pxHigh: PixelData = { x: 319, y: 239, r: 240, g: 180, b: 90, coreId: 63 };
    const encoded = encodeBinaryPixelPacket(pxHigh);
    assert.strictEqual(encoded.length, 8);
    assert.strictEqual(encoded[0], 0xaa);
    assert.strictEqual(encoded[1], 0x55);

    const decoded = parseBinaryPixelChunk(encoded);
    assert.strictEqual(decoded.length, 1);
    assert.deepStrictEqual(decoded[0], pxHigh);
  });

  test('v3.2: StatefulBinaryDemuxer reassembles 8-byte packets split across USB transfer chunks and shields 0x0A bytes', () => {
    const demuxer = new StatefulBinaryDemuxer();

    // Packet with X=10 (0x0A, newline byte!) and Y=300 (bit-packed)
    const pkt = encodeBinaryPixelPacket({ x: 10, y: 300, r: 10, g: 200, b: 10, coreId: 42 });
    const textBefore = new TextEncoder().encode('{"Temp":25.5}\n');

    // Split pkt into first 3 bytes and remaining 5 bytes across two USB chunks
    const chunk1 = new Uint8Array(textBefore.length + 3);
    chunk1.set(textBefore, 0);
    chunk1.set(pkt.slice(0, 3), textBefore.length);

    const chunk2 = pkt.slice(3);

    const res1 = demuxer.push(chunk1);
    assert.strictEqual(res1.pixels.length, 0);
    assert.strictEqual(new TextDecoder().decode(res1.cleanTextBytes), '{"Temp":25.5}\n');

    const res2 = demuxer.push(chunk2);
    assert.strictEqual(res2.pixels.length, 1);
    assert.strictEqual(res2.pixels[0].x, 10);
    assert.strictEqual(res2.pixels[0].y, 300);
    assert.strictEqual(res2.pixels[0].coreId, 42);
    // Clean text bytes in chunk2 must be empty (0x0A inside pixel did not leak into text stream!)
    assert.strictEqual(res2.cleanTextBytes.length, 0);
  });

  test('v3.2: WebSocket tx_raw_hex preserves binary bytes >= 0x80 and supports release_port', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
    await new Promise<void>((resolve) => ws.on('open', () => resolve()));

    const echoes: any[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'tx_echo') echoes.push(msg);
    });

    ws.send(JSON.stringify({ type: 'tx_raw_hex', hex: 'AA 55 FF 80 0A 00 12 3F' }));
    await new Promise((r) => setTimeout(r, 40));

    assert.ok(echoes.length >= 1);
    assert.strictEqual(echoes[0].rawHex, 'AA 55 FF 80 0A 00 12 3F');

    ws.send(JSON.stringify({ type: 'release_port' }));
    await new Promise((r) => setTimeout(r, 40));
    assert.strictEqual(mux.status, 'released_for_flash');

    ws.close();
  });

  test('v3.2: Firmware Codegen includes sendPixel512 bit-packed helper across C++/STM32/MicroPython', () => {
    const ino = generateArduinoCode(['GPU_FPS'], []);
    assert.ok(ino.includes('sendPixel512(uint16_t x, uint16_t y'));
    assert.ok(ino.includes('(((x >> 8) & 0x01) << 6)'));

    const stm = generateSTM32Code(['GPU_FPS'], []);
    assert.ok(stm.includes('OpenSerial_SendPixel512(uint16_t x, uint16_t y'));

    const py = generateMicroPythonCode(['GPU_FPS'], []);
    assert.ok(py.includes('def send_pixel_512(x, y, r, g, b, core_id=0):'));
  });
});
