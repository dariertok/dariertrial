import {
  TrackPoint,
  WaypointWeather,
  TripSettings,
  RouteWeatherResult,
  SunTimes,
  DepartureWindowSummary,
  HourlyForecastPoint,
  WeatherProvider,
  ModelComparisonEntry,
} from '../types';
import {
  calculateBearing,
  computeCumulativeRideMinutes,
  getWindRelation,
  WindSampleAtDist,
} from './gpxParser';

export interface WeatherProviderInfo {
  id: WeatherProvider;
  name: string;
  badge: string;
  description: string;
}

export const WEATHER_PROVIDERS: WeatherProviderInfo[] = [
  {
    id: 'met_no',
    name: 'Yr.no / MET Norway',
    badge: 'Norwegia · Niezależne API',
    description:
      'Norweski Instytut Meteorologiczny (api.met.no). Ceniony w Polsce za trafne opady i zachmurzenie (~9 dni).',
  },
  {
    id: 'dwd_icon',
    name: 'DWD ICON',
    badge: 'Niemcy · Wysoka rozdzielczość PL',
    description:
      'Niemiecki model regionalny ICON (siatka 2–7 km nad Polską). Bardzo precyzyjny dla wiatru i porywów.',
  },
  {
    id: 'ecmwf',
    name: 'ECMWF IFS',
    badge: 'Europa · Złoty standard',
    description:
      'Europejskie Centrum Prognoz Średnioterminowych — stabilne prognozy na wyjazdy 2–10 dni naprzód.',
  },
  {
    id: 'noaa_gfs',
    name: 'NOAA GFS',
    badge: 'USA · Globalny (16 dni)',
    description:
      'Amerykański model globalny do sprawdzania długich terminów i porównywania frontów atmosferycznych.',
  },
  {
    id: 'open_meteo_auto',
    name: 'Open-Meteo (Auto)',
    badge: 'Miks modeli',
    description:
      'Domyślne automatyczne łączenie modeli pogodowych w zależności od lokalizacji i terminu.',
  },
];

export function getWeatherProviderInfo(provider: WeatherProvider): WeatherProviderInfo {
  return (
    WEATHER_PROVIDERS.find((p) => p.id === provider) ||
    WEATHER_PROVIDERS[WEATHER_PROVIDERS.length - 1]
  );
}

export function getWeatherDescription(code: number): { description: string; icon: string } {
  switch (code) {
    case 0:
      return { description: 'Bezchmurnie', icon: '☀️' };
    case 1:
    case 2:
      return { description: 'Częściowe zachmurzenie', icon: '⛅' };
    case 3:
      return { description: 'Pochmurno', icon: '☁️' };
    case 45:
    case 48:
      return { description: 'Mgła', icon: '🌫️' };
    case 51:
    case 53:
    case 55:
      return { description: 'Mżawka', icon: '🌦️' };
    case 61:
    case 63:
    case 65:
      return { description: 'Deszcz', icon: '🌧️' };
    case 71:
    case 73:
    case 75:
      return { description: 'Śnieg', icon: '❄️' };
    case 95:
    case 96:
    case 99:
      return { description: 'Burza', icon: '⚡' };
    default:
      return { description: 'Przelotne opady', icon: '🌧️' };
  }
}

function mapMetNoSymbolToWmo(symbolCode?: string): number {
  if (!symbolCode) return 2;
  const base = symbolCode.replace(/_(day|night|polartwilight)$/, '');
  if (base.includes('thunder')) return 95;
  if (base.includes('snow') || base.includes('sleet')) {
    return base.includes('light') ? 71 : 73;
  }
  if (base.includes('fog')) return 45;
  if (base.includes('heavyrain')) return 65;
  if (base.includes('lightrainshowers') || base.includes('lightrain')) return 51;
  if (base.includes('rain')) return 63;
  if (base === 'clearsky') return 0;
  if (base === 'fair' || base === 'partlycloudy') return 2;
  if (base === 'cloudy') return 3;
  return 2;
}

function estimateMetNoPrecipProb(symbolCode: string | undefined, precipMm: number): number {
  const base = (symbolCode || '').replace(/_(day|night|polartwilight)$/, '');
  if (precipMm >= 2.0) return 90;
  if (precipMm >= 0.5) return 75;
  if (precipMm > 0) return 55;
  if (base.includes('heavyrain') || base.includes('thunder')) return 85;
  if (base.includes('rain') || base.includes('snow') || base.includes('sleet')) return 60;
  if (base === 'cloudy') return 15;
  if (base === 'partlycloudy' || base === 'fair') return 5;
  return 0;
}

function computeSunTimes(lat: number, lon: number, dateStr: string): SunTimes | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;
  const doy = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);

  const calc = (isSunrise: boolean): string | null => {
    const lngHour = lon / 15;
    const t = doy + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = deg * Math.atan(0.91764 * Math.tan(L * rad));
    RA = ((RA % 360) + 360) % 360;
    const Lquad = Math.floor(L / 90) * 90;
    const RAquad = Math.floor(RA / 90) * 90;
    RA = (RA + (Lquad - RAquad)) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH =
      (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    const H = (isSunrise ? 360 - deg * Math.acos(cosH) : deg * Math.acos(cosH)) / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = (((T - lngHour) % 24) + 24) % 24;
    const ms = Date.UTC(y, m - 1, d) + Math.round(UT * 3600 * 1000);
    return new Date(ms).toISOString();
  };

  const sunrise = calc(true);
  const sunset = calc(false);
  if (!sunrise || !sunset) return null;
  return { sunrise, sunset };
}

function findClosestHourIdx(hourly: HourlyForecastPoint[], targetTime: Date): number {
  let closestIdx = 0;
  let minDiff = Infinity;
  const targetMs = targetTime.getTime();
  for (let i = 0; i < hourly.length; i++) {
    const diff = Math.abs(new Date(hourly[i].time).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = i;
    }
  }
  return closestIdx;
}

function buildDepartureWindows(
  waypoints: WaypointWeather[],
  settings: TripSettings,
  totalDistance: number,
  waypointRideMinutes: number[]
): DepartureWindowSummary[] {
  if (waypoints.length === 0) return [];
  const candidateHours = ['07:00', '09:00', '11:30', '14:00', '16:30'];
  const breakMinutes = settings.breakMinutes || 0;

  const summaries: DepartureWindowSummary[] = candidateHours.map((startTimeStr) => {
    const baseDate = new Date(`${settings.departureDate}T${startTimeStr}:00`);
    let tempSum = 0;
    let maxWind = 0;
    let maxGusts = 0;
    let maxRainProb = 0;
    let tailwindCount = 0;
    let worstCode = 0;

    waypoints.forEach((wp, idx) => {
      const progress = totalDistance > 0 ? wp.point.distanceFromStart / totalDistance : 0;
      const rideMins = waypointRideMinutes[idx] ?? (wp.point.distanceFromStart / Math.max(1, settings.speedKmH)) * 60;
      const arrivalTime = new Date(
        baseDate.getTime() + (rideMins + progress * breakMinutes) * 60 * 1000
      );

      let slot = {
        temperature: wp.temperature,
        windSpeed: wp.windSpeed,
        windGusts: wp.windGusts,
        windDirection: wp.windDirection,
        precipitationProbability: wp.precipitationProbability,
        weatherCode: wp.weatherCode,
      };

      if (wp.hourlySeries && wp.hourlySeries.length > 0) {
        const hIdx = findClosestHourIdx(wp.hourlySeries, arrivalTime);
        slot = wp.hourlySeries[hIdx];
      }

      tempSum += slot.temperature;
      if (slot.windSpeed > maxWind) maxWind = slot.windSpeed;
      if (slot.windGusts > maxGusts) maxGusts = slot.windGusts;
      if (slot.precipitationProbability > maxRainProb) maxRainProb = slot.precipitationProbability;
      if (slot.weatherCode > worstCode) worstCode = slot.weatherCode;

      const rel = getWindRelation(wp.routeBearing, slot.windDirection);
      if (rel === 'tailwind') tailwindCount++;
    });

    const avgTemp = Math.round(tempSum / waypoints.length);
    const tailwindPercent = Math.round((tailwindCount / waypoints.length) * 100);

    const tempComfort = 25 - Math.abs(avgTemp - 19) * 1.1;
    const score =
      100 -
      maxRainProb * 0.9 -
      maxWind * 0.8 -
      maxGusts * 0.3 +
      tailwindPercent * 0.25 +
      tempComfort;

    const { icon } = getWeatherDescription(worstCode);

    return {
      time: startTimeStr,
      avgTemp,
      maxWind: Math.round(maxWind),
      maxGusts: Math.round(maxGusts),
      maxRainProb: Math.round(maxRainProb),
      tailwindPercent,
      weatherIcon: icon,
      score,
      isBest: false,
    };
  });

  let bestIdx = 0;
  for (let i = 1; i < summaries.length; i++) {
    if (summaries[i].score > summaries[bestIdx].score) bestIdx = i;
  }
  summaries[bestIdx].isBest = true;

  return summaries;
}

interface MetNoEntry {
  time: string;
  data?: {
    instant?: {
      details?: {
        air_temperature?: number;
        apparent_air_temperature?: number;
        relative_humidity?: number;
        wind_speed?: number;
        wind_speed_of_gust?: number;
        wind_from_direction?: number;
      };
    };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number; probability_of_precipitation?: number };
    };
    next_6_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number; probability_of_precipitation?: number };
    };
  };
}

async function fetchMetNoHourly(lat: number, lon: number): Promise<HourlyForecastPoint[]> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(
    4
  )}&lon=${lon.toFixed(4)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('MET Norway fetch failed');
  const json = await res.json();
  const timeseries: MetNoEntry[] = json?.properties?.timeseries || [];
  if (timeseries.length === 0) throw new Error('Empty MET Norway timeseries');

  return timeseries.map((entry) => {
    const inst = entry.data?.instant?.details || {};
    const n1 = entry.data?.next_1_hours;
    const n6 = entry.data?.next_6_hours;

    const temp = inst.air_temperature ?? 15;
    const apparentTemp = inst.apparent_air_temperature ?? temp;
    const windMs = inst.wind_speed ?? 3;
    const windKmH = Math.round(windMs * 3.6 * 10) / 10;
    const gustKmH =
      inst.wind_speed_of_gust != null
        ? Math.round(inst.wind_speed_of_gust * 3.6 * 10) / 10
        : Math.round(windKmH * 1.45 * 10) / 10;

    const precip =
      n1?.details?.precipitation_amount ??
      (n6?.details?.precipitation_amount != null
        ? Math.round((n6.details.precipitation_amount / 6) * 10) / 10
        : 0);

    const symbol = n1?.summary?.symbol_code || n6?.summary?.symbol_code;
    const precipProb =
      n1?.details?.probability_of_precipitation ??
      n6?.details?.probability_of_precipitation ??
      estimateMetNoPrecipProb(symbol, precip);

    return {
      time: entry.time,
      temperature: Math.round(temp * 10) / 10,
      apparentTemperature: Math.round(apparentTemp * 10) / 10,
      humidity: Math.round(inst.relative_humidity ?? 60),
      precipitationProbability: Math.round(precipProb),
      precipitation: Math.round(precip * 10) / 10,
      windSpeed: windKmH,
      windGusts: gustKmH,
      windDirection: Math.round(inst.wind_from_direction ?? 0),
      weatherCode: mapMetNoSymbolToWmo(symbol),
    };
  });
}

function getOpenMeteoModelParam(provider: WeatherProvider): string | null {
  switch (provider) {
    case 'ecmwf':
      return 'ecmwf_ifs025';
    case 'dwd_icon':
      return 'icon_seamless';
    case 'noaa_gfs':
      return 'gfs_seamless';
    case 'open_meteo_auto':
    default:
      return null;
  }
}

async function fetchOpenMeteoHourly(
  lat: number,
  lon: number,
  provider: WeatherProvider,
  departureDate: string,
  includeSunTimes: boolean
): Promise<{ hourlySeries: HourlyForecastPoint[]; sunTimes: SunTimes | null }> {
  const model = getOpenMeteoModelParam(provider);
  const modelQuery = model ? `&models=${model}` : '';
  const dailyQuery = includeSunTimes ? '&daily=sunrise,sunset' : '';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code${dailyQuery}${modelQuery}&forecast_days=16&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Open-Meteo fetch failed');
  const data = await res.json();

  let sunTimes: SunTimes | null = null;
  if (includeSunTimes && data.daily?.time) {
    const dayIdx = data.daily.time.findIndex((d: string) => d === departureDate);
    const targetIdx = dayIdx >= 0 ? dayIdx : 0;
    if (data.daily.sunrise?.[targetIdx] && data.daily.sunset?.[targetIdx]) {
      sunTimes = {
        sunrise: data.daily.sunrise[targetIdx],
        sunset: data.daily.sunset[targetIdx],
      };
    }
  }

  const times: string[] = data.hourly?.time || [];
  const hourlySeries: HourlyForecastPoint[] = times.map((t, i) => ({
    time: t,
    temperature: data.hourly.temperature_2m?.[i] ?? 15,
    apparentTemperature:
      data.hourly.apparent_temperature?.[i] ?? data.hourly.temperature_2m?.[i] ?? 15,
    humidity: data.hourly.relative_humidity_2m?.[i] ?? 60,
    precipitationProbability: data.hourly.precipitation_probability?.[i] ?? 0,
    precipitation: data.hourly.precipitation?.[i] ?? 0,
    windSpeed: data.hourly.wind_speed_10m?.[i] ?? 10,
    windGusts: data.hourly.wind_gusts_10m?.[i] ?? (data.hourly.wind_speed_10m?.[i] ?? 10) * 1.5,
    windDirection: data.hourly.wind_direction_10m?.[i] ?? 0,
    weatherCode: data.hourly.weather_code?.[i] ?? 0,
  }));

  if (hourlySeries.length === 0) throw new Error('Empty Open-Meteo hourly series');
  return { hourlySeries, sunTimes };
}

function sampleRoutePoints(points: TrackPoint[], maxSamplesCount: number) {
  const maxSamples = Math.min(maxSamplesCount, points.length);
  const step = Math.max(1, Math.floor(points.length / maxSamples));
  const sampledPoints: { point: TrackPoint; index: number; bearing: number }[] = [];

  for (let i = 0; i < points.length; i += step) {
    const nextIdx = Math.min(points.length - 1, i + Math.max(1, Math.floor(step / 2)));
    const prevIdx = Math.max(0, i - 1);
    const pA = i < points.length - 1 ? points[i] : points[prevIdx];
    const pB = i < points.length - 1 ? points[nextIdx] : points[i];
    const bearing = calculateBearing(pA.lat, pA.lon, pB.lat, pB.lon);
    sampledPoints.push({ point: points[i], index: i, bearing });
  }

  if (sampledPoints[sampledPoints.length - 1].index !== points.length - 1) {
    const lastIdx = points.length - 1;
    const prevIdx = Math.max(0, lastIdx - 1);
    const bearing = calculateBearing(
      points[prevIdx].lat,
      points[prevIdx].lon,
      points[lastIdx].lat,
      points[lastIdx].lon
    );
    sampledPoints.push({ point: points[lastIdx], index: lastIdx, bearing });
  }

  return sampledPoints;
}

export async function fetchRouteWeather(
  points: TrackPoint[],
  settings: TripSettings
): Promise<RouteWeatherResult> {
  if (points.length === 0) {
    return {
      waypoints: [],
      sunTimes: null,
      departureWindows: [],
      realisticDurationMinutes: 0,
      flatDurationMinutes: 0,
    };
  }

  const sampledPoints = sampleRoutePoints(points, 12);
  const totalDistance = points[points.length - 1].distanceFromStart || 0;
  const breakMinutes = settings.breakMinutes || 0;
  const baseDate = new Date(`${settings.departureDate}T${settings.departureTime}:00`);
  const provider: WeatherProvider = settings.weatherProvider || 'open_meteo_auto';

  // Pass 1: cumulative ride minutes based on terrain slope & bike type
  const terrainOnlyMinutes = computeCumulativeRideMinutes(points, settings);
  const flatRideMinutes = (totalDistance / Math.max(1, settings.speedKmH)) * 60;
  const flatDurationMinutes = Math.round(flatRideMinutes + breakMinutes);

  let sunTimes: SunTimes | null = null;

  const weatherPromises = sampledPoints.map(async ({ point, index, bearing }, sIdx) => {
    const progress = totalDistance > 0 ? point.distanceFromStart / totalDistance : 0;
    const rideMins = terrainOnlyMinutes[index] ?? 0;
    const arrivalTime = new Date(baseDate.getTime() + (rideMins + progress * breakMinutes) * 60 * 1000);

    const lat = point.lat;
    const lon = point.lon;
    const isLastPoint = sIdx === sampledPoints.length - 1;

    try {
      let hourlySeries: HourlyForecastPoint[];

      if (provider === 'met_no') {
        hourlySeries = await fetchMetNoHourly(lat, lon);
        if (isLastPoint) {
          sunTimes = computeSunTimes(lat, lon, settings.departureDate);
        }
      } else {
        const res = await fetchOpenMeteoHourly(
          lat,
          lon,
          provider,
          settings.departureDate,
          isLastPoint
        );
        hourlySeries = res.hourlySeries;
        if (isLastPoint) {
          sunTimes = res.sunTimes ?? computeSunTimes(lat, lon, settings.departureDate);
        }
      }

      const closestIdx = findClosestHourIdx(hourlySeries, arrivalTime);
      const chosen = hourlySeries[closestIdx];
      const { description, icon } = getWeatherDescription(chosen.weatherCode);
      const windRelation = getWindRelation(bearing, chosen.windDirection);

      return {
        point: { ...point, estimatedTime: arrivalTime },
        temperature: chosen.temperature,
        apparentTemperature: chosen.apparentTemperature,
        humidity: chosen.humidity,
        precipitationProbability: chosen.precipitationProbability,
        precipitation: chosen.precipitation,
        windSpeed: chosen.windSpeed,
        windGusts: chosen.windGusts,
        windDirection: chosen.windDirection,
        routeBearing: bearing,
        windRelation,
        weatherCode: chosen.weatherCode,
        weatherDescription: description,
        weatherIcon: icon,
        hourlySeries,
      } as WaypointWeather;
    } catch {
      if (isLastPoint && !sunTimes) {
        sunTimes = computeSunTimes(lat, lon, settings.departureDate);
      }
      const windDirection = 180;
      const windRelation = getWindRelation(bearing, windDirection);
      return {
        point: { ...point, estimatedTime: arrivalTime },
        temperature: Math.round(17 - point.elevation / 300),
        apparentTemperature: Math.round(15 - point.elevation / 300),
        humidity: 62,
        precipitationProbability: 10,
        precipitation: 0.0,
        windSpeed: 14,
        windGusts: 22,
        windDirection,
        routeBearing: bearing,
        windRelation,
        weatherCode: 1,
        weatherDescription: 'Częściowe zachmurzenie',
        weatherIcon: '⛅',
      } as WaypointWeather;
    }
  });

  const initialWaypoints = await Promise.all(weatherPromises);

  // Pass 2: If realisticPace is enabled, refine arrival times using actual wind along route
  const windSamples: WindSampleAtDist[] = initialWaypoints.map((w) => ({
    distanceFromStart: w.point.distanceFromStart,
    windSpeed: w.windSpeed,
    windDirection: w.windDirection,
  }));
  const fullRealisticMinutes = computeCumulativeRideMinutes(points, settings, windSamples);
  const totalRealisticRideMins =
    fullRealisticMinutes[fullRealisticMinutes.length - 1] ?? flatRideMinutes;
  const realisticDurationMinutes = Math.round(totalRealisticRideMins + breakMinutes);

  const waypointRideMinutes: number[] = [];
  const waypoints = initialWaypoints.map((wp, idx) => {
    const ptIdx = sampledPoints[idx].index;
    const rideMins = fullRealisticMinutes[ptIdx] ?? 0;
    waypointRideMinutes.push(rideMins);

    const progress = totalDistance > 0 ? wp.point.distanceFromStart / totalDistance : 0;
    const refinedArrival = new Date(
      baseDate.getTime() + (rideMins + progress * breakMinutes) * 60 * 1000
    );

    if (wp.hourlySeries && wp.hourlySeries.length > 0) {
      const closestIdx = findClosestHourIdx(wp.hourlySeries, refinedArrival);
      const chosen = wp.hourlySeries[closestIdx];
      const { description, icon } = getWeatherDescription(chosen.weatherCode);
      const windRelation = getWindRelation(wp.routeBearing, chosen.windDirection);
      return {
        ...wp,
        point: { ...wp.point, estimatedTime: refinedArrival },
        temperature: chosen.temperature,
        apparentTemperature: chosen.apparentTemperature,
        humidity: chosen.humidity,
        precipitationProbability: chosen.precipitationProbability,
        precipitation: chosen.precipitation,
        windSpeed: chosen.windSpeed,
        windGusts: chosen.windGusts,
        windDirection: chosen.windDirection,
        windRelation,
        weatherCode: chosen.weatherCode,
        weatherDescription: description,
        weatherIcon: icon,
      };
    }

    return {
      ...wp,
      point: { ...wp.point, estimatedTime: refinedArrival },
    };
  });

  const departureWindows = buildDepartureWindows(
    waypoints,
    settings,
    totalDistance,
    waypointRideMinutes
  );

  return {
    waypoints,
    sunTimes,
    departureWindows,
    realisticDurationMinutes,
    flatDurationMinutes,
  };
}

export async function compareRouteModels(
  points: TrackPoint[],
  settings: TripSettings
): Promise<ModelComparisonEntry[]> {
  if (points.length === 0) return [];

  const providersToCompare: WeatherProvider[] = ['met_no', 'dwd_icon', 'ecmwf'];
  const sampled = sampleRoutePoints(points, 4);
  const totalDistance = points[points.length - 1].distanceFromStart || 0;
  const rideMinsArr = computeCumulativeRideMinutes(points, settings);
  const breakMinutes = settings.breakMinutes || 0;
  const baseDate = new Date(`${settings.departureDate}T${settings.departureTime}:00`);

  const results = await Promise.all(
    providersToCompare.map(async (provider) => {
      const info = getWeatherProviderInfo(provider);
      const pointStats = await Promise.all(
        sampled.map(async ({ point, index, bearing }) => {
          const progress = totalDistance > 0 ? point.distanceFromStart / totalDistance : 0;
          const rideMins = rideMinsArr[index] ?? 0;
          const arrivalTime = new Date(
            baseDate.getTime() + (rideMins + progress * breakMinutes) * 60 * 1000
          );

          const hourly =
            provider === 'met_no'
              ? await fetchMetNoHourly(point.lat, point.lon)
              : (
                  await fetchOpenMeteoHourly(
                    point.lat,
                    point.lon,
                    provider,
                    settings.departureDate,
                    false
                  )
                ).hourlySeries;

          const idx = findClosestHourIdx(hourly, arrivalTime);
          const chosen = hourly[idx];
          const rel = getWindRelation(bearing, chosen.windDirection);
          return { chosen, rel };
        })
      );

      const temps = pointStats.map((s) => s.chosen.temperature);
      const winds = pointStats.map((s) => s.chosen.windSpeed);
      const gusts = pointStats.map((s) => s.chosen.windGusts);
      const rains = pointStats.map((s) => s.chosen.precipitationProbability);
      const worstCode = Math.max(...pointStats.map((s) => s.chosen.weatherCode));
      const tailwindCount = pointStats.filter((s) => s.rel === 'tailwind').length;

      return {
        provider,
        name: info.name,
        badge: info.badge,
        minTemp: Math.round(Math.min(...temps)),
        maxTemp: Math.round(Math.max(...temps)),
        maxWind: Math.round(Math.max(...winds)),
        maxGusts: Math.round(Math.max(...gusts)),
        maxRainProb: Math.round(Math.max(...rains)),
        tailwindPct: Math.round((tailwindCount / pointStats.length) * 100),
        weatherIcon: getWeatherDescription(worstCode).icon,
      } as ModelComparisonEntry;
    })
  );

  return results;
}
