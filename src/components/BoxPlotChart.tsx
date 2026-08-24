import React, { useMemo, useState } from 'react';
import { Listing } from '../types';
import { cn } from '../lib/utils';
import { Info, BarChart3, ExternalLink, Calculator, TrendingUp, ShieldAlert } from 'lucide-react';

interface BoxPlotChartProps {
  soldListings: Listing[];
  acreRange: [number, number];
  rangeLabel: string;
}

function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export default function BoxPlotChart({ soldListings, acreRange, rangeLabel }: BoxPlotChartProps) {
  const [hoveredComp, setHoveredComp] = useState<Listing | null>(null);

  // 1. Filter comps for the selected acreage range and remove extreme outliers (1.5x IQR rule)
  const cleanDataset = useMemo(() => {
    const rawComps = soldListings.filter(l => {
      if (acreRange[1] >= 1000000) {
        return l.acres >= acreRange[0];
      }
      return l.acres >= acreRange[0] && l.acres < acreRange[1];
    });

    const rawPrices = rawComps
      .map(c => c.pricePerAcre)
      .filter(p => !isNaN(p) && p > 0)
      .sort((a, b) => a - b);

    if (rawPrices.length < 4) {
      return {
        comps: rawComps,
        prices: rawPrices,
        removedOutliersCount: 0,
      };
    }

    const q1 = calculatePercentile(rawPrices, 0.25);
    const q3 = calculatePercentile(rawPrices, 0.75);
    const iqr = Math.max(0, q3 - q1);
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const cleanComps = rawComps.filter(c => c.pricePerAcre >= lowerBound && c.pricePerAcre <= upperBound);
    const cleanPrices = cleanComps.map(c => c.pricePerAcre).sort((a, b) => a - b);
    const removedCount = rawComps.length - cleanComps.length;

    return {
      comps: cleanComps,
      prices: cleanPrices,
      removedOutliersCount: removedCount,
    };
  }, [soldListings, acreRange]);

  // 2. Compute full statistical metrics on the outlier-free dataset
  const stats = useMemo(() => {
    const { prices, removedOutliersCount } = cleanDataset;
    if (prices.length === 0) return null;

    const n = prices.length;
    const minVal = prices[0];
    const maxVal = prices[prices.length - 1];
    const q1 = calculatePercentile(prices, 0.25);
    const median = calculatePercentile(prices, 0.50);
    const q3 = calculatePercentile(prices, 0.75);
    const iqr = Math.max(0, q3 - q1);

    // Mean (Average)
    const sum = prices.reduce((acc, val) => acc + val, 0);
    const mean = sum / n;

    // Standard Deviation (Sample SD)
    const variance = n > 1 
      ? prices.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1)
      : 0;
    const sd = Math.sqrt(variance);

    // 95% Confidence Interval (z = 1.96)
    const se = n > 0 ? sd / Math.sqrt(n) : 0;
    const ciMargin = 1.96 * se;
    const ciLower = Math.max(0, mean - ciMargin);
    const ciUpper = mean + ciMargin;

    return {
      count: n,
      removedOutliersCount,
      minVal,
      maxVal,
      q1,
      median,
      q3,
      iqr,
      mean,
      sd,
      ciLower,
      ciUpper,
      ciMargin,
    };
  }, [cleanDataset]);

  const formatPrice = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${Math.round(val / 1000)}k`;
    return `$${Math.round(val)}`;
  };

  const formatFullPrice = (val: number) => {
    return `$${Math.round(val).toLocaleString()}`;
  };

  // SVG dimensions & scale
  const svgWidth = 540;
  const svgHeight = 150;
  const paddingLeft = 45;
  const paddingRight = 45;
  const plotWidth = svgWidth - paddingLeft - paddingRight;

  const scaleDomain = useMemo(() => {
    if (!stats) return { min: 0, max: 100 };
    const min = Math.max(0, stats.minVal * 0.9);
    const max = stats.maxVal * 1.1 || min + 100;
    return { min, max };
  }, [stats]);

  const toX = (val: number) => {
    const range = scaleDomain.max - scaleDomain.min || 1;
    const norm = (val - scaleDomain.min) / range;
    return paddingLeft + norm * plotWidth;
  };

  // Ticks for X-axis
  const ticks = useMemo(() => {
    const range = scaleDomain.max - scaleDomain.min;
    if (range <= 0) return [];
    const count = 5;
    const step = range / (count - 1);
    return Array.from({ length: count }, (_, i) => scaleDomain.min + i * step);
  }, [scaleDomain]);

  if (!stats || stats.count === 0) {
    return (
      <div className="bg-neutral-50/60 border border-neutral-200/80 rounded-xl p-6 flex flex-col items-center justify-center text-center h-full min-h-[220px]">
        <BarChart3 className="w-8 h-8 text-neutral-300 mb-2" />
        <p className="text-xs font-bold text-neutral-600 mb-1">No Sold Comps Available</p>
        <p className="text-[11px] text-neutral-400 max-w-[220px]">
          No sold listings found in the <span className="font-semibold text-neutral-700">{rangeLabel}</span> acreage range.
        </p>
      </div>
    );
  }

  const boxY = 32;
  const boxHeight = 44;
  const centerY = boxY + boxHeight / 2;

  return (
    <div className="bg-white border border-neutral-200/90 rounded-xl p-5 shadow-sm space-y-4">
      {/* Header with Title and Outlier Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-100 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-600" />
          <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
            {rangeLabel} Acreage Price Boxplot
          </h4>
        </div>
        <div className="flex items-center gap-2">
          {stats.removedOutliersCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-full text-[10px] font-semibold flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-amber-600" />
              {stats.removedOutliersCount} extreme outlier{stats.removedOutliersCount > 1 ? 's' : ''} removed
            </span>
          )}
          <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full text-[10px] font-bold font-mono">
            n = {stats.count} comps
          </span>
        </div>
      </div>

      {/* SVG Box Plot Visual */}
      <div className="relative overflow-hidden">
        <svg 
          viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
          className="w-full h-auto overflow-visible"
        >
          {/* Background Grid Lines */}
          {ticks.map((t, idx) => {
            const x = toX(t);
            return (
              <g key={`grid-${idx}`}>
                <line 
                  x1={x} 
                  y1={15} 
                  x2={x} 
                  y2={svgHeight - 32} 
                  stroke="#f3f4f6" 
                  strokeDasharray="3 3" 
                />
                <text 
                  x={x} 
                  y={svgHeight - 14} 
                  textAnchor="middle" 
                  className="text-[10px] fill-neutral-400 font-mono font-medium"
                >
                  {formatPrice(t)}
                </text>
              </g>
            );
          })}

          {/* Baseline X axis */}
          <line 
            x1={paddingLeft} 
            y1={svgHeight - 30} 
            x2={svgWidth - paddingRight} 
            y2={svgHeight - 30} 
            stroke="#e5e7eb" 
            strokeWidth="1.5" 
          />

          {stats.count >= 2 ? (
            <g>
              {/* Left Whisker Line (minVal to Q1) */}
              <line 
                x1={toX(stats.minVal)} 
                y1={centerY} 
                x2={toX(stats.q1)} 
                y2={centerY} 
                stroke="#16a34a" 
                strokeWidth="2" 
                strokeDasharray="4 2"
              />

              {/* Right Whisker Line (Q3 to maxVal) */}
              <line 
                x1={toX(stats.q3)} 
                y1={centerY} 
                x2={toX(stats.maxVal)} 
                y2={centerY} 
                stroke="#16a34a" 
                strokeWidth="2" 
                strokeDasharray="4 2"
              />

              {/* Left Whisker Cap */}
              <line 
                x1={toX(stats.minVal)} 
                y1={centerY - 12} 
                x2={toX(stats.minVal)} 
                y2={centerY + 12} 
                stroke="#16a34a" 
                strokeWidth="2.5" 
                strokeLinecap="round"
              />

              {/* Right Whisker Cap */}
              <line 
                x1={toX(stats.maxVal)} 
                y1={centerY - 12} 
                x2={toX(stats.maxVal)} 
                y2={centerY + 12} 
                stroke="#16a34a" 
                strokeWidth="2.5" 
                strokeLinecap="round"
              />

              {/* Box Rect (Q1 to Q3) */}
              <rect 
                x={toX(stats.q1)} 
                y={boxY} 
                width={Math.max(2, toX(stats.q3) - toX(stats.q1))} 
                height={boxHeight} 
                rx="6"
                className="fill-emerald-100/80 stroke-emerald-600" 
                strokeWidth="2"
              />

              {/* Median Line */}
              <line 
                x1={toX(stats.median)} 
                y1={boxY} 
                x2={toX(stats.median)} 
                y2={boxY + boxHeight} 
                stroke="#15803d" 
                strokeWidth="3.5" 
                strokeLinecap="round"
              />

              {/* Median Dot Highlight */}
              <circle cx={toX(stats.median)} cy={centerY} r="3" fill="#ffffff" stroke="#15803d" strokeWidth="2" />

              {/* Mean Indicator (Blue Diamond) */}
              <polygon 
                points={`
                  ${toX(stats.mean)},${centerY - 6} 
                  ${toX(stats.mean) + 5},${centerY} 
                  ${toX(stats.mean)},${centerY + 6} 
                  ${toX(stats.mean) - 5},${centerY}
                `} 
                fill="#2563eb" 
                stroke="#ffffff" 
                strokeWidth="1.5" 
              />
            </g>
          ) : null}

          {/* Render individual comp dots overlayed */}
          {cleanDataset.comps.map((comp, idx) => {
            const x = toX(comp.pricePerAcre);
            const jitter = ((idx % 5) - 2) * 4;
            const y = centerY + jitter;
            const isHovered = hoveredComp?.id === comp.id;

            return (
              <g 
                key={comp.id || idx}
                onMouseEnter={() => setHoveredComp(comp)}
                onMouseLeave={() => setHoveredComp(null)}
                className="cursor-pointer transition-all"
              >
                <circle 
                  cx={x} 
                  cy={y} 
                  r={isHovered ? 6 : 4} 
                  className={cn(
                    "transition-all duration-150",
                    isHovered ? "fill-emerald-600 stroke-white stroke-2 shadow-lg" : "fill-emerald-600/70 hover:fill-emerald-700 stroke-emerald-800/40 stroke-1"
                  )} 
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip when hovering a point */}
        {hoveredComp && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-[10px] px-3 py-1.5 rounded-lg shadow-xl z-20 flex items-center gap-2 pointer-events-none">
            <span className="font-bold font-mono text-emerald-400">
              ${Math.round(hoveredComp.pricePerAcre).toLocaleString()}/ac
            </span>
            <span className="text-neutral-300">({hoveredComp.acres} ac)</span>
            <span className="text-neutral-400 max-w-[120px] truncate">{hoveredComp.address || 'Comp'}</span>
          </div>
        )}
      </div>

      {/* Primary Parametric Statistics: Average, SD, 95% Confidence Interval */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-neutral-50/80 border border-neutral-200/80 p-3 rounded-xl">
        <div className="bg-white border border-neutral-100 p-2.5 rounded-lg shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-1.5 mb-1">
            <Calculator className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">Average (Mean)</span>
          </div>
          <span className="text-sm font-mono font-extrabold text-blue-900" title={formatFullPrice(stats.mean)}>
            {formatFullPrice(stats.mean)}<span className="text-[10px] font-normal text-neutral-400">/ac</span>
          </span>
        </div>

        <div className="bg-white border border-neutral-100 p-2.5 rounded-lg shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">Std Deviation (σ)</span>
          </div>
          <span className="text-sm font-mono font-bold text-indigo-900" title={`±${formatFullPrice(stats.sd)}`}>
            ±{formatFullPrice(stats.sd)}<span className="text-[10px] font-normal text-neutral-400">/ac</span>
          </span>
        </div>

        <div className="bg-white border border-neutral-100 p-2.5 rounded-lg shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-1.5 mb-1">
            <Info className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-tight">95% Conf. Interval</span>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-900 truncate" title={`${formatFullPrice(stats.ciLower)} - ${formatFullPrice(stats.ciUpper)}`}>
            {formatPrice(stats.ciLower)} – {formatPrice(stats.ciUpper)}
            <span className="text-[10px] text-neutral-400 font-normal ml-1">(±{formatPrice(stats.ciMargin)})</span>
          </span>
        </div>
      </div>

      {/* Quartile Distribution Grid */}
      <div className="grid grid-cols-5 gap-1.5 pt-0.5">
        <div className="bg-neutral-50 border border-neutral-100 p-2 rounded-lg text-center flex flex-col">
          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Min</span>
          <span className="text-xs font-mono font-bold text-neutral-800 truncate" title={formatFullPrice(stats.minVal)}>
            {formatPrice(stats.minVal)}
          </span>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100/80 p-2 rounded-lg text-center flex flex-col">
          <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-tighter">Q1 (25%)</span>
          <span className="text-xs font-mono font-bold text-emerald-900 truncate" title={formatFullPrice(stats.q1)}>
            {formatPrice(stats.q1)}
          </span>
        </div>
        <div className="bg-emerald-100/60 border border-emerald-300/80 p-2 rounded-lg text-center flex flex-col ring-1 ring-emerald-500/20">
          <span className="text-[9px] font-bold text-emerald-900 uppercase tracking-tighter">Median</span>
          <span className="text-xs font-mono font-extrabold text-emerald-950 truncate" title={formatFullPrice(stats.median)}>
            {formatPrice(stats.median)}
          </span>
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100/80 p-2 rounded-lg text-center flex flex-col">
          <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-tighter">Q3 (75%)</span>
          <span className="text-xs font-mono font-bold text-emerald-900 truncate" title={formatFullPrice(stats.q3)}>
            {formatPrice(stats.q3)}
          </span>
        </div>
        <div className="bg-neutral-50 border border-neutral-100 p-2 rounded-lg text-center flex flex-col">
          <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Max</span>
          <span className="text-xs font-mono font-bold text-neutral-800 truncate" title={formatFullPrice(stats.maxVal)}>
            {formatPrice(stats.maxVal)}
          </span>
        </div>
      </div>
    </div>
  );
}

