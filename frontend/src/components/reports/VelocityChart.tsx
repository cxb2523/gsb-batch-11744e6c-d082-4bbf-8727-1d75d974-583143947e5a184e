'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { VelocityChartData } from '@/lib/api/reports';

interface VelocityChartProps {
  data: VelocityChartData;
}

export default function VelocityChart({ data }: VelocityChartProps) {
  const chartData = data.sprints.map((sprint) => ({
    name: sprint.sprint_name,
    committed: sprint.committed,
    completed: sprint.completed,
    completionRate: sprint.committed > 0 ? (sprint.completed / sprint.committed) * 100 : 0,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-sm font-semibold text-gray-900 mb-2">{data.name}</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#DFE1E6]" />
              <span className="text-sm text-gray-600">Committed:</span>
              <span className="text-sm font-semibold text-gray-900">
                {data.committed} pts
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#0052CC]" />
              <span className="text-sm text-gray-600">Completed:</span>
              <span className="text-sm font-semibold text-gray-900">
                {data.completed} pts
              </span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-1">
              <span className="text-xs text-gray-600">Completion:</span>
              <span className="text-xs font-semibold text-gray-900">
                {data.completionRate.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full" style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={80}
            tick={{ fill: '#6B7280', fontSize: 12 }}
            axisLine={{ stroke: '#E5E7EB' }}
            tickLine={{ stroke: '#E5E7EB' }}
          />
          <YAxis
            label={{
              value: 'Story Points',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle' },
            }}
            tick={{ fill: '#6B7280', fontSize: 12 }}
            axisLine={{ stroke: '#E5E7EB' }}
            tickLine={{ stroke: '#E5E7EB' }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0, 82, 204, 0.05)' }} />
          <Legend
            wrapperStyle={{ paddingTop: 20 }}
            formatter={(value) => (
              <span className="text-sm text-gray-700">{value}</span>
            )}
          />
          <ReferenceLine
            y={data.average_velocity}
            stroke="#FF991F"
            strokeDasharray="5 5"
            strokeWidth={2}
            label={{
              value: `Avg: ${data.average_velocity.toFixed(1)} pts`,
              position: 'right',
              fill: '#FF991F',
              fontSize: 12,
              fontWeight: 600,
            }}
          />
          <Bar
            dataKey="committed"
            fill="#DFE1E6"
            name="Committed"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="completed"
            fill="#0052CC"
            name="Completed"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
