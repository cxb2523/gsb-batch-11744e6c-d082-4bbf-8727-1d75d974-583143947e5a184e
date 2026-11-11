import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { MoreHorizontal, Pause, Play, Waves } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { DataPoint } from '../../lib/parser';
import {
  analyzeSignalAndSpectrum,
  type WindowFunctionType,
  type PeakInterpolationMethod,
} from '../../lib/dsp';
import type { ChartType } from '../../lib/workspace';

export type { ChartType };

interface ChartWidgetProps {
  label: string;
  value: number;
  unit?: string;
  history?: DataPoint[];
  displayType: ChartType;
  onChangeType: (type: ChartType) => void;
}

function resolveGaugeCeiling(value: number, history: DataPoint[]): number {
  let maxObserved = Math.abs(value);
  for (const pt of history) {
    if (Math.abs(pt.value) > maxObserved) maxObserved = Math.abs(pt.value);
  }
  if (maxObserved <= 100) return 100;
  if (maxObserved <= 255) return 255;
  if (maxObserved <= 1023) return 1023;
  if (maxObserved <= 4095) return 4095;
  return Math.ceil(maxObserved / 100) * 100;
}

const GaugeChart = ({ value, ceiling }: { value: number; ceiling: number }) => {
  const normalized = Math.min(Math.max(value / ceiling, 0), 1) * 100;
  const angle = (normalized / 100) * 180 - 90;

  return (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
      <svg viewBox="0 0 200 120" className="w-full h-full max-w-[200px] drop-shadow-xl">
        {/* Background Arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="16"
          strokeLinecap="round"
        />
        {/* Progress Arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray="251.2"
          strokeDashoffset={251.2 - (251.2 * normalized) / 100}
          className="transition-all duration-150"
        />

        {/* Needle */}
        <g transform={`translate(100, 100) rotate(${angle})`} className="transition-transform duration-150">
          <polygon points="-4,0 4,0 0,-70" fill="#f4f4f5" />
          <circle cx="0" cy="0" r="8" fill="#18181b" stroke="#f4f4f5" strokeWidth="2" />
        </g>

        <text x="20" y="115" fill="#71717a" fontSize="11" fontFamily="monospace" textAnchor="middle">
          0
        </text>
        <text x="180" y="115" fill="#71717a" fontSize="11" fontFamily="monospace" textAnchor="middle">
          {ceiling}
        </text>
      </svg>
    </div>
  );
};

const CHART_MODE_LABELS: Record<ChartType, string> = {
  line: 'Line (Time)',
  bar: 'Bar Chart',
  gauge: 'Gauge Meter',
  fft: 'FFT Spectrum',
};

export const ChartWidget: React.FC<ChartWidgetProps> = ({
  label,
  value,
  unit,
  history,
  displayType,
  onChangeType,
}) => {
  const [fallbackData, setFallbackData] = useState<DataPoint[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [frozenSnapshot, setFrozenSnapshot] = useState<{
    value: number;
    data: DataPoint[];
  } | null>(null);
  const [windowType, setWindowType] = useState<WindowFunctionType>('hann');
  const [interpMethod, setInterpMethod] = useState<PeakInterpolationMethod>('gaussian_log');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (history && history.length > 0) return;
    const now = Date.now();
    const d = new Date(now);
    const timeStr = `${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    setFallbackData((prev) => [...prev, { time: timeStr, timestamp: now, value }].slice(-128));
  }, [value, history]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const liveData = history && history.length > 0 ? history : fallbackData;
  const activeData = isPaused && frozenSnapshot ? frozenSnapshot.data : liveData;
  const activeValue = isPaused && frozenSnapshot ? frozenSnapshot.value : value;

  const togglePause = () => {
    if (!isPaused) {
      setFrozenSnapshot({ value, data: [...liveData] });
      setIsPaused(true);
    } else {
      setIsPaused(false);
      setFrozenSnapshot(null);
    }
  };

  const { metrics, spectrum } = useMemo(
    () => analyzeSignalAndSpectrum(activeData, windowType, undefined, interpMethod),
    [activeData, windowType, interpMethod]
  );

  // Exclude DC bin (k=0) from AC spectral bar plot since zero-mean subtraction is applied
  const acSpectrum = useMemo(
    () => (spectrum.length > 1 ? spectrum.slice(1) : spectrum),
    [spectrum]
  );

  const gaugeCeiling = resolveGaugeCeiling(activeValue, activeData);

  return (
    <div
      className={cn(
        'bg-[#111113] border rounded-xl p-4 flex flex-col relative transition-colors',
        displayType === 'fft' ? 'min-h-[330px]' : 'h-76',
        isPaused ? 'border-amber-400/30' : 'border-white/[0.08]'
      )}
    >
      {/* Top Header */}
      <div className="flex justify-between items-center mb-2 relative gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-zinc-300 text-sm font-semibold tracking-wide uppercase truncate">
            {label}
          </h3>
          {isPaused && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase rounded bg-amber-400/15 text-amber-300 border border-amber-400/30 shrink-0">
              HOLD
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-baseline gap-1 font-mono mr-1">
            <span className="text-xl font-bold text-zinc-100">
              {Number.isInteger(activeValue) ? activeValue : activeValue.toFixed(2)}
            </span>
            {unit && <span className="text-xs text-cyan-400 font-semibold">{unit}</span>}
          </div>

          {/* Quick FFT Toggle Button */}
          <button
            type="button"
            onClick={() => onChangeType(displayType === 'fft' ? 'line' : 'fft')}
            title={displayType === 'fft' ? 'Switch to Time Domain (Line)' : 'Switch to Frequency Domain (FFT Spectrum)'}
            className={cn(
              'px-2 py-1 text-[10px] font-mono font-bold rounded-md border transition-colors flex items-center gap-1',
              displayType === 'fft'
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                : 'bg-zinc-800/80 text-zinc-400 border-white/5 hover:text-zinc-200'
            )}
          >
            <Waves className="w-3 h-3" />
            FFT
          </button>

          {/* Waveform Pause / Freeze Button */}
          <button
            type="button"
            onClick={togglePause}
            title={isPaused ? 'Resume live waveform' : 'Freeze waveform for inspection'}
            className={cn(
              'p-1.5 rounded-md border transition-colors',
              isPaused
                ? 'bg-amber-400/15 text-amber-300 border-amber-400/30'
                : 'bg-zinc-800/80 text-zinc-400 border-white/5 hover:text-zinc-200'
            )}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>

          {/* Chart Mode Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 rounded-md transition-colors"
              title="Select visualization mode"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-20">
                <div className="p-1">
                  {(['line', 'bar', 'gauge', 'fft'] as ChartType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        onChangeType(t);
                        setShowMenu(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs font-medium rounded-md transition-colors',
                        displayType === t
                          ? 'bg-accent-blue/15 text-accent-blue'
                          : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      {CHART_MODE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FFT Sub-header (Window Function + Dominant Peak Readout) */}
      {displayType === 'fft' && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 mb-2 rounded-lg bg-zinc-950/70 border border-white/5 text-[10px] font-mono">
          <div className="flex items-center gap-2 text-zinc-400 truncate">
            <span>
              f<sub className="text-[8px]">peak</sub>:{' '}
              <strong className="text-cyan-400">{metrics.dominantFreqHz.toFixed(2)} Hz</strong>
            </span>
            <span className="text-zinc-600">|</span>
            <span>
              |X|: <strong className="text-zinc-200">{metrics.dominantMagnitude.toFixed(2)}</strong>
            </span>
            <span className="text-zinc-600 hidden sm:inline">|</span>
            <span className="hidden sm:inline text-zinc-500">
              N={metrics.fftSize} (Î”f={metrics.freqResolutionHz.toFixed(2)}Hz)
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {(['hann', 'hamming', 'rectangular'] as WindowFunctionType[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindowType(w)}
                title={`Apply ${w} window function`}
                className={cn(
                  'px-1.5 py-0.5 rounded uppercase transition-colors',
                  windowType === w
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
              >
                {w === 'rectangular' ? 'Rect' : w}
              </button>
            ))}
            <span className="text-zinc-700">|</span>
            <button
              type="button"
              onClick={() =>
                setInterpMethod(interpMethod === 'gaussian_log' ? 'lagrange_linear' : 'gaussian_log')
              }
              title={`Interpolation Method: ${
                interpMethod === 'gaussian_log'
                  ? 'Gaussian Log-Parabolic (unbiased for Hann/bell windows)'
                  : 'Lagrange Linear Parabolic'
              }`}
              className="px-1.5 py-0.5 rounded text-[9px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
            >
              {interpMethod === 'gaussian_log' ? 'LogPeak' : 'LinLagrange'}
            </button>
          </div>
        </div>
      )}

      {/* Main Chart Canvas */}
      <div className="flex-1 w-full min-h-0 relative">
        {displayType === 'line' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="time" hide />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                itemStyle={{ color: '#22d3ee' }}
                animationDuration={80}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}

        {displayType === 'bar' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="time" hide />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                itemStyle={{ color: '#10b981' }}
                animationDuration={80}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Bar dataKey="value" fill="#10b981" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {displayType === 'gauge' && <GaugeChart value={activeValue} ceiling={gaugeCeiling} />}

        {displayType === 'fft' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={acSpectrum}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="frequency"
                tick={{ fill: '#71717a', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${Number(v).toFixed(0)}Hz`}
              />
              <YAxis
                domain={[0, 'auto']}
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  borderColor: 'rgba(168,85,247,0.3)',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                labelFormatter={(freq) => `Frequency: ${Number(freq).toFixed(2)} Hz`}
                formatter={(val, _name, item) => {
                  const db = item?.payload?.decibels ?? 0;
                  return [`${Number(val).toFixed(4)} (${db} dB)`, 'Magnitude |X(f)|'];
                }}
                animationDuration={80}
                cursor={{ fill: 'rgba(34,211,238,0.08)' }}
              />
              <Bar dataKey="magnitude" fill="#22d3ee" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Bottom Signal Metrology Strip */}
      <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-6 gap-1 text-[10px] font-mono text-zinc-500">
        <div className="truncate" title="Minimum Value">
          MIN <span className="text-zinc-300">{metrics.min}</span>
        </div>
        <div className="truncate" title="Maximum Value">
          MAX <span className="text-zinc-300">{metrics.max}</span>
        </div>
        <div className="truncate" title="Mean / DC Component">
          AVG <span className="text-zinc-300">{metrics.mean}</span>
        </div>
        <div className="truncate" title="Peak-to-Peak Amplitude (Max - Min)">
          VPP <span className="text-cyan-400">{metrics.vpp}</span>
        </div>
        <div
          className="truncate"
          title={`Effective Sample Rate (Nyquist: ${metrics.nyquistHz} Hz)${
            metrics.hasHardwareTiming
              ? ' â€” âš¡ Synchronized with MCU hardware microsecond timer (zero USB latency jitter)'
              : metrics.isJitterHigh
                ? ` â€” âš ï¸ High Inter-Sample Jitter: ${metrics.jitterPercent}% (Ïƒ=${metrics.jitterMs}ms)`
                : ''
          }`}
        >
          Fs{' '}
          <span className={metrics.isJitterHigh ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
            {metrics.sampleRateHz}Hz
          </span>
          {metrics.hasHardwareTiming ? (
            <span
              className="text-[9px] text-cyan-400 font-mono font-bold ml-0.5"
              title="MCU hardware microsecond timebase active"
            >
              HW
            </span>
          ) : metrics.isJitterHigh ? (
            <span
              className="text-[10px] text-amber-400 font-mono ml-0.5"
              title={`Uneven packet intervals detected: jitter ${metrics.jitterPercent}% (Ïƒ=${metrics.jitterMs}ms)`}
            >
              âš ï¸
            </span>
          ) : null}
        </div>
        <div className="truncate text-right" title="Dominant Spectral Peak Frequency (Sub-Bin Interpolated)">
          Fp <span className="text-cyan-400">{metrics.dominantFreqHz}Hz</span>
        </div>
      </div>

      {/* Deep DSP Spectral Metrology Strip (FFT mode) */}
      {displayType === 'fft' && (
        <div className="mt-1.5 pt-1.5 border-t border-cyan-500/10 grid grid-cols-4 sm:grid-cols-5 gap-1 text-[9px] font-mono text-zinc-400">
          <div title="Signal-to-Noise Ratio (P_fund / P_noise)">
            SNR <span className="text-emerald-400 font-semibold">{metrics.snrDb ?? 0}dB</span>
          </div>
          <div title="Total Harmonic Distortion (Harmonics 2..5 power over fundamental)">
            THD <span className="text-amber-400 font-semibold">{metrics.thdPercent ?? 0}%</span>
          </div>
          <div title="Signal-to-Noise and Distortion Ratio">
            SINAD <span className="text-cyan-300 font-semibold">{metrics.sinadDb ?? 0}dB</span>
          </div>
          <div title="Effective Number of Bits ((SINAD - 1.76) / 6.02)">
            ENOB <span className="text-cyan-300 font-semibold">{metrics.enob ?? 0}b</span>
          </div>
          {metrics.sineFit && (
            <div
              className="hidden sm:block truncate text-right text-zinc-400"
              title={`IEEE-1057 Sine Fit: Amplitude=${metrics.sineFit.amplitude}, Phase=${metrics.sineFit.phaseDeg}Â°, Offset=${metrics.sineFit.offset}, RMSE=${metrics.sineFit.rmse}`}
            >
              FIT <span className="text-zinc-200">A={metrics.sineFit.amplitude}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


