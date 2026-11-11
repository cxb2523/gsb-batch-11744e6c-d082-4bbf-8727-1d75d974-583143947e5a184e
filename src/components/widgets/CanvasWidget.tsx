import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  Trash2,
  Layers,
  Sparkles,
  Maximize2,
  Download,
  Cpu,
} from 'lucide-react';
import {
  type PixelData,
  type CanvasViewMode,
  type ResolutionPreset,
  RESOLUTION_PRESETS,
  getCoreHeatmapRgb,
} from '../../lib/framebuffer';

interface CanvasWidgetProps {
  incomingPixels: PixelData[];
  onClear?: () => void;
  className?: string;
}

export const CanvasWidget: React.FC<CanvasWidgetProps> = ({
  incomingPixels,
  onClear,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [resolution, setResolution] = useState<ResolutionPreset>(RESOLUTION_PRESETS[0]);
  const [viewMode, setViewMode] = useState<CanvasViewMode>('rgb');

  // Double-buffering pixel cache: store [r, g, b, coreId] per (x, y)
  const pixelCacheRef = useRef<Map<number, PixelData>>(new Map());
  const activeCoresRef = useRef<Set<number>>(new Set());
  const [pixelCount, setPixelCount] = useState(0);
  const [activeCoreCount, setActiveCoreCount] = useState(0);
  const [fps, setFps] = useState(0);

  const fpsFramesRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());

  // Redraw canvas from pixel cache
  const renderCanvas = useCallback(
    (mode: CanvasViewMode, res: ResolutionPreset) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imgData = ctx.createImageData(res.width, res.height);
      const data = imgData.data;

      // Initialize background to dark metallic slate
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 15;     // R
        data[i + 1] = 20; // G
        data[i + 2] = 28; // B
        data[i + 3] = 255;// A
      }

      // Draw all cached pixels
      pixelCacheRef.current.forEach((p) => {
        if (p.x >= 0 && p.x < res.width && p.y >= 0 && p.y < res.height) {
          const idx = (p.y * res.width + p.x) * 4;
          if (mode === 'rgb') {
            data[idx] = p.r;
            data[idx + 1] = p.g;
            data[idx + 2] = p.b;
            data[idx + 3] = 255;
          } else {
            // Core Heatmap Mode
            const [hr, hg, hb] = getCoreHeatmapRgb(p.coreId);
            data[idx] = hr;
            data[idx + 1] = hg;
            data[idx + 2] = hb;
            data[idx + 3] = 255;
          }
        }
      });

      ctx.putImageData(imgData, 0, 0);
    },
    []
  );

  // Ingest incoming pixels batch
  useEffect(() => {
    if (!incomingPixels || incomingPixels.length === 0) return;

    const cache = pixelCacheRef.current;
    let newPixels = 0;

    for (const p of incomingPixels) {
      if (p.x >= 0 && p.x < resolution.width && p.y >= 0 && p.y < resolution.height) {
        const key = p.y * resolution.width + p.x;
        cache.set(key, p);
        activeCoresRef.current.add(p.coreId);
        newPixels++;
      }
    }

    if (newPixels > 0) {
      setPixelCount(cache.size);
      setActiveCoreCount(activeCoresRef.current.size);
      fpsFramesRef.current += newPixels;

      renderCanvas(viewMode, resolution);
    }
  }, [incomingPixels, resolution, viewMode, renderCanvas]);

  // FPS ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastFpsTimeRef.current) / 1000;
      if (dt >= 1.0) {
        const currentPxSec = Math.round(fpsFramesRef.current / dt);
        setFps(currentPxSec);
        fpsFramesRef.current = 0;
        lastFpsTimeRef.current = now;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle Clear
  const handleClear = () => {
    pixelCacheRef.current.clear();
    activeCoresRef.current.clear();
    setPixelCount(0);
    setActiveCoreCount(0);
    renderCanvas(viewMode, resolution);
    if (onClear) onClear();
  };

  // Handle Snapshot PNG Download
  const handleSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `openserial-gpu-render-${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={`flex flex-col bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden shadow-xl ${className}`}>
      {/* Widget Header & Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-zinc-900/60 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent-blue/15 border border-accent-blue/30 flex items-center justify-center">
            <Camera className="w-4 h-4 text-accent-blue" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              GPU Framebuffer <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">Raymarching</span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Resolution Dropdown */}
          <select
            value={`${resolution.width}x${resolution.height}`}
            onChange={(e) => {
              const matched = RESOLUTION_PRESETS.find(
                (r) => `${r.width}x${r.height}` === e.target.value
              );
              if (matched) {
                setResolution(matched);
                pixelCacheRef.current.clear();
                setPixelCount(0);
                setTimeout(() => renderCanvas(viewMode, matched), 20);
              }
            }}
            className="bg-zinc-950 border border-white/10 text-zinc-300 text-xs rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-accent-blue"
            title="Select Framebuffer Resolution"
          >
            {RESOLUTION_PRESETS.map((r) => (
              <option key={`${r.width}x${r.height}`} value={`${r.width}x${r.height}`}>
                {r.label}
              </option>
            ))}
          </select>

          {/* View Mode Toggle: RGB vs Core Heatmap */}
          <div className="flex items-center bg-zinc-950 border border-white/10 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => {
                setViewMode('rgb');
                renderCanvas('rgb', resolution);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'rgb'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="True 3D Raymarching RGB Color"
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>RGB</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('heatmap');
                renderCanvas('heatmap', resolution);
              }}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'heatmap'
                  ? 'bg-purple-950/70 text-purple-200 border border-purple-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="64-Core RISC-V Workload Heatmap Overlay"
            >
              <Layers className="w-3 h-3 text-purple-400" />
              <span>Cores</span>
            </button>
          </div>

          <div className="w-px h-4 bg-white/10"></div>

          {/* Snapshot PNG Button */}
          <button
            type="button"
            onClick={handleSnapshot}
            className="p-1.5 text-zinc-400 hover:text-accent-blue hover:bg-white/5 rounded-lg transition-colors"
            title="Export Framebuffer as PNG Snapshot"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Clear Canvas */}
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Clear Framebuffer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Viewport (Pixelated Scaling) */}
      <div className="relative flex-1 min-h-[260px] bg-zinc-950 flex items-center justify-center p-3 overflow-hidden select-none">
        <canvas
          ref={canvasRef}
          width={resolution.width}
          height={resolution.height}
          className="h-[260px] w-auto object-contain rounded-lg border border-white/10 shadow-2xl"
          style={{
            imageRendering: 'pixelated',
            aspectRatio: `${resolution.width} / ${resolution.height}`,
          }}
        />

        {pixelCount === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 pointer-events-none">
            <Maximize2 className="w-8 h-8 mb-2 opacity-30 animate-pulse" />
            <p className="text-xs font-mono">Waiting for GPU pixel packets ([0xAA, 0x55, X, Y, R, G, B, Core])...</p>
          </div>
        )}
      </div>

      {/* Diagnostic & Telemetry Footer Strip */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-zinc-950/80 border-t border-white/5 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent-green"></span>
            Pixels: <strong className="text-zinc-200">{pixelCount.toLocaleString()}</strong> / {(resolution.width * resolution.height).toLocaleString()}
          </span>
          <span className="flex items-center gap-1.5">
            Throughput: <strong className="text-cyan-400">{fps.toLocaleString()} px/s</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-purple-300">
            <Cpu className="w-3.5 h-3.5" />
            Active Cores: <strong className="text-purple-200">{activeCoreCount} / 64</strong>
          </span>
          <span className="px-2 py-0.5 bg-zinc-900 border border-white/10 rounded text-[11px] text-zinc-400">
            {resolution.width}x{resolution.height}
          </span>
        </div>
      </div>
    </div>
  );
};
