import {
  AirQualitySummary,
  AiRouteAnalysis,
  RouteClimb,
  RouteData,
  SunTimes,
  TrackPoint,
  TripSettings,
  WaypointWeather,
  WeekdayForecastSummary,
} from '../types';
import { calculateBearing, getWindRelation } from './gpxParser';
import { getWeatherDescription } from './weatherApi';

export async function fetchRouteAirQuality(
  waypoints: WaypointWeather[]
): Promise<AirQualitySummary | null> {
  if (waypoints.length === 0) return null;

  // Sample up to 3 representative waypoints (start, middle, end)
  const indices = Array.from(
    new Set([0, Math.floor(waypoints.length / 2), waypoints.length - 1])
  );
  const targets = indices.map((i) => waypoints[i]);

  const samples = await Promise.all(
    targets.map(async (wp) => {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${wp.point.lat.toFixed(
        4
      )}&longitude=${wp.point.lon.toFixed(
        4
      )}&hourly=pm10,pm2_5,european_aqi,uv_index&forecast_days=5&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Air quality fetch failed');
      const data = await res.json();
      const times: string[] = data?.hourly?.time || [];
      if (times.length === 0) return { aqi: 20, pm25: 8, pm10: 15, uv: 1 };

      const targetMs = (wp.point.estimatedTime || new Date()).getTime();
      let bestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(new Date(times[i]).getTime() - targetMs);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = i;
        }
      }

      return {
        aqi: Number(data.hourly.european_aqi?.[bestIdx] ?? 20),
        pm25: Number(data.hourly.pm2_5?.[bestIdx] ?? 8),
        pm10: Number(data.hourly.pm10?.[bestIdx] ?? 15),
        uv: Number(data.hourly.uv_index?.[bestIdx] ?? 1),
      };
    })
  );

  const maxAqi = Math.round(Math.max(...samples.map((s) => s.aqi)));
  const avgAqi = Math.round(samples.reduce((a, b) => a + b.aqi, 0) / samples.length);
  const maxPm25 = Math.round(Math.max(...samples.map((s) => s.pm25)) * 10) / 10;
  const maxPm10 = Math.round(Math.max(...samples.map((s) => s.pm10)) * 10) / 10;
  const maxUv = Math.round(Math.max(...samples.map((s) => s.uv)) * 10) / 10;

  let ratingLabel = 'Bardzo dobra';
  let ratingTone: AirQualitySummary['ratingTone'] = 'good';
  if (maxAqi > 60) {
    ratingLabel = 'Zła (wysoki smog)';
    ratingTone = 'poor';
  } else if (maxAqi > 40) {
    ratingLabel = 'Umiarkowana';
    ratingTone = 'moderate';
  } else if (maxAqi > 20) {
    ratingLabel = 'Dobra';
    ratingTone = 'good';
  }

  return {
    maxAqi,
    avgAqi,
    maxPm25,
    maxPm10,
    maxUv,
    ratingLabel,
    ratingTone,
  };
}

export async function fetchWeekForecast(
  points: TrackPoint[],
  settings: TripSettings
): Promise<WeekdayForecastSummary[]> {
  if (points.length < 2) return [];

  const start = points[0];
  const mid = points[Math.floor(points.length / 2)];
  const end = points[points.length - 1];
  const samplePoints = [
    { lat: start.lat, lon: start.lon, bearing: calculateBearing(start.lat, start.lon, mid.lat, mid.lon) },
    { lat: mid.lat, lon: mid.lon, bearing: calculateBearing(start.lat, start.lon, end.lat, end.lon) },
    { lat: end.lat, lon: end.lon, bearing: calculateBearing(mid.lat, mid.lon, end.lat, end.lon) },
  ];

  const dataPerPoint = await Promise.all(
    samplePoints.map(async (pt) => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt.lat.toFixed(
        4
      )}&longitude=${pt.lon.toFixed(
        4
      )}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code&forecast_days=7&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('7-day forecast fetch failed');
      const json = await res.json();
      return { bearing: pt.bearing, hourly: json.hourly };
    })
  );

  const totalHours = Math.max(0.5, (points[points.length - 1].distanceFromStart || 10) / Math.max(5, settings.speedKmH));
  const [startH, startM] = settings.departureTime.split(':').map(Number);
  const startHourFrac = (startH || 9) + (startM || 0) / 60;

  const days: WeekdayForecastSummary[] = [];
  const today = new Date();

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
    const dateStr = [
      dt.getFullYear(),
      String(dt.getMonth() + 1).padStart(2, '0'),
      String(dt.getDate()).padStart(2, '0'),
    ].join('-');

    let tempSum = 0;
    let maxWind = 0;
    let maxGusts = 0;
    let maxRainProb = 0;
    let tailwindCount = 0;
    let worstCode = 0;

    dataPerPoint.forEach((pData, idx) => {
      const progress = idx / Math.max(1, dataPerPoint.length - 1);
      const targetHour = Math.min(23, Math.round(startHourFrac + progress * totalHours));
      const targetIsoPrefix = `${dateStr}T${String(targetHour).padStart(2, '0')}:00`;
      const times: string[] = pData.hourly?.time || [];
      let hIdx = times.findIndex((t) => t === targetIsoPrefix);
      if (hIdx < 0) hIdx = Math.min(times.length - 1, dayOffset * 24 + targetHour);

      const temp = Number(pData.hourly.temperature_2m?.[hIdx] ?? 15);
      const wind = Number(pData.hourly.wind_speed_10m?.[hIdx] ?? 10);
      const gusts = Number(pData.hourly.wind_gusts_10m?.[hIdx] ?? wind * 1.5);
      const rain = Number(pData.hourly.precipitation_probability?.[hIdx] ?? 0);
      const dir = Number(pData.hourly.wind_direction_10m?.[hIdx] ?? 0);
      const code = Number(pData.hourly.weather_code?.[hIdx] ?? 1);

      tempSum += temp;
      if (wind > maxWind) maxWind = wind;
      if (gusts > maxGusts) maxGusts = gusts;
      if (rain > maxRainProb) maxRainProb = rain;
      if (code > worstCode) worstCode = code;
      if (getWindRelation(pData.bearing, dir) === 'tailwind') tailwindCount++;
    });

    const avgTemp = Math.round(tempSum / dataPerPoint.length);
    const tailwindPct = Math.round((tailwindCount / dataPerPoint.length) * 100);
    const tempComfort = 25 - Math.abs(avgTemp - 19) * 1.1;
    const score =
      100 - maxRainProb * 0.9 - maxWind * 0.8 - maxGusts * 0.3 + tailwindPct * 0.25 + tempComfort;

    const weekdayRaw =
      dayOffset === 0
        ? 'Dzisiaj'
        : dayOffset === 1
        ? 'Jutro'
        : dt.toLocaleDateString('pl-PL', { weekday: 'long' });
    const weekdayLabel =
      weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1);

    days.push({
      date: dateStr,
      weekdayLabel,
      avgTemp,
      maxWind: Math.round(maxWind),
      maxGusts: Math.round(maxGusts),
      maxRainProb: Math.round(maxRainProb),
      tailwindPct,
      weatherIcon: getWeatherDescription(worstCode).icon,
      score,
      isBest: false,
    });
  }

  let bestIdx = 0;
  for (let i = 1; i < days.length; i++) {
    if (days[i].score > days[bestIdx].score) bestIdx = i;
  }
  if (days[bestIdx]) days[bestIdx].isBest = true;

  return days;
}

export function detectRouteClimbs(
  points: TrackPoint[],
  waypoints: WaypointWeather[]
): RouteClimb[] {
  if (points.length < 4) return [];

  // Smooth elevation slightly to prevent GPS noise from fragmenting climbs
  const smoothed = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)].elevation;
    const curr = p.elevation;
    const next = points[Math.min(points.length - 1, i + 1)].elevation;
    return (prev + curr + next) / 3;
  });

  const findNearestWeather = (distKm: number): WaypointWeather | null => {
    if (waypoints.length === 0) return null;
    let best = waypoints[0];
    let bestDiff = Math.abs(best.point.distanceFromStart - distKm);
    for (const wp of waypoints) {
      const d = Math.abs(wp.point.distanceFromStart - distKm);
      if (d < bestDiff) {
        bestDiff = d;
        best = wp;
      }
    }
    return best;
  };

  const climbs: RouteClimb[] = [];
  let inClimb = false;
  let startIdx = 0;
  let peakIdx = 0;
  let peakEle = smoothed[0];
  let maxSegSlope = 0;

  const finalizeClimb = (sIdx: number, eIdx: number, segMaxSlope: number) => {
    const startPt = points[sIdx];
    const endPt = points[eIdx];
    const lengthKm = endPt.distanceFromStart - startPt.distanceFromStart;
    const gainM = smoothed[eIdx] - smoothed[sIdx];
    if (lengthKm < 0.25 || gainM < 22) return;

    const avgSlopePct = (gainM / (lengthKm * 1000)) * 100;
    if (avgSlopePct < 2.0) return;

    const score = gainM * avgSlopePct;
    let category: RouteClimb['category'] = 'Łagodny';
    if (score >= 2500) category = 'Bardzo trudny';
    else if (score >= 1100) category = 'Trudny';
    else if (score >= 450) category = 'Średni';

    climbs.push({
      id: `${sIdx}-${eIdx}`,
      startKm: Math.round(startPt.distanceFromStart * 10) / 10,
      endKm: Math.round(endPt.distanceFromStart * 10) / 10,
      lengthKm: Math.round(lengthKm * 10) / 10,
      elevationGainM: Math.round(gainM),
      avgSlopePct: Math.round(avgSlopePct * 10) / 10,
      maxSlopePct: Math.round(Math.max(avgSlopePct, segMaxSlope) * 10) / 10,
      summitElevationM: Math.round(endPt.elevation),
      category,
      summitWeather: findNearestWeather(endPt.distanceFromStart),
    });
  };

  for (let i = 1; i < points.length; i++) {
    const dDistM = (points[i].distanceFromStart - points[i - 1].distanceFromStart) * 1000;
    const dEle = smoothed[i] - smoothed[i - 1];
    const slope = dDistM > 15 ? (dEle / dDistM) * 100 : 0;

    if (!inClimb) {
      if (dEle > 0.3 && slope >= 1.5) {
        inClimb = true;
        startIdx = i - 1;
        peakIdx = i;
        peakEle = smoothed[i];
        maxSegSlope = Math.min(25, Math.max(0, slope));
      }
    } else {
      if (smoothed[i] >= peakEle) {
        peakEle = smoothed[i];
        peakIdx = i;
        if (slope > maxSegSlope && slope < 25) maxSegSlope = slope;
      } else if (peakEle - smoothed[i] > 12 || i === points.length - 1) {
        finalizeClimb(startIdx, peakIdx, maxSegSlope);
        inClimb = false;
      }
    }
  }

  if (inClimb) {
    finalizeClimb(startIdx, peakIdx, maxSegSlope);
  }

  return climbs;
}

export interface AnalyzeRoutePayload {
  routeSummary: {
    name: string;
    totalDistanceKm: number;
    elevationGainM: number;
    elevationLossM: number;
    minElevationM: number;
    maxElevationM: number;
    bikeType: string;
    speedKmH: number;
    departureDate: string;
    departureTime: string;
    estimatedDurationMinutes: number;
    sunrise?: string;
    sunset?: string;
  };
  waypointsSummary: {
    km: number;
    tempC: number;
    apparentC: number;
    windKmH: number;
    gustsKmH: number;
    windRelation: string;
    rainProbPct: number;
    weather: string;
  }[];
  climbs: {
    startKm: number;
    endKm: number;
    lengthKm: number;
    gainM: number;
    avgSlopePct: number;
    category: string;
  }[];
  airQuality: AirQualitySummary | null;
}

export function buildAiPayload(
  route: RouteData,
  settings: TripSettings,
  waypoints: WaypointWeather[],
  climbs: RouteClimb[],
  airQuality: AirQualitySummary | null,
  sunTimes: SunTimes | null,
  realisticDurationMinutes: number | null
): AnalyzeRoutePayload {
  const durationMinutes =
    realisticDurationMinutes ??
    Math.round((route.totalDistance / Math.max(1, settings.speedKmH)) * 60) +
      (settings.breakMinutes || 0);

  return {
    routeSummary: {
      name: route.name,
      totalDistanceKm: route.totalDistance,
      elevationGainM: route.elevationGain,
      elevationLossM: route.elevationLoss,
      minElevationM: route.minElevation,
      maxElevationM: route.maxElevation,
      bikeType: settings.bikeType,
      speedKmH: settings.speedKmH,
      departureDate: settings.departureDate,
      departureTime: settings.departureTime,
      estimatedDurationMinutes: durationMinutes,
      sunrise: sunTimes?.sunrise,
      sunset: sunTimes?.sunset,
    },
    waypointsSummary: waypoints.map((w) => ({
      km: Math.round(w.point.distanceFromStart * 10) / 10,
      tempC: Math.round(w.temperature),
      apparentC: Math.round(w.apparentTemperature),
      windKmH: Math.round(w.windSpeed),
      gustsKmH: Math.round(w.windGusts),
      windRelation: w.windRelation,
      rainProbPct: w.precipitationProbability,
      weather: w.weatherDescription,
    })),
    climbs: climbs.slice(0, 6).map((c) => ({
      startKm: c.startKm,
      endKm: c.endKm,
      lengthKm: c.lengthKm,
      gainM: c.elevationGainM,
      avgSlopePct: c.avgSlopePct,
      category: c.category,
    })),
    airQuality,
  };
}

export async function requestAiRouteAnalysis(
  payload: AnalyzeRoutePayload
): Promise<AiRouteAnalysis> {
  const res = await fetch('/api/analyze-route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Nie udało się wygenerować analizy AI.');
  }
  return data as AiRouteAnalysis;
}

export async function askAiRouteQuestion(
  question: string,
  context: AnalyzeRoutePayload
): Promise<string> {
  const res = await fetch('/api/analyze-route-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Nie udało się uzyskać odpowiedzi AI.');
  }
  return data.answer || '';
}
