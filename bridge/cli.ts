#!/usr/bin/env node

import { SerialMultiplexer } from './serialMux.ts';
import { OpenSerialMcpServer } from './mcpServer.ts';

function printHelp(): void {
  console.error(`
OpenSerial-Studio Hybrid Bridge & MCP Server (v3.0.0)

Usage:
  openserial-bridge [options]

Options:
  --port <path>          Physical serial port (e.g. COM3, /dev/ttyUSB0)
  --baud <rate>          Baud rate (default: 115200)
  --sim <scenario>       Virtual MCU simulator (dsp_harmonics, pid_motor, iot_env, raymarcher_gpu)
  --ws-port <port>       WebSocket server port (default: 8765)
  --no-mcp               Disable stdio MCP server (WebSocket bridge only)
  --help, -h             Show this help message

Examples:
  openserial-bridge --sim dsp_harmonics
  openserial-bridge --port COM5 --baud 115200
  openserial-bridge --sim pid_motor --ws-port 8765
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let port: string | null = null;
  let baud = 115200;
  let sim: string | null = null;
  let wsPort = 8765;
  let enableMcp = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--port' && i + 1 < args.length) {
      port = args[++i];
    } else if (arg === '--baud' && i + 1 < args.length) {
      baud = parseInt(args[++i], 10) || 115200;
    } else if (arg === '--sim' && i + 1 < args.length) {
      sim = args[++i];
    } else if (arg === '--ws-port' && i + 1 < args.length) {
      wsPort = parseInt(args[++i], 10) || 8765;
    } else if (arg === '--no-mcp') {
      enableMcp = false;
    }
  }

  console.error(`[OpenSerial Bridge] Starting v3.0.0 daemon...`);
  const mux = new SerialMultiplexer(wsPort);

  try {
    await mux.startServer();
    console.error(`[OpenSerial Bridge] WebSocket server running at ws://127.0.0.1:${wsPort}`);

    if (sim) {
      const simUri = sim.startsWith('sim://') ? sim : `sim://${sim}`;
      console.error(`[OpenSerial Bridge] Auto-connecting to virtual simulator: ${simUri}`);
      await mux.connect(simUri, baud);
    } else if (port) {
      console.error(`[OpenSerial Bridge] Auto-connecting to serial port: ${port} @ ${baud} baud`);
      await mux.connect(port, baud);
    }

    if (enableMcp) {
      const mcp = new OpenSerialMcpServer(mux);
      mcp.listenStdio();
      console.error(`[OpenSerial Bridge] MCP Server listening on stdio (Ready for AI Agent tool calls)`);
    }

    // Graceful shutdown handling
    const shutdown = async () => {
      console.error(`\n[OpenSerial Bridge] Shutting down cleanly...`);
      await mux.stopServer();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err: any) {
    console.error(`[OpenSerial Bridge] Fatal error starting bridge:`, err?.message || err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js') || process.argv[1]?.includes('openserial-bridge')) {
  main();
}

export { main };
