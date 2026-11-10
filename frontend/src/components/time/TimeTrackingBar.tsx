"use client";

import React from 'react';
import { formatSeconds, calculateTimeProgress } from '@/lib/timeUtils';
import { tokens } from '@/design-system/tokens';

interface TimeTrackingBarProps {
  originalEstimateSeconds: number;
  timeSpentSeconds: number;
  remainingEstimateSeconds: number;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function TimeTrackingBar({
  originalEstimateSeconds,
  timeSpentSeconds,
  remainingEstimateSeconds,
  showDetails = true,
  size = 'md',
}: TimeTrackingBarProps) {
  const totalEstimate = originalEstimateSeconds || (timeSpentSeconds + remainingEstimateSeconds);
  const progress = calculateTimeProgress(timeSpentSeconds, totalEstimate);

  // Determine bar color based on progress
  const getBarColor = () => {
    if (progress >= 100) return tokens.colors.error[500]; // Over estimate
    if (progress >= 80) return tokens.colors.warning[500]; // Warning
    if (progress >= 50) return tokens.colors.warning[300]; // In progress
    return tokens.colors.info[500]; // On track
  };

  const barHeight = {
    sm: 4,
    md: 8,
    lg: 12,
  }[size];

  const textSize = {
    sm: 11,
    md: 13,
    lg: 14,
  }[size];

  if (totalEstimate === 0 && timeSpentSeconds === 0) {
    return (
      <div style={{ color: tokens.colors.neutral[500], fontSize: 13, textAlign: 'center' }}>
        No time tracked
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {showDetails && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: textSize, color: tokens.colors.neutral[600] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: tokens.colors.neutral[500] }}>Spent:</span>{' '}
              <span style={{ fontWeight: 500, color: tokens.colors.neutral[900] }}>{formatSeconds(timeSpentSeconds)}</span>
            </div>
            {originalEstimateSeconds > 0 && (
              <>
                <div>
                  <span style={{ color: tokens.colors.neutral[500] }}>Est:</span>{' '}
                  <span style={{ fontWeight: 500, color: tokens.colors.neutral[900] }}>{formatSeconds(originalEstimateSeconds)}</span>
                </div>
                <div>
                  <span style={{ color: tokens.colors.neutral[500] }}>Left:</span>{' '}
                  <span style={{ fontWeight: 500, color: tokens.colors.neutral[900] }}>{formatSeconds(remainingEstimateSeconds)}</span>
                </div>
              </>
            )}
          </div>
          <span style={{ fontWeight: 600, fontSize: textSize }}>{progress}%</span>
        </div>
      )}

      <div style={{ width: '100%', backgroundColor: tokens.colors.neutral[200], borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            height: barHeight,
            backgroundColor: getBarColor(),
            width: `${Math.min(100, progress)}%`,
            transition: 'width 0.3s ease',
            borderRadius: 999,
          }}
        />
      </div>

      {!showDetails && (
        <div style={{ fontSize: textSize, color: tokens.colors.neutral[500], textAlign: 'center' }}>
          {formatSeconds(timeSpentSeconds)} / {formatSeconds(totalEstimate)}
        </div>
      )}
    </div>
  );
}
