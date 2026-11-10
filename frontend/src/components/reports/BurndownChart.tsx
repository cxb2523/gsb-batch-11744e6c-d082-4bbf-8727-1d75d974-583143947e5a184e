'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import { BurndownChartData } from '@/lib/api/reports';

interface BurndownChartProps {
  data: BurndownChartData;
}

export default function BurndownChart({ data }: BurndownChartProps) {
  const chartData = data.data_points.map((point, index) => ({
    day: index + 1,
    date: new Date(point.date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    actual: point.story_points_remaining,
    ideal: point.ideal_remaining,
    scopeChange: point.scope_change,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-sm font-semibold text-gray-900 mb-2">{data.date}</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#0052CC]" />
              <span className="text-sm text-gray-600">Remaining:</span>
              <span className="text-sm font-semibold text-gray-900">
                {data.actual} pts
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#8993A4]" />
              <span className="text-sm text-gray-600">Ideal:</span>
              <span className="text-sm font-semibold text-gray-900">
                {data.ideal} pts
              </span>
            </div>
            {data.scopeChange !== undefined && data.scopeChange !== 0 && (
              <div className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-1">
                <span className="text-xs text-gray-600">Scope change:</span>
                <span
                  className={`text-xs font-semibold ${
                    data.scopeChange > 0 ? 'text-orange-600' : 'text-green-600'
                  }`}
                >
                  {data.scopeChange > 0 ? '+' : ''}
                  {data.scopeChange} pts
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const scopeChangePoints = chartData.filter((d) => d.scopeChange && d.scopeChange !== 0);

  return (
    <div className="w-full" style={{ height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="day"
            label={{ value: 'Sprint Day', position: 'insideBottom', offset: -10 }}
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
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#0052CC', strokeWidth: 1 }} />
          <Legend
            wrapperStyle={{ paddingTop: 20 }}
            iconType="line"
            formatter={(value) => (
              <span className="text-sm text-gray-700">{value}</span>
            )}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#0052CC"
            strokeWidth={3}
            dot={{ fill: '#0052CC', r: 4 }}
            activeDot={{ r: 6 }}
            name="Actual"
          />
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="#8993A4"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name="Ideal"
          />
          {scopeChangePoints.map((point, idx) => (
            <ReferenceDot
              key={idx}
              x={point.day}
              y={point.actual}
              r={8}
              fill={point.scopeChange && point.scopeChange > 0 ? '#FF991F' : '#00875A'}
              stroke="white"
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
