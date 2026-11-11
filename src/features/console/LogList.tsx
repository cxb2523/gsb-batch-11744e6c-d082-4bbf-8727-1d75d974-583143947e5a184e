import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { TerminalLogItem } from '../../components/widgets/TerminalLog';
import { highlightMatches, formatLogTimestamp } from './logFilter';
import { toHexString } from '../../lib/parser';
import { cn } from '../../lib/utils';

interface LogListProps {
  items: TerminalLogItem[];
  searchQuery: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  isHexView: boolean;
  showTimestamps: boolean;
  autoScroll: boolean;
  activeMatchVirtualIndex?: number;
}

export const LogList: React.FC<LogListProps> = ({
  items,
  searchQuery,
  isRegex,
  isCaseSensitive,
  isHexView,
  showTimestamps,
  autoScroll,
  activeMatchVirtualIndex,
}) => {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 22,
    overscan: 15,
  });

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (autoScroll && items.length > 0) {
      rowVirtualizer.scrollToIndex(items.length - 1, { align: 'end' });
    }
  }, [items.length, autoScroll, rowVirtualizer]);

  // Scroll to focused search match
  useEffect(() => {
    if (
      activeMatchVirtualIndex !== undefined &&
      activeMatchVirtualIndex >= 0 &&
      activeMatchVirtualIndex < items.length
    ) {
      rowVirtualizer.scrollToIndex(activeMatchVirtualIndex, { align: 'center' });
    }
  }, [activeMatchVirtualIndex, items.length, rowVirtualizer]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 font-mono text-xs select-none">
        No log entries to display
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className="flex-1 h-full overflow-y-auto overflow-x-auto bg-[#09090b] font-mono text-xs leading-5 select-text scrollbar-thin scrollbar-thumb-zinc-800"
    >
      <div
        className="w-full relative"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {virtualRows.map((virtualRow) => {
          const item = items[virtualRow.index];
          const isFocused = virtualRow.index === activeMatchVirtualIndex;

          let displayContent = item.text;
          if (isHexView && item.rawBytes) {
            displayContent = toHexString(item.rawBytes);
          }

          const segments = searchQuery
            ? highlightMatches(displayContent, searchQuery, isRegex, isCaseSensitive)
            : [{ text: displayContent, isMatch: false }];

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className={cn(
                'absolute top-0 left-0 w-full flex items-baseline hover:bg-zinc-900/60 px-2 py-0.5 border-b border-white/[0.02] transition-colors',
                isFocused && 'bg-cyan-950/40 border-cyan-500/30'
              )}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {/* Line Gutter */}
              <span className="w-12 shrink-0 text-right pr-3 text-[11px] text-zinc-600 select-none tabular-nums">
                {virtualRow.index + 1}
              </span>

              {/* Timestamp */}
              {showTimestamps && (
                <span className="shrink-0 text-[11px] text-zinc-500 pr-3 select-none tabular-nums">
                  {formatLogTimestamp(Date.now())}
                </span>
              )}

              {/* Tag / Origin Prefix */}
              <span className="shrink-0 pr-2 select-none">
                {item.isMcpTx ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-800 text-zinc-300 border border-white/10">
                    MCP TX
                  </span>
                ) : item.isTx ? (
                  <span className="text-cyan-400 font-semibold text-[11px]">TX &gt;</span>
                ) : (
                  <span className="text-zinc-500 font-medium text-[11px]">RX &lt;</span>
                )}
              </span>

              {/* Message text with match highlights */}
              <span
                className={cn(
                  'flex-1 whitespace-pre-wrap break-all',
                  item.isTx ? 'text-cyan-200' : 'text-zinc-300'
                )}
              >
                {segments.map((seg, idx) =>
                  seg.isMatch ? (
                    <mark
                      key={idx}
                      className={cn(
                        'bg-cyan-500/30 text-cyan-100 rounded px-0.5 font-bold',
                        isFocused && 'bg-cyan-400 text-zinc-950'
                      )}
                    >
                      {seg.text}
                    </mark>
                  ) : (
                    <React.Fragment key={idx}>{seg.text}</React.Fragment>
                  )
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
