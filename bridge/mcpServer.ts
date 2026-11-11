import { SerialMultiplexer } from './serialMux.ts';
import {
  generateArduinoCode,
  generateArduinoPlotterCode,
  generateSTM32Code,
  generateMicroPythonCode,
  type CodegenPlatform,
  type ControlSpec,
} from '../src/lib/codegen.ts';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'serial_list_ports',
    description: 'Lists available physical COM/TTY serial ports (with VID/PID) and virtual simulation channels (sim://dsp_harmonics, sim://pid_motor, sim://iot_env, sim://raymarcher_gpu).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'serial_connect',
    description: 'Connects to a physical COM port or virtual simulation channel with the specified baud rate.',
    inputSchema: {
      type: 'object',
      properties: {
        port: {
          type: 'string',
          description: 'Port name (e.g. "COM3", "/dev/ttyUSB0", or virtual "sim://dsp_harmonics", "sim://pid_motor", "sim://iot_env", "sim://raymarcher_gpu")',
        },
        baudRate: {
          type: 'number',
          description: 'Baud rate (default 115200)',
        },
      },
      required: ['port'],
    },
  },
  {
    name: 'serial_release_port',
    description: 'Temporarily releases the COM port lock so external flashers (arduino-cli, esptool, STM32_Programmer_CLI) can flash firmware without "Port busy" errors.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'serial_read_telemetry',
    description: 'Reads real-time telemetry channels, laboratory DSP metrology (SNR, THD, SINAD, ENOB, IEEE-1057 Sine Fit), and recent frames with strict provenance tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        detail: {
          type: 'string',
          enum: ['summary', 'complete'],
          description: 'Detail level ("summary" default saves tokens; "complete" includes larger historical frame slice)',
        },
      },
    },
  },
  {
    name: 'serial_send_command',
    description: 'Transmits a command (JSON, ASCII, or HEX) to the hardware/simulator, and echoes [MCP TX] to connected Web UI dashboards.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command payload to send (e.g. \'{"Kp":0.5}\', "LED_1:1", or "AA 55 01 FF")',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'serial_generate_firmware',
    description: 'Generates zero-heap, memory-safe firmware code for Arduino, Serial Plotter, STM32 HAL (with DMA), or MicroPython with microsecond timebase.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['arduino', 'plotter', 'stm32', 'micropython'],
          description: 'Target firmware platform',
        },
        channels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Telemetry sensor channel names to transmit',
        },
        controls: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string', enum: ['button', 'slider'] },
            },
            required: ['id', 'type'],
          },
          description: 'Control actuators to receive commands',
        },
      },
      required: ['platform'],
    },
  },
];

export class OpenSerialMcpServer {
  public mux: SerialMultiplexer;

  constructor(mux: SerialMultiplexer) {
    this.mux = mux;
  }

  /**
   * Executes an MCP tool call programmatically.
   */
  public async handleToolCall(name: string, args: Record<string, any> = {}): Promise<any> {
    switch (name) {
      case 'serial_list_ports': {
        const ports = await this.mux.listPorts();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ports, count: ports.length }, null, 2),
            },
          ],
          isError: false,
        };
      }

      case 'serial_connect': {
        const port = String(args.port || '');
        const baudRate = typeof args.baudRate === 'number' ? args.baudRate : 115200;
        const ok = await this.mux.connectPort(port, baudRate);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: ok,
                  activePort: this.mux.activePort,
                  baudRate: this.mux.baudRate,
                  status: this.mux.status,
                },
                null,
                2
              ),
            },
          ],
          isError: false,
        };
      }

      case 'serial_release_port': {
        const ok = await this.mux.releasePort();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: ok,
                  status: this.mux.status,
                  message: 'Port released. External flashing tools (arduino-cli, esptool) can now access the COM port.',
                },
                null,
                2
              ),
            },
          ],
          isError: false,
        };
      }

      case 'serial_read_telemetry': {
        const detail = args.detail === 'complete' ? 'complete' : 'summary';
        const telemetry = this.mux.getTelemetry(detail);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(telemetry, null, 2),
            },
          ],
          isError: false,
        };
      }

      case 'serial_send_command': {
        const command = String(args.command || '');
        const ok = this.mux.sendCommand(command, 'mcp');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: ok,
                  command,
                  origin: 'mcp',
                  timestamp: Date.now(),
                },
                null,
                2
              ),
            },
          ],
          isError: false,
        };
      }

      case 'serial_generate_firmware': {
        const platform = args.platform as CodegenPlatform;
        const channels = Array.isArray(args.channels) ? args.channels : ['Signal_V', 'Vibration_g'];
        const controls: ControlSpec[] = Array.isArray(args.controls)
          ? args.controls
          : [
              { id: 'LED_1', type: 'button' },
              { id: 'PWM_1', type: 'slider' },
            ];

        let code = '';
        if (platform === 'arduino') {
          code = generateArduinoCode(channels, controls);
        } else if (platform === 'plotter') {
          code = generateArduinoPlotterCode(channels, controls);
        } else if (platform === 'stm32') {
          code = generateSTM32Code(channels, controls);
        } else if (platform === 'micropython') {
          code = generateMicroPythonCode(channels, controls);
        }

        return {
          content: [
            {
              type: 'text',
              text: code,
            },
          ],
          isError: false,
        };
      }

      default:
        throw new Error(`Unknown MCP Tool: ${name}`);
    }
  }

  /**
   * Starts listening for MCP JSON-RPC messages on stdio.
   */
  public listenStdio(): void {
    let buffer = '';

    process.stdin.on('data', async (chunk) => {
      buffer += chunk.toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const req = JSON.parse(trimmed);
          const res = await this.handleJsonRpc(req);
          if (res) {
            process.stdout.write(`${JSON.stringify(res)}\n`);
          }
        } catch (err: any) {
          const errRes = {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: err?.message || 'Parse error',
            },
          };
          process.stdout.write(`${JSON.stringify(errRes)}\n`);
        }
      }
    });
  }

  private async handleJsonRpc(req: any): Promise<any> {
    if (!req || typeof req !== 'object') return null;

    if (req.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'openserial-mcp',
            version: '3.2.0',
          },
        },
      };
    }

    if (req.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: MCP_TOOL_DEFINITIONS,
        },
      };
    }

    if (req.method === 'tools/call') {
      const toolName = req.params?.name;
      const toolArgs = req.params?.arguments || {};
      try {
        const result = await this.handleToolCall(toolName, toolArgs);
        return {
          jsonrpc: '2.0',
          id: req.id,
          result,
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: -32603,
            message: err?.message || 'Internal tool execution error',
          },
        };
      }
    }

    return null;
  }
}
