import {
  BgMode,
  BikeType,
  ColorTheme,
  GearItem,
  RecoveryMode,
  RouteData,
  SkyTrailBackupFile,
  TrackPoint,
  TripSettings,
  WeatherProvider,
} from '../types';

const GUEST_ROUTES_KEY = 'skytrail_saved_routes';
const GUEST_SETTINGS_KEY = 'skytrail_appearance_v1';
const GUEST_GEAR_KEY = 'skytrail_gear_v1';
const AUTO_RECOVERY_KEY = 'skytrail_auto_recovery_snapshot_v1';

const VALID_COLOR_THEMES: ColorTheme[] = [
  'sky',
  'emerald',
  'amber',
  'violet',
  'rose',
  'teal',
  'indigo',
  'orange',
];
const VALID_BG_MODES: BgMode[] = ['light', 'tinted', 'dark', 'midnight'];
const VALID_PROVIDERS: WeatherProvider[] = [
  'open_meteo_auto',
  'ecmwf',
  'dwd_icon',
  'met_no',
  'noaa_gfs',
];
const VALID_BIKE_TYPES: BikeType[] = ['road', 'gravel', 'mtb', 'touring', 'ebike'];

export function getDefaultSettings(): TripSettings {
  return {
    departureDate: new Date().toISOString().split('T')[0],
    departureTime: '09:00',
    bikeType: 'gravel',
    speedKmH: 22,
    breakMinutes: 0,
    realisticPace: true,
    colorTheme: 'sky',
    bgMode: 'light',
    weatherProvider: 'open_meteo_auto',
  };
}

function getRoutesKey(userId: string | null): string {
  return userId ? `skytrail_u_${userId}_routes` : GUEST_ROUTES_KEY;
}

function getSettingsKey(userId: string | null): string {
  return userId ? `skytrail_u_${userId}_settings` : GUEST_SETTINGS_KEY;
}

function getGearKey(userId: string | null): string {
  return userId ? `skytrail_u_${userId}_gear` : GUEST_GEAR_KEY;
}

export function sanitizeSettings(raw: Partial<TripSettings> | null | undefined): TripSettings {
  const defaults = getDefaultSettings();
  if (!raw || typeof raw !== 'object') return defaults;

  const speed =
    typeof raw.speedKmH === 'number' && Number.isFinite(raw.speedKmH)
      ? Math.min(45, Math.max(8, Math.round(raw.speedKmH)))
      : defaults.speedKmH;

  const breakMin =
    typeof raw.breakMinutes === 'number' && Number.isFinite(raw.breakMinutes)
      ? Math.min(240, Math.max(0, Math.round(raw.breakMinutes)))
      : defaults.breakMinutes;

  const departureDate =
    typeof raw.departureDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.departureDate)
      ? raw.departureDate
      : defaults.departureDate;

  const departureTime =
    typeof raw.departureTime === 'string' && /^\d{2}:\d{2}$/.test(raw.departureTime)
      ? raw.departureTime
      : defaults.departureTime;

  return {
    departureDate,
    departureTime,
    bikeType: VALID_BIKE_TYPES.includes(raw.bikeType as BikeType)
      ? (raw.bikeType as BikeType)
      : defaults.bikeType,
    speedKmH: speed,
    breakMinutes: breakMin,
    realisticPace: typeof raw.realisticPace === 'boolean' ? raw.realisticPace : defaults.realisticPace,
    colorTheme: VALID_COLOR_THEMES.includes(raw.colorTheme as ColorTheme)
      ? (raw.colorTheme as ColorTheme)
      : defaults.colorTheme,
    bgMode: VALID_BG_MODES.includes(raw.bgMode as BgMode)
      ? (raw.bgMode as BgMode)
      : defaults.bgMode,
    weatherProvider: VALID_PROVIDERS.includes(raw.weatherProvider as WeatherProvider)
      ? (raw.weatherProvider as WeatherProvider)
      : defaults.weatherProvider,
  };
}

export function loadUserSettings(userId: string | null): TripSettings {
  try {
    const raw = localStorage.getItem(getSettingsKey(userId));
    if (!raw) return getDefaultSettings();
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return getDefaultSettings();
  }
}

export function saveUserSettings(userId: string | null, settings: TripSettings) {
  try {
    localStorage.setItem(getSettingsKey(userId), JSON.stringify(settings));
  } catch {
    // Ignore storage write errors
  }
}

export function loadSavedRoutes(userId: string | null): RouteData[] {
  try {
    const raw = localStorage.getItem(getRoutesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSavedRoutes(userId: string | null, routes: RouteData[]) {
  try {
    localStorage.setItem(getRoutesKey(userId), JSON.stringify(routes));
  } catch {
    // Ignore storage write errors
  }
}

export function loadGearState(userId: string | null): GearItem[] {
  try {
    const raw = localStorage.getItem(getGearKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGearState(userId: string | null, items: GearItem[]) {
  try {
    localStorage.setItem(getGearKey(userId), JSON.stringify(items));
  } catch {
    // Ignore storage write errors
  }
}

function isValidTrackPoint(p: unknown): p is TrackPoint {
  if (!p || typeof p !== 'object') return false;
  const pt = p as Record<string, unknown>;
  return (
    typeof pt.lat === 'number' &&
    Number.isFinite(pt.lat) &&
    typeof pt.lon === 'number' &&
    Number.isFinite(pt.lon) &&
    typeof pt.elevation === 'number' &&
    Number.isFinite(pt.elevation) &&
    typeof pt.distanceFromStart === 'number' &&
    Number.isFinite(pt.distanceFromStart)
  );
}

function sanitizeRoute(raw: unknown, idx: number): RouteData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || !Array.isArray(r.points)) return null;
  const validPoints = r.points.filter(isValidTrackPoint);
  if (validPoints.length < 2) return null;

  return {
    id: typeof r.id === 'string' && r.id ? r.id : `restored_${Date.now()}_${idx}`,
    name: r.name.trim() || `Trasa #${idx + 1}`,
    points: validPoints,
    totalDistance:
      typeof r.totalDistance === 'number' && Number.isFinite(r.totalDistance)
        ? r.totalDistance
        : Number(validPoints[validPoints.length - 1].distanceFromStart.toFixed(1)),
    elevationGain:
      typeof r.elevationGain === 'number' && Number.isFinite(r.elevationGain)
        ? r.elevationGain
        : 0,
    elevationLoss:
      typeof r.elevationLoss === 'number' && Number.isFinite(r.elevationLoss)
        ? r.elevationLoss
        : 0,
    minElevation:
      typeof r.minElevation === 'number' && Number.isFinite(r.minElevation)
        ? r.minElevation
        : Math.round(Math.min(...validPoints.map((pt) => pt.elevation))),
    maxElevation:
      typeof r.maxElevation === 'number' && Number.isFinite(r.maxElevation)
        ? r.maxElevation
        : Math.round(Math.max(...validPoints.map((pt) => pt.elevation))),
    createdAt:
      typeof r.createdAt === 'string'
        ? r.createdAt
        : new Date().toLocaleDateString('pl-PL'),
  };
}

export function buildBackupPayload(params: {
  profile: { name: string; email: string; avatarColor?: string } | null;
  settings: TripSettings;
  savedRoutes: RouteData[];
  activeRoute: RouteData | null;
  gearItems?: GearItem[];
}): SkyTrailBackupFile {
  return {
    schemaVersion: 1,
    app: 'SkyTrail',
    exportedAt: new Date().toISOString(),
    profile: params.profile
      ? {
          name: params.profile.name,
          email: params.profile.email,
          avatarColor: params.profile.avatarColor || '#0284c7',
        }
      : null,
    settings: params.settings,
    savedRoutes: params.savedRoutes,
    activeRoute: params.activeRoute,
    gearItems: params.gearItems,
  };
}

export function downloadBackupFile(payload: SkyTrailBackupFile) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const datePart = new Date().toISOString().slice(0, 10);
  const profileSlug = payload.profile?.name
    ? `_${payload.profile.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`
    : '';
  const link = document.createElement('a');
  link.href = url;
  link.download = `skytrail_kopia${profileSlug}_${datePart}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseAndValidateBackup(jsonText: string): SkyTrailBackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Wybrany plik nie jest poprawnym plikiem JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Nieprawidłowa struktura pliku kopii zapasowej.');
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.app !== 'SkyTrail') {
    throw new Error('Ten plik nie jest kopią zapasową aplikacji SkyTrail.');
  }

  const sanitizedSettings = sanitizeSettings(obj.settings as Partial<TripSettings>);
  const rawRoutes = Array.isArray(obj.savedRoutes) ? obj.savedRoutes : [];
  const sanitizedRoutes = rawRoutes
    .map((r, i) => sanitizeRoute(r, i))
    .filter((r): r is RouteData => r !== null);

  const sanitizedActiveRoute = obj.activeRoute ? sanitizeRoute(obj.activeRoute, 999) : null;
  const rawGear = Array.isArray(obj.gearItems) ? (obj.gearItems as GearItem[]) : undefined;

  let profile: SkyTrailBackupFile['profile'] = null;
  if (obj.profile && typeof obj.profile === 'object') {
    const p = obj.profile as Record<string, unknown>;
    if (typeof p.name === 'string' && typeof p.email === 'string') {
      profile = {
        name: p.name,
        email: p.email,
        avatarColor: typeof p.avatarColor === 'string' ? p.avatarColor : '#0284c7',
      };
    }
  }

  return {
    schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1,
    app: 'SkyTrail',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    profile,
    settings: sanitizedSettings,
    savedRoutes: sanitizedRoutes,
    activeRoute: sanitizedActiveRoute,
    gearItems: rawGear,
  };
}

export function mergeRoutes(existing: RouteData[], incoming: RouteData[]): RouteData[] {
  const byKey = new Map<string, RouteData>();
  for (const r of existing) {
    const key = r.id || r.name.toLowerCase();
    byKey.set(key, r);
  }
  for (const r of incoming) {
    const key = r.id || r.name.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, r);
    }
  }
  return Array.from(byKey.values());
}

export function saveAutoRecoverySnapshot(payload: SkyTrailBackupFile) {
  try {
    localStorage.setItem(AUTO_RECOVERY_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota errors
  }
}

export function loadAutoRecoverySnapshot(): SkyTrailBackupFile | null {
  try {
    const raw = localStorage.getItem(AUTO_RECOVERY_KEY);
    if (!raw) return null;
    return parseAndValidateBackup(raw);
  } catch {
    return null;
  }
}

export function applyBackupRecovery(params: {
  backup: SkyTrailBackupFile;
  mode: RecoveryMode;
  currentUserId: string | null;
  profileMeta: { name: string; email: string } | null;
  currentSettings: TripSettings;
  currentRoutes: RouteData[];
  currentActiveRoute: RouteData | null;
  currentGearItems: GearItem[];
}): {
  nextSettings: TripSettings;
  nextRoutes: RouteData[];
  nextActiveRoute: RouteData | null;
  nextGearItems: GearItem[];
} {
  const snapshot = buildBackupPayload({
    profile: params.profileMeta,
    settings: params.currentSettings,
    savedRoutes: params.currentRoutes,
    activeRoute: params.currentActiveRoute,
    gearItems: params.currentGearItems,
  });
  saveAutoRecoverySnapshot(snapshot);

  const nextSettings = params.backup.settings;
  const nextRoutes =
    params.mode === 'replace'
      ? params.backup.savedRoutes
      : mergeRoutes(params.currentRoutes, params.backup.savedRoutes);

  const nextActiveRoute =
    params.mode === 'replace'
      ? params.backup.activeRoute ?? nextRoutes[0] ?? null
      : params.currentActiveRoute ?? params.backup.activeRoute ?? nextRoutes[0] ?? null;

  const nextGearItems =
    params.backup.gearItems && params.mode === 'replace'
      ? params.backup.gearItems
      : params.currentGearItems;

  saveUserSettings(params.currentUserId, nextSettings);
  saveSavedRoutes(params.currentUserId, nextRoutes);
  saveGearState(params.currentUserId, nextGearItems);

  return { nextSettings, nextRoutes, nextActiveRoute, nextGearItems };
}
