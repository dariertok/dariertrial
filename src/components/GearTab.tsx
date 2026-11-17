import React, { useState, useEffect } from 'react';
import { WaypointWeather, GearItem, RouteData, TripSettings } from '../types';
import { estimateNutrition } from '../utils/gpxParser';
import { Backpack, CheckSquare, Square, Plus, ShieldCheck } from 'lucide-react';

interface GearTabProps {
  waypoints: WaypointWeather[];
  route: RouteData | null;
  settings: TripSettings;
  realisticDurationMinutes: number | null;
  persistedGearItems: GearItem[];
  onPersistGearItems: (items: GearItem[]) => void;
}

export const GearTab: React.FC<GearTabProps> = ({
  waypoints,
  route,
  settings,
  realisticDurationMinutes,
  persistedGearItems,
  onPersistGearItems,
}) => {
  const minTemp = waypoints.length > 0 ? Math.min(...waypoints.map((w) => w.temperature)) : 15;
  const avgTemp =
    waypoints.length > 0
      ? waypoints.reduce((acc, w) => acc + w.temperature, 0) / waypoints.length
      : 16;
  const maxRain = waypoints.length > 0 ? Math.max(...waypoints.map((w) => w.precipitationProbability)) : 0;
  const maxWind = waypoints.length > 0 ? Math.max(...waypoints.map((w) => w.windGusts || w.windSpeed)) : 10;

  const nutrition = route
    ? estimateNutrition(
        route,
        realisticDurationMinutes ??
          Math.round((route.totalDistance / Math.max(1, settings.speedKmH)) * 60),
        settings.bikeType,
        avgTemp
      )
    : null;

  const buildDefaultGear = (): GearItem[] => [
    {
      id: '1',
      category: 'clothing',
      name: 'Kurtka przeciwdeszczowa / peleryna rowerowa',
      required: maxRain > 30,
      reason: maxRain > 30 ? `Wysoka szansa opadów (${maxRain}%)` : 'Na nagłą zmianę pogody',
      checked: false,
    },
    {
      id: '2',
      category: 'clothing',
      name: 'Bluza termiczna / rękawki i nogawki',
      required: minTemp < 11,
      reason: minTemp < 11 ? `Chłodno na trasie (min. ${Math.round(minTemp)}°C)` : 'Dodatkowy komfort rano',
      checked: false,
    },
    {
      id: '3',
      category: 'clothing',
      name: 'Kamizelka lub kurtka przeciwwiatrowa',
      required: maxWind > 28,
      reason: maxWind > 28 ? `Silne porywy wiatru (${Math.round(maxWind)} km/h)` : 'Ochrona na zjazdach',
      checked: false,
    },
    {
      id: '4',
      category: 'safety',
      name: 'Kask, lampki przód/tył i zestaw naprawczy (dętka, pompka)',
      required: true,
      reason: 'Podstawa bezpiecznej jazdy rowerem',
      checked: true,
    },
    {
      id: '5',
      category: 'tech',
      name: 'Licznik GPS / telefon z uchwytem i powerbank',
      required: true,
      reason: 'Nawigacja po wgranym śladzie GPX',
      checked: true,
    },
    {
      id: '6',
      category: 'nutrition',
      name: nutrition
        ? `${nutrition.bidons750ml}× bidon (ok. ${nutrition.waterLiters} L wody)${
            nutrition.snacksCount > 0 ? ` i ${nutrition.snacksCount} przekąski` : ''
          }`
        : 'Bidony z wodą / izotonikiem i żele lub batony',
      required: true,
      reason: nutrition
        ? `Szacowane zapotrzebowanie ok. ${nutrition.totalKcal} kcal (sprawdź źródła wody na mapie)`
        : 'Nawodnienie i energia na trasę',
      checked: false,
    },
  ];

  const mergeGearWithDefaults = (saved: GearItem[]): GearItem[] => {
    const customItems = saved.filter((item) => Number(item.id) > 1000);
    const refreshedDefaults = buildDefaultGear().map((def) => {
      const existing = saved.find((p) => p.id === def.id);
      return existing ? { ...def, checked: existing.checked } : def;
    });
    return [...refreshedDefaults, ...customItems];
  };

  const [gearList, setGearList] = useState<GearItem[]>(() => mergeGearWithDefaults(persistedGearItems));
  const [newItemName, setNewItemName] = useState('');

  useEffect(() => {
    setGearList(mergeGearWithDefaults(persistedGearItems));
  }, [
    minTemp,
    maxRain,
    maxWind,
    route?.totalDistance,
    settings.bikeType,
    settings.speedKmH,
    realisticDurationMinutes,
    persistedGearItems,
  ]);

  const toggleCheck = (id: string) => {
    const updated = gearList.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item));
    setGearList(updated);
    onPersistGearItems(updated);
  };

  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const newItem: GearItem = {
      id: Date.now().toString(),
      category: 'safety',
      name: newItemName.trim(),
      required: false,
      reason: 'Dodane przez Ciebie',
      checked: false,
    };
    const updated = [...gearList, newItem];
    setGearList(updated);
    onPersistGearItems(updated);
    setNewItemName('');
  };

  const checkedCount = gearList.filter((g) => g.checked).length;
  const progressPercent = Math.round((checkedCount / Math.max(1, gearList.length)) * 100);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header and Progress */}
      <div className="surface-card border border-theme rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Backpack className="w-5 h-5 text-accent" /> Ekwipunek rowerowy na trasę
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Lista automatycznie dopasowana do temperatury ({Math.round(minTemp)}°C), wiatru ({Math.round(maxWind)} km/h) i opadów ({maxRain}%)
            </p>
          </div>
          <div className="flex items-center gap-3 surface-subtle px-4 py-2.5 rounded-xl border border-theme self-start sm:self-auto">
            <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Spakowano</div>
              <div className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                {checkedCount} / {gearList.length} ({progressPercent}%)
              </div>
            </div>
          </div>
        </div>

        <div className="w-full h-2.5 surface-subtle rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Add Custom Item Form */}
      <div className="surface-card border border-theme rounded-2xl p-5 shadow-xs">
        <form onSubmit={addItem} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Dodaj własną rzecz (np. okulary przeciwsłoneczne)..."
            className="flex-1 px-4 py-2.5 surface-subtle border border-theme rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-medium"
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-accent text-white font-semibold rounded-xl text-sm shadow-xs hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Dodaj</span>
          </button>
        </form>
      </div>

      {/* Checklist */}
      <div className="surface-card border border-theme rounded-2xl p-5 sm:p-6 shadow-xs space-y-2.5">
        {gearList.map((item) => (
          <div
            key={item.id}
            onClick={() => toggleCheck(item.id)}
            className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
              item.checked
                ? 'surface-subtle border-theme opacity-75'
                : 'surface-card border-theme hover:border-[var(--accent)]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-accent shrink-0">
                {item.checked ? (
                  <CheckSquare className="w-5 h-5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400" />
                )}
              </span>
              <div className="min-w-0">
                <span
                  className={`block text-sm font-semibold text-slate-900 dark:text-white ${
                    item.checked ? 'line-through text-slate-500 dark:text-slate-400' : ''
                  }`}
                >
                  {item.name}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{item.reason}</span>
              </div>
            </div>
            {item.required && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 shrink-0">
                Zalecane
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
