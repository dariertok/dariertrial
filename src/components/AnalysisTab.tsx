import React, { useEffect, useMemo, useState } from 'react';
import {
  AirQualitySummary,
  AiRouteAnalysis,
  RouteData,
  SunTimes,
  TripSettings,
  WaypointWeather,
  WeekdayForecastSummary,
} from '../types';
import {
  askAiRouteQuestion,
  buildAiPayload,
  detectRouteClimbs,
  fetchRouteAirQuality,
  fetchWeekForecast,
  requestAiRouteAnalysis,
} from '../utils/analysisApi';
import {
  Sparkles,
  Wind,
  Sun,
  Mountain,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Loader2,
  Send,
  ShieldAlert,
  Shirt,
  TrendingUp,
} from 'lucide-react';

interface AnalysisTabProps {
  route: RouteData;
  settings: TripSettings;
  waypoints: WaypointWeather[];
  sunTimes: SunTimes | null;
  realisticDurationMinutes: number | null;
  onSelectDepartureDate: (date: string) => void;
  onJumpToMapDistance: (km: number) => void;
}

export const AnalysisTab: React.FC<AnalysisTabProps> = ({
  route,
  settings,
  waypoints,
  sunTimes,
  realisticDurationMinutes,
  onSelectDepartureDate,
  onJumpToMapDistance,
}) => {
  const [airQuality, setAirQuality] = useState<AirQualitySummary | null>(null);
  const [aqLoading, setAqLoading] = useState(false);

  const [weekDays, setWeekDays] = useState<WeekdayForecastSummary[]>([]);
  const [weekLoading, setWeekLoading] = useState(false);

  const [aiAnalysis, setAiAnalysis] = useState<AiRouteAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [question, setQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState<string | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  const climbs = useMemo(
    () => detectRouteClimbs(route.points, waypoints),
    [route.points, waypoints]
  );

  // Fetch Air Quality & UV for the route
  useEffect(() => {
    if (waypoints.length === 0) return;
    let active = true;
    setAqLoading(true);
    fetchRouteAirQuality(waypoints)
      .then((res) => {
        if (active) setAirQuality(res);
      })
      .catch(() => {
        if (active) setAirQuality(null);
      })
      .finally(() => {
        if (active) setAqLoading(false);
      });
    return () => {
      active = false;
    };
  }, [waypoints]);

  // Fetch 7-day comparison for the route
  useEffect(() => {
    if (route.points.length < 2) return;
    let active = true;
    setWeekLoading(true);
    fetchWeekForecast(route.points, settings)
      .then((res) => {
        if (active) setWeekDays(res);
      })
      .catch(() => {
        if (active) setWeekDays([]);
      })
      .finally(() => {
        if (active) setWeekLoading(false);
      });
    return () => {
      active = false;
    };
  }, [route, settings.departureTime, settings.speedKmH]);

  // Reset AI analysis when route or key trip parameters change
  useEffect(() => {
    setAiAnalysis(null);
    setAiError(null);
    setQaAnswer(null);
    setQaError(null);
  }, [route, settings.departureDate, settings.departureTime, settings.bikeType, settings.speedKmH]);

  const handleRunAiAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const payload = buildAiPayload(
        route,
        settings,
        waypoints,
        climbs,
        airQuality,
        sunTimes,
        realisticDurationMinutes
      );
      const result = await requestAiRouteAnalysis(payload);
      setAiAnalysis(result);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Nie udało się wygenerować analizy AI.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAskQuestion = async (customQ?: string) => {
    const q = (customQ ?? question).trim();
    if (!q) return;
    if (customQ) setQuestion(customQ);
    setQaLoading(true);
    setQaError(null);
    try {
      const payload = buildAiPayload(
        route,
        settings,
        waypoints,
        climbs,
        airQuality,
        sunTimes,
        realisticDurationMinutes
      );
      const answer = await askAiRouteQuestion(q, payload);
      setQaAnswer(answer);
    } catch (err: unknown) {
      setQaError(err instanceof Error ? err.message : 'Błąd odpowiedzi AI.');
    } finally {
      setQaLoading(false);
    }
  };

  const getCategoryStyle = (cat: string) => {
    if (cat === 'Bardzo trudny') {
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
    }
    if (cat === 'Trudny') {
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300';
    }
    if (cat === 'Średni') {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
    }
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
  };

  return (
    <div className="space-y-6">
      {/* 1. AI Route & Weather Analysis */}
      <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl accent-gradient text-white flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Analiza AI trasy i pogody
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inteligentna ocena wiatru, podjazdów, ubioru oraz jakości powietrza dla {route.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunAiAnalysis}
            disabled={aiLoading || waypoints.length === 0}
            className="px-5 py-2.5 bg-accent text-white font-semibold rounded-xl text-xs shadow-sm hover:opacity-95 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            {aiLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{aiLoading ? 'Analizuję trasę...' : aiAnalysis ? 'Odśwież analizę AI' : 'Analizuj trasę z AI'}</span>
          </button>
        </div>

        {aiError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs font-medium">
            {aiError}
          </div>
        )}

        {aiAnalysis && (
          <div className="space-y-4">
            <div className="surface-subtle border border-theme rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-14 h-14 rounded-2xl accent-gradient text-white flex flex-col items-center justify-center shadow-sm font-mono">
                  <span className="text-lg font-extrabold leading-none">
                    {aiAnalysis.readinessScore}
                  </span>
                  <span className="text-[10px] opacity-85">/ 100</span>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    Ocena warunków
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {aiAnalysis.overallVerdict}
                  </div>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed sm:border-l border-theme sm:pl-4">
                {aiAnalysis.summary}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="surface-subtle border border-theme rounded-2xl p-4 space-y-1.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-accent" /> Strategia podjazdów
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {aiAnalysis.climbStrategy}
                </p>
              </div>

              <div className="surface-subtle border border-theme rounded-2xl p-4 space-y-1.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Shirt className="w-4 h-4 text-accent" /> Ubiór i sprzęt
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {aiAnalysis.clothingAdvice}
                </p>
              </div>

              <div className="surface-subtle border border-theme rounded-2xl p-4 space-y-1.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-500" /> Bezpieczeństwo
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {aiAnalysis.safetyNote}
                </p>
              </div>
            </div>

            {aiAnalysis.tacticalTips?.length > 0 && (
              <div className="surface-subtle border border-theme rounded-2xl p-4 space-y-2">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Kluczowe wskazówki na trasę
                </div>
                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {aiAnalysis.tacticalTips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Quick AI Q&A about this route */}
        <div className="pt-3 border-t border-theme space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Szybkie pytania:
            </span>
            {[
              'Czy warto jechać w krótkim rękawku?',
              'Gdzie będzie najbardziej wiało?',
              'Jak rozłożyć siły na tej trasie?',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleAskQuestion(preset)}
                disabled={qaLoading || waypoints.length === 0}
                className="px-2.5 py-1 surface-subtle border border-theme rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-[var(--accent)] cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskQuestion();
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Zadaj własne pytanie o pogodę lub taktykę na tej trasie..."
              className="flex-1 px-4 py-2.5 surface-subtle border border-theme rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={qaLoading || !question.trim() || waypoints.length === 0}
              className="px-4 py-2.5 bg-accent text-white font-semibold rounded-xl text-xs shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {qaLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Zapytaj AI</span>
            </button>
          </form>

          {qaError && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{qaError}</p>
          )}
          {qaAnswer && (
            <div className="p-4 rounded-xl surface-subtle border border-theme text-xs sm:text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
              {qaAnswer}
            </div>
          )}
        </div>
      </div>

      {/* 2. Air Quality (Smog) & UV Index */}
      <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wind className="w-4 h-4 text-accent" /> Jakość powietrza (smog) i indeks UV
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dane z Open-Meteo Air Quality dla godzin przejazdu przez trasę
            </p>
          </div>
          {aqLoading && (
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sprawdzam...
            </span>
          )}
        </div>

        {airQuality ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="surface-subtle border border-theme rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Ocena EAQI</div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                {airQuality.maxAqi} EAQI
              </div>
              <span
                className={`inline-block mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                  airQuality.ratingTone === 'good'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : airQuality.ratingTone === 'moderate'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                }`}
              >
                {airQuality.ratingLabel}
              </span>
            </div>

            <div className="surface-subtle border border-theme rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Pył PM2.5 (maks.)</div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                {airQuality.maxPm25} <span className="text-xs font-normal">µg/m³</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {airQuality.maxPm25 > 25 ? 'Podwyższony pył zawieszony' : 'Norma WHO w porządku'}
              </p>
            </div>

            <div className="surface-subtle border border-theme rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Pył PM10 (maks.)</div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                {airQuality.maxPm10} <span className="text-xs font-normal">µg/m³</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {airQuality.maxPm10 > 45 ? 'Unikaj mocnego wysiłku w miastach' : 'Czyste powietrze'}
              </p>
            </div>

            <div className="surface-subtle border border-theme rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Sun className="w-3.5 h-3.5 text-amber-500" /> Indeks UV
              </div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                {airQuality.maxUv}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {airQuality.maxUv >= 5
                  ? 'Wysokie UV — krem z filtrem i okulary'
                  : airQuality.maxUv >= 3
                  ? 'Umiarkowane UV — przydadzą się okulary'
                  : 'Niskie promieniowanie UV'}
              </p>
            </div>
          </div>
        ) : (
          !aqLoading && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dane jakości powietrza są dostępne dla prognoz do 5 dni naprzód.
            </p>
          )
        )}
      </div>

      {/* 3. Detected Climbs & Descent Weather */}
      <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mountain className="w-4 h-4 text-accent" />
            Wykryte podjazdy na trasie ({climbs.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automatyczne wykrywanie głównych wzniesień wraz z nachyleniem i pogodą na szczycie
          </p>
        </div>

        {climbs.length === 0 ? (
          <div className="surface-subtle border border-theme rounded-xl p-4 text-xs text-slate-600 dark:text-slate-300">
            Trasa ma płaski lub łagodnie pofalowany profil — nie wykryto stromych podjazdów powyżej 22 m przewyższenia.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {climbs.map((climb, idx) => (
              <div
                key={climb.id}
                className="surface-subtle border border-theme rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Podjazd #{idx + 1}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${getCategoryStyle(climb.category)}`}>
                        {climb.category}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
                      Km {climb.startKm} → {climb.endKm} ({climb.lengthKm} km) · Szczyt {climb.summitElevationM} m n.p.m.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onJumpToMapDistance(climb.startKm)}
                    className="px-2.5 py-1 rounded-lg bg-accent-soft text-accent text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <MapPin className="w-3 h-3" /> Mapa
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
                  <span>
                    Przewyższenie: <strong className="text-slate-900 dark:text-white">+{climb.elevationGainM} m</strong>
                  </span>
                  <span>
                    Śr.: <strong className="text-accent">{climb.avgSlopePct}%</strong>
                  </span>
                  <span>
                    Maks.: <strong className="text-rose-600 dark:text-rose-400">{climb.maxSlopePct}%</strong>
                  </span>
                </div>

                {climb.summitWeather && (
                  <div className="pt-2 border-t border-theme flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <span>
                      Na szczycie: {climb.summitWeather.weatherIcon}{' '}
                      <strong>{Math.round(climb.summitWeather.temperature)}°C</strong> · wiatr{' '}
                      <strong>{Math.round(climb.summitWeather.windSpeed)} km/h</strong> (porywy{' '}
                      {Math.round(climb.summitWeather.windGusts)})
                    </span>
                    {climb.summitWeather.precipitationProbability > 30 && (
                      <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Mokry zjazd ({climb.summitWeather.precipitationProbability}%)
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. 7-Day Comparison ("Sobota czy niedziela?") */}
      <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-accent" />
              Porównanie najbliższych 7 dni („Sobota czy niedziela?”)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Kliknij wybrany dzień, aby przełączyć datę wyjazdu (start o {settings.departureTime})
            </p>
          </div>
          {weekLoading && (
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Ładuję dni...
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const isSelected = settings.departureDate === day.date;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => onSelectDepartureDate(day.date)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/25 surface-subtle'
                    : 'border-theme hover:border-[var(--accent)]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {day.weekdayLabel}
                    </span>
                    <span className="text-lg">{day.weatherIcon}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mb-2.5">{day.date}</div>

                  <div className="space-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>Temp:</span>
                      <strong className="text-slate-900 dark:text-white">{day.avgTemp}°C</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Wiatr:</span>
                      <strong className="text-slate-900 dark:text-white">{day.maxWind} km/h</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Opady:</span>
                      <strong className="text-slate-900 dark:text-white">{day.maxRainProb}%</strong>
                    </div>
                  </div>
                </div>

                {day.isBest && (
                  <div className="mt-2.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md text-center">
                    Najlepszy dzień
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
