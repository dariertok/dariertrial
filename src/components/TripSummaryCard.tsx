import React, { useEffect, useState } from 'react';
import {
  DepartureWindowSummary,
  ModelComparisonEntry,
  RouteData,
  SunTimes,
  TripSettings,
  WaypointWeather,
  WeatherProvider,
} from '../types';
import { estimateNutrition, getWindRelation } from '../utils/gpxParser';
import { compareRouteModels } from '../utils/weatherApi';
import {
  CheckCircle2,
  AlertTriangle,
  CloudRain,
  Wind,
  Thermometer,
  Clock,
  Sunset,
  Navigation,
  Droplets,
  Flame,
  ArrowLeftRight,
  GitCompareArrows,
  Loader2,
  Check,
} from 'lucide-react';

interface TripSummaryCardProps {
  route: RouteData;
  settings: TripSettings;
  waypoints: WaypointWeather[];
  sunTimes: SunTimes | null;
  realisticDurationMinutes: number | null;
  departureWindows: DepartureWindowSummary[];
  onSelectDepartureTime: (time: string) => void;
  onReverseRoute: () => void;
  onSelectWeatherProvider: (provider: WeatherProvider) => void;
}

export const TripSummaryCard: React.FC<TripSummaryCardProps> = ({
  route,
  settings,
  waypoints,
  sunTimes,
  realisticDurationMinutes,
  departureWindows,
  onSelectDepartureTime,
  onReverseRoute,
  onSelectWeatherProvider,
}) => {
  const [comparison, setComparison] = useState<ModelComparisonEntry[] | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Reset comparison results when route or departure parameters change
  useEffect(() => {
    setComparison(null);
    setCompareError(null);
  }, [route, settings.departureDate, settings.departureTime, settings.speedKmH, settings.bikeType]);

  if (waypoints.length === 0) return null;

  const temps = waypoints.map((w) => w.temperature);
  const winds = waypoints.map((w) => w.windSpeed);
  const gusts = waypoints.map((w) => w.windGusts);
  const rains = waypoints.map((w) => w.precipitationProbability);

  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
  const maxWind = Math.max(...winds);
  const maxGusts = Math.max(...gusts);
  const maxRain = Math.max(...rains);

  // Wind relation breakdown (forward vs reversed direction)
  const tailwindCount = waypoints.filter((w) => w.windRelation === 'tailwind').length;
  const crosswindCount = waypoints.filter((w) => w.windRelation === 'crosswind').length;
  const tailwindPct = Math.round((tailwindCount / waypoints.length) * 100);
  const crosswindPct = Math.round((crosswindCount / waypoints.length) * 100);
  const headwindPct = Math.max(0, 100 - tailwindPct - crosswindPct);

  const reversedTailwindCount = waypoints.filter(
    (w) => getWindRelation((w.routeBearing + 180) % 360, w.windDirection) === 'tailwind'
  ).length;
  const reversedTailwindPct = Math.round((reversedTailwindCount / waypoints.length) * 100);
  const reverseIsBetter = reversedTailwindPct > tailwindPct + 10;

  // Duration & hydration/nutrition calculation
  const fallbackMins =
    Math.round((route.totalDistance / Math.max(1, settings.speedKmH)) * 60) +
    (settings.breakMinutes || 0);
  const totalMinutes =
    settings.realisticPace && realisticDurationMinutes ? realisticDurationMinutes : fallbackMins;
  const rideOnlyMinutes = Math.max(15, totalMinutes - (settings.breakMinutes || 0));

  const nutrition = estimateNutrition(route, rideOnlyMinutes, settings.bikeType, avgTemp);

  const startDt = new Date(`${settings.departureDate}T${settings.departureTime}:00`);
  const finishDt = new Date(startDt.getTime() + totalMinutes * 60 * 1000);

  const warnings: string[] = [];
  if (sunTimes) {
    const sunsetDt = new Date(sunTimes.sunset);
    const diffMins = (finishDt.getTime() - sunsetDt.getTime()) / 60000;
    if (diffMins > 0) {
      warnings.push(
        `Powrót po zmroku! Meta ok. ${finishDt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}, a zachód słońca o ${sunsetDt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}. Zabierz mocne lampki.`
      );
    } else if (diffMins > -30) {
      warnings.push(
        `Meta tuż przed zachodem słońca (${sunsetDt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}). Warto mieć naładowane oświetlenie.`
      );
    }
  }

  if (maxGusts > 40 || maxWind > 30) {
    warnings.push(
      `Silny wiatr na trasie (do ${Math.round(maxWind)} km/h, porywy ${Math.round(
        maxGusts
      )} km/h). Zachowaj ostrożność na otwartych przestrzeniach.`
    );
  }
  if (maxRain > 40) {
    warnings.push(
      `Wysokie ryzyko opadów (${maxRain}%). Spakuj kurtkę przeciwdeszczową i błotniki.`
    );
  }
  if (minTemp < 6) {
    warnings.push(
      `Niska temperatura na trasie (${Math.round(
        minTemp
      )}°C). Zalecane rękawiczki i warstwa termiczna.`
    );
  }

  const handleCompareModels = async () => {
    setIsComparing(true);
    setCompareError(null);
    try {
      const res = await compareRouteModels(route.points, settings);
      setComparison(res);
    } catch {
      setCompareError('Nie udało się pobrać porównania modeli. Spróbuj ponownie.');
    } finally {
      setIsComparing(false);
    }
  };

  // Consensus calculation for compared models
  let consensusText = '';
  let consensusHigh = true;
  if (comparison && comparison.length >= 2) {
    const maxTemps = comparison.map((c) => c.maxTemp);
    const maxWinds = comparison.map((c) => c.maxWind);
    const maxRains = comparison.map((c) => c.maxRainProb);
    const tempSpread = Math.max(...maxTemps) - Math.min(...maxTemps);
    const windSpread = Math.max(...maxWinds) - Math.min(...maxWinds);
    const rainSpread = Math.max(...maxRains) - Math.min(...maxRains);

    if (tempSpread <= 3 && windSpread <= 8 && rainSpread <= 25) {
      consensusHigh = true;
      consensusText = 'Wysoka zgodność modeli — prognoza jest stabilna.';
    } else {
      consensusHigh = false;
      consensusText = `Rozbieżność modeli (różnica temp. ${tempSpread}°C, wiatr ${windSpread} km/h, opady ${rainSpread}%).`;
    }
  }

  return (
    <div className="space-y-6">
      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Temperatura
            </span>
            <Thermometer className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            {Math.round(minTemp)}° – {Math.round(maxTemp)}°C
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Od startu do mety</p>
        </div>

        <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Wiatr i porywy
            </span>
            <Wind className="w-4 h-4 text-accent" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {Math.round(maxWind)} km/h
            </span>
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
              porywy {Math.round(maxGusts)}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {maxGusts > 40 ? 'Odczuwalny silniejszy wiatr' : 'Warunki wiatrowe w normie'}
          </p>
        </div>

        <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Kierunek względem jazdy
            </span>
            <Navigation className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-center gap-2 text-xs font-bold font-mono tabular-nums mt-1">
            <span className="text-emerald-600 dark:text-emerald-400">{tailwindPct}% plecy</span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="text-amber-600 dark:text-amber-400">{crosswindPct}% bok</span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="text-rose-600 dark:text-rose-400">{headwindPct}% twarz</span>
          </div>
          <div className="w-full h-2 rounded-full overflow-hidden flex mt-2.5 bg-slate-200 dark:bg-slate-800">
            <div style={{ width: `${tailwindPct}%` }} className="bg-emerald-500 h-full" />
            <div style={{ width: `${crosswindPct}%` }} className="bg-amber-500 h-full" />
            <div style={{ width: `${headwindPct}%` }} className="bg-rose-500 h-full" />
          </div>
          {reverseIsBetter && (
            <button
              type="button"
              onClick={onReverseRoute}
              className="mt-2.5 text-[11px] font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeftRight className="w-3 h-3" />
              <span>Odwróć kierunek ({reversedTailwindPct}% z wiatrem)</span>
            </button>
          )}
        </div>

        <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Szansa opadów
            </span>
            <CloudRain className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono tabular-nums">
            {maxRain}%
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {sunTimes
              ? `Zachód słońca: ${new Date(sunTimes.sunset).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : maxRain > 40
              ? 'Zalecana ochrona przed deszczem'
              : 'Niskie ryzyko deszczu'}
          </p>
        </div>
      </div>

      {/* Hydration & Energy Estimator */}
      <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Nawodnienie i energia na trasę
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Wyliczone na podstawie czasu jazdy, temperatury ({Math.round(avgTemp)}°C) i przewyższeń
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-5 font-mono tabular-nums">
          <div className="surface-subtle border border-theme rounded-xl px-3.5 py-2">
            <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">Woda</div>
            <div className="text-sm font-extrabold text-slate-900 dark:text-white">
              {nutrition.waterLiters} L{' '}
              <span className="text-xs font-semibold text-accent">
                ({nutrition.bidons750ml}×750 ml)
              </span>
            </div>
          </div>

          <div className="surface-subtle border border-theme rounded-xl px-3.5 py-2">
            <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-500" /> Energia
            </div>
            <div className="text-sm font-extrabold text-slate-900 dark:text-white">
              ~{nutrition.totalKcal} kcal
            </div>
          </div>

          {nutrition.snacksCount > 0 && (
            <div className="surface-subtle border border-theme rounded-xl px-3.5 py-2">
              <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400">
                Przekąski
              </div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                {nutrition.snacksCount} batony / żele
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3-Model Weather Comparison (Consensus) */}
      <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GitCompareArrows className="w-4 h-4 text-accent" />
              Porównanie 3 modeli pogody naraz (Yr.no · DWD ICON · ECMWF)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sprawdź zgodność niezależnych prognoz dla tej trasy i wybierz najbardziej wiarygodny model
            </p>
          </div>
          <button
            type="button"
            onClick={handleCompareModels}
            disabled={isComparing}
            className="px-4 py-2 bg-accent text-white font-semibold rounded-xl text-xs shadow-xs transition-opacity hover:opacity-95 disabled:opacity-60 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            {isComparing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <GitCompareArrows className="w-3.5 h-3.5" />
            )}
            <span>{isComparing ? 'Porównuję...' : comparison ? 'Odśwież porównanie' : 'Porównaj 3 modele'}</span>
          </button>
        </div>

        {compareError && (
          <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{compareError}</p>
        )}

        {comparison && (
          <div className="space-y-3">
            <div
              className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
                consensusHigh
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200'
              }`}
            >
              {consensusHigh ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{consensusText}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {comparison.map((model) => {
                const isActive = settings.weatherProvider === model.provider;
                return (
                  <button
                    key={model.provider}
                    type="button"
                    onClick={() => onSelectWeatherProvider(model.provider)}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      isActive
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/25 surface-subtle'
                        : 'border-theme hover:border-[var(--accent)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        {model.name}
                        {isActive && <Check className="w-3.5 h-3.5 text-accent" />}
                      </span>
                      <span className="text-lg">{model.weatherIcon}</span>
                    </div>

                    <div className="space-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      <div className="flex justify-between">
                        <span>Temperatura:</span>
                        <strong className="text-slate-900 dark:text-white">
                          {model.minTemp}° – {model.maxTemp}°C
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Wiatr / porywy:</span>
                        <strong className="text-slate-900 dark:text-white">
                          {model.maxWind} / {model.maxGusts} km/h
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Ryzyko opadów:</span>
                        <strong className="text-slate-900 dark:text-white">{model.maxRainProb}%</strong>
                      </div>
                    </div>

                    <div className="mt-2.5 text-[11px] font-semibold text-accent">
                      {isActive ? 'Aktywne źródło na mapie' : 'Kliknij, aby użyć na mapie →'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Departure Time Optimizer ("Kiedy najlepiej wyjechać?") */}
      {departureWindows.length > 0 && (
        <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent" />
                Kiedy najlepiej wyjechać? (porównanie godzin startu)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Kliknij dowolne okno, aby ustawić godzinę startu i odświeżyć trasę
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {departureWindows.map((win) => {
              const isSelected = settings.departureTime === win.time;
              return (
                <button
                  key={win.time}
                  type="button"
                  onClick={() => onSelectDepartureTime(win.time)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                    isSelected
                      ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/25 surface-subtle'
                      : 'border-theme hover:border-[var(--accent)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                      {win.time}
                    </span>
                    <span className="text-lg">{win.weatherIcon}</span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                    <div className="flex justify-between">
                      <span>Temp:</span>
                      <strong className="text-slate-900 dark:text-white">{win.avgTemp}°C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Wiatr:</span>
                      <strong className="text-slate-900 dark:text-white">{win.maxWind} km/h</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Opady:</span>
                      <strong className="text-slate-900 dark:text-white">{win.maxRainProb}%</strong>
                    </div>
                  </div>

                  {win.isBest && (
                    <div className="mt-2.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md text-center">
                      Najlepsze okno
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Warnings / Safety Status */}
      {warnings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {warnings.map((w, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs font-medium"
            >
              {w.includes('zmroku') || w.includes('zachodem') ? (
                <Sunset className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              )}
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            Dobre warunki do jazdy rowerem — brak istotnych ostrzeżeń pogodowych ani jazdy po zmroku.
          </span>
        </div>
      )}
    </div>
  );
};
