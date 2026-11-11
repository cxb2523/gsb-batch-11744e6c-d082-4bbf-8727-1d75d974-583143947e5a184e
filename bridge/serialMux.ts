import { WebSocketServer, WebSocket } from 'ws';
import { VirtualMcuSimulator, type SimulationScenario } from './virtualMcu.ts';
import {
  parseSerialPayloadDetailed,
  extractWidgetsFromBatch,
  toHexString,
  parseHexInput,
  type ParsedTelemetryFrame,
  type WidgetConfig,
} from '../src/lib/parser.ts';
import {
  analyzeSignalAndSpectrum,
  type SignalMetrics,
} from '../src/lib/dsp.ts';
import { StatefulBinaryDemuxer } from '../src/lib/framebuffer.ts';

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  isVirtual?: boolean;
}

export interface MultiplexerStatus {
  activePort: string | null;
  baudRate: number;
  status: 'disconnected' | 'connecting' | 'connected' | 'released_for_flash' | 'error';
  isVirtual: boolean;
  clientCount: number;
  totalFramesReceived: number;
  totalCommandsSent: number;
  droppedFrames: number;
  availablePorts?: SerialPortInfo[];
}

export interface TelemetrySummaryResponse {
  activePort: string | null;
  status: string;
  channels: Record<string, {
    latestValue: number | string | boolean;
    unit?: string;
    metrics?: SignalMetrics;
    sampleCount: number;
  }>;
  recentFrames?: ParsedTelemetryFrame[];
  coverage: {
    completeness: 'complete' | 'partial';
    bufferedFrames: number;
    droppedFrames: number;
  };
  residual_unknowns: string[];
  _meta: {
    provenance: {
      untrusted_content: boolean;
      source: string;
    };
  };
}

export class SerialMultiplexer {
  public status: MultiplexerStatus['status'] = 'disconnected';
  public activePort: string | null = null;
  public baudRate = 115200;
  public isVirtual = false;

  private wss: WebSocketServer | null = null;
  private wsClients: Set<WebSocket> = new Set();
  private simulator: VirtualMcuSimulator | null = null;
  private physicalPort: any = null;
  private demuxer: StatefulBinaryDemuxer = new StatefulBinaryDemuxer();
  private cachedPorts: SerialPortInfo[] = [
    { path: 'sim://dsp_harmonics', manufacturer: 'OpenSerial Simulation', isVirtual: true },
    { path: 'sim://pid_motor', manufacturer: 'OpenSerial Simulation', isVirtual: true },
    { path: 'sim://iot_env', manufacturer: 'OpenSerial Simulation', isVirtual: true },
    { path: 'sim://raymarcher_gpu', manufacturer: 'OpenSerial Simulation', isVirtual: true },
  ];

  private frameBuffer: ParsedTelemetryFrame[] = [];
  private widgetsMap: Map<string, WidgetConfig> = new Map();
  private rawBytesBuffer: Uint8Array[] = [];

  private totalFramesReceived = 0;
  private totalCommandsSent = 0;
  private droppedFrames = 0;
  private maxBufferedFrames = 256;

  // Rate Limiting for TX commands
  private lastCommandTimestamp = 0;
  private minCommandIntervalMs = 20; // max 50 commands/sec to prevent UART FIFO overrun

  public wsPort: number;

  constructor(wsPort = 8765) {
    this.wsPort = wsPort;
  }

  /**
   * Starts local WebSocket broadcast server for Web UI clients.
   */
  public startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.wsPort }, () => {
          resolve();
        });

        this.wss.on('connection', (ws) => {
          this.wsClients.add(ws);

          // Send immediate handshake with current status and enumerated ports
          this.listPorts().then(() => {
            this.sendToClient(ws, {
              type: 'status',
              data: this.getStatus(),
            });
          });

          ws.on('message', (data) => {
            try {
              const msg = JSON.parse(data.toString());
              if (msg.type === 'tx_command' && typeof msg.payload === 'string') {
                this.sendCommand(msg.payload, 'web');
              } else if (msg.type === 'tx_raw_hex' && typeof msg.hex === 'string') {
                const rawBytes = parseHexInput(msg.hex);
                if (rawBytes) {
                  this.sendRawBytes(rawBytes, 'web');
                }
              } else if (msg.type === 'connect' && typeof msg.port === 'string') {
                this.connectPort(msg.port, msg.baudRate ?? 115200);
              } else if (msg.type === 'release_port') {
                this.releasePort();
              } else if (msg.type === 'list_ports') {
                this.listPorts().then((ports) => {
                  this.sendToClient(ws, { type: 'ports_list', ports });
                  this.broadcastStatus();
                });
              } else if (msg.type === 'disconnect') {
                this.disconnect();
              }
            } catch {
              // Ignore invalid client messages
            }
          });

          ws.on('close', () => {
            this.wsClients.delete(ws);
          });
        });

        this.wss.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  public stopServer(): Promise<void> {
    return new Promise((resolve) => {
      this.disconnect();
      if (this.wss) {
        this.wss.close(() => {
          this.wss = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Lists available physical COM ports and virtual simulation channels.
   */
  public async listPorts(): Promise<SerialPortInfo[]> {
    const ports: SerialPortInfo[] = [
      { path: 'sim://dsp_harmonics', manufacturer: 'OpenSerial Simulation', isVirtual: true },
      { path: 'sim://pid_motor', manufacturer: 'OpenSerial Simulation', isVirtual: true },
      { path: 'sim://iot_env', manufacturer: 'OpenSerial Simulation', isVirtual: true },
      { path: 'sim://raymarcher_gpu', manufacturer: 'OpenSerial Simulation', isVirtual: true },
    ];

    try {
      // Dynamically load serialport if installed in environment
      // @ts-ignore
      const { SerialPort } = await import('serialport').catch(() => ({ SerialPort: null }));
      if (SerialPort && typeof SerialPort.list === 'function') {
        const physical = await SerialPort.list();
        for (const p of physical) {
          ports.push({
            path: p.path,
            manufacturer: p.manufacturer,
            serialNumber: p.serialNumber,
            isVirtual: false,
          });
        }
      }
    } catch {
      // serialport not available; virtual ports always available
    }

    this.cachedPorts = ports;
    return ports;
  }

  /**
   * Connects to a physical COM port or a virtual simulator channel.
   */
  public async connect(portName: string, baudRate = 115200): Promise<boolean> {
    return this.connectPort(portName, baudRate);
  }

  public async connectPort(portName: string, baudRate = 115200): Promise<boolean> {
    this.disconnect();
    this.demuxer.reset();
    this.activePort = portName;
    this.baudRate = baudRate;
    this.status = 'connecting';
    await this.listPorts();
    this.broadcastStatus();

    if (portName.startsWith('sim://')) {
      const scenario = portName.replace('sim://', '') as SimulationScenario;
      this.isVirtual = true;
      this.simulator = new VirtualMcuSimulator({
        scenario,
        onTxData: (line, rawBytes) => this.handleIncomingData(line, rawBytes),
      });
      this.simulator.start();
      this.status = 'connected';
      this.broadcastStatus();
      return true;
    }

    // Physical Serial Port connection
    try {
      // @ts-ignore
      const { SerialPort } = await import('serialport').catch(() => ({ SerialPort: null }));
      if (!SerialPort) {
        throw new Error('serialport package not installed for physical COM ports');
      }

      this.isVirtual = false;
      this.physicalPort = new SerialPort({
        path: portName,
        baudRate,
        autoOpen: true,
      });

      this.physicalPort.on('open', () => {
        this.status = 'connected';
        this.broadcastStatus();
      });

      let lineBuffer = '';
      const textDecoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

      this.physicalPort.on('data', (chunk: Buffer) => {
        const rawBytes = new Uint8Array(chunk);
        const { pixels, cleanTextBytes } = this.demuxer.push(rawBytes);

        // If binary pixel packets were extracted and there are no text lines, broadcast raw chunk immediately
        if (pixels.length > 0 && cleanTextBytes.length === 0) {
          this.broadcast({
            type: 'rx_raw',
            rawHex: toHexString(rawBytes),
            timestamp: Date.now(),
          });
        }

        if (cleanTextBytes.length > 0) {
          lineBuffer += textDecoder.decode(cleanTextBytes, { stream: true });
          const lines = lineBuffer.split(/\r?\n/);
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              this.handleIncomingData(trimmed, rawBytes);
            }
          }
        }
      });

      this.physicalPort.on('error', (err: Error) => {
        console.error('Physical Port Error:', err.message);
        this.status = 'error';
        this.broadcastStatus();
      });

      return true;
    } catch (err: any) {
      console.warn('Could not open physical serial port:', err?.message || err);
      this.status = 'error';
      this.broadcastStatus();
      return false;
    }
  }

  /**
   * Releases port lock temporarily (for flashing firmware with external tool)
   * without destroying multiplexer state.
   */
  public async releasePortForFlash(): Promise<boolean> {
    return this.releasePort();
  }

  public async releasePort(): Promise<boolean> {
    if (this.physicalPort) {
      await new Promise<void>((resolve) => {
        this.physicalPort.close(() => {
          this.physicalPort = null;
          resolve();
        });
      });
    }
    if (this.simulator) {
      this.simulator.stop();
    }
    this.status = 'released_for_flash';
    this.broadcastStatus();
    return true;
  }

  public disconnect(): void {
    if (this.simulator) {
      this.simulator.stop();
      this.simulator = null;
    }
    if (this.physicalPort) {
      try {
        this.physicalPort.close();
      } catch {
        // Ignore close error
      }
      this.physicalPort = null;
    }
    this.status = 'disconnected';
    this.activePort = null;
    this.broadcastStatus();
  }

  /**
   * Sends command down to device/simulator and notifies all WebSocket clients.
   */
  public sendCommand(commandText: string, origin: 'web' | 'mcp' = 'web'): boolean {
    const now = Date.now();
    if (now - this.lastCommandTimestamp < this.minCommandIntervalMs) {
      // Throttle excessive command bursts
      return false;
    }
    this.lastCommandTimestamp = now;

    const cleanCommand = commandText.trim();
    if (!cleanCommand) return false;

    this.totalCommandsSent++;

    if (this.isVirtual && this.simulator) {
      this.simulator.receiveCommand(cleanCommand);
    } else if (this.physicalPort && this.status === 'connected') {
      this.physicalPort.write(`${cleanCommand}\n`);
    }

    // Broadcast TX notification to all Web UI clients
    this.broadcast({
      type: 'tx_echo',
      origin,
      text: cleanCommand,
      timestamp: now,
    });

    return true;
  }

  /**
   * Sends raw binary bytes (e.g. Modbus RTU, custom bootloader frames) without UTF-8 loss.
   */
  public sendRawBytes(bytes: Uint8Array, origin: 'web' | 'mcp' = 'web'): boolean {
    if (!bytes || bytes.length === 0) return false;
    const now = Date.now();
    this.totalCommandsSent++;

    if (this.physicalPort && this.status === 'connected') {
      this.physicalPort.write(Buffer.from(bytes));
    }

    const hex = toHexString(bytes);
    this.broadcast({
      type: 'tx_echo',
      origin,
      text: `[HEX] ${hex}`,
      rawHex: hex,
      timestamp: now,
    });

    return true;
  }

  /**
   * Ingests line of telemetry from physical UART or simulator.
   */
  private handleIncomingData(data: string, rawBytes?: Uint8Array): void {
    this.totalFramesReceived++;

    if (rawBytes) {
      this.rawBytesBuffer.push(rawBytes);
      if (this.rawBytesBuffer.length > 50) {
        this.rawBytesBuffer = this.rawBytesBuffer.slice(-25);
      }
    }

    const frame = parseSerialPayloadDetailed(data);
    if (frame) {
      this.frameBuffer.push(frame);
      if (this.frameBuffer.length > this.maxBufferedFrames) {
        this.frameBuffer = this.frameBuffer.slice(-Math.floor(this.maxBufferedFrames / 2));
        this.droppedFrames += Math.floor(this.maxBufferedFrames / 2);
      }
      this.widgetsMap = extractWidgetsFromBatch([frame], this.widgetsMap, 128);
    }

    // Broadcast raw and line stream to Web UI clients
    this.broadcast({
      type: 'rx_data',
      line: data,
      rawHex: rawBytes ? toHexString(rawBytes) : undefined,
      frame,
      timestamp: Date.now(),
    });
  }

  /**
   * Computes comprehensive telemetry and DSP metrics according to rea-tool-design contract.
   */
  public getTelemetry(detail: 'summary' | 'complete' = 'summary'): TelemetrySummaryResponse {
    const channels: TelemetrySummaryResponse['channels'] = {};

    for (const [key, widget] of this.widgetsMap.entries()) {
      let metrics: SignalMetrics | undefined;
      if (widget.type === 'chart' && widget.history.length >= 8) {
        const dspResult = analyzeSignalAndSpectrum(widget.history, 'hann');
        metrics = dspResult.metrics;
      }

      channels[key] = {
        latestValue: widget.value,
        unit: widget.unit,
        metrics,
        sampleCount: widget.history.length,
      };
    }

    const recentFrames = detail === 'complete' ? this.frameBuffer.slice(-20) : this.frameBuffer.slice(-5);

    return {
      activePort: this.activePort,
      status: this.status,
      channels,
      recentFrames,
      coverage: {
        completeness: this.status === 'connected' ? 'complete' : 'partial',
        bufferedFrames: this.frameBuffer.length,
        droppedFrames: this.droppedFrames,
      },
      residual_unknowns:
        this.status !== 'connected'
          ? ['Device not currently connected; metrics reflect retained historical samples']
          : [],
      _meta: {
        provenance: {
          untrusted_content: true,
          source: 'uart_hardware_stream',
        },
      },
    };
  }

  public getStatus(): MultiplexerStatus {
    return {
      activePort: this.activePort,
      baudRate: this.baudRate,
      status: this.status,
      isVirtual: this.isVirtual,
      clientCount: this.wsClients.size,
      totalFramesReceived: this.totalFramesReceived,
      totalCommandsSent: this.totalCommandsSent,
      droppedFrames: this.droppedFrames,
      availablePorts: this.cachedPorts,
    };
  }

  private broadcastStatus(): void {
    this.broadcast({
      type: 'status',
      data: this.getStatus(),
    });
  }

  private broadcast(obj: Record<string, unknown>): void {
    const payload = JSON.stringify(obj);
    for (const client of this.wsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private sendToClient(ws: WebSocket, obj: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }
}
