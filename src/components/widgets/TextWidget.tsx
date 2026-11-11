import React from 'react';
import { AlignLeft } from 'lucide-react';

interface TextWidgetProps {
  label: string;
  value: any;
}

export const TextWidget: React.FC<TextWidgetProps> = ({ label, value }) => {
  return (
    <div className="bg-zinc-900 border border-white/5 rounded-2xl p-6 flex flex-col justify-center min-h-[160px]">
      <div className="flex items-center gap-2 mb-2">
        <AlignLeft className="w-4 h-4 text-zinc-500" />
        <h3 className="text-zinc-400 text-sm font-medium tracking-wide uppercase">{label}</h3>
      </div>
      <div className="text-3xl font-bold text-zinc-100 mt-2 break-words">
        {String(value)}
      </div>
    </div>
  );
};
