/**
 * Time tracking utilities for parsing and formatting time values
 */

/**
 * Parse time string to seconds
 * Supports formats: "2h", "2.5h", "2h 30m", "150m", "30m", "1h30m"
 */
export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr || timeStr.trim() === '') return 0;

  const normalized = timeStr.toLowerCase().trim();
  let totalSeconds = 0;

  // Match hours and minutes with various formats
  const hourMinutePattern = /(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s*(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?/;
  const minuteOnlyPattern = /^(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?$/;
  const hourOnlyPattern = /^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/;

  // Try hour + minute format (e.g., "2h 30m" or "2h30m")
  const hourMinuteMatch = normalized.match(hourMinutePattern);
  if (hourMinuteMatch) {
    const hours = parseFloat(hourMinuteMatch[1]);
    const minutes = hourMinuteMatch[2] ? parseFloat(hourMinuteMatch[2]) : 0;
    totalSeconds = (hours * 3600) + (minutes * 60);
    return Math.floor(totalSeconds);
  }

  // Try minute only format (e.g., "90m")
  const minuteMatch = normalized.match(minuteOnlyPattern);
  if (minuteMatch) {
    const minutes = parseFloat(minuteMatch[1]);
    totalSeconds = minutes * 60;
    return Math.floor(totalSeconds);
  }

  // Try hour only format (e.g., "2h" or "2.5h")
  const hourMatch = normalized.match(hourOnlyPattern);
  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    totalSeconds = hours * 3600;
    return Math.floor(totalSeconds);
  }

  // If no pattern matched, try to parse as decimal hours
  const numericValue = parseFloat(normalized);
  if (!isNaN(numericValue)) {
    totalSeconds = numericValue * 3600; // Assume hours
    return Math.floor(totalSeconds);
  }

  return 0;
}

/**
 * Format seconds to human-readable time string
 * Examples: "2h", "2h 30m", "30m", "0h"
 */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === 0) return '0h';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return '0h';
  }
}

/**
 * Format seconds to decimal hours
 * Example: 5400 seconds = 1.5 hours = "1.5h"
 */
export function formatSecondsToDecimalHours(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds === 0) return '0h';
  const hours = (seconds / 3600).toFixed(1);
  return `${hours}h`;
}

/**
 * Format seconds for time input field
 * Returns format suitable for editing (e.g., "2h 30m")
 */
export function formatSecondsForInput(seconds: number | null | undefined): string {
  return formatSeconds(seconds);
}

/**
 * Calculate percentage for progress bar
 */
export function calculateTimeProgress(spent: number, estimated: number): number {
  if (estimated === 0) return 0;
  return Math.min(100, Math.round((spent / estimated) * 100));
}

/**
 * Validate time string format
 */
export function isValidTimeString(timeStr: string): boolean {
  if (!timeStr || timeStr.trim() === '') return false;
  const seconds = parseTimeToSeconds(timeStr);
  return seconds > 0;
}

/**
 * Get time color based on remaining vs spent
 */
export function getTimeStatusColor(spent: number, remaining: number, original: number): string {
  if (original === 0) return 'gray';

  const totalEstimated = original;
  const percentage = (spent / totalEstimated) * 100;

  if (percentage >= 100) return 'red'; // Over estimate
  if (percentage >= 80) return 'orange'; // Warning
  if (percentage >= 50) return 'yellow'; // In progress
  return 'green'; // On track
}
