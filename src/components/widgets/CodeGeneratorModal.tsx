import React, { useState } from 'react';
import { X, Code2, Copy, Check, Download } from 'lucide-react';
import {
  generateArduinoCode,
  generateArduinoPlotterCode,
  generateSTM32Code,
  generateMicroPythonCode,
  type ControlSpec,
  type CodegenPlatform,
} from '../../lib/codegen';

interface CodeGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  widgetKeys: string[];
  controls: ControlSpec[];
}

const PLATFORM_TABS: Array<{ id: CodegenPlatform; label: string; ext: string; subtitle: string }> = [
  {
    id: 'arduino',
    label: 'Arduino / ESP32 (JSON)',
    ext: 'ino',
    subtitle: 'ArduinoJson v7 + Static Buffer (Zero Heap Fragmentation)',
  },
  {
    id: 'plotter',
    label: 'Arduino Zero-Lib (Plotter)',
    ext: 'ino',
    subtitle: 'Lightweight Key:Value Stream â€” No external libraries needed',
  },
  {
    id: 'stm32',
    label: 'STM32 (HAL + DMA)',
    ext: 'c',
    subtitle: 'STM32CubeIDE HAL_UARTEx_ReceiveToIdle_DMA + snprintf',
  },
  {
    id: 'micropython',
    label: 'MicroPython (Pico / ESP32)',
    ext: 'py',
    subtitle: 'RP2040 / ESP32 non-blocking select.poll() + duty_u16 PWM',
  },
];

export const CodeGeneratorModal: React.FC<CodeGeneratorModalProps> = ({
  isOpen,
  onClose,
  widgetKeys,
  controls,
}) => {
  const [activeTab, setActiveTab] = useState<CodegenPlatform>('arduino');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const code =
    activeTab === 'arduino'
      ? generateArduinoCode(widgetKeys, controls)
      : activeTab === 'plotter'
        ? generateArduinoPlotterCode(widgetKeys, controls)
        : activeTab === 'stm32'
          ? generateSTM32Code(widgetKeys, controls)
          : generateMicroPythonCode(widgetKeys, controls);

  const currentPlatform = PLATFORM_TABS.find((t) => t.id === activeTab)!;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openserial_firmware.${currentPlatform.ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/50">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-accent-blue" />
            <div>
              <h2 className="text-lg font-bold text-zinc-100">Auto Firmware Code Generator v3.2</h2>
              <p className="text-xs text-zinc-400">{currentPlatform.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap border-b border-white/5 bg-zinc-900/30">
          {PLATFORM_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs sm:text-sm font-semibold transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-accent-blue text-accent-blue bg-accent-blue/5'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-6 relative group bg-[#0d0d0f]">
          <div className="sticky top-0 float-right flex items-center gap-2 z-10">
            <button
              type="button"
              onClick={handleDownload}
              className="bg-zinc-900/90 border border-white/10 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all hover:bg-zinc-800"
              title={`Download .${currentPlatform.ext} file`}
            >
              <Download className="w-3.5 h-3.5 text-accent-blue" />
              .{currentPlatform.ext}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="bg-zinc-800/90 border border-white/10 text-zinc-200 hover:text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all hover:bg-zinc-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
          <pre className="text-xs sm:text-sm font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

