import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Layers,
  Download,
  Trash2,
  Cpu,
  Crosshair,
} from 'lucide-react';
import {
  type ResolutionPreset,
  RESOLUTION_PRESETS,
  type CanvasViewMode,
} from '../../lib/framebuffer';
import { framebufferStore } from '../../store/framebufferStore';
import { EmptyState } from '../../components/shell/EmptyState';
import { cn } from '../../lib/utils';

interface FramebufferTabProps {
  incomingPixels: any[];
  isActive: boolean;
  hasPixels: boolean;
  onClear: () => void;
  onSelectDemo: () => void;
}

export const FramebufferTab: React.FC<FramebufferTabProps> = ({
  isActive,
  hasPixels,
  onClear,
  onSelectDemo,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [resolution, setResolution] = useState<ResolutionPreset>(
    framebufferStore.state.resolution
  );
  const [viewMode, setViewMode] = useState<CanvasViewMode>(
    framebufferStore.state.viewMode
  );
  const [zoom, setZoom] = useState<'1x' | '2x' | '4x' | 'fit'>('fit');
  const [pixelCount, setPixelCount] = useState(framebufferStore.state.pixelCount);
  const [activeCoreCount, setActiveCoreCount] = useState(
    framebufferStore.state.activeCoreCount
  );
  const [throughput, setThroughput] = useState(framebufferStore.state.throughput);

  // Hover coordinate & color readout
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    hex: string;
    coreId: number;
  } | null>(null);

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = framebufferStore.subscribe(() => {
      setPixelCount(framebufferStore.state.pixelCount);
      setActiveCoreCount(framebufferStore.state.activeCoreCount);
      setThroughput(framebufferStore.state.throughput);
    });
    return unsubscribe;
  }, []);

  // rAF rendering loop
  useEffect(() => {
    if (!isActive) return;

    let animId: number;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas && framebufferStore.state.isDirty) {
        framebufferStore.renderToCanvas(canvas);
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isActive]);

  // Initial draw
  useEffect(() => {
    if (isActive && canvasRef.current) {
      framebufferStore.renderToCanvas(canvasRef.current);
    }
  }, [isActive, resolution, viewMode]);

  const handleResolutionChange = (res: ResolutionPreset) => {
    setResolution(res);
    framebufferStore.setResolution(res);
  };

  const handleViewModeChange = (mode: CanvasViewMode) => {
    setViewMode(mode);
    framebufferStore.setViewMode(mode);
  };

  const handleClear = () => {
    framebufferStore.clear();
    setHoverInfo(null);
    onClear();
  };

  const handleSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `openserial_gpu_${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      const x = Math.floor((e.clientX - rect.left) * scaleX);
      const y = Math.floor((e.clientY - rect.top) * scaleY);

      if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
        const px = framebufferStore.getPixelAt(x, y);
        if (px) {
          const hex = `#${px.r.toString(16).padStart(2, '0')}${px.g
            .toString(16)
            .padStart(2, '0')}${px.b.toString(16).padStart(2, '0')}`.toUpperCase();
          setHoverInfo({ x, y, hex, coreId: px.coreId });
          return;
        }
        setHoverInfo({ x, y, hex: '#0F141C', coreId: 0 });
      } else {
        setHoverInfo(null);
      }
    },
    []
  );

  const handleMouseLeave = () => setHoverInfo(null);

  const totalPixels = resolution.width * resolution.height;
  const fillPct = totalPixels > 0 ? ((pixelCount / totalPixels) * 100).toFixed(1) : '0';

  if (!hasPixels && pixelCount === 0) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-4 justify-center">
        <EmptyState
          badge="8-Byte Pixel Framebuffer"
          title="No Framebuffer Pixels Ingested"
          description="Send binary 8-byte pixel packets [0xAA, 0x55, X, Y, R, G, B, CoreID] or JSON pixel streams over UART to render real-time graphical displays."
          codeSnippet={`// Binary Packet Format (8 bytes):\n[0xAA, 0x55, X_COORD, Y_COORD, R, G, B, CORE_ID]\n\n// Fast C++ Macro:\n#define SEND_PIXEL(x, y, r, g, b, core) \\\n  uint8_t pkt[8] = {0xAA, 0x55, (uint8_t)(x), (uint8_t)(y), (r), (g), (b), (core)}; \\\n  Serial.write(pkt, 8);`}
          actionLabel="Try 3D GPU Raymarcher Demo"
          onAction={onSelectDemo}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#111113] border border-white/[0.08] rounded-xl overflow-hidden shadow-sm">
      {/* 1. Framebuffer Toolbar */}
      <div className="h-11 border-b border-white/[0.08] bg-[#09090b] px-3 flex items-center justify-between gap-3 text-xs select-none">
        {/* Left: Resolution & View Mode */}
        <div className="flex items-center gap-2">
          {/* Resolution preset */}
          <select
            value={`${resolution.width}x${resolution.height}`}
            onChange={(e) => {
              const matched = RESOLUTION_PRESETS.find(
                (r) => `${r.width}x${r.height}` === e.target.value
              );
              if (matched) handleResolutionChange(matched);
            }}
            className="bg-[#111113] border border-white/10 text-zinc-300 text-xs rounded-lg px-2.5 py-1 font-mono focus:outline-none focus:border-cyan-400"
          >
            {RESOLUTION_PRESETS.map((r) => (
              <option key={`${r.width}x${r.height}`} value={`${r.width}x${r.height}`}>
                {r.label}
              </option>
            ))}
          </select>

          {/* View mode toggle */}
          <div className="flex items-center bg-[#111113] border border-white/[0.08] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => handleViewModeChange('rgb')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
                viewMode === 'rgb'
                  ? 'bg-zinc-800 text-cyan-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>RGB</span>
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('heatmap')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
                viewMode === 'heatmap'
                  ? 'bg-zinc-800 text-cyan-400 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Cores</span>
            </button>
          </div>
        </div>

        {/* Middle: Zoom Controls */}
        <div className="flex items-center bg-[#111113] border border-white/[0.08] rounded-lg p-0.5 font-mono text-[11px]">
          {(['1x', '2x', '4x', 'fit'] as const).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={cn(
                'px-2 py-0.5 rounded transition-colors uppercase',
                zoom === z
                  ? 'bg-zinc-800 text-zinc-100 font-bold'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {z}
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleSnapshot}
            className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800 rounded transition-colors"
            title="Download PNG snapshot"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
            title="Clear Framebuffer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Canvas Viewport with Subtle Checkerboard Pattern */}
      <div className="flex-1 overflow-auto bg-[#09090b] bg-[radial-gradient(#18181b_1px,transparent_1px)] [background-size:12px_12px] flex items-center justify-center p-6 relative select-none">
        <canvas
          ref={canvasRef}
          width={resolution.width}
          height={resolution.height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className={cn(
            'border border-white/10 rounded-lg shadow-2xl transition-all',
            zoom === '1x' && 'w-auto h-auto',
            zoom === '2x' && 'w-[320px] md:w-[640px] h-auto',
            zoom === '4x' && 'w-[640px] md:w-[960px] h-auto',
            zoom === 'fit' && 'w-full max-w-2xl max-h-[62vh] h-auto object-contain aspect-[4/3] shadow-2xl'
          )}
          style={{
            imageRendering: 'pixelated',
            aspectRatio: `${resolution.width} / ${resolution.height}`,
          }}
        />
      </div>

      {/* 3. Diagnostic & Telemetry Footer Readout */}
      <div className="h-9 border-t border-white/[0.08] bg-[#09090b] px-4 flex items-center justify-between text-xs font-mono text-zinc-400 select-none">
        {/* Left: Pixel coverage & throughput */}
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              <strong className="text-zinc-200">{pixelCount.toLocaleString()}</strong> /{' '}
              {totalPixels.toLocaleString()} ({fillPct}%)
            </span>
          </span>

          <span className="text-zinc-600">Â·</span>
          <span className="text-cyan-400 font-medium">
            {throughput.toLocaleString()} px/s
          </span>

          <span className="text-zinc-600">Â·</span>
          <span className="flex items-center gap-1 text-cyan-400">
            <Cpu className="w-3.5 h-3.5" />
            <span>{activeCoreCount} / 64 cores</span>
          </span>
        </div>

        {/* Right: Hover Coordinate & Color Readout */}
        <div className="flex items-center gap-2">
          {hoverInfo ? (
            <div className="flex items-center gap-2 text-zinc-300">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                X: {hoverInfo.x}, Y: {hoverInfo.y}
              </span>
              <span className="text-zinc-600">Â·</span>
              <span className="flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-sm border border-white/20"
                  style={{ backgroundColor: hoverInfo.hex }}
                />
                <span className="text-zinc-200">{hoverInfo.hex}</span>
              </span>
              <span className="text-zinc-600">Â·</span>
              <span className="text-cyan-400">Core {hoverInfo.coreId}</span>
            </div>
          ) : (
            <span className="text-zinc-600 italic">Hover canvas for pixel inspector</span>
          )}
        </div>
      </div>
    </div>
  );
};




