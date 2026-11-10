"use client";

import React, { useState } from 'react';
import { parseTimeToSeconds, formatSecondsForInput } from '@/lib/timeUtils';

interface WorklogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (worklog: WorklogData) => Promise<void>;
  issueKey: string;
}

export interface WorklogData {
  time_spent_seconds: number;
  started_at: string;
  description: string;
  adjust_estimate: 'auto' | 'manual' | 'leave';
  new_remaining_seconds?: number;
}

export default function WorklogModal({ isOpen, onClose, onSubmit, issueKey }: WorklogModalProps) {
  const [timeSpent, setTimeSpent] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [adjustEstimate, setAdjustEstimate] = useState<'auto' | 'manual' | 'leave'>('auto');
  const [newRemaining, setNewRemaining] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const timeSpentSeconds = parseTimeToSeconds(timeSpent);
    if (timeSpentSeconds === 0) {
      setError('Please enter a valid time (e.g., 2h, 1h 30m, 90m)');
      return;
    }

    if (timeSpentSeconds > 86400) {
      setError('Time spent cannot exceed 24 hours per entry');
      return;
    }

    const worklogData: WorklogData = {
      time_spent_seconds: timeSpentSeconds,
      started_at: new Date(date).toISOString(),
      description,
      adjust_estimate: adjustEstimate,
    };

    if (adjustEstimate === 'manual' && newRemaining) {
      const newRemainingSeconds = parseTimeToSeconds(newRemaining);
      if (newRemainingSeconds === 0) {
        setError('Please enter a valid remaining estimate');
        return;
      }
      worklogData.new_remaining_seconds = newRemainingSeconds;
    }

    try {
      setLoading(true);
      await onSubmit(worklogData);

      // Reset form
      setTimeSpent('');
      setDate(new Date().toISOString().split('T')[0]);
      setDescription('');
      setAdjustEstimate('auto');
      setNewRemaining('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to log work');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Log Work - {issueKey}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            type="button"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="timeSpent" className="block text-sm font-medium text-gray-700 mb-1">
              Time Spent *
            </label>
            <input
              type="text"
              id="timeSpent"
              value={timeSpent}
              onChange={(e) => setTimeSpent(e.target.value)}
              placeholder="e.g., 2h, 1h 30m, 90m"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Examples: 2h, 1h 30m, 90m, 2.5h
            </p>
          </div>

          <div>
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
              Date Worked
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Work Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="adjustEstimate" className="block text-sm font-medium text-gray-700 mb-1">
              Adjust Estimate
            </label>
            <select
              id="adjustEstimate"
              value={adjustEstimate}
              onChange={(e) => setAdjustEstimate(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="auto">Auto - Reduce remaining by time spent</option>
              <option value="manual">Manual - Set new remaining estimate</option>
              <option value="leave">Leave - Don't change estimate</option>
            </select>
          </div>

          {adjustEstimate === 'manual' && (
            <div>
              <label htmlFor="newRemaining" className="block text-sm font-medium text-gray-700 mb-1">
                New Remaining Estimate
              </label>
              <input
                type="text"
                id="newRemaining"
                value={newRemaining}
                onChange={(e) => setNewRemaining(e.target.value)}
                placeholder="e.g., 4h, 2h 30m"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging...' : 'Log Work'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
