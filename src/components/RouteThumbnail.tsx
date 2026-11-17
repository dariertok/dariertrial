import React, { useMemo } from 'react';
import { RouteData } from '../types';
import { MapPin } from 'lucide-react';

interface RouteThumbnailProps {
  route: RouteData;
  className?: string;
}

const VIEW_W = 144;
const VIEW_H = 104;
const PADDING = 14;

export const RouteThumbnail: React.FC<RouteThumbnailProps> = ({ route, className = '' }) => {
  const geometry = useMemo(() => {
    const pts = route.points;
    if (!pts || pts.length === 0) return null;

    // Downsample very dense GPX tracks for crisp, fast SVG rendering
    const maxSamples = 140;
    const step = pts.length > maxSamples ? Math.ceil(pts.length / maxSamples) : 1;
    const sampled = pts.filter((_, idx) => idx === 0 || idx === pts.length - 1 || idx % step === 0);

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    for (const p of sampled) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }

    const avgLat = (minLat + maxLat) / 2;
    const cosLat = Math.max(0.2, Math.cos((avgLat * Math.PI) / 180));

    const rawW = (maxLon - minLon) * cosLat;
    const rawH = maxLat - minLat;

    const drawW = VIEW_W - PADDING * 2;
    const drawH = VIEW_H - PADDING * 2;

    let coords: { x: number; y: number }[];
    if (rawW < 1e-6 && rawH < 1e-6) {
      coords = sampled.map(() => ({ x: VIEW_W / 2, y: VIEW_H / 2 }));
    } else {
      const safeW = Math.max(rawW, 1e-5);
      const safeH = Math.max(rawH, 1e-5);
      const scale = Math.min(drawW / safeW, drawH / safeH);
      const renderedW = safeW * scale;
      const renderedH = safeH * scale;
      const offsetX = PADDING + (drawW - renderedW) / 2;
      const offsetY = PADDING + (drawH - renderedH) / 2;

      coords = sampled.map((p) => ({
        x: offsetX + ((p.lon - minLon) * cosLat) * scale,
        y: offsetY + (maxLat - p.lat) * scale,
      }));
    }

    const pathData = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');

    const start = coords[0];
    const end = coords[coords.length - 1];
    const isLoop =
      coords.length > 2 && Math.hypot(start.x - end.x, start.y - end.y) < 7;

    return { pathData, start, end, isLoop };
  }, [route.points]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl surface-subtle border border-theme select-none flex items-center justify-center ${className}`}
      aria-hidden="true"
    >
      {geometry ? (
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-full block"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Subtle cartographic grid */}
          <g className="stroke-slate-300/60 dark:stroke-slate-700/60" strokeWidth="0.75">
            <line x1="0" y1="26" x2={VIEW_W} y2="26" />
            <line x1="0" y1="52" x2={VIEW_W} y2="52" />
            <line x1="0" y1="78" x2={VIEW_W} y2="78" />
            <line x1="36" y1="0" x2="36" y2={VIEW_H} />
            <line x1="72" y1="0" x2="72" y2={VIEW_H} />
            <line x1="108" y1="0" x2="108" y2={VIEW_H} />
          </g>

          {/* Soft route halo */}
          <path
            d={geometry.pathData}
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.22"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Main GPX track */}
          <path
            d={geometry.pathData}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Finish marker (drawn first if loop so start ring remains visible) */}
          {!geometry.isLoop && (
            <circle
              cx={geometry.end.x}
              cy={geometry.end.y}
              r="4"
              fill="#f43f5e"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          )}

          {/* Start marker */}
          <circle
            cx={geometry.start.x}
            cy={geometry.start.y}
            r={geometry.isLoop ? 4.6 : 4}
            fill="#10b981"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
        </svg>
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
          <MapPin className="w-5 h-5" />
        </div>
      )}
    </div>
  );
};
