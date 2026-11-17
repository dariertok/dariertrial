import { PoiCategory, RoutePoi, TrackPoint } from '../types';
import { calculateDistance } from './gpxParser';

export interface RainRadarFrame {
  time: number; // unix seconds
  path: string;
  isForecast: boolean;
}

export interface RainRadarData {
  host: string;
  frames: RainRadarFrame[];
}

export async function fetchRainViewerRadar(): Promise<RainRadarData> {
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!res.ok) throw new Error('Nie udało się pobrać danych radaru opadów.');
  const json = await res.json();
  const host: string = json?.host || 'https://tilecache.rainviewer.com';
  const past: { time: number; path: string }[] = json?.radar?.past || [];
  const nowcast: { time: number; path: string }[] = json?.radar?.nowcast || [];

  const recentPast = past.slice(-6).map((f) => ({
    time: f.time,
    path: f.path,
    isForecast: false,
  }));
  const upcoming = nowcast.slice(0, 6).map((f) => ({
    time: f.time,
    path: f.path,
    isForecast: true,
  }));

  const frames = [...recentPast, ...upcoming];
  if (frames.length === 0) throw new Error('Brak dostępnych klatek radaru.');
  return { host, frames };
}

interface OverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export async function fetchRoutePois(points: TrackPoint[]): Promise<RoutePoi[]> {
  if (points.length === 0) return [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  // Pad bounding box by ~1.5 km
  const pad = 0.015;
  const s = (minLat - pad).toFixed(4);
  const w = (minLon - pad).toFixed(4);
  const n = (maxLat + pad).toFixed(4);
  const e = (maxLon + pad).toFixed(4);

  const query = `[out:json][timeout:10];
(
  node["amenity"="drinking_water"](${s},${w},${n},${e});
  node["natural"="spring"]["drinking_water"!="no"](${s},${w},${n},${e});
  node["shop"~"^(convenience|supermarket|bakery)$"](${s},${w},${n},${e});
  node["amenity"~"^(shelter|bicycle_repair_station)$"](${s},${w},${n},${e});
);
out body 120;`;

  let elements: OverpassElement[] = [];
  let lastError: unknown = null;

  for (const endpoint of OVERPASS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      elements = data?.elements || [];
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    throw new Error('Serwer punktów OSM jest chwilowo zajęty. Spróbuj ponownie za chwilę.');
  }

  // Sample route points every ~500m for fast distance-to-track filtering
  const sampledTrack: TrackPoint[] = [];
  let lastAddedDist = -1;
  for (const p of points) {
    if (p.distanceFromStart - lastAddedDist >= 0.4 || p === points[points.length - 1]) {
      sampledTrack.push(p);
      lastAddedDist = p.distanceFromStart;
    }
  }

  const pois: RoutePoi[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || !el.tags) continue;

    // Filter POIs within 1.2 km of the GPX route
    let minDist = Infinity;
    let nearestKm = 0;
    for (const tp of sampledTrack) {
      const d = calculateDistance(lat, lon, tp.lat, tp.lon);
      if (d < minDist) {
        minDist = d;
        nearestKm = tp.distanceFromStart;
      }
    }
    if (minDist > 1.2) continue;

    const tags = el.tags;
    let category: PoiCategory = 'shop';
    let fallbackName = 'Sklep / Punkt';

    if (tags.amenity === 'drinking_water' || tags.natural === 'spring') {
      category = 'water';
      fallbackName = tags.natural === 'spring' ? 'Źródło wody' : 'Woda pitna / Zdrój';
    } else if (tags.amenity === 'shelter' || tags.amenity === 'bicycle_repair_station') {
      category = 'shelter';
      fallbackName =
        tags.amenity === 'bicycle_repair_station' ? 'Stacja naprawy rowerów' : 'Wiata / Schronienie';
    } else {
      category = 'shop';
      fallbackName =
        tags.shop === 'bakery'
          ? 'Piekarnia'
          : tags.shop === 'supermarket'
          ? 'Supermarket'
          : 'Sklep spożywczy';
    }

    pois.push({
      id: `${el.type}-${el.id}`,
      lat,
      lon,
      category,
      name: tags.name || fallbackName,
      distanceAlongKm: Math.round(nearestKm * 10) / 10,
    });
  }

  // Cap at 45 closest-spread POIs so map remains readable
  return pois.sort((a, b) => a.distanceAlongKm - b.distanceAlongKm).slice(0, 45);
}
