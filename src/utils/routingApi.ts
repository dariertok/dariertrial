import { RouteData } from '../types';
import { buildRouteFromPoints } from './gpxParser';

export interface PlaceSearchResult {
  displayName: string;
  lat: number;
  lon: number;
}

export async function searchPlace(query: string): Promise<PlaceSearchResult[]> {
  if (!query.trim()) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
    query.trim()
  )}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error('Nie udało się wyszukać lokalizacji.');
  const data = await res.json();
  return (data || []).map((item: any) => ({
    displayName: item.display_name,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
  }));
}

async function fetchElevationsForPoints(
  coords: { lat: number; lon: number }[]
): Promise<number[]> {
  if (coords.length === 0) return [];
  // Open-Meteo elevation API supports up to 100 coordinates per call
  const maxBatch = 80;
  const step = Math.max(1, Math.ceil(coords.length / maxBatch));
  const sampled: { lat: number; lon: number; idx: number }[] = [];

  for (let i = 0; i < coords.length; i += step) {
    sampled.push({ lat: coords[i].lat, lon: coords[i].lon, idx: i });
  }
  if (sampled[sampled.length - 1].idx !== coords.length - 1) {
    sampled.push({
      lat: coords[coords.length - 1].lat,
      lon: coords[coords.length - 1].lon,
      idx: coords.length - 1,
    });
  }

  try {
    const lats = sampled.map((s) => s.lat.toFixed(5)).join(',');
    const lons = sampled.map((s) => s.lon.toFixed(5)).join(',');
    const res = await fetch(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`
    );
    if (!res.ok) throw new Error('Elevation fetch failed');
    const data = await res.json();
    const elevations: number[] = data.elevation || [];

    // Interpolate elevations across all points
    const fullElevations = new Array<number>(coords.length).fill(0);
    for (let s = 0; s < sampled.length - 1; s++) {
      const startIdx = sampled[s].idx;
      const endIdx = sampled[s + 1].idx;
      const startEle = elevations[s] ?? 150;
      const endEle = elevations[s + 1] ?? startEle;
      const span = Math.max(1, endIdx - startIdx);
      for (let i = startIdx; i <= endIdx; i++) {
        const t = (i - startIdx) / span;
        fullElevations[i] = Math.round(startEle + t * (endEle - startEle));
      }
    }
    return fullElevations;
  } catch {
    return coords.map(() => 150);
  }
}

export async function buildCustomCyclingRoute(
  waypoints: { lat: number; lon: number }[],
  routeName: string,
  snapToRoads: boolean = true
): Promise<RouteData> {
  if (waypoints.length < 2) {
    throw new Error('Wybierz co najmniej 2 punkty, aby wyznaczyć trasę.');
  }

  let routeCoords: { lat: number; lon: number }[] = [];

  if (snapToRoads) {
    try {
      const coordStr = waypoints.map((w) => `${w.lon.toFixed(6)},${w.lat.toFixed(6)}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/bike/${coordStr}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const geom = data.routes?.[0]?.geometry?.coordinates;
        if (Array.isArray(geom) && geom.length >= 2) {
          routeCoords = geom.map(([lon, lat]: [number, number]) => ({ lat, lon }));
        }
      }
    } catch {
      // Fallback to direct segments below
    }
  }

  // Fallback or straight-line mode: interpolate intermediate points
  if (routeCoords.length < 2) {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const steps = 12;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        routeCoords.push({
          lat: p1.lat + t * (p2.lat - p1.lat),
          lon: p1.lon + t * (p2.lon - p1.lon),
        });
      }
    }
    routeCoords.push(waypoints[waypoints.length - 1]);
  }

  // Downsample gently if OSRM returned > 300 points to keep charts & GPX responsive
  if (routeCoords.length > 260) {
    const step = Math.ceil(routeCoords.length / 240);
    const reduced = routeCoords.filter((_, i) => i % step === 0);
    if (reduced[reduced.length - 1] !== routeCoords[routeCoords.length - 1]) {
      reduced.push(routeCoords[routeCoords.length - 1]);
    }
    routeCoords = reduced;
  }

  const elevations = await fetchElevationsForPoints(routeCoords);
  const rawPoints = routeCoords.map((c, i) => ({
    lat: c.lat,
    lon: c.lon,
    elevation: elevations[i] ?? 150,
  }));

  return buildRouteFromPoints(rawPoints, routeName || 'Własna trasa rowerowa');
}

function offsetLatLon(
  lat: number,
  lon: number,
  distanceKm: number,
  bearingDeg: number
): { lat: number; lon: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceKm * Math.cos(rad)) / 111.32;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const dLon = (distanceKm * Math.sin(rad)) / (111.32 * cosLat);
  return { lat: lat + dLat, lon: lon + dLon };
}

export async function generateCyclingLoop(
  startLat: number,
  startLon: number,
  targetKm: number,
  bearingDeg: number = 0,
  routeName?: string
): Promise<RouteData> {
  const clampedKm = Math.max(8, Math.min(180, targetKm));
  // Teardrop 3-waypoint loop tuned for OSRM cycling road detour factor
  const radiusKm = clampedKm / 6.2;
  const wp1 = offsetLatLon(startLat, startLon, radiusKm * 0.95, bearingDeg - 42);
  const wp2 = offsetLatLon(startLat, startLon, radiusKm * 1.45, bearingDeg);
  const wp3 = offsetLatLon(startLat, startLon, radiusKm * 0.95, bearingDeg + 42);

  const waypoints = [
    { lat: startLat, lon: startLon },
    wp1,
    wp2,
    wp3,
    { lat: startLat, lon: startLon },
  ];

  const finalName = routeName?.trim() || `Pętla rowerowa ~${clampedKm} km`;
  return buildCustomCyclingRoute(waypoints, finalName, true);
}

