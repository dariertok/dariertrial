import { TrackPoint, RouteData, WindRelation, BikeType, TripSettings } from '../types';

export interface BikeTypeConfig {
  id: BikeType;
  label: string;
  defaultSpeedKmH: number;
  minSpeedKmH: number;
  maxSpeedKmH: number;
  climbFactor: number;
  windFactor: number;
  kcalPerHour: number;
}

export const BIKE_TYPES: BikeTypeConfig[] = [
  {
    id: 'road',
    label: 'Szosa',
    defaultSpeedKmH: 28,
    minSpeedKmH: 18,
    maxSpeedKmH: 45,
    climbFactor: 1.0,
    windFactor: 0.9,
    kcalPerHour: 620,
  },
  {
    id: 'gravel',
    label: 'Gravel',
    defaultSpeedKmH: 22,
    minSpeedKmH: 14,
    maxSpeedKmH: 36,
    climbFactor: 0.95,
    windFactor: 0.95,
    kcalPerHour: 580,
  },
  {
    id: 'mtb',
    label: 'MTB / Górski',
    defaultSpeedKmH: 15,
    minSpeedKmH: 8,
    maxSpeedKmH: 28,
    climbFactor: 0.85,
    windFactor: 0.85,
    kcalPerHour: 600,
  },
  {
    id: 'touring',
    label: 'Treking / Miejski',
    defaultSpeedKmH: 17,
    minSpeedKmH: 10,
    maxSpeedKmH: 28,
    climbFactor: 1.05,
    windFactor: 1.05,
    kcalPerHour: 480,
  },
  {
    id: 'ebike',
    label: 'E-bike (elektryk)',
    defaultSpeedKmH: 24,
    minSpeedKmH: 14,
    maxSpeedKmH: 35,
    climbFactor: 0.3,
    windFactor: 0.4,
    kcalPerHour: 340,
  },
];

export function getBikeTypeConfig(bikeType?: BikeType | string): BikeTypeConfig {
  return BIKE_TYPES.find((b) => b.id === bikeType) || BIKE_TYPES[3];
}

// Haversine formula to calculate distance between two lat/lng points in km
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Forward azimuth bearing from point 1 to point 2 in degrees (0..360)
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

// Meteorological windDirection = direction wind comes FROM.
// If cyclist rides North (0 deg) and wind blows from North (0 deg), cos(0) = +1 -> headwind.
// If cyclist rides South (180 deg) and wind blows from North (0 deg), cos(180) = -1 -> tailwind.
export function getWindRelation(routeBearing: number, windDirection: number): WindRelation {
  const diffRad = ((routeBearing - windDirection) * Math.PI) / 180;
  const headComponent = Math.cos(diffRad);
  if (headComponent > 0.35) return 'headwind';
  if (headComponent < -0.35) return 'tailwind';
  return 'crosswind';
}

export interface WindSampleAtDist {
  distanceFromStart: number;
  windSpeed: number;
  windDirection: number;
}

/**
 * Estimates cumulative riding minutes at every TrackPoint, taking into account
 * terrain slope (uphill penalty / downhill bonus), bike type, and optional wind vectors.
 */
export function computeCumulativeRideMinutes(
  points: TrackPoint[],
  settings: Pick<TripSettings, 'speedKmH' | 'bikeType' | 'realisticPace'>,
  windSamples?: WindSampleAtDist[]
): number[] {
  if (points.length === 0) return [];
  const baseSpeed = Math.max(5, settings.speedKmH);
  const bikeCfg = getBikeTypeConfig(settings.bikeType);
  const mins: number[] = [0];

  const findNearestWind = (distKm: number): WindSampleAtDist | null => {
    if (!windSamples || windSamples.length === 0) return null;
    let best = windSamples[0];
    let bestDiff = Math.abs(best.distanceFromStart - distKm);
    for (const ws of windSamples) {
      const d = Math.abs(ws.distanceFromStart - distKm);
      if (d < bestDiff) {
        bestDiff = d;
        best = ws;
      }
    }
    return best;
  };

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segKm = Math.max(0, curr.distanceFromStart - prev.distanceFromStart);

    if (segKm === 0) {
      mins.push(mins[i - 1]);
      continue;
    }

    if (!settings.realisticPace) {
      mins.push(mins[i - 1] + (segKm / baseSpeed) * 60);
      continue;
    }

    const segMeters = segKm * 1000;
    const eleDiff = curr.elevation - prev.elevation;
    const rawSlopePct = segMeters > 5 ? (eleDiff / segMeters) * 100 : 0;
    const slopePct = Math.max(-12, Math.min(18, rawSlopePct));

    // Uphill slowdown & cautious downhill speed-up
    let terrainTimeFactor = 1;
    if (slopePct > 0.5) {
      terrainTimeFactor = 1 + slopePct * 0.095 * bikeCfg.climbFactor;
    } else if (slopePct < -1) {
      terrainTimeFactor = Math.max(0.76, 1 + slopePct * 0.025);
    }

    // Wind component along riding direction
    let windTimeFactor = 1;
    const midDist = (prev.distanceFromStart + curr.distanceFromStart) / 2;
    const wSample = findNearestWind(midDist);
    if (wSample) {
      const bearing = calculateBearing(prev.lat, prev.lon, curr.lat, curr.lon);
      const headRatio = Math.cos(((bearing - wSample.windDirection) * Math.PI) / 180);
      // headRatio > 0 => headwind (increases time); headRatio < 0 => tailwind (reduces time slightly)
      const signedEffect =
        headRatio >= 0
          ? headRatio * wSample.windSpeed * 0.0085 * bikeCfg.windFactor
          : headRatio * wSample.windSpeed * 0.0045 * bikeCfg.windFactor;
      windTimeFactor = Math.max(0.78, Math.min(1.42, 1 + signedEffect));
    }

    const effectiveSpeed = Math.max(
      5,
      Math.min(50, baseSpeed / (terrainTimeFactor * windTimeFactor))
    );
    mins.push(mins[i - 1] + (segKm / effectiveSpeed) * 60);
  }

  return mins;
}

export interface RouteNutritionEstimate {
  waterLiters: number;
  bidons750ml: number;
  totalKcal: number;
  snacksCount: number;
}

export function estimateNutrition(
  route: RouteData,
  durationMinutes: number,
  bikeType: BikeType,
  avgTempC: number
): RouteNutritionEstimate {
  const hours = Math.max(0.25, durationMinutes / 60);
  const bikeCfg = getBikeTypeConfig(bikeType);

  // Hydration scales with temperature & climbing
  const tempBonusLPerHour = avgTempC > 26 ? 0.35 : avgTempC > 20 ? 0.18 : avgTempC > 12 ? 0.05 : 0;
  const climbBonusL = (route.elevationGain / 1000) * 0.25;
  const rawLiters = hours * (0.5 + tempBonusLPerHour) + climbBonusL;
  const waterLiters = Math.max(0.5, Math.round(rawLiters * 10) / 10);
  const bidons750ml = Math.max(1, Math.ceil(waterLiters / 0.75));

  // Calories scale with duration, bike type & vertical meters
  const totalKcal = Math.round(hours * bikeCfg.kcalPerHour + route.elevationGain * 0.75);
  const snacksCount = durationMinutes > 75 ? Math.max(1, Math.round((hours - 0.5) * 1.4)) : 0;

  return {
    waterLiters,
    bidons750ml,
    totalKcal,
    snacksCount,
  };
}

export function buildRouteFromPoints(
  rawPoints: { lat: number; lon: number; elevation?: number; time?: string }[],
  name: string
): RouteData {
  const points: TrackPoint[] = [];
  let totalDistance = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  let prevLat: number | null = null;
  let prevLon: number | null = null;
  let prevEle: number | null = null;

  for (const pt of rawPoints) {
    const ele = typeof pt.elevation === 'number' && !Number.isNaN(pt.elevation) ? pt.elevation : 0;
    if (prevLat !== null && prevLon !== null) {
      totalDistance += calculateDistance(prevLat, prevLon, pt.lat, pt.lon);
    }
    if (prevEle !== null) {
      const diff = ele - prevEle;
      if (diff > 0) elevationGain += diff;
      else elevationLoss += Math.abs(diff);
    }
    if (ele < minElevation) minElevation = ele;
    if (ele > maxElevation) maxElevation = ele;

    points.push({
      lat: pt.lat,
      lon: pt.lon,
      elevation: ele,
      time: pt.time,
      distanceFromStart: totalDistance,
    });

    prevLat = pt.lat;
    prevLon = pt.lon;
    prevEle = ele;
  }

  if (minElevation === Infinity) minElevation = 0;
  if (maxElevation === -Infinity) maxElevation = 0;

  return {
    name,
    points,
    totalDistance: Math.round(totalDistance * 100) / 100,
    elevationGain: Math.round(elevationGain),
    elevationLoss: Math.round(elevationLoss),
    minElevation: Math.round(minElevation),
    maxElevation: Math.round(maxElevation),
  };
}

export function reverseRouteData(route: RouteData): RouteData {
  const reversed = [...route.points].reverse().map((p) => ({
    lat: p.lat,
    lon: p.lon,
    elevation: p.elevation,
    time: p.time,
  }));
  const cleanBaseName = route.name.replace(/\s*\(Powrót\)$/i, '');
  const newName = route.name.endsWith('(Powrót)') ? cleanBaseName : `${cleanBaseName} (Powrót)`;
  return buildRouteFromPoints(reversed, newName);
}

export function makeRoundTripRouteData(route: RouteData): RouteData {
  if (route.points.length < 2) return route;
  const forward = route.points.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    elevation: p.elevation,
    time: p.time,
  }));
  const back = [...forward].slice(0, -1).reverse();
  const cleanBaseName = route.name
    .replace(/\s*\(Tam i z powrotem\)$/i, '')
    .replace(/\s*\(Powrót\)$/i, '');
  return buildRouteFromPoints([...forward, ...back], `${cleanBaseName} (Tam i z powrotem)`);
}

export function exportRouteToGPX(route: RouteData): string {
  const escapedName = route.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const trkpts = route.points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${Math.round(p.elevation)}</ele></trkpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SkyTrail">
  <metadata>
    <name>${escapedName}</name>
  </metadata>
  <trk>
    <name>${escapedName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

export function parseGPX(gpxText: string, routeName?: string): RouteData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxText, 'text/xml');

  const nameEl = xmlDoc.querySelector('trk > name') || xmlDoc.querySelector('metadata > name');
  const name = routeName || (nameEl ? nameEl.textContent || 'Trasa GPX' : 'Trasa GPX');

  const trkpts = xmlDoc.querySelectorAll('trkpt');
  const raw: { lat: number; lon: number; elevation: number; time?: string }[] = [];

  const nodes = trkpts.length > 0 ? trkpts : xmlDoc.querySelectorAll('rtept');
  nodes.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute('lat') || '0');
    const lon = parseFloat(pt.getAttribute('lon') || '0');
    const eleEl = pt.querySelector('ele');
    const elevation = eleEl ? parseFloat(eleEl.textContent || '0') : 0;
    const timeEl = pt.querySelector('time');
    const time = timeEl ? timeEl.textContent || undefined : undefined;
    raw.push({ lat, lon, elevation, time });
  });

  return buildRouteFromPoints(raw, name);
}
