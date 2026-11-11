import React from 'react';
import { motion } from 'framer-motion';
import { Activity, Camera, Terminal, SlidersHorizontal, PanelRightClose, PanelRight } from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import type { WorkspaceTab } from '../../lib/workspace';
import { cn } from '../../lib/utils';

interface TabItem {
  id: WorkspaceTab;
  index: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabItem[] = [
  { id: 'telemetry', index: 1, label: 'Telemetry & DSP', icon: Activity },
  { id: 'framebuffer', index: 2, label: 'Framebuffer', icon: Camera },
  { id: 'console', index: 3, label: 'Console & Sniffer', icon: Terminal },
  { id: 'controls', index: 4, label: 'Control Panel', icon: SlidersHorizontal },
];

export const TabRail: React.FC = () => {
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const unreadLogsCount = useStudioStore((s) => s.unreadLogsCount);
  const hasNewPixels = useStudioStore((s) => s.hasNewPixels);
  const inspectorOpen = useStudioStore((s) => s.inspectorOpen);
  const toggleInspector = useStudioStore((s) => s.toggleInspector);

  return (
    <div className="h-11 border-b border-white/[0.08] bg-[#09090b] px-4 flex items-center justify-between select-none overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-1 min-w-max">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              data-tab={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors outline-none focus-visible:ring-1 focus-visible:ring-cyan-400',
                isActive
                  ? 'text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabPill"
                  className="absolute inset-0 rounded-lg bg-zinc-800/80 border border-white/10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}

              <span className="relative z-10 flex items-center gap-2">
                <span className="font-mono text-[11px] text-zinc-500">{tab.index}</span>
                <Icon className={cn('w-3.5 h-3.5', isActive ? 'text-cyan-400' : 'text-zinc-400')} />
                <span>{tab.label}</span>

                {/* Badges */}
                {tab.id === 'console' && unreadLogsCount > 0 && !isActive && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {unreadLogsCount > 999 ? '999+' : unreadLogsCount}
                  </span>
                )}

                {tab.id === 'framebuffer' && hasNewPixels && !isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {activeTab !== 'controls' && (
        <div className="flex items-center gap-2 pl-4">
          <button
            type="button"
            onClick={toggleInspector}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
              inspectorOpen
                ? 'bg-zinc-800/80 text-zinc-200 border-white/15'
                : 'bg-transparent text-zinc-500 hover:text-zinc-300 border-transparent hover:border-white/10'
            )}
            title="Toggle Contextual Inspector (Hotkey: ])"
          >
            {inspectorOpen ? (
              <PanelRightClose className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <PanelRight className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span className="hidden sm:inline">Inspector</span>
            <kbd className="hidden sm:inline font-mono text-[10px] px-1 py-0.2 bg-zinc-900 border border-white/10 rounded text-zinc-400">
              ]
            </kbd>
          </button>
        </div>
      )}
    </div>
  );
};
