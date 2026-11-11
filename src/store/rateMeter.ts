/**
 * 1-second sliding window throughput meter.
 * Accurately measures data flow: lines/s and bytes/s.
 */
interface RateSample {
  timestamp: number;
  lines: number;
  bytes: number;
}

export class RateMeter {
  private samples: RateSample[] = [];
  private windowMs: number;

  constructor(windowMs = 1000) {
    this.windowMs = windowMs;
  }

  public record(lines: number, bytes: number, now = Date.now()): void {
    this.samples.push({ timestamp: now, lines, bytes });
    this.prune(now);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  public getRates(now = Date.now()): { linesPerSec: number; bytesPerSec: number } {
    this.prune(now);
    if (this.samples.length === 0) {
      return { linesPerSec: 0, bytesPerSec: 0 };
    }

    let totalLines = 0;
    let totalBytes = 0;
    for (let i = 0; i < this.samples.length; i++) {
      totalLines += this.samples[i].lines;
      totalBytes += this.samples[i].bytes;
    }

    const durationSec = this.windowMs / 1000.0;
    return {
      linesPerSec: Math.round(totalLines / durationSec),
      bytesPerSec: Math.round(totalBytes / durationSec),
    };
  }

  public reset(): void {
    this.samples = [];
  }
}
