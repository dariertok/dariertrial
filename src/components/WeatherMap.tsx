import React, { useEffect, useState, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ColorTheme,
  MapStyle,
  WaypointWeather,
  RouteData,
  WindRelation,
  RoutePoi,
  PoiCategory,
} from '../types';
import { COLOR_THEMES, getTempColor, getWindColor } from '../utils/themes';
import { buildCustomCyclingRoute, generateCyclingLoop, searchPlace, PlaceSearchResult } from '../utils/routingApi';
import { fetchRainViewerRadar, fetchRoutePois, RainRadarData } from '../utils/poiApi';
import {
  Wind,
  Compass,
  Droplets,
  Thermometer,
  Layers,
  Undo2,
  Trash2,
  Check,
  Search,
  Navigation,
  Play,
  Pause,
  CloudRain,
  MapPin,
  Loader2,
  Repeat,
  Route as RouteIcon,
} from 'lucide-react';

type MapMetric = 'all' | 'temp' | 'wind' | 'rain';
type RouteColorMode = 'wind' | 'theme';

const MapController: React.FC<{
  points: { lat: number; lon: number }[];
  isDrawingMode: boolean;
}> = ({ points, isDrawingMode }) => {
  const map = useMap();

  useEffect(() => {
    if (!isDrawingMode && points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [45, 45] });
    }
  }, [points, isDrawingMode, map]);

  return null;
};

const MapClickHandler: React.FC<{
  enabled: boolean;
  onAddPoint: (lat: number, lon: number) => void;
}> = ({ enabled, onAddPoint }) => {
  useMapEvents({
    click(e) {
      if (enabled) {
        onAddPoint(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
};

function getWindRelationColor(rel: WindRelation): string {
  if (rel === 'tailwind') return '#16a34a';
  if (rel === 'headwind') return '#dc2626';
  return '#d97706';
}

function getWindRelationLabel(rel: WindRelation): string {
  if (rel === 'tailwind') return 'Wiatr w plecy';
  if (rel === 'headwind') return 'Wiatr w twarz';
  return 'Wiatr boczny';
}

function getPoiStyle(category: PoiCategory): { emoji: string; label: string; bg: string } {
  if (category === 'water') {
    return { emoji: '💧', label: 'Woda pitna / Zdrój', bg: '#0284c7' };
  }
  if (category === 'shelter') {
    return { emoji: '🛖', label: 'Wiata / Naprawa', bg: '#d97706' };
  }
  return { emoji: '🛒', label: 'Sklep / Piekarnia', bg: '#059669' };
}

interface WeatherMapProps {
  route: RouteData | null;
  weatherWaypoints: WaypointWeather[];
  colorTheme: ColorTheme;
  isDrawingMode: boolean;
  onCancelDrawing: () => void;
  onCustomRouteCreated: (route: RouteData) => void;
  riderDistanceKm: number | null;
  onRiderDistanceChange: (km: number | null) => void;
}

export const WeatherMap: React.FC<WeatherMapProps> = ({
  route,
  weatherWaypoints,
  colorTheme,
  isDrawingMode,
  onCancelDrawing,
  onCustomRouteCreated,
  riderDistanceKm,
  onRiderDistanceChange,
}) => {
  const [metric, setMetric] = useState<MapMetric>('all');
  const [mapStyle, setMapStyle] = useState<MapStyle>('osm');
  const [routeColorMode, setRouteColorMode] = useState<RouteColorMode>('wind');

  // RainViewer radar state
  const [showRadar, setShowRadar] = useState(false);
  const [radarData, setRadarData] = useState<RainRadarData | null>(null);
  const [radarFrameIdx, setRadarFrameIdx] = useState(0);
  const [isRadarPlaying, setIsRadarPlaying] = useState(false);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);

  // OSM POI state
  const [showPois, setShowPois] = useState(false);
  const [pois, setPois] = useState<RoutePoi[]>([]);
  const [poisLoading, setPoisLoading] = useState(false);
  const [poisError, setPoisError] = useState<string | null>(null);

  // Waymarked Trails cycling overlay
  const [showCyclingTrails, setShowCyclingTrails] = useState(false);

  // Drawing / custom route state & loop generator
  const [builderMode, setBuilderMode] = useState<'draw' | 'loop'>('draw');
  const [loopTargetKm, setLoopTargetKm] = useState(40);
  const [loopBearingDeg, setLoopBearingDeg] = useState(0);
  const [draftPoints, setDraftPoints] = useState<{ lat: number; lon: number; label?: string }[]>([]);
  const [customRouteName, setCustomRouteName] = useState('Moja trasa rowerowa');
  const [snapToRoads, setSnapToRoads] = useState(true);
  const [isBuildingRoute, setIsBuildingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Place search state for Start / Finish
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    target: 'start' | 'end';
    items: PlaceSearchResult[];
  } | null>(null);

  // Playback animation for rider scrubber
  const [isPlayingRide, setIsPlayingRide] = useState(false);

  const routeTotalDistance = route?.totalDistance ?? 0;

  // Reset POIs when route changes
  useEffect(() => {
    setPois([]);
    setPoisError(null);
    if (showPois && route && route.points.length > 0) {
      setPoisLoading(true);
      fetchRoutePois(route.points)
        .then((res) => setPois(res))
        .catch((err: unknown) =>
          setPoisError(err instanceof Error ? err.message : 'Błąd pobierania punktów.')
        )
        .finally(() => setPoisLoading(false));
    }
  }, [route]);

  // Animate radar frames when playing
  useEffect(() => {
    if (!showRadar || !isRadarPlaying || !radarData || radarData.frames.length === 0) return;
    const timer = setInterval(() => {
      setRadarFrameIdx((prev) => (prev + 1) % radarData.frames.length);
    }, 850);
    return () => clearInterval(timer);
  }, [showRadar, isRadarPlaying, radarData]);

  useEffect(() => {
    if (!isPlayingRide || !route) return;
    const interval = setInterval(() => {
      onRiderDistanceChange(
        (() => {
          const cur = riderDistanceKm ?? 0;
          const step = Math.max(0.2, routeTotalDistance / 60);
          if (cur + step >= routeTotalDistance) {
            setIsPlayingRide(false);
            return routeTotalDistance;
          }
          return Number((cur + step).toFixed(2));
        })()
      );
    }, 180);
    return () => clearInterval(interval);
  }, [isPlayingRide, riderDistanceKm, route, routeTotalDistance, onRiderDistanceChange]);

  const handleToggleRadar = async () => {
    if (showRadar) {
      setShowRadar(false);
      setIsRadarPlaying(false);
      return;
    }
    setShowRadar(true);
    setRadarError(null);
    if (!radarData) {
      setRadarLoading(true);
      try {
        const data = await fetchRainViewerRadar();
        setRadarData(data);
        // Start on latest past frame (current time)
        const lastPastIdx = Math.max(
          0,
          data.frames.filter((f) => !f.isForecast).length - 1
        );
        setRadarFrameIdx(lastPastIdx);
        setIsRadarPlaying(true);
      } catch (err: unknown) {
        setRadarError(err instanceof Error ? err.message : 'Błąd radaru opadów.');
      } finally {
        setRadarLoading(false);
      }
    } else {
      setIsRadarPlaying(true);
    }
  };

  const handleTogglePois = async () => {
    if (showPois) {
      setShowPois(false);
      return;
    }
    setShowPois(true);
    setPoisError(null);
    if (route && route.points.length > 0 && pois.length === 0) {
      setPoisLoading(true);
      try {
        const res = await fetchRoutePois(route.points);
        setPois(res);
        if (res.length === 0) {
          setPoisError('Brak oznaczonych źródełek wody, sklepów ani wiat w pobliżu tej trasy.');
        }
      } catch (err: unknown) {
        setPoisError(err instanceof Error ? err.message : 'Nie udało się pobrać punktów POI.');
      } finally {
        setPoisLoading(false);
      }
    }
  };

  if (!route && !isDrawingMode) return null;

  const routePoints = route?.points ?? [];
  const palette = COLOR_THEMES[colorTheme] || COLOR_THEMES.sky;
  const centerLat = routePoints[0]?.lat ?? 52.069;
  const centerLon = routePoints[0]?.lon ?? 19.48;
  const polylineCoords: [number, number][] = routePoints.map((p) => [p.lat, p.lon]);

  // Split polyline into wind-colored segments based on nearest weather waypoint
  const windColoredSegments = useMemo(() => {
    if (routePoints.length < 2 || weatherWaypoints.length === 0) return [];
    const segments: { coords: [number, number][]; color: string }[] = [];

    for (let i = 0; i < routePoints.length - 1; i++) {
      const p1 = routePoints[i];
      const p2 = routePoints[i + 1];
      const midDist = (p1.distanceFromStart + p2.distanceFromStart) / 2;

      let nearestWp = weatherWaypoints[0];
      let bestDiff = Infinity;
      for (const wp of weatherWaypoints) {
        const diff = Math.abs(wp.point.distanceFromStart - midDist);
        if (diff < bestDiff) {
          bestDiff = diff;
          nearestWp = wp;
        }
      }

      const color = getWindRelationColor(nearestWp.windRelation);
      const lastSeg = segments[segments.length - 1];
      if (lastSeg && lastSeg.color === color) {
        lastSeg.coords.push([p2.lat, p2.lon]);
      } else {
        segments.push({
          coords: [
            [p1.lat, p1.lon],
            [p2.lat, p2.lon],
          ],
          color,
        });
      }
    }
    return segments;
  }, [routePoints, weatherWaypoints]);

  // Interpolated rider point & weather for current scrubber position
  const activeRiderState = useMemo(() => {
    if (riderDistanceKm === null || routePoints.length === 0) return null;
    let closestPt = routePoints[0];
    let bestPtDiff = Infinity;
    for (const pt of routePoints) {
      const d = Math.abs(pt.distanceFromStart - riderDistanceKm);
      if (d < bestPtDiff) {
        bestPtDiff = d;
        closestPt = pt;
      }
    }

    let closestWp = weatherWaypoints[0] || null;
    let bestWpDiff = Infinity;
    for (const wp of weatherWaypoints) {
      const d = Math.abs(wp.point.distanceFromStart - riderDistanceKm);
      if (d < bestWpDiff) {
        bestWpDiff = d;
        closestWp = wp;
      }
    }

    return { point: closestPt, weather: closestWp };
  }, [riderDistanceKm, routePoints, weatherWaypoints]);

  const handlePlaceSearch = async (target: 'start' | 'end', query: string) => {
    if (!query.trim()) return;
    setRouteError(null);
    try {
      const items = await searchPlace(query);
      setSearchResults({ target, items });
    } catch {
      setRouteError('Błąd wyszukiwania miejscowości.');
    }
  };

  const handleApplyPlace = (target: 'start' | 'end', place: PlaceSearchResult) => {
    const shortName = place.displayName.split(',')[0];
    if (target === 'start') {
      setStartQuery(shortName);
      setDraftPoints((prev) => {
        const rest = prev.length > 1 ? prev.slice(1) : [];
        return [{ lat: place.lat, lon: place.lon, label: shortName }, ...rest];
      });
    } else {
      setEndQuery(shortName);
      setDraftPoints((prev) => {
        if (prev.length === 0) {
          return [
            { lat: centerLat, lon: centerLon, label: 'Start' },
            { lat: place.lat, lon: place.lon, label: shortName },
          ];
        }
        if (prev.length === 1) {
          return [...prev, { lat: place.lat, lon: place.lon, label: shortName }];
        }
        return [...prev.slice(0, -1), { lat: place.lat, lon: place.lon, label: shortName }];
      });
    }
    setSearchResults(null);
  };

  const handleFinishCustomRoute = async () => {
    if (draftPoints.length < 2) {
      setRouteError('Kliknij na mapie lub wyszukaj co najmniej 2 punkty (Start i Meta).');
      return;
    }
    setIsBuildingRoute(true);
    setRouteError(null);
    try {
      const built = await buildCustomCyclingRoute(draftPoints, customRouteName, snapToRoads);
      onCustomRouteCreated(built);
      setDraftPoints([]);
      onCancelDrawing();
    } catch (err: unknown) {
      setRouteError(err instanceof Error ? err.message : 'Nie udało się wyznaczyć trasy.');
    } finally {
      setIsBuildingRoute(false);
    }
  };

  const handleGenerateLoop = async () => {
    const startPt = draftPoints[0];
    if (!startPt) {
      setRouteError('Kliknij punkt startowy na mapie lub wyszukaj miejscowość startu.');
      return;
    }
    setIsBuildingRoute(true);
    setRouteError(null);
    try {
      const built = await generateCyclingLoop(
        startPt.lat,
        startPt.lon,
        loopTargetKm,
        loopBearingDeg,
        customRouteName === 'Moja trasa rowerowa'
          ? `Pętla ~${loopTargetKm} km`
          : customRouteName
      );
      onCustomRouteCreated(built);
      setDraftPoints([]);
      onCancelDrawing();
    } catch (err: unknown) {
      setRouteError(err instanceof Error ? err.message : 'Nie udało się wygenerować pętli.');
    } finally {
      setIsBuildingRoute(false);
    }
  };

  const createWeatherIcon = (w: WaypointWeather) => {
    const tempCol = getTempColor(w.temperature);
    const windCol = getWindColor(w.windSpeed);
    const rainColor =
      w.precipitationProbability >= 50
        ? '#1d4ed8'
        : w.precipitationProbability >= 20
        ? '#0284c7'
        : '#64748b';
    const relColor = getWindRelationColor(w.windRelation);

    let contentHtml = '';
    let width = 142;

    if (metric === 'temp') {
      width = 86;
      contentHtml = `
        <span style="font-size: 14px;">${w.weatherIcon}</span>
        <span style="font-size: 12px; font-weight: 800; color: ${tempCol.text};">${Math.round(w.temperature)}°C</span>
      `;
    } else if (metric === 'wind') {
      width = 114;
      contentHtml = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${relColor}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${w.windDirection}deg); flex-shrink: 0;">
          <line x1="12" y1="19" x2="12" y2="5"></line>
          <polyline points="5 12 12 5 19 12"></polyline>
        </svg>
        <span style="font-size: 11px; font-weight: 800; color: ${windCol.text};">${Math.round(w.windSpeed)}/${Math.round(w.windGusts)}</span>
      `;
    } else if (metric === 'rain') {
      width = 92;
      contentHtml = `
        <span style="font-size: 13px;">💧</span>
        <span style="font-size: 11px; font-weight: 800; color: ${rainColor};">${w.precipitationProbability}%</span>
      `;
    } else {
      width = 146;
      contentHtml = `
        <span style="font-size: 14px;">${w.weatherIcon}</span>
        <span style="font-size: 12px; font-weight: 800; color: ${tempCol.text}; background: ${tempCol.bg}; padding: 1px 6px; border-radius: 999px;">${Math.round(w.temperature)}°</span>
        <div style="display: flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 700; color: ${relColor};">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${w.windDirection}deg);">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
          <span>${Math.round(w.windSpeed)}</span>
        </div>
      `;
    }

    return L.divIcon({
      className: 'custom-weather-marker',
      html: `
        <div style="background: #ffffff; border: 2px solid ${routeColorMode === 'wind' ? relColor : palette.primary}; border-radius: 999px; padding: 4px 8px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 4px 10px -1px rgb(15 23 42 / 0.22); font-family: 'Plus Jakarta Sans', sans-serif; white-space: nowrap;">
          ${contentHtml}
        </div>
      `,
      iconSize: [width, 32],
      iconAnchor: [width / 2, 16],
    });
  };

  const createPoiIcon = (category: PoiCategory) => {
    const style = getPoiStyle(category);
    return L.divIcon({
      className: 'custom-poi-pin',
      html: `<div style="width: 26px; height: 26px; border-radius: 999px; background: #ffffff; border: 2px solid ${style.bg}; display: flex; align-items: center; justify-content: center; font-size: 13px; box-shadow: 0 3px 8px rgba(15,23,42,0.22);">${style.emoji}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  };

  const createDraftPinIcon = (idx: number) =>
    L.divIcon({
      className: 'custom-draft-pin',
      html: `<div style="width: 26px; height: 26px; border-radius: 999px; background: ${palette.primary}; color: white; border: 2px solid white; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; box-shadow: 0 3px 8px rgba(0,0,0,0.3);">${idx + 1}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

  const riderIcon = L.divIcon({
    className: 'custom-rider-pin',
    html: `<div style="width: 32px; height: 32px; border-radius: 999px; background: ${palette.primary}; color: white; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.35);">🚴</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  const tileConfig = {
    osm: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attr: '&copy; OpenStreetMap',
      label: 'Standardowa',
    },
    topo: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attr: '&copy; OpenTopoMap',
      label: 'Topo / Rowerowa',
    },
    dark: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attr: '&copy; OpenStreetMap',
      label: 'Ciemna',
    },
  }[mapStyle];

  const metricButtons: { id: MapMetric; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'all', label: 'Wszystko', icon: Compass },
    { id: 'temp', label: 'Temp.', icon: Thermometer },
    { id: 'wind', label: 'Wiatr / Porywy', icon: Wind },
    { id: 'rain', label: 'Opady', icon: Droplets },
  ];

  const activeRadarFrame = radarData?.frames[radarFrameIdx] || null;
  const activeRadarUrl =
    showRadar && radarData && activeRadarFrame
      ? `${radarData.host}${activeRadarFrame.path}/256/{z}/{x}/{y}/2/1_1.png`
      : null;

  return (
    <div className="surface-card border border-theme rounded-2xl overflow-hidden shadow-xs mb-6">
      {/* Custom Route Builder Panel (when active) */}
      {isDrawingMode && (
        <div className="p-4 sm:p-5 border-b border-theme surface-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-accent" />
                  Ustaw własną trasę rowerową
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {builderMode === 'draw'
                    ? `Klikaj punkty na mapie albo wpisz Start i Metę (${draftPoints.length} pkt).`
                    : 'Kliknij start na mapie lub wyszukaj miejscowość i wygeneruj okrężną pętlę.'}
                </p>
              </div>

              <div className="flex items-center gap-1 surface-card p-1 rounded-xl border border-theme">
                <button
                  type="button"
                  onClick={() => setBuilderMode('draw')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    builderMode === 'draw'
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Punkty A → B
                </button>
                <button
                  type="button"
                  onClick={() => setBuilderMode('loop')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer ${
                    builderMode === 'loop'
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Repeat className="w-3 h-3" /> Generator pętli
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDraftPoints((p) => p.slice(0, -1))}
                disabled={draftPoints.length === 0}
                className="px-3 py-1.5 surface-card border border-theme rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" /> Cofnij
              </button>
              <button
                type="button"
                onClick={() => setDraftPoints([])}
                disabled={draftPoints.length === 0}
                className="px-3 py-1.5 surface-card border border-theme rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Wyczyść
              </button>
              <button
                type="button"
                onClick={onCancelDrawing}
                className="px-3 py-1.5 surface-card border border-theme rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Anuluj
              </button>
              {builderMode === 'draw' ? (
                <button
                  type="button"
                  onClick={handleFinishCustomRoute}
                  disabled={draftPoints.length < 2 || isBuildingRoute}
                  className="px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isBuildingRoute ? 'Wyznaczam...' : 'Zastosuj trasę'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerateLoop}
                  disabled={draftPoints.length < 1 || isBuildingRoute}
                  className="px-4 py-1.5 bg-accent text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>{isBuildingRoute ? 'Generuję...' : 'Wygeneruj pętlę'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Nazwa trasy
              </label>
              <input
                type="text"
                value={customRouteName}
                onChange={(e) => setCustomRouteName(e.target.value)}
                placeholder="Moja trasa..."
                className="w-full px-3 py-2 surface-card border border-theme rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Wyszukaj punkt Startu
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={startQuery}
                  onChange={(e) => setStartQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePlaceSearch('start', startQuery)}
                  placeholder="np. Kraków Rynek..."
                  className="flex-1 px-3 py-2 surface-card border border-theme rounded-xl text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => handlePlaceSearch('start', startQuery)}
                  className="px-3 py-2 bg-accent text-white rounded-xl text-xs font-semibold cursor-pointer"
                  aria-label="Szukaj startu"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {builderMode === 'draw' ? (
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  Wyszukaj punkt Mety
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={endQuery}
                    onChange={(e) => setEndQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePlaceSearch('end', endQuery)}
                    placeholder="np. Ojców..."
                    className="flex-1 px-3 py-2 surface-card border border-theme rounded-xl text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => handlePlaceSearch('end', endQuery)}
                    className="px-3 py-2 bg-accent text-white rounded-xl text-xs font-semibold cursor-pointer"
                    aria-label="Szukaj mety"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Dystans pętli
                  </label>
                  <select
                    value={loopTargetKm}
                    onChange={(e) => setLoopTargetKm(Number(e.target.value))}
                    className="w-full px-3 py-2 surface-card border border-theme rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                  >
                    {[20, 30, 40, 60, 80, 100].map((km) => (
                      <option key={km} value={km}>
                        ok. {km} km
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    Kierunek pętli
                  </label>
                  <select
                    value={loopBearingDeg}
                    onChange={(e) => setLoopBearingDeg(Number(e.target.value))}
                    className="w-full px-3 py-2 surface-card border border-theme rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                  >
                    <option value={0}>Na Północ (N)</option>
                    <option value={90}>Na Wschód (E)</option>
                    <option value={180}>Na Południe (S)</option>
                    <option value={270}>Na Zachód (W)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {searchResults && searchResults.items.length > 0 && (
            <div className="surface-card border border-theme rounded-xl p-2 space-y-1 max-h-40 overflow-y-auto">
              {searchResults.items.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPlace(searchResults.target, item)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-slate-700 dark:text-slate-200 hover:bg-accent-soft transition-colors cursor-pointer truncate"
                >
                  {item.displayName}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {builderMode === 'draw' ? (
              <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={snapToRoads}
                  onChange={(e) => setSnapToRoads(e.target.checked)}
                  style={{ accentColor: palette.primary }}
                />
                <span>Dopasuj trasę automatycznie do dróg i ścieżek rowerowych</span>
              </label>
            ) : (
              <span className="text-slate-600 dark:text-slate-300">
                Punkt startowy: {draftPoints[0] ? `${draftPoints[0].lat.toFixed(4)}, ${draftPoints[0].lon.toFixed(4)}` : 'kliknij na mapie lub wyszukaj powyżej'}
              </span>
            )}
            {routeError && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">{routeError}</span>
            )}
          </div>
        </div>
      )}

      {/* Map Toolbar Header */}
      <div className="p-4 border-b border-theme flex flex-col gap-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Weather Metric Switcher */}
            <div className="flex items-center gap-1 surface-subtle p-1 rounded-xl border border-theme">
              {metricButtons.map((btn) => {
                const Icon = btn.icon;
                const active = metric === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setMetric(btn.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-accent text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{btn.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Wind vs Theme Polyline Switcher */}
            <div className="flex items-center gap-1 surface-subtle p-1 rounded-xl border border-theme">
              <button
                type="button"
                onClick={() => setRouteColorMode('wind')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  routeColorMode === 'wind'
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Linia: Wiatr
              </button>
              <button
                type="button"
                onClick={() => setRouteColorMode('theme')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  routeColorMode === 'theme'
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Linia: Motyw
              </button>
            </div>

            {/* Radar, Cycling Trails & POI Toggles */}
            <button
              type="button"
              onClick={handleToggleRadar}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                showRadar
                  ? 'bg-accent text-white border-transparent shadow-xs'
                  : 'surface-subtle border-theme text-slate-700 dark:text-slate-200 hover:opacity-90'
              }`}
              title="Pokaż animowany radar opadów RainViewer na mapie"
            >
              {radarLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CloudRain className="w-3.5 h-3.5" />
              )}
              <span>Radar opadów</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCyclingTrails((v) => !v)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                showCyclingTrails
                  ? 'bg-accent text-white border-transparent shadow-xs'
                  : 'surface-subtle border-theme text-slate-700 dark:text-slate-200 hover:opacity-90'
              }`}
              title="Pokaż oznakowane szlaki rowerowe (Waymarked Trails)"
            >
              <RouteIcon className="w-3.5 h-3.5" />
              <span>Szlaki rowerowe</span>
            </button>

            {route && (
              <button
                type="button"
                onClick={handleTogglePois}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  showPois
                    ? 'bg-accent text-white border-transparent shadow-xs'
                    : 'surface-subtle border-theme text-slate-700 dark:text-slate-200 hover:opacity-90'
                }`}
                title="Pokaż punkty wody pitnej, sklepy i wiaty z OpenStreetMap wzdłuż trasy"
              >
                {poisLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MapPin className="w-3.5 h-3.5" />
                )}
                <span>Woda i sklepy{pois.length > 0 && showPois ? ` (${pois.length})` : ''}</span>
              </button>
            )}
          </div>

          {/* Map Tile Background Switcher + Wind Legend */}
          <div className="flex flex-wrap items-center gap-3">
            {routeColorMode === 'wind' && (
              <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> W plecy
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600" /> Boczny
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600" /> Pod wiatr
                </span>
              </div>
            )}

            <div className="flex items-center gap-1 surface-subtle p-1 rounded-xl border border-theme">
              <Layers className="w-3.5 h-3.5 text-accent ml-1.5 mr-0.5" />
              {(['osm', 'topo', 'dark'] as MapStyle[]).map((styleId) => (
                <button
                  key={styleId}
                  type="button"
                  onClick={() => setMapStyle(styleId)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    mapStyle === styleId
                      ? 'bg-accent text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {styleId === 'osm' ? 'Mapa' : styleId === 'topo' ? 'Topo' : 'Ciemna'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(radarError || poisError) && (
          <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            {radarError || poisError}
          </div>
        )}
      </div>

      {/* Interactive Leaflet Map */}
      <div
        className={`h-[440px] sm:h-[500px] w-full relative z-0 ${
          isDrawingMode ? 'cursor-crosshair' : ''
        }`}
      >
        <MapContainer
          center={[centerLat, centerLon]}
          zoom={route ? 12 : 6}
          scrollWheelZoom={true}
          className={mapStyle === 'dark' ? 'leaflet-dark-tiles' : ''}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer key={mapStyle} attribution={tileConfig.attr} url={tileConfig.url} maxZoom={18} />

          {/* Waymarked Trails cycling routes overlay */}
          {showCyclingTrails && (
            <TileLayer
              url="https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png"
              opacity={0.85}
              zIndex={350}
              attribution="&copy; Waymarked Trails"
            />
          )}

          {/* RainViewer live precipitation radar overlay */}
          {activeRadarUrl && (
            <TileLayer
              key={activeRadarUrl}
              url={activeRadarUrl}
              opacity={0.65}
              zIndex={400}
              attribution="RainViewer"
            />
          )}

          <MapClickHandler
            enabled={isDrawingMode}
            onAddPoint={(lat, lon) => setDraftPoints((prev) => [...prev, { lat, lon }])}
          />

          {/* Active GPX route polyline */}
          {route && routeColorMode === 'wind' && windColoredSegments.length > 0 ? (
            windColoredSegments.map((seg, i) => (
              <Polyline
                key={`seg-${i}`}
                positions={seg.coords}
                pathOptions={{ color: seg.color, weight: 5.5, opacity: 0.9 }}
              />
            ))
          ) : route && polylineCoords.length >= 2 ? (
            <Polyline
              positions={polylineCoords}
              pathOptions={{ color: palette.primary, weight: 5, opacity: 0.9 }}
            />
          ) : null}

          {/* Draft polyline while drawing */}
          {isDrawingMode && draftPoints.length >= 2 && (
            <Polyline
              positions={draftPoints.map((p): [number, number] => [p.lat, p.lon])}
              pathOptions={{ color: palette.primary, weight: 4, dashArray: '8 8' }}
            />
          )}

          {isDrawingMode &&
            draftPoints.map((pt, idx) => (
              <Marker key={`draft-${idx}`} position={[pt.lat, pt.lon]} icon={createDraftPinIcon(idx)} />
            ))}

          <MapController points={routePoints} isDrawingMode={isDrawingMode} />

          {/* OSM Route POIs */}
          {!isDrawingMode &&
            showPois &&
            pois.map((poi) => {
              const style = getPoiStyle(poi.category);
              return (
                <Marker key={poi.id} position={[poi.lat, poi.lon]} icon={createPoiIcon(poi.category)}>
                  <Popup>
                    <div className="p-1 min-w-[170px] font-sans text-xs">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
                        <span>{style.emoji}</span>
                        <span>{poi.name}</span>
                      </div>
                      <div className="text-slate-500">{style.label}</div>
                      <div className="text-slate-700 font-mono font-semibold mt-1">
                        Ok. {poi.distanceAlongKm} km trasy
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* Weather markers */}
          {!isDrawingMode &&
            weatherWaypoints.map((w, idx) => (
              <Marker
                key={`${idx}-${metric}-${colorTheme}-${routeColorMode}`}
                position={[w.point.lat, w.point.lon]}
                icon={createWeatherIcon(w)}
              >
                <Popup>
                  <div className="p-1.5 min-w-[230px] font-sans">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-500 font-mono">
                        Km {w.point.distanceFromStart.toFixed(1)}
                      </span>
                      <span className="text-xs font-bold font-mono" style={{ color: palette.primary }}>
                        {w.point.estimatedTime
                          ? w.point.estimatedTime.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 mb-2.5">
                      <span className="text-2xl">{w.weatherIcon}</span>
                      <div>
                        <div className="text-base font-extrabold text-slate-900">
                          {Math.round(w.temperature)}°C{' '}
                          <span className="text-xs font-normal text-slate-500">
                            (odcz. {Math.round(w.apparentTemperature)}°C)
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">{w.weatherDescription}</div>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Relacja wiatru:</span>
                        <strong style={{ color: getWindRelationColor(w.windRelation) }}>
                          {getWindRelationLabel(w.windRelation)}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 font-medium">
                          <Wind className="w-3.5 h-3.5" style={{ color: palette.primary }} /> Wiatr:
                        </span>
                        <strong className="text-slate-900 font-mono">{Math.round(w.windSpeed)} km/h</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-medium pl-4">Porywy:</span>
                        <strong className="text-rose-600 font-mono">{Math.round(w.windGusts)} km/h</strong>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="font-medium">Opady:</span>
                        <strong className="text-slate-900 font-mono">
                          {w.precipitationProbability}% ({w.precipitation || 0} mm)
                        </strong>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

          {/* Interactive Rider Position Marker */}
          {activeRiderState && (
            <Marker
              position={[activeRiderState.point.lat, activeRiderState.point.lon]}
              icon={riderIcon}
              zIndexOffset={1000}
            />
          )}
        </MapContainer>

        {/* Floating RainViewer Timeline Control when Radar is active */}
        {showRadar && radarData && activeRadarFrame && (
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-80 z-[450] surface-card/95 backdrop-blur-xs border border-theme rounded-xl px-3 py-2 shadow-lg flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsRadarPlaying((v) => !v)}
              className="w-7 h-7 rounded-lg bg-accent text-white flex items-center justify-center shrink-0 cursor-pointer"
              aria-label={isRadarPlaying ? 'Zatrzymaj radar' : 'Odtwarzaj radar'}
            >
              {isRadarPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-100 mb-0.5">
                <span className="flex items-center gap-1">
                  <CloudRain className="w-3 h-3 text-sky-500" /> Radar opadów
                </span>
                <span className="font-mono">
                  {new Date(activeRadarFrame.time * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {activeRadarFrame.isForecast ? ' (prog.)' : ''}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, radarData.frames.length - 1)}
                value={radarFrameIdx}
                onChange={(e) => {
                  setIsRadarPlaying(false);
                  setRadarFrameIdx(Number(e.target.value));
                }}
                className="w-full h-1.5 cursor-pointer"
                style={{ accentColor: palette.primary }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Interactive Rider Simulation Scrubber */}
      {route && (
        <div className="p-4 border-t border-theme surface-subtle flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!isPlayingRide && (riderDistanceKm === null || riderDistanceKm >= route.totalDistance)) {
                  onRiderDistanceChange(0);
                }
                setIsPlayingRide(!isPlayingRide);
              }}
              className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center cursor-pointer shadow-xs"
              title={isPlayingRide ? 'Zatrzymaj symulację' : 'Odtwórz przejazd po trasie'}
            >
              {isPlayingRide ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
              Symulacja trasy:
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(0.1, route.totalDistance)}
            step={0.1}
            value={riderDistanceKm ?? 0}
            onChange={(e) => {
              setIsPlayingRide(false);
              onRiderDistanceChange(Number(e.target.value));
            }}
            className="flex-1 cursor-pointer"
            style={{ accentColor: palette.primary }}
          />

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums shrink-0">
            <span className="font-bold text-slate-900 dark:text-white">
              {(riderDistanceKm ?? 0).toFixed(1)} / {route.totalDistance} km
            </span>
            {activeRiderState?.weather && (
              <>
                <span className="text-slate-600 dark:text-slate-300">
                  {Math.round(activeRiderState.point.elevation)}m n.p.m.
                </span>
                <span className="font-bold text-accent">
                  {activeRiderState.weather.weatherIcon}{' '}
                  {Math.round(activeRiderState.weather.temperature)}°C
                </span>
                <span
                  className="font-bold"
                  style={{ color: getWindRelationColor(activeRiderState.weather.windRelation) }}
                >
                  {getWindRelationLabel(activeRiderState.weather.windRelation)} (
                  {Math.round(activeRiderState.weather.windSpeed)} km/h)
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
