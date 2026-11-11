import {
  type PixelData,
  type CanvasViewMode,
  type ResolutionPreset,
  RESOLUTION_PRESETS,
  getCoreHeatmapRgb,
} from '../lib/framebuffer';

export interface FramebufferState {
  resolution: ResolutionPreset;
  viewMode: CanvasViewMode;
  zoom: '1x' | '2x' | '4x' | 'fit';
  pixelCount: number;
  activeCoreCount: number;
  fps: number;
  throughput: number;
  isDirty: boolean;
  activeCores: Set<number>;
  pixelsMap: Map<number, PixelData>;
}

class FramebufferStore {
  public state: FramebufferState = {
    resolution: RESOLUTION_PRESETS[0], // 160x120
    viewMode: 'rgb',
    zoom: 'fit',
    pixelCount: 0,
    activeCoreCount: 0,
    fps: 0,
    throughput: 0,
    isDirty: false,
    activeCores: new Set<number>(),
    pixelsMap: new Map<number, PixelData>(),
  };

  private listeners: Set<() => void> = new Set();
  private fpsCounter = 0;
  private lastFpsTime = Date.now();

  constructor() {
    if (typeof window !== 'undefined') {
      window.setInterval(() => {
        const now = Date.now();
        const dt = (now - this.lastFpsTime) / 1000;
        if (dt >= 1.0) {
          this.state.throughput = Math.round(this.fpsCounter / dt);
          this.fpsCounter = 0;
          this.lastFpsTime = now;
          this.notify();
        }
      }, 1000);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  public setResolution(res: ResolutionPreset): void {
    this.state.resolution = res;
    this.clear();
  }

  public setViewMode(mode: CanvasViewMode): void {
    this.state.viewMode = mode;
    this.state.isDirty = true;
    this.notify();
  }

  public setZoom(zoom: '1x' | '2x' | '4x' | 'fit'): void {
    this.state.zoom = zoom;
    this.notify();
  }

  public putPixels(pixels: PixelData[]): void {
    this.ingestPixels(pixels);
  }

  public getPixelAt(x: number, y: number): PixelData | null {
    const { width, height } = this.state.resolution;
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    return this.state.pixelsMap.get(y * width + x) || null;
  }

  public ingestPixels(pixels: PixelData[]): void {
    if (pixels.length === 0) return;
    const { width, height } = this.state.resolution;
    const map = this.state.pixelsMap;
    const cores = this.state.activeCores;

    let added = 0;
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
        const key = p.y * width + p.x;
        map.set(key, p);
        cores.add(p.coreId);
        added++;
      }
    }

    if (added > 0) {
      this.fpsCounter += added;
      this.state.pixelCount = map.size;
      this.state.activeCoreCount = cores.size;
      this.state.isDirty = true;
      this.notify();
    }
  }

  public renderToCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = this.state.resolution;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // Dark slate metallic background (15, 20, 28, 255)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 15;
      data[i + 1] = 20;
      data[i + 2] = 28;
      data[i + 3] = 255;
    }

    const isRgb = this.state.viewMode === 'rgb';
    this.state.pixelsMap.forEach((p) => {
      if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
        const idx = (p.y * width + p.x) * 4;
        if (isRgb) {
          data[idx] = p.r;
          data[idx + 1] = p.g;
          data[idx + 2] = p.b;
          data[idx + 3] = 255;
        } else {
          const [hr, hg, hb] = getCoreHeatmapRgb(p.coreId);
          data[idx] = hr;
          data[idx + 1] = hg;
          data[idx + 2] = hb;
          data[idx + 3] = 255;
        }
      }
    });

    ctx.putImageData(imgData, 0, 0);
    this.state.isDirty = false;
  }

  public clear(): void {
    this.state.pixelsMap.clear();
    this.state.activeCores.clear();
    this.state.pixelCount = 0;
    this.state.activeCoreCount = 0;
    this.state.throughput = 0;
    this.state.isDirty = true;
    this.notify();
  }
}

export const framebufferStore = new FramebufferStore();
