import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { WebSocket } from 'ws';
import { VirtualMcuSimulator } from '../bridge/virtualMcu.ts';
import { SerialMultiplexer } from '../bridge/serialMux.ts';
import { OpenSerialMcpServer, MCP_TOOL_DEFINITIONS } from '../bridge/mcpServer.ts';

describe('OpenSerial Studio v3.0 — Virtual MCU Simulator (Closed-Loop Physics)', () => {
  test('dsp_harmonics: produces composite dual-tone sinusoid with microsecond timebase', async () => {
    const sim = new VirtualMcuSimulator('dsp_harmonics', 40);
    const frames: string[] = [];
    sim.start((line) => frames.push(line));

    await new Promise((resolve) => setTimeout(resolve, 120));
    sim.stop();

    assert.ok(frames.length >= 3, `Expected at least 3 frames, got ${frames.length}`);
    const parsed = JSON.parse(frames[0]);
    assert.strictEqual(typeof parsed.Signal_V, 'number');
    assert.strictEqual(typeof parsed.t_us, 'number');

    // Test dynamic tuning command
    sim.receiveCommand('{"f1": 10.0, "noise": 0.05}');
    assert.strictEqual(sim.dsp.f1, 10.0);
    assert.strictEqual(sim.dsp.noiseAmp, 0.05);
  });

  test('pid_motor: converges closed-loop toward setpoint and responds to parameter updates', async () => {
    const sim = new VirtualMcuSimulator('pid_motor', 40);
    sim.pid.rpm = 0;
    sim.pid.setpoint = 1000;
    sim.pid.velocity = 0;

    const frames: string[] = [];
    sim.start((line) => frames.push(line));

    // Run for 300ms (12 ticks)
    await new Promise((resolve) => setTimeout(resolve, 300));
    sim.stop();

    assert.ok(frames.length > 5);
    const lastFrame = JSON.parse(frames[frames.length - 1]);
    // Closed-loop PID should have accelerated rotor RPM toward 1000
    assert.ok(lastFrame.Rotor_rpm > 100, `Expected RPM > 100, got ${lastFrame.Rotor_rpm}`);

    // Test setpoint command
    sim.receiveCommand('{"setpoint": 1500, "Kp": 0.25}');
    assert.strictEqual(sim.pid.setpoint, 1500);
    assert.strictEqual(sim.pid.kp, 0.25);
  });

  test('iot_env: formats Arduino Serial Plotter Key:Value string with microsecond timebase', async () => {
    const sim = new VirtualMcuSimulator('iot_env', 40);
    const frames: string[] = [];
    sim.start((line) => frames.push(line));

    await new Promise((resolve) => setTimeout(resolve, 100));
    sim.stop();

    assert.ok(frames.length >= 2);
    const line = frames[0];
    assert.ok(line.includes('Temp:'), `Expected Temp in plotter line: ${line}`);
    assert.ok(line.includes('Humidity:'), `Expected Humidity in plotter line: ${line}`);
    assert.ok(line.includes('t_us:'), `Expected t_us in plotter line: ${line}`);
  });
});

describe('OpenSerial Studio v3.0 — Serial Multiplexer & WebSocket Broadcast', () => {
  const TEST_WS_PORT = 8769;
  let mux: SerialMultiplexer;

  before(async () => {
    mux = new SerialMultiplexer(TEST_WS_PORT);
    await mux.startServer();
  });

  after(async () => {
    await mux.stopServer();
  });

  test('lists virtual simulation ports and handles connect/disconnect lifecycle', async () => {
    const ports = await mux.listPorts();
    assert.ok(ports.some((p) => p.path === 'sim://dsp_harmonics'));
    assert.ok(ports.some((p) => p.path === 'sim://pid_motor'));
    assert.ok(ports.some((p) => p.path === 'sim://iot_env'));

    const connected = await mux.connect('sim://dsp_harmonics', 115200);
    assert.strictEqual(connected, true);
    assert.strictEqual(mux.status, 'connected');
    assert.strictEqual(mux.isVirtual, true);

    const released = await mux.releasePortForFlash();
    assert.strictEqual(released, true);
    assert.strictEqual(mux.status, 'released_for_flash');

    mux.disconnect();
    assert.strictEqual(mux.status, 'disconnected');
  });

  test('streams telemetry frames and echoes TX commands to connected WebSocket clients', async () => {
    await mux.connect('sim://dsp_harmonics', 115200);

    const ws = new WebSocket(`ws://127.0.0.1:${TEST_WS_PORT}`);
    const receivedMessages: any[] = [];

    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
    });

    // Wait 150ms to accumulate incoming streamed telemetry
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Send a client command
    ws.send(JSON.stringify({ type: 'tx_command', payload: '{"f1": 6.5}' }));

    // Wait for TX echo
    await new Promise((resolve) => setTimeout(resolve, 100));

    ws.close();
    mux.disconnect();

    const statusMsg = receivedMessages.find((m) => m.type === 'status');
    assert.ok(statusMsg, 'Expected handshake status message');

    const rxDataMsg = receivedMessages.find((m) => m.type === 'rx_data');
    assert.ok(rxDataMsg, 'Expected rx_data streamed telemetry message');
    assert.strictEqual(typeof rxDataMsg.line, 'string');

    const txEchoMsg = receivedMessages.find((m) => m.type === 'tx_echo');
    assert.ok(txEchoMsg, 'Expected tx_echo message');
    assert.strictEqual(txEchoMsg.text, '{"f1": 6.5}');
  });

  test('rate limiter throttles rapid TX command bursts to protect UART FIFO', () => {
    // First send succeeds
    const sent1 = mux.sendCommand('CMD1');
    assert.strictEqual(sent1, true);

    // Immediate second send (< 20ms) should be throttled
    const sent2 = mux.sendCommand('CMD2');
    assert.strictEqual(sent2, false);
  });
});

describe('OpenSerial Studio v3.0 — MCP Server Tool Contract (rea-tool-design)', () => {
  const MCP_WS_PORT = 8770;
  let mux: SerialMultiplexer;
  let mcp: OpenSerialMcpServer;

  before(async () => {
    mux = new SerialMultiplexer(MCP_WS_PORT);
    await mux.startServer();
    mcp = new OpenSerialMcpServer(mux);
  });

  after(async () => {
    await mux.stopServer();
  });

  test('MCP tool definitions adhere to standard schema contracts', () => {
    assert.strictEqual(MCP_TOOL_DEFINITIONS.length, 6);
    const toolNames = MCP_TOOL_DEFINITIONS.map((t) => t.name);
    assert.ok(toolNames.includes('serial_list_ports'));
    assert.ok(toolNames.includes('serial_connect'));
    assert.ok(toolNames.includes('serial_release_port'));
    assert.ok(toolNames.includes('serial_read_telemetry'));
    assert.ok(toolNames.includes('serial_send_command'));
    assert.ok(toolNames.includes('serial_generate_firmware'));
  });

  test('serial_list_ports: enumerates virtual and physical ports', async () => {
    const res = await mcp.handleToolCall('serial_list_ports', {});
    const data = JSON.parse(res.content[0].text);
    assert.ok(Array.isArray(data.ports));
    assert.ok(data.ports.length >= 3);
  });

  test('serial_connect & serial_read_telemetry: verifies provenance, coverage, and detail levels', async () => {
    const connectRes = await mcp.handleToolCall('serial_connect', {
      port: 'sim://dsp_harmonics',
      baudRate: 115200,
    });
    assert.strictEqual(connectRes.isError, false);

    // Allow simulator to stream a few frames
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 1. Summary mode (saves context tokens)
    const summaryRes = await mcp.handleToolCall('serial_read_telemetry', { detail: 'summary' });
    const summaryData = JSON.parse(summaryRes.content[0].text);

    // Check rea-tool-design contracts
    assert.strictEqual(summaryData._meta.provenance.untrusted_content, true);
    assert.strictEqual(summaryData.coverage.completeness, 'complete');
    assert.ok(Array.isArray(summaryData.residual_unknowns));
    assert.ok(summaryData.channels.Signal_V);
    assert.strictEqual(typeof summaryData.channels.Signal_V.latestValue, 'number');
    assert.ok(summaryData.recentFrames.length <= 5);

    // 2. Complete mode (full historical slice)
    const completeRes = await mcp.handleToolCall('serial_read_telemetry', { detail: 'complete' });
    const completeData = JSON.parse(completeRes.content[0].text);
    assert.ok(completeData.recentFrames.length >= summaryData.recentFrames.length);
  });

  test('serial_send_command: transmits command and triggers [MCP TX] origin', async () => {
    // Wait for rate-limit window
    await new Promise((resolve) => setTimeout(resolve, 30));

    const res = await mcp.handleToolCall('serial_send_command', {
      command: '{"f1": 5.0}',
    });
    assert.strictEqual(res.isError, false);
    const data = JSON.parse(res.content[0].text);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.command, '{"f1": 5.0}');
  });

  test('serial_release_port: transitions multiplexer state to released_for_flash without port lock', async () => {
    const res = await mcp.handleToolCall('serial_release_port', {});
    assert.strictEqual(res.isError, false);
    const data = JSON.parse(res.content[0].text);
    assert.strictEqual(data.status, 'released_for_flash');
    assert.strictEqual(mux.status, 'released_for_flash');
  });

  test('serial_generate_firmware: generates valid STM32 HAL DMA firmware with microsecond timebase', async () => {
    const res = await mcp.handleToolCall('serial_generate_firmware', {
      platform: 'stm32',
      channels: ['Pressure_bar', 'Temperature_C'],
      controls: [{ id: 'LED1', type: 'button' }],
    });
    assert.strictEqual(res.isError, false);
    const code = res.content[0].text;
    assert.ok(code.includes('HAL_UARTEx_ReceiveToIdle_DMA'));
    assert.ok(code.includes('Pressure_bar'));
  });
});
