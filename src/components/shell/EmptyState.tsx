import React from 'react';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  badge?: string;
  title: string;
  description: string;
  codeSnippet?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  badge,
  title,
  description,
  codeSnippet,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        'w-full max-w-2xl mx-auto my-auto p-8 rounded-xl border border-white/[0.08] bg-[#111113] flex flex-col items-center text-center shadow-sm',
        className
      )}
    >
      {badge && (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 mb-4">
          {badge}
        </span>
      )}

      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center mb-4 text-zinc-400">
          <Icon className="w-6 h-6 text-cyan-400" />
        </div>
      )}

      <h3 className="text-base font-semibold text-zinc-100 mb-2">{title}</h3>
      <p className="text-xs text-zinc-400 max-w-md leading-relaxed mb-6">{description}</p>

      {codeSnippet && (
        <div className="w-full bg-[#09090b] border border-white/[0.08] rounded-lg p-3 text-left mb-6 font-mono text-xs text-zinc-300 overflow-x-auto">
          <pre className="text-[11px] leading-relaxed text-zinc-400">{codeSnippet}</pre>
        </div>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 text-zinc-950 font-semibold text-xs hover:bg-cyan-400 transition-colors shadow-sm"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
