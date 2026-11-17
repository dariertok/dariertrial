import React from 'react';
import { BikeType, TripSettings, RouteData, SunTimes } from '../types';
import { BIKE_TYPES, getBikeTypeConfig } from '../utils/gpxParser';
import { getWeatherProviderInfo } from '../utils/weatherApi';
import {
  Calendar,
  Clock,
  Bike,
  RefreshCw,
  BookmarkPlus,
  Check,
  ArrowLeftRight,
  Repeat,
  Coffee,
  PenTool,
  Sunrise,
  Sunset,
  CloudSun,
  Gauge,
} from 'lucide-react';

interface TripControlsProps {
  route: RouteData;
  settings: TripSettings;
  sunTimes: SunTimes | null;
  realisticDurationMinutes: number | null;
  flatDurationMinutes: number | null;
  isDrawingMode: boolean;
  onToggleDrawingMode: () => void;
  onUpdateSettings: (settings: TripSettings) => void;
  onCalculate: () => void;
  onReverseRoute: () => void;
  onMakeRoundTrip: () => void;
  onQuickSave: () => void;
  onOpenOptions: () => void;
  isSavedFeedback: boolean;
  isLoading: boolean;
}

export const TripControls: React.FC<TripControlsProps> = ({
  route,
  settings,
  sunTimes,
  realisticDurationMinutes,
  flatDurationMinutes,
  isDrawingMode,
  onToggleDrawingMode,
  onUpdateSettings,
  onCalculate,
  onReverseRoute,
  onMakeRoundTrip,
  onQuickSave,
  onOpenOptions,
  isSavedFeedback,
  isLoading,
}) => {
  const providerInfo = getWeatherProviderInfo(settings.weatherProvider);
  const bikeConfig = getBikeTypeConfig(settings.bikeType);

  const fallbackFlatMins =
    Math.round((route.totalDistance / Math.max(1, settings.speedKmH)) * 60) +
    (settings.breakMinutes || 0);
  const activeTotalMinutes =
    settings.realisticPace && realisticDurationMinutes
      ? realisticDurationMinutes
      : flatDurationMinutes ?? fallbackFlatMins;
  const flatMinsDisplay = flatDurationMinutes ?? fallbackFlatMins;

  const hours = Math.floor(activeTotalMinutes / 60);
  const minutes = activeTotalMinutes % 60;

  const baseStart = new Date(`${settings.departureDate}T${settings.departureTime}:00`);
  const finishTime = new Date(baseStart.getTime() + activeTotalMinutes * 60 * 1000);
  const finishStr = finishTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const sunriseStr = sunTimes
    ? new Date(sunTimes.sunrise).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const sunsetStr = sunTimes
    ? new Date(sunTimes.sunset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  const isAlreadyRoundTrip = route.name.includes('(Tam i z powrotem)');

  return (
    <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs mb-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bike className="w-5 h-5 text-accent shrink-0" />
            <span className="truncate">{route.name}</span>
          </h2>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
            <span>
              Dystans:{' '}
              <strong className="text-slate-900 dark:text-white">{route.totalDistance} km</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Podjazdy:{' '}
              <strong className="text-slate-900 dark:text-white">+{route.elevationGain}m</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Czas:{' '}
              <strong className="text-accent">
                {hours}h {minutes}m
              </strong>{' '}
              (meta ~{finishStr})
              {settings.realisticPace && Math.abs(activeTotalMinutes - flatMinsDisplay) >= 3 && (
                <span className="text-[11px] text-slate-400 ml-1">
                  (płasko {Math.floor(flatMinsDisplay / 60)}h {flatMinsDisplay % 60}m)
                </span>
              )}
            </span>
            {sunriseStr && sunsetStr && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Sunrise className="w-3.5 h-3.5 text-amber-500" /> {sunriseStr}
                  <span aria-hidden="true">/</span>
                  <Sunset className="w-3.5 h-3.5 text-orange-500" /> {sunsetStr}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenOptions}
              className="inline-flex items-center gap-1 font-sans font-semibold text-accent hover:underline cursor-pointer"
              title="Kliknij, aby zmienić dostawcę prognozy pogody"
            >
              <CloudSun className="w-3.5 h-3.5" />
              <span>{providerInfo.name}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleDrawingMode}
            className={`px-3.5 py-2 border rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              isDrawingMode
                ? 'bg-accent text-white border-transparent shadow-xs'
                : 'surface-subtle border-theme text-slate-700 dark:text-slate-200 hover:opacity-90'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>{isDrawingMode ? 'Zakończ rysowanie' : 'Ustaw własną trasę'}</span>
          </button>

          <button
            type="button"
            onClick={onReverseRoute}
            className="px-3.5 py-2 surface-subtle border border-theme rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
            title="Odwróć kierunek jazdy (start ↔ meta)"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-accent" />
            <span>Odwróć</span>
          </button>

          {!isAlreadyRoundTrip && (
            <button
              type="button"
              onClick={onMakeRoundTrip}
              className="px-3.5 py-2 surface-subtle border border-theme rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
              title="Wydłuż trasę o drogę powrotną tym samym śladem"
            >
              <Repeat className="w-3.5 h-3.5 text-accent" />
              <span>Tam i z powrotem</span>
            </button>
          )}

          <button
            type="button"
            onClick={onQuickSave}
            className="px-3.5 py-2 surface-subtle border border-theme rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
          >
            {isSavedFeedback ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-600 dark:text-emerald-400">Zapisano</span>
              </>
            ) : (
              <>
                <BookmarkPlus className="w-3.5 h-3.5 text-accent" />
                <span>Zapisz trasę</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Parameters Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 items-end">
        {/* Departure Date */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-accent" /> Data wyjazdu
          </label>
          <input
            type="date"
            value={settings.departureDate}
            onChange={(e) => onUpdateSettings({ ...settings, departureDate: e.target.value })}
            className="w-full px-3 py-2.5 surface-subtle border border-theme rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        {/* Departure Time */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-accent" /> Godzina startu
          </label>
          <input
            type="time"
            value={settings.departureTime}
            onChange={(e) => onUpdateSettings({ ...settings, departureTime: e.target.value })}
            className="w-full px-3 py-2.5 surface-subtle border border-theme rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] tabular-nums"
          />
        </div>

        {/* Bike Type */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Bike className="w-3.5 h-3.5 text-accent" /> Rodzaj roweru
          </label>
          <select
            value={settings.bikeType}
            onChange={(e) => {
              const bikeType = e.target.value as BikeType;
              const cfg = getBikeTypeConfig(bikeType);
              onUpdateSettings({
                ...settings,
                bikeType,
                speedKmH: cfg.defaultSpeedKmH,
              });
            }}
            className="w-full px-3 py-2.5 surface-subtle border border-theme rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            {BIKE_TYPES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} (dom. {b.defaultSpeedKmH} km/h)
              </option>
            ))}
          </select>
        </div>

        {/* Rest / Break time */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Coffee className="w-3.5 h-3.5 text-accent" /> Przerwa na trasie
          </label>
          <select
            value={settings.breakMinutes}
            onChange={(e) =>
              onUpdateSettings({ ...settings, breakMinutes: Number(e.target.value) })
            }
            className="w-full px-3 py-2.5 surface-subtle border border-theme rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <option value={0}>Bez postojów (0 min)</option>
            <option value={15}>Krótka przerwa (15 min)</option>
            <option value={30}>Postój na kawę (30 min)</option>
            <option value={60}>Obiad / odpoczynek (60 min)</option>
          </select>
        </div>

        {/* Action button */}
        <div>
          <button
            type="button"
            onClick={onCalculate}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-accent text-white font-semibold rounded-xl text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Aktualizuję...' : 'Odśwież pogodę'}</span>
          </button>
        </div>
      </div>

      {/* Dedicated Speed Slider for Selected Bike Type + Realistic Pace Toggle */}
      <div className="pt-3.5 border-t border-theme flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap">
            <Gauge className="w-3.5 h-3.5 text-accent" />
            Prędkość ({bikeConfig.label}):
          </span>
          <input
            type="range"
            min={bikeConfig.minSpeedKmH}
            max={bikeConfig.maxSpeedKmH}
            step="1"
            value={settings.speedKmH}
            onChange={(e) => onUpdateSettings({ ...settings, speedKmH: Number(e.target.value) })}
            className="flex-1 cursor-pointer max-w-xs"
            style={{ accentColor: 'var(--accent)' }}
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  speedKmH: Math.max(8, settings.speedKmH - 1),
                })
              }
              className="w-7 h-7 rounded-lg surface-subtle border border-theme text-xs font-bold text-slate-700 dark:text-slate-200 hover:opacity-80 cursor-pointer"
              aria-label="Zmniejsz prędkość"
            >
              −
            </button>
            <span className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums w-16 text-center">
              {settings.speedKmH} km/h
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  speedKmH: Math.min(45, settings.speedKmH + 1),
                })
              }
              className="w-7 h-7 rounded-lg surface-subtle border border-theme text-xs font-bold text-slate-700 dark:text-slate-200 hover:opacity-80 cursor-pointer"
              aria-label="Zwiększ prędkość"
            >
              +
            </button>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.realisticPace}
            onChange={(e) =>
              onUpdateSettings({ ...settings, realisticPace: e.target.checked })
            }
            style={{ accentColor: 'var(--accent)' }}
            className="w-4 h-4 rounded cursor-pointer"
          />
          <span>Realistyczne tempo (uwzględnij podjazdy i wiatr)</span>
        </label>
      </div>
    </div>
  );
};
