"use client";

import React from 'react';
import { formatSeconds } from '@/lib/timeUtils';
import { format } from 'date-fns';

export interface Worklog {
  id: number;
  issue_id: number;
  issue_key: string;
  time_spent_seconds: number;
  started_at: string;
  description: string;
  author: {
    id: number;
    name: string;
    email: string;
  };
  created_at: string;
  updated_at?: string;
}

interface WorklogListProps {
  worklogs: Worklog[];
  onDelete?: (worklogId: number) => void;
  currentUserId?: number;
  isAdmin?: boolean;
}

export default function WorklogList({ worklogs, onDelete, currentUserId, isAdmin }: WorklogListProps) {
  if (worklogs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>No work logged yet</p>
      </div>
    );
  }

  const canDelete = (worklog: Worklog) => {
    return isAdmin || worklog.author.id === currentUserId;
  };

  return (
    <div className="space-y-3">
      {worklogs.map((worklog) => (
        <div key={worklog.id} className="border border-gray-200 rounded-md p-4 hover:border-gray-300 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-medium">
                    {worklog.author.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{worklog.author.name}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(worklog.started_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm font-medium">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatSeconds(worklog.time_spent_seconds)}
                </div>
              </div>

              {worklog.description && (
                <p className="text-sm text-gray-700 mt-2">{worklog.description}</p>
              )}

              <p className="text-xs text-gray-400 mt-2">
                Logged {format(new Date(worklog.created_at), 'MMM d, yyyy \'at\' h:mm a')}
              </p>
            </div>

            {canDelete(worklog) && onDelete && (
              <button
                onClick={() => onDelete(worklog.id)}
                className="text-gray-400 hover:text-red-600 transition-colors ml-2"
                title="Delete worklog"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
