export interface TrackPoint {
  lat: number;
  lon: number;
  elevation: number;
  time?: string;
  distanceFromStart: number; // in km
  estimatedTime?: Date;
}

export type WindRelation = 'tailwind' | 'crosswind' | 'headwind';

export interface HourlyForecastPoint {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitationProbability: number;
  precipitation: number;
  windSpeed: number;
  windGusts: number;
  windDirection: number;
  weatherCode: number;
}

export interface WaypointWeather {
  point: TrackPoint;
  temperature: number; // °C
  apparentTemperature: number;
  humidity: number; // %
  precipitationProbability: number; // %
  precipitation: number; // mm
  windSpeed: number; // km/h
  windGusts: number; // km/h
  windDirection: number; // degrees (where wind blows FROM)
  routeBearing: number; // degrees (direction cyclist travels TO)
  windRelation: WindRelation;
  weatherCode: number;
  weatherDescription: string;
  weatherIcon: string;
  hourlySeries?: HourlyForecastPoint[];
}

export interface DepartureWindowSummary {
  time: string; // "07:00"
  avgTemp: number;
  maxWind: number;
  maxGusts: number;
  maxRainProb: number;
  tailwindPercent: number;
  weatherIcon: string;
  score: number;
  isBest: boolean;
}

export interface SunTimes {
  sunrise: string; // ISO string
  sunset: string; // ISO string
}

export interface RouteWeatherResult {
  waypoints: WaypointWeather[];
  sunTimes: SunTimes | null;
  departureWindows: DepartureWindowSummary[];
  realisticDurationMinutes: number;
  flatDurationMinutes: number;
}

export interface ModelComparisonEntry {
  provider: WeatherProvider;
  name: string;
  badge: string;
  minTemp: number;
  maxTemp: number;
  maxWind: number;
  maxGusts: number;
  maxRainProb: number;
  tailwindPct: number;
  weatherIcon: string;
}

export type PoiCategory = 'water' | 'shop' | 'shelter';

export interface RoutePoi {
  id: string;
  lat: number;
  lon: number;
  category: PoiCategory;
  name: string;
  distanceAlongKm: number;
}

export interface RouteData {
  id?: string;
  name: string;
  points: TrackPoint[];
  totalDistance: number; // km
  elevationGain: number; // m
  elevationLoss: number; // m
  minElevation: number;
  maxElevation: number;
  createdAt?: string;
}

export type ColorTheme =
  | 'sky'
  | 'emerald'
  | 'amber'
  | 'violet'
  | 'rose'
  | 'teal'
  | 'indigo'
  | 'orange';

export type BgMode = 'light' | 'tinted' | 'dark' | 'midnight';

export type MapStyle = 'osm' | 'topo' | 'dark';

export type AppTab = 'map' | 'analysis' | 'schedule' | 'gear' | 'routes';

export interface AirQualitySummary {
  maxAqi: number;
  avgAqi: number;
  maxPm25: number;
  maxPm10: number;
  maxUv: number;
  ratingLabel: string;
  ratingTone: 'good' | 'moderate' | 'poor';
}

export interface RouteClimb {
  id: string;
  startKm: number;
  endKm: number;
  lengthKm: number;
  elevationGainM: number;
  avgSlopePct: number;
  maxSlopePct: number;
  summitElevationM: number;
  category: 'Łagodny' | 'Średni' | 'Trudny' | 'Bardzo trudny';
  summitWeather: WaypointWeather | null;
}

export interface WeekdayForecastSummary {
  date: string; // YYYY-MM-DD
  weekdayLabel: string;
  avgTemp: number;
  maxWind: number;
  maxGusts: number;
  maxRainProb: number;
  tailwindPct: number;
  weatherIcon: string;
  score: number;
  isBest: boolean;
}

export interface AiRouteAnalysis {
  readinessScore: number;
  overallVerdict: string;
  summary: string;
  tacticalTips: string[];
  climbStrategy: string;
  clothingAdvice: string;
  safetyNote: string;
}

export type WeatherProvider =
  | 'open_meteo_auto'
  | 'ecmwf'
  | 'dwd_icon'
  | 'met_no'
  | 'noaa_gfs';

export type BikeType = 'road' | 'gravel' | 'mtb' | 'touring' | 'ebike';

export interface TripSettings {
  departureDate: string; // YYYY-MM-DD
  departureTime: string; // HH:MM
  bikeType: BikeType;
  speedKmH: number;
  breakMinutes: number;
  realisticPace: boolean;
  colorTheme: ColorTheme;
  bgMode: BgMode;
  weatherProvider: WeatherProvider;
}

export interface GearItem {
  id: string;
  category: 'clothing' | 'safety' | 'nutrition' | 'tech';
  name: string;
  required: boolean;
  reason: string;
  checked: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  pinHash?: string;
  avatarColor: string;
  createdAt: string;
  lastLoginAt: string;
}

export type RecoveryMode = 'merge' | 'replace';

export interface SkyTrailBackupFile {
  schemaVersion: number;
  app: 'SkyTrail';
  exportedAt: string;
  profile?: {
    name: string;
    email: string;
    avatarColor: string;
  } | null;
  settings: TripSettings;
  savedRoutes: RouteData[];
  activeRoute: RouteData | null;
  gearItems?: GearItem[];
}

