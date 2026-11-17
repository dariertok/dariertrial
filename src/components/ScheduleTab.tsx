import React, { useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ColorTheme, RouteData, TripSettings, WaypointWeather, WindRelation } from '../types';
import { COLOR_THEMES, getTempColor, getWindColor } from '../utils/themes';
import { getBikeTypeConfig } from '../utils/gpxParser';
import {
  Mountain,
  TrendingUp,
  Flame,
  Activity,
  Download,
  Clock,
  Droplets,
  Navigation,
  MapPin,
} from 'lucide-react';

type ChartOverlay = 'none' | 'temp' | 'wind' | 'rain';

interface ScheduleTabProps {
  route: RouteData;
  settings: TripSettings;
  waypoints: WaypointWeather[];
  colorTheme: ColorTheme;
  onJumpToMapDistance: (km: number) => void;
}

function getWindRelationBadge(rel: WindRelation) {
  if (rel === 'tailwind') {
    return { label: 'W plecy', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' };
  }
  if (rel === 'headwind') {
    return { label: 'Pod wiatr', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' };
  }
  return { label: 'Boczny', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' };
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  route,
  settings,
  waypoints,
  colorTheme,
  onJumpToMapDistance,
}) => {
  const [overlay, setOverlay] = useState<ChartOverlay>('temp');
  const palette = COLOR_THEMES[colorTheme] || COLOR_THEMES.sky;

  const findNearestWeather = (distKm: number): WaypointWeather | null => {
    if (waypoints.length === 0) return null;
    let best = waypoints[0];
    let bestDiff = Math.abs(best.point.distanceFromStart - distKm);
    for (const wp of waypoints) {
      const diff = Math.abs(wp.point.distanceFromStart - distKm);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = wp;
      }
    }
    return best;
  };

  const chartData = route.points.map((p, idx, arr) => {
    let slope = 0;
    if (idx > 0) {
      const prev = arr[idx - 1];
      const distDiff = (p.distanceFromStart - prev.distanceFromStart) * 1000;
      const eleDiff = p.elevation - prev.elevation;
      if (distDiff > 0) {
        slope = Math.round((eleDiff / distDiff) * 100);
      }
    }
    const wp = findNearestWeather(p.distanceFromStart);
    return {
      distance: Number(p.distanceFromStart.toFixed(2)),
      elevation: Math.round(p.elevation),
      slope,
      temperature: wp ? Math.round(wp.temperature) : null,
      windSpeed: wp ? Math.round(wp.windSpeed) : null,
      rainProb: wp ? wp.precipitationProbability : null,
    };
  });

  const bikeConfig = getBikeTypeConfig(settings.bikeType);
  const rideHours = route.totalDistance / Math.max(1, settings.speedKmH);
  const totalCalories = Math.round(rideHours * bikeConfig.kcalPerHour + route.elevationGain * 0.75);
  const maxSlope = Math.max(...chartData.map((d) => d.slope), 0);

  let difficulty = 'Łatwa';
  let diffStyle = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
  if (route.elevationGain > 600 || route.totalDistance > 30) {
    difficulty = 'Średnia';
    diffStyle = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
  }
  if (route.elevationGain > 1200 || route.totalDistance > 60) {
    difficulty = 'Wymagająca';
    diffStyle = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
  }

  const handleExportCSV = () => {
    const csvContent = [
      [
        'Km',
        'Czas',
        'Wysokosc(m)',
        'Temp(C)',
        'Wiatr(km/h)',
        'Porywy(km/h)',
        'RelacjaWiatru',
        'Opady(%)',
        'Opis',
      ],
      ...waypoints.map((w) => [
        w.point.distanceFromStart.toFixed(2),
        w.point.estimatedTime ? w.point.estimatedTime.toLocaleTimeString() : '',
        Math.round(w.point.elevation),
        Math.round(w.temperature),
        Math.round(w.windSpeed),
        Math.round(w.windGusts),
        w.windRelation,
        w.precipitationProbability,
        w.weatherDescription,
      ]),
    ]
      .map((e) => e.join(';'))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${route.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_harmonogram.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const overlayConfig = {
    none: { label: 'Sama wysokość', key: '', color: palette.primary, unit: '' },
    temp: { label: '+ Temperatura', key: 'temperature', color: '#f59e0b', unit: '°C' },
    wind: { label: '+ Wiatr', key: 'windSpeed', color: '#10b981', unit: ' km/h' },
    rain: { label: '+ Opady', key: 'rainProb', color: '#3b82f6', unit: '%' },
  }[overlay];

  return (
    <div className="space-y-6">
      {/* 4 Key Ride Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Trudność trasy</span>
            <Mountain className="w-4 h-4 text-accent" />
          </div>
          <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${diffStyle}`}>
            {difficulty}
          </span>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-mono">
            {route.minElevation}m – {route.maxElevation}m n.p.m.
          </p>
        </div>

        <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Suma podjazdów</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            +{route.elevationGain} m
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Zjazdy: -{route.elevationLoss} m
          </p>
        </div>

        <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Spalone kalorie</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            ~{totalCalories} kcal
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {bikeConfig.label} · {settings.speedKmH} km/h
          </p>
        </div>

        <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Maks. nachylenie</span>
            <Activity className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            {maxSlope}%
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Najbardziej stromy podjazd
          </p>
        </div>
      </div>

      {/* Elevation + Weather Overlay Chart */}
      <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Profil wysokościowy i przebieg pogody
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kliknij punkt na wykresie lub w tabeli, aby wskazać go bezpośrednio na mapie
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 surface-subtle p-1 rounded-xl border border-theme self-start sm:self-auto">
            {(['none', 'temp', 'wind', 'rain'] as ChartOverlay[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setOverlay(mode)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  overlay === mode
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {mode === 'none'
                  ? 'Wysokość'
                  : mode === 'temp'
                  ? '+ Temp.'
                  : mode === 'wind'
                  ? '+ Wiatr'
                  : '+ Opady'}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
              onClick={(state: any) => {
                if (state && state.activeLabel !== undefined) {
                  onJumpToMapDistance(Number(state.activeLabel));
                }
              }}
            >
              <defs>
                <linearGradient id="elevationGradTheme" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={palette.primary} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={palette.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="distance" unit=" km" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis yAxisId="left" unit=" m" stroke="#94a3b8" fontSize={11} tickLine={false} />
              {overlay !== 'none' && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  unit={overlayConfig.unit}
                  stroke={overlayConfig.color}
                  fontSize={11}
                  tickLine={false}
                />
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg text-xs space-y-1">
                        <p className="font-semibold font-mono">Dystans: {data.distance} km</p>
                        <p>
                          Wysokość: <strong className="font-mono">{data.elevation} m n.p.m.</strong> ({data.slope}%)
                        </p>
                        {data.temperature !== null && (
                          <p>
                            Pogoda: <strong className="font-mono">{data.temperature}°C</strong> · Wiatr{' '}
                            <strong className="font-mono">{data.windSpeed} km/h</strong> · Opady{' '}
                            <strong className="font-mono">{data.rainProb}%</strong>
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="elevation"
                stroke={palette.primary}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#elevationGradTheme)"
              />
              {overlay !== 'none' && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey={overlayConfig.key}
                  stroke={overlayConfig.color}
                  strokeWidth={2.5}
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weather Checkpoint Schedule Table */}
      <div className="surface-card border border-theme rounded-2xl overflow-hidden shadow-xs">
        <div className="p-5 sm:p-6 border-b border-theme flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Harmonogram pogody punkt po punkcie
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Prognoza dla dokładnej godziny przejazdu z uwzględnieniem postojów
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2 bg-accent text-white font-semibold rounded-xl text-xs shadow-xs transition-opacity hover:opacity-95 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Pobierz CSV</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="surface-subtle text-slate-500 dark:text-slate-400 text-xs font-semibold border-b border-theme">
                <th className="py-3 px-4 sm:px-5">Km</th>
                <th className="py-3 px-4 sm:px-5">Godzina</th>
                <th className="py-3 px-4 sm:px-5">Wysokość</th>
                <th className="py-3 px-4 sm:px-5">Pogoda</th>
                <th className="py-3 px-4 sm:px-5">Temp.</th>
                <th className="py-3 px-4 sm:px-5">Wiatr / Kierunek</th>
                <th className="py-3 px-4 sm:px-5">Opady</th>
                <th className="py-3 px-4 sm:px-5 text-right">Mapa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs sm:text-sm">
              {waypoints.map((w, idx) => {
                const tempCol = getTempColor(w.temperature);
                const windCol = getWindColor(w.windSpeed);
                const relBadge = getWindRelationBadge(w.windRelation);
                return (
                  <tr
                    key={idx}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 sm:px-5 font-bold text-slate-900 dark:text-white font-mono tabular-nums whitespace-nowrap">
                      {w.point.distanceFromStart.toFixed(1)} km
                    </td>
                    <td className="py-3.5 px-4 sm:px-5 text-slate-700 dark:text-slate-300 font-mono tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-accent" />
                        {w.point.estimatedTime
                          ? w.point.estimatedTime.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 sm:px-5 text-slate-600 dark:text-slate-300 font-mono tabular-nums whitespace-nowrap">
                      {Math.round(w.point.elevation)} m
                    </td>
                    <td className="py-3.5 px-4 sm:px-5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                        <span className="text-lg">{w.weatherIcon}</span>
                        <span>{w.weatherDescription}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 sm:px-5 whitespace-nowrap">
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono tabular-nums"
                        style={{ backgroundColor: tempCol.bg, color: tempCol.text }}
                      >
                        {Math.round(w.temperature)}°C
                      </span>
                    </td>
                    <td className="py-3.5 px-4 sm:px-5 whitespace-nowrap">
                      <div className="inline-flex items-center gap-2 font-mono tabular-nums">
                        <Navigation
                          className="w-3.5 h-3.5 shrink-0"
                          style={{
                            transform: `rotate(${w.windDirection}deg)`,
                            color: windCol.text,
                          }}
                        />
                        <span className="font-bold text-slate-900 dark:text-white">
                          {Math.round(w.windSpeed)}/{Math.round(w.windGusts)} km/h
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-sans ${relBadge.cls}`}>
                          {relBadge.label}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-5 text-slate-600 dark:text-slate-300 font-mono tabular-nums whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Droplets className="w-3.5 h-3.5 text-sky-500" />
                        {w.precipitationProbability}% · {w.precipitation || 0} mm
                      </span>
                    </td>
                    <td className="py-3.5 px-4 sm:px-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onJumpToMapDistance(w.point.distanceFromStart)}
                        className="px-2.5 py-1.5 rounded-lg bg-accent-soft text-accent text-xs font-bold hover:opacity-90 inline-flex items-center gap-1 cursor-pointer"
                        title="Pokaż na mapie"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Pokaż</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
