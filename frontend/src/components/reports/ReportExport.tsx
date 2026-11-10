'use client';

import React, { useState } from 'react';
import { ImageDown, Sheet } from 'lucide-react';
import { tokens } from '@/design-system/tokens';

interface ReportExportProps {
  chartRef?: React.RefObject<HTMLDivElement | null>;
  data?: any[];
  filename?: string;
  onExportPNG?: () => void;
  onExportCSV?: () => void;
  className?: string;
}

/**
 * The two export CTAs. These were Tailwind-classed buttons (gray-300 hairline,
 * rounded-md, focus rings) on pages that style everything else from the design
 * tokens, so they read as a different app's buttons; they now match the
 * secondary button used elsewhere.
 */
function ExportButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof ImageDown;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 36,
        padding: '0 14px',
        fontFamily: tokens.fontFamily.sans,
        fontSize: 13,
        fontWeight: 500,
        color: disabled ? tokens.colors.neutral[500] : tokens.colors.neutral[800],
        background:
          disabled || !hovered
            ? tokens.colors.semantic.background.default
            : tokens.colors.neutral[50],
        border: `1px solid ${tokens.colors.neutral[300]}`,
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease',
        whiteSpace: 'nowrap',
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

export default function ReportExport({
  chartRef,
  data,
  filename = 'report',
  onExportPNG,
  onExportCSV,
  className = '',
}: ReportExportProps) {
  const handleExportPNG = async () => {
    if (onExportPNG) {
      onExportPNG();
      return;
    }

    if (!chartRef?.current) {
      console.error('Chart reference not available');
      return;
    }

    try {
      // Dynamically import html2canvas to avoid SSR issues
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });

      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Failed to export PNG:', error);
    }
  };

  const handleExportCSV = () => {
    if (onExportCSV) {
      onExportCSV();
      return;
    }

    if (!data || data.length === 0) {
      console.error('No data available for export');
      return;
    }

    try {
      // Convert data to CSV
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map((row) =>
          headers.map((header) => {
            const value = row[header];
            // Handle values that might contain commas
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value}"`;
            }
            return value;
          }).join(',')
        ),
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}.csv`;
      link.click();
    } catch (error) {
      console.error('Failed to export CSV:', error);
    }
  };

  return (
    <div className={className} style={{ display: 'flex', gap: 8 }}>
      <ExportButton icon={ImageDown} label="Export PNG" onClick={handleExportPNG} />
      <ExportButton
        icon={Sheet}
        label="Export CSV"
        onClick={handleExportCSV}
        disabled={!onExportCSV && (!data || data.length === 0)}
      />
    </div>
  );
}
