import { useEffect, useState, useCallback, useRef } from 'react';
import { Header } from './components/layout/Header';
import { TabRail } from './components/shell/TabRail';
import { StatusBar } from './components/shell/StatusBar';
import { TelemetryTab } from './features/telemetry/TelemetryTab';
import { FramebufferTab } from './features/framebuffer/FramebufferTab';
import { ConsoleTab } from './features/console/ConsoleTab';
import { ControlsTab } from './features/controls/ControlsTab';
import { Inspector } from './features/inspector/Inspector';
import { CodeGeneratorModal } from './components/widgets/CodeGeneratorModal';
import { SettingsModal } from './components/widgets/SettingsModal';
import { useWebSerial } from './hooks/useWebSerial';
import { useDataLogger } from './hooks/useDataLogger';
import { useHotkeys } from './hooks/useHotkeys';
import { useStudioStore } from './store/useStudioStore';
import { framebufferStore } from './store/framebufferStore';
import {
  parseSerialPayloadDetailed,
  extractWidgetsFromBatch,
  type ParsedTelemetryFrame,
} from './lib/parser';
import {
  serializeWorkspaceProfile,
  parseWorkspaceProfile,
  type DemoPreset,
} from './lib/workspace';
import {
  StatefulBinaryDemuxer,
  extractPixelsFromJson,
  raymarchPixel,
  type PixelData,
} from './lib/framebuffer';
import type { TerminalLogItem } from './components/widgets/TerminalLog';
import { cn } from './lib/utils';

export type { DemoPreset };

function App() {
  useHotkeys();

  const {
    status,
    transportMode,
    setTransportMode,
    bridgeStatus,
    selectBridgePort,
    releaseBridgePort,
    connect,
    disconnect,
    readLoop,
    write,
    writeBytes,
    error,
  } = useWebSerial();

  const { isRecording, startRecording, stopRecording, clearLog, exportCSV, logData, logCount } =
    useDataLogger();

  // Zustand Studio Store Selectors & Actions
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const baudRate = useStudioStore((s) => s.baudRate);
  const setBaudRate = useStudioStore((s) => s.setBaudRate);
  const bufferSize = useStudioStore((s) => s.bufferSize);
  const setBufferSize = useStudioStore((s) => s.setBufferSize);
  const controls = useStudioStore((s) => s.controls);
  const setControls = useStudioStore((s) => s.setControls);
  const widgetPrefs = useStudioStore((s) => s.widgetPrefs);
  const setWidgetPref = useStudioStore((s) => s.setWidgetPref);
  const demoPreset = useStudioStore((s) => s.demoPreset);
  const setDemoPreset = useStudioStore((s) => s.setDemoPreset);
  const setStoreStatus = useStudioStore((s) => s.setStatus);
  const setStoreError = useStudioStore((s) => s.setError);
  const setBridgeStatus = useStudioStore((s) => s.setBridgeStatus);
  const setActiveProtocol = useStudioStore((s) => s.setActiveProtocol);
  const setWidgets = useStudioStore((s) => s.setWidgets);
  const pushLog = useStudioStore((s) => s.pushLog);
  const clearLogs = useStudioStore((s) => s.clearLogs);
  const markNewPixels = useStudioStore((s) => s.markNewPixels);
  const isCodeGenOpen = useStudioStore((s) => s.isCodeGenOpen);
  const openCodeGen = useStudioStore((s) => s.openCodeGen);
  const isSettingsOpen = useStudioStore((s) => s.isSettingsOpen);
  const openSettings = useStudioStore((s) => s.openSettings);

  // Sync connection state with store
  useEffect(() => {
    setStoreStatus(status);
  }, [status, setStoreStatus]);

  useEffect(() => {
    setStoreError(error);
  }, [error, setStoreError]);

  useEffect(() => {
    setBridgeStatus(bridgeStatus);
  }, [bridgeStatus, setBridgeStatus]);

  // Demo simulation state
  const [isDemoMode, setIsDemoMode] = useState(false);
  const demoIntervalRef = useRef<number | null>(null);
  const demoCamRotRef = useRef<{ x: number; y: number; light: number }>({ x: 18, y: 45, light: 1.0 });

  // Fast Buffering Queues between 50ms UI frames
  const logsBuffer = useRef<TerminalLogItem[]>([]);
  const payloadQueueRef = useRef<ParsedTelemetryFrame[]>([]);
  const latestRawChunkRef = useRef<Uint8Array | null>(null);
  const binaryDemuxerRef = useRef<StatefulBinaryDemuxer>(new StatefulBinaryDemuxer());
  const incomingPixelsBufferRef = useRef<PixelData[]>([]);
  const [incomingPixelsBatch, setIncomingPixelsBatch] = useState<PixelData[]>([]);
  const [hasPixels, setHasPixels] = useState(false);
  const [logs, setLogs] = useState<TerminalLogItem[]>([]);

  const handleRawChunk = useCallback((chunk: Uint8Array) => {
    latestRawChunkRef.current = chunk;
    const { pixels } = binaryDemuxerRef.current.push(chunk);
    if (pixels.length > 0) {
      incomingPixelsBufferRef.current.push(...pixels);
      framebufferStore.putPixels(pixels);
      setHasPixels(true);
      markNewPixels(true);
    }
  }, [markNewPixels]);

  const handleData = useCallback(
    (data: string, sampleTimestamp?: number, rawBytes?: Uint8Array, isMcpTx = false) => {
      const entry: TerminalLogItem = {
        text: data,
        isTx: isMcpTx,
        isMcpTx,
        rawBytes,
      };
      logsBuffer.current.push(entry);
      pushLog(entry);

      if (!isMcpTx) {
        if (data.startsWith('{') && data.endsWith('}')) {
          try {
            const parsedObj = JSON.parse(data);
            const pxs = extractPixelsFromJson(parsedObj);
            if (pxs.length > 0) {
              incomingPixelsBufferRef.current.push(...pxs);
              framebufferStore.putPixels(pxs);
              setHasPixels(true);
              markNewPixels(true);
            }
          } catch {
            // Ignore parse errors
          }
        }

        const frame = parseSerialPayloadDetailed(data, sampleTimestamp ?? Date.now());
        if (frame) {
          payloadQueueRef.current.push(frame);
          if (payloadQueueRef.current.length > 512) {
            payloadQueueRef.current = payloadQueueRef.current.slice(-256);
          }
          logData(frame.values);
        }
      }
    },
    [logData, pushLog, markNewPixels]
  );

  // UI Refresh Loop (20 FPS = 50ms)
  useEffect(() => {
    const interval = setInterval(() => {
      if (logsBuffer.current.length > 0) {
        const incomingLogs = logsBuffer.current;
        logsBuffer.current = [];
        setLogs((prev) => [...prev, ...incomingLogs].slice(-500));
      }
      if (payloadQueueRef.current.length > 0) {
        const batch = payloadQueueRef.current;
        payloadQueueRef.current = [];
        const lastProto = batch[batch.length - 1].protocol;
        setActiveProtocol(lastProto);
        setWidgets((currentWidgets) =>
          extractWidgetsFromBatch(batch, currentWidgets, bufferSize)
        );
      }
      if (incomingPixelsBufferRef.current.length > 0) {
        const drained = incomingPixelsBufferRef.current;
        incomingPixelsBufferRef.current = [];
        setIncomingPixelsBatch(drained);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [bufferSize, setActiveProtocol, setWidgets]);

  useEffect(() => {
    if (status === 'connected') {
      readLoop(
        (line, isMcpTx, rawBytes) =>
          handleData(line, undefined, rawBytes ?? (latestRawChunkRef.current ?? undefined), isMcpTx),
        (chunk) => handleRawChunk(chunk)
      );
    }
  }, [status, readLoop, handleData, handleRawChunk]);

  const startDemoStream = useCallback(
    (preset: DemoPreset) => {
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current);
      }
      setWidgets(() => new Map());
      setActiveProtocol(null);
      payloadQueueRef.current = [];

      if (preset === 'dsp_harmonics') {
        setWidgetPref('Signal_V', 'fft');
        setWidgetPref('Vibration_g', 'line');
        const dtMs = 25; // f_s = 40 Hz
        let sampleIdx = 0;
        const baseEpoch = Date.now();

        demoIntervalRef.current = window.setInterval(() => {
          for (let s = 0; s < 2; s++) {
            sampleIdx++;
            const tSec = (sampleIdx * dtMs) / 1000;
            const syntheticTs = baseEpoch + sampleIdx * dtMs;

            const sigV =
              2.5 +
              2.0 * Math.sin(2 * Math.PI * 4.0 * tSec) +
              0.85 * Math.sin(2 * Math.PI * 9.5 * tSec);

            const vib = 1.4 * Math.sin(2 * Math.PI * 6.25 * tSec);

            const payload = {
              Signal_V: Number(sigV.toFixed(4)),
              Vibration_g: Number(vib.toFixed(4)),
            };
            handleData(JSON.stringify(payload), syntheticTs);
          }
        }, 50);
      } else if (preset === 'pid_motor') {
        setWidgetPref('Rotor_rpm', 'line');
        setWidgetPref('Setpoint_rpm', 'line');
        let stepCount = 0;
        let rpm = 0;
        let velocity = 0;
        const baseEpoch = Date.now();

        demoIntervalRef.current = window.setInterval(() => {
          stepCount++;
          const setpoint = Math.floor(stepCount / 60) % 2 === 0 ? 1200 : 600;
          const errorVal = setpoint - rpm;
          velocity = 0.82 * velocity + 0.14 * errorVal;
          rpm += velocity;
          const currentMa = Math.max(80, 150 + velocity * 1.8 + rpm * 0.12);

          const payload = {
            Setpoint_rpm: setpoint,
            Rotor_rpm: Number(rpm.toFixed(1)),
            Current_ma: Number(currentMa.toFixed(1)),
          };
          handleData(JSON.stringify(payload), baseEpoch + stepCount * 50);
        }, 50);
      } else if (preset === 'raymarcher_gpu') {
        setWidgetPref('GPU_FPS', 'line');
        setWidgetPref('Active_Cores', 'gauge');
        setWidgetPref('Scanline', 'line');
        setHasPixels(true);

        // Inject default 3D camera controls pinned to Framebuffer
        const ids = new Set(controls.map((c) => c.id));
        const next = [...controls];
        if (!ids.has('cam_rot_y')) {
          next.push({
            id: 'cam_rot_y',
            type: 'slider',
            label: 'Camera Yaw (°)',
            min: 0,
            max: 360,
            step: 5,
            group: 'Camera',
            pinTo: ['framebuffer'],
          });
        }
        if (!ids.has('cam_rot_x')) {
          next.push({
            id: 'cam_rot_x',
            type: 'slider',
            label: 'Camera Pitch (°)',
            min: -90,
            max: 90,
            step: 5,
            group: 'Camera',
            pinTo: ['framebuffer'],
          });
        }
        if (!ids.has('light_val')) {
          next.push({
            id: 'light_val',
            type: 'slider',
            label: 'Light Intensity (%)',
            min: 10,
            max: 100,
            step: 5,
            group: 'Camera',
            pinTo: ['framebuffer'],
          });
        }
        setControls(next);

        let currentScanY = 0;
        const baseEpoch = Date.now();
        let tick = 0;

        demoIntervalRef.current = window.setInterval(() => {
          tick++;
          const linesPerTick = 3;
          const w = 160;
          const h = 120;
          const pixelsBatch: PixelData[] = [];

          demoCamRotRef.current.y = (demoCamRotRef.current.y + 0.6) % 360;

          for (let l = 0; l < linesPerTick; l++) {
            const y = currentScanY;
            currentScanY = (currentScanY + 1) % h;
            for (let x = 0; x < w; x++) {
              pixelsBatch.push(
                raymarchPixel(
                  x,
                  y,
                  w,
                  h,
                  demoCamRotRef.current.x,
                  demoCamRotRef.current.y,
                  demoCamRotRef.current.light
                )
              );
            }
          }

          incomingPixelsBufferRef.current.push(...pixelsBatch);
          framebufferStore.putPixels(pixelsBatch);

          const companionPayload = {
            t_us: baseEpoch * 1000 + tick * 35000,
            GPU_FPS: 28.5,
            Active_Cores: 64,
            Scanline: currentScanY,
          };
          handleData(JSON.stringify(companionPayload), baseEpoch + tick * 35);
        }, 35);
      } else {
        let tick = 0;
        const baseEpoch = Date.now();
        demoIntervalRef.current = window.setInterval(() => {
          tick++;
          const t = tick * 0.08;
          const temp = (26.5 + Math.sin(t) * 3.2).toFixed(2);
          const humid = (58.0 + Math.cos(t * 0.7) * 8.5).toFixed(2);
          const vbat = (3.85 + Math.sin(t * 0.2) * 0.15).toFixed(2);
          const plotterLine = `Temp:${temp}C, Humid:${humid}%, Vbat:${vbat}V, State:ONLINE`;
          handleData(plotterLine, baseEpoch + tick * 80);
        }, 80);
      }
    },
    [controls, handleData, setActiveProtocol, setControls, setWidgetPref, setWidgets]
  );

  const toggleDemoMode = () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
    } else {
      setIsDemoMode(true);
      startDemoStream(demoPreset);
    }
  };

  const handleSelectDemoPreset = (preset: DemoPreset) => {
    setDemoPreset(preset);
    setIsDemoMode(true);
    startDemoStream(preset);
  };

  const handleClearDashboard = () => {
    setWidgets(() => new Map());
    setActiveProtocol(null);
    payloadQueueRef.current = [];
    clearLog();
  };

  const handleClearCanvas = () => {
    framebufferStore.clear();
    setIncomingPixelsBatch([]);
    setHasPixels(false);
  };

  const handleWrite = (data: string) => {
    const cleanEcho = data.replace(/\r?\n$/, '');
    const entry: TerminalLogItem = {
      text: `> ${cleanEcho}`,
      isTx: true,
      rawBytes: new TextEncoder().encode(data),
    };
    logsBuffer.current.push(entry);
    pushLog(entry);

    if (isDemoMode) {
      try {
        const parsed = JSON.parse(cleanEcho);
        if (typeof parsed.cam_rot_x === 'number') demoCamRotRef.current.x = parsed.cam_rot_x;
        if (typeof parsed.cam_rot_y === 'number') demoCamRotRef.current.y = parsed.cam_rot_y;
        if (typeof parsed.light_intensity === 'number') demoCamRotRef.current.light = parsed.light_intensity;
        if (typeof parsed.light_val === 'number') demoCamRotRef.current.light = parsed.light_val / 100.0;
      } catch {
        // Not JSON
      }
    } else {
      write(data);
    }
  };

  const handleWriteBytes = (bytes: Uint8Array, displayHex: string) => {
    const entry: TerminalLogItem = {
      text: `> [HEX] ${displayHex}`,
      isTx: true,
      rawBytes: bytes,
    };
    logsBuffer.current.push(entry);
    pushLog(entry);
    if (!isDemoMode) {
      writeBytes(bytes);
    }
  };

  const handleExportProfile = () => {
    const json = serializeWorkspaceProfile({
      baudRate,
      bufferSize,
      controls,
      widgetPrefs,
      demoPreset,
      activeTab,
      inspectorOpen: useStudioStore.getState().inspectorOpen,
    });
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openserial_profile_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportProfile = (rawJson: string): boolean => {
    const profile = parseWorkspaceProfile(rawJson);
    if (!profile) return false;
    setBaudRate(profile.baudRate);
    if (profile.bufferSize) setBufferSize(profile.bufferSize);
    setControls(profile.controls);
    if (profile.demoPreset) setDemoPreset(profile.demoPreset);
    if (profile.activeTab) setActiveTab(profile.activeTab);
    return true;
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#09090b] text-zinc-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. Header (56px) */}
      <Header
        status={status}
        transportMode={transportMode}
        onSelectTransportMode={setTransportMode}
        bridgeStatus={bridgeStatus}
        onSelectBridgePort={(port) => selectBridgePort(port, baudRate)}
        onReleaseBridgePort={releaseBridgePort}
        onConnect={() => connect(baudRate)}
        onDisconnect={disconnect}
        onOpenCodeGen={() => openCodeGen(true)}
        onOpenSettings={() => openSettings(true)}
        onDemo={toggleDemoMode}
        isDemoMode={isDemoMode}
        onSelectDemoPreset={handleSelectDemoPreset}
        isRecording={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onExportCSV={exportCSV}
        logCount={logCount}
      />

      {/* 2. Sub-Header Tab Rail (44px) */}
      <TabRail />

      {/* 3. Main Workspace & Collapsible Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        <main className="flex-1 overflow-hidden relative flex flex-col bg-[#09090b]">
          {/* Tab 1: Telemetry */}
          <div
            className={cn('h-full w-full', activeTab !== 'telemetry' && 'hidden')}
            inert={activeTab !== 'telemetry' ? true : undefined}
          >
            <TelemetryTab
              isActive={activeTab === 'telemetry'}
              onClearDashboard={handleClearDashboard}
              onSelectDemo={(p) => handleSelectDemoPreset(p)}
            />
          </div>

          {/* Tab 2: Framebuffer */}
          <div
            className={cn('h-full w-full', activeTab !== 'framebuffer' && 'hidden')}
            inert={activeTab !== 'framebuffer' ? true : undefined}
          >
            <FramebufferTab
              incomingPixels={incomingPixelsBatch}
              isActive={activeTab === 'framebuffer'}
              hasPixels={hasPixels}
              onClear={handleClearCanvas}
              onSelectDemo={() => handleSelectDemoPreset('raymarcher_gpu')}
            />
          </div>

          {/* Tab 3: Console */}
          <div
            className={cn('h-full w-full', activeTab !== 'console' && 'hidden')}
            inert={activeTab !== 'console' ? true : undefined}
          >
            <ConsoleTab
              logs={logs}
              isActive={activeTab === 'console'}
              onClear={() => {
                logsBuffer.current = [];
                setLogs([]);
                clearLogs();
              }}
              onSend={handleWrite}
              onSendBytes={handleWriteBytes}
            />
          </div>

          {/* Tab 4: Controls */}
          <div
            className={cn('h-full w-full', activeTab !== 'controls' && 'hidden')}
            inert={activeTab !== 'controls' ? true : undefined}
          >
            <ControlsTab isActive={activeTab === 'controls'} onSend={handleWrite} />
          </div>
        </main>

        {/* Right Collapsible Inspector Panel */}
        <Inspector onSend={handleWrite} />
      </div>

      {/* 4. Bottom Status Bar (28px) */}
      <StatusBar />

      {/* Modals */}
      <CodeGeneratorModal
        isOpen={isCodeGenOpen}
        onClose={() => openCodeGen(false)}
        widgetKeys={Array.from(useStudioStore.getState().widgets.keys())}
        controls={controls}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => openSettings(false)}
        currentBaudRate={baudRate}
        onSaveBaudRate={setBaudRate}
        currentBufferSize={bufferSize}
        onSaveBufferSize={setBufferSize}
        onExportProfile={handleExportProfile}
        onImportProfile={handleImportProfile}
      />
    </div>
  );
}

export default App;
