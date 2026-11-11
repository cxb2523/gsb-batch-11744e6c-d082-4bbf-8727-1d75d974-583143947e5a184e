import React, { useState, useRef } from 'react';
import { X, Settings2, Check, Download, Upload } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBaudRate: number;
  onSaveBaudRate: (baud: number) => void;
  currentBufferSize?: number;
  onSaveBufferSize?: (size: number) => void;
  onExportProfile?: () => void;
  onImportProfile?: (rawJson: string) => boolean;
}

const STANDARD_BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentBaudRate,
  onSaveBaudRate,
  currentBufferSize = 128,
  onSaveBufferSize,
  onExportProfile,
  onImportProfile,
}) => {
  const isStandard = STANDARD_BAUD_RATES.includes(currentBaudRate);

  const [selectedBaud, setSelectedBaud] = useState<number>(currentBaudRate);
  const [selectedBufferSize, setSelectedBufferSize] = useState<number>(currentBufferSize);
  const [isCustom, setIsCustom] = useState<boolean>(!isStandard);
  const [customBaud, setCustomBaud] = useState<string>(!isStandard ? currentBaudRate.toString() : '');
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    if (isCustom) {
      const parsed = parseInt(customBaud, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        onSaveBaudRate(parsed);
      }
    } else {
      onSaveBaudRate(selectedBaud);
    }
    if (onSaveBufferSize) {
      onSaveBufferSize(selectedBufferSize);
    }
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportProfile) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const ok = onImportProfile(content);
      if (ok) {
        setProfileFeedback({ type: 'ok', msg: `Imported profile from "${file.name}"` });
      } else {
        setProfileFeedback({ type: 'err', msg: 'Invalid workspace profile JSON file.' });
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-accent-blue" />
            <h2 className="text-lg font-bold text-zinc-100">Hardware & Workspace Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <label className="text-sm font-semibold text-zinc-300 mb-3 block">
              UART Baud Rate (bps)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STANDARD_BAUD_RATES.map((baud) => (
                <button
                  key={baud}
                  type="button"
                  onClick={() => {
                    setIsCustom(false);
                    setSelectedBaud(baud);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-mono font-medium transition-all border ${
                    !isCustom && selectedBaud === baud
                      ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                      : 'bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {baud}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsCustom(true)}
                className={`py-2 px-3 rounded-lg text-xs font-medium transition-all border ${
                  isCustom
                    ? 'bg-accent-blue/20 border-accent-blue text-accent-blue'
                    : 'bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Custom
              </button>
            </div>

            {isCustom && (
              <div className="mt-3">
                <label className="text-xs text-zinc-500 mb-1 block">Custom Baud Rate (bps)</label>
                <input
                  type="number"
                  min="1"
                  value={customBaud}
                  onChange={(e) => setCustomBaud(e.target.value)}
                  placeholder="e.g. 74880 or 1000000"
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                />
              </div>
            )}
          </div>

          {/* Ring-Buffer / FFT Window Size */}
          <div className="pt-4 border-t border-white/5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-zinc-300 block">
                Telemetry Buffer / FFT Window Size (N)
              </label>
              <span className="text-xs font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                N = {selectedBufferSize}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {([64, 128, 256, 512, 1024] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setSelectedBufferSize(size)}
                  className={`py-2 px-1 rounded-lg text-xs font-mono font-medium transition-all border text-center ${
                    selectedBufferSize === size
                      ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.15)]'
                      : 'bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500 mt-2">
              Larger N increases spectral resolution (Δf = Fs / N) for precision FFT analysis.
            </p>
          </div>

          {/* Workspace Profile Export / Import */}
          <div className="pt-4 border-t border-white/5">
            <label className="text-sm font-semibold text-zinc-300 mb-1 block">
              Workspace Profile (.json)
            </label>
            <p className="text-xs text-zinc-500 mb-3">
              Controls, baud rate, and chart modes are automatically persisted to browser storage. Export or import JSON profiles to share hardware setups.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onExportProfile}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-accent-blue" />
                Export Profile
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                Import Profile
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {profileFeedback && (
              <div
                className={`mt-2 text-xs font-mono px-3 py-1.5 rounded-lg border ${
                  profileFeedback.type === 'ok'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                    : 'bg-red-500/10 text-red-400 border-red-500/25'
                }`}
              >
                {profileFeedback.msg}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-zinc-900/30 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            className="bg-accent-blue hover:bg-accent-blue/90 text-zinc-950 px-6 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
