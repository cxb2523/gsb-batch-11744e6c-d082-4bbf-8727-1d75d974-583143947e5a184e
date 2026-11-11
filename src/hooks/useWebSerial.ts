import { useState, useCallback, useRef, useEffect } from 'react';
import { parseHexInput, toHexString } from '../lib/parser';
import { StatefulBinaryDemuxer } from '../lib/framebuffer';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'released_for_flash' | 'error';
export type TransportMode = 'usb' | 'bridge';

export interface SerialConnectionOptions {
  baudRate?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
  wsUrl?: string;
}

export function useWebSerial() {
  const [transportMode, setTransportMode] = useState<TransportMode>('usb');
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<any | null>(null);

  // USB Web Serial references
  const portRef = useRef<any | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const keepReadingRef = useRef<boolean>(true);
  const encoderRef = useRef<TextEncoder>(new TextEncoder());

  // Bridge WebSocket references
  const wsRef = useRef<WebSocket | null>(null);
  const bridgeCallbacksRef = useRef<{
    onData?: (data: string, isMcpTx?: boolean, rawBytes?: Uint8Array) => void;
    onRawData?: (chunk: Uint8Array) => void;
  }>({});

  const connectBridge = useCallback((wsUrl = 'ws://127.0.0.1:8765') => {
    setStatus('connecting');
    setError(null);

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setStatus('connected');
        setError(null);
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'rx_data' && typeof msg.line === 'string') {
            let rawBytes: Uint8Array | undefined;
            if (msg.rawHex) {
              rawBytes = parseHexInput(msg.rawHex) ?? undefined;
            }
            if (rawBytes && bridgeCallbacksRef.current.onRawData) {
              bridgeCallbacksRef.current.onRawData(rawBytes);
            }
            if (bridgeCallbacksRef.current.onData) {
              bridgeCallbacksRef.current.onData(msg.line, false, rawBytes);
            }
          } else if (msg.type === 'rx_raw' && typeof msg.rawHex === 'string') {
            const rawBytes = parseHexInput(msg.rawHex) ?? undefined;
            if (rawBytes && bridgeCallbacksRef.current.onRawData) {
              bridgeCallbacksRef.current.onRawData(rawBytes);
            }
          } else if (msg.type === 'tx_echo') {
            const isMcp = msg.origin === 'mcp';
            if (isMcp && bridgeCallbacksRef.current.onData) {
              bridgeCallbacksRef.current.onData(msg.text, true);
            }
          } else if (msg.type === 'status') {
            setBridgeStatus(msg.data);
            if (msg.data?.status === 'released_for_flash') {
              setStatus('released_for_flash');
            } else if (msg.data?.status === 'connected') {
              setStatus('connected');
            }
          }
        } catch (err) {
          console.error('[Bridge WS] Failed to parse message:', err);
        }
      };

      socket.onerror = () => {
        setStatus('error');
        setError('Cannot connect to Bridge daemon at ' + wsUrl + '. Make sure "npm run bridge" is running.');
      };

      socket.onclose = () => {
        setStatus((prev) => (prev === 'connected' ? 'disconnected' : prev));
        wsRef.current = null;
      };
    } catch (err: any) {
      setStatus('error');
      setError(err?.message || 'WebSocket connection error');
    }
  }, []);

  const connectUsb = useCallback(async (baudRate = 115200, options?: Omit<SerialConnectionOptions, 'baudRate'>) => {
    try {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      }
      const serial = (navigator as any).serial;

      setStatus('connecting');
      setError(null);

      const port = await serial.requestPort();
      await port.open({
        baudRate,
        dataBits: options?.dataBits ?? 8,
        stopBits: options?.stopBits ?? 1,
        parity: options?.parity ?? 'none',
      });

      portRef.current = port;
      setStatus('connected');
      keepReadingRef.current = true;
    } catch (err: any) {
      console.error('Serial Connection Error:', err);
      setStatus('error');
      setError(err?.message || 'Failed to connect');
      portRef.current = null;
    }
  }, []);

  const connect = useCallback(async (baudRate = 115200, options?: SerialConnectionOptions) => {
    if (transportMode === 'bridge') {
      connectBridge(options?.wsUrl ?? 'ws://127.0.0.1:8765');
    } else {
      await connectUsb(baudRate, options);
    }
  }, [transportMode, connectBridge, connectUsb]);

  const disconnect = useCallback(async () => {
    if (transportMode === 'bridge') {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus('disconnected');
      setError(null);
      return;
    }

    keepReadingRef.current = false;

    try {
      if (readerRef.current) {
        await readerRef.current.cancel().catch(() => {});
        try {
          readerRef.current.releaseLock();
        } catch {
          // Lock already released
        }
        readerRef.current = null;
      }
      if (writerRef.current) {
        try {
          writerRef.current.releaseLock();
        } catch {
          // Lock already released
        }
        writerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close().catch(() => {});
        portRef.current = null;
      }
      setStatus('disconnected');
      setError(null);
    } catch (err: any) {
      console.error('Serial Disconnect Error:', err);
      setError(err?.message || 'Failed to disconnect');
    }
  }, [transportMode]);

  useEffect(() => {
    const handlePhysicalDisconnect = (e: any) => {
      if (portRef.current && e.target === portRef.current) {
        console.warn('Device physically disconnected');
        setStatus('disconnected');
        setError('Device was physically unplugged');

        keepReadingRef.current = false;
        readerRef.current = null;
        writerRef.current = null;
        portRef.current = null;
      }
    };

    if ('serial' in navigator) {
      (navigator as any).serial.addEventListener('disconnect', handlePhysicalDisconnect);
      return () => {
        (navigator as any).serial.removeEventListener('disconnect', handlePhysicalDisconnect);
      };
    }
  }, []);

  const writeBytes = useCallback(async (bytes: Uint8Array) => {
    if (status !== 'connected') {
      console.warn('Cannot write: Port not connected');
      return;
    }

    if (transportMode === 'bridge') {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'tx_raw_hex', hex: toHexString(bytes) }));
      }
      return;
    }

    if (!portRef.current) return;

    try {
      if (!writerRef.current) {
        writerRef.current = portRef.current.writable!.getWriter();
      }
      await writerRef.current!.write(bytes);
    } catch (err: any) {
      console.error('Serial Write Error:', err);
      setError(err?.message || 'Failed to write data');
    }
  }, [status, transportMode]);

  const selectBridgePort = useCallback((port: string, baudRate = 115200) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'connect', port, baudRate }));
    }
  }, []);

  const releaseBridgePort = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'release_port' }));
    }
  }, []);

  const write = useCallback(async (data: string) => {
    if (transportMode === 'bridge') {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'tx_command', payload: data }));
      }
      return;
    }

    const encoded = encoderRef.current.encode(data);
    await writeBytes(encoded);
  }, [transportMode, writeBytes]);

  const readLoop = useCallback(
    async (
      onDataReceived: (data: string, isMcpTx?: boolean, rawBytes?: Uint8Array) => void,
      onRawData?: (chunk: Uint8Array) => void
    ) => {
      if (transportMode === 'bridge') {
        bridgeCallbacksRef.current = {
          onData: onDataReceived,
          onRawData,
        };
        return;
      }

      if (!portRef.current || status !== 'connected') return;

      try {
        const reader: ReadableStreamDefaultReader<Uint8Array> = portRef.current.readable!.getReader();
        readerRef.current = reader;

        const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
        const usbDemuxer = new StatefulBinaryDemuxer();
        let buffer = '';

        while (keepReadingRef.current && portRef.current) {
          const { value, done } = await reader.read();

          if (done) break;
          if (value && value.length > 0) {
            // 1. Emit raw byte chunk before any UTF-8 decoding to preserve binary protocols
            if (onRawData) {
              try {
                onRawData(value);
              } catch (rawErr) {
                console.error('Error in onRawData callback:', rawErr);
              }
            }

            // 2. Strip 8-byte binary pixel packets so 0x0A coordinates do not cause fake line splits
            const { cleanTextBytes } = usbDemuxer.push(value);
            if (cleanTextBytes.length > 0) {
              buffer += decoder.decode(cleanTextBytes, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) onDataReceived(trimmed, false, value);
              }
            }
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (err?.name === 'NetworkError' || msg.includes('The device has been lost')) {
          console.warn('Device unexpectedly disconnected');
          await disconnect();
        } else {
          console.error('Serial Read Error:', err);
          setError(msg || 'Error reading data');
        }
      } finally {
        if (readerRef.current) {
          try {
            readerRef.current.releaseLock();
          } catch {
            // Ignore if already unlocked
          }
        }
      }
    },
    [status, disconnect, transportMode]
  );

  return {
    status,
    transportMode,
    setTransportMode,
    bridgeStatus,
    selectBridgePort,
    releaseBridgePort,
    error,
    connect,
    disconnect,
    write,
    writeBytes,
    readLoop,
  };
}
