"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChartDatum {
  label: string;
  value: number;
  color?: string;
}

/** Vertical Bar Chart — pure SVG, no deps */
export function BarChart({
  data,
  height = 200,
  className,
  formatValue = (v: number) => v.toString(),
}: {
  data: ChartDatum[];
  height?: number;
  className?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const padding = { top: 20, right: 8, bottom: 28, left: 8 };
  const barWidth = 100 / data.length;

  return (
    <div className={cn("w-full", className)}>
      <div className="relative" style={{ height }}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="overflow-visible"
        >
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1="0"
              x2="100"
              y1={padding.top + (height - padding.top - padding.bottom) * (1 - t)}
              y2={padding.top + (height - padding.top - padding.bottom) * (1 - t)}
              stroke="var(--border)"
              strokeWidth="0.2"
              strokeDasharray="1 1"
            />
          ))}

          {/* Bars */}
          {data.map((d, i) => {
            const barH = (d.value / max) * (height - padding.top - padding.bottom);
            const x = i * barWidth + barWidth * 0.2;
            const w = barWidth * 0.6;
            const y = height - padding.bottom - barH;
            const color = d.color || "var(--chart-1)";
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={barH}
                  rx="1.5"
                  fill={color}
                  className="transition-all duration-300 hover:opacity-80"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* X axis labels */}
      <div className="flex justify-between mt-2 px-1">
        {data.map((d, i) => (
          <span key={i} className="text-[10px] text-muted-foreground flex-1 text-center truncate">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Donut Chart — pure SVG */
export function DonutChart({
  data,
  size = 160,
  thickness = 18,
  className,
  centerLabel,
  centerValue,
}: {
  data: ChartDatum[];
  size?: number;
  thickness?: number;
  className?: string;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--chart-6)",
  ];

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={thickness}
        />
        {data.map((d, i) => {
          const len = (d.value / total) * circumference;
          const seg = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color || colors[i % colors.length]}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      {(centerLabel || centerValue) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue && (
            <span className="text-xl font-bold text-foreground tabular-nums">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="text-xs text-muted-foreground">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
