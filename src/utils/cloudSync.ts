import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { GearItem, RouteData, TrackPoint, TripSettings } from '../types';
import { handleFirestoreError, OperationType } from './firestoreErrors';
import { sanitizeSettings } from './storageAndBackup';

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `route_${Date.now()}`;
}

function downsamplePointsForCloud(points: TrackPoint[], maxPoints = 2200): TrackPoint[] {
  const cleanPoints = points.map((p) => ({
    lat: Number(p.lat.toFixed(6)),
    lon: Number(p.lon.toFixed(6)),
    elevation: Math.round(p.elevation * 10) / 10,
    distanceFromStart: Math.round(p.distanceFromStart * 1000) / 1000,
  }));

  if (cleanPoints.length <= maxPoints) return cleanPoints;

  const result: TrackPoint[] = [cleanPoints[0]];
  const step = (cleanPoints.length - 2) / (maxPoints - 2);
  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.min(cleanPoints.length - 2, Math.round(i * step));
    result.push(cleanPoints[idx]);
  }
  result.push(cleanPoints[cleanPoints.length - 1]);
  return result;
}

export async function ensureUserProfileDoc(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    const displayName = (user.displayName || user.email || 'Rowerzysta').slice(0, 120);
    const email = (user.email || '').slice(0, 200);
    const photoURL = user.photoURL ? user.photoURL.slice(0, 600) : undefined;

    if (!snap.exists()) {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        email,
        displayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      await setDoc(ref, payload);
    } else {
      const payload: Record<string, unknown> = {
        email,
        displayName,
        updatedAt: serverTimestamp(),
      };
      if (photoURL) payload.photoURL = photoURL;
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveCloudSettings(uid: string, settings: TripSettings): Promise<void> {
  const path = `users/${uid}/settings/preferences`;
  const ref = doc(db, 'users', uid, 'settings', 'preferences');
  const clean = sanitizeSettings(settings);
  const basePayload = {
    userId: uid,
    departureDate: clean.departureDate,
    departureTime: clean.departureTime,
    bikeType: clean.bikeType,
    speedKmH: clean.speedKmH,
    breakMinutes: clean.breakMinutes,
    realisticPace: clean.realisticPace,
    colorTheme: clean.colorTheme,
    bgMode: clean.bgMode,
    weatherProvider: clean.weatherProvider,
    updatedAt: serverTimestamp(),
  };

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, basePayload);
    } else {
      const { userId: _u, ...updateFields } = basePayload;
      await updateDoc(ref, updateFields);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCloudSettings(uid: string): Promise<TripSettings | null> {
  const path = `users/${uid}/settings/preferences`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'preferences'));
    if (!snap.exists()) return null;
    return sanitizeSettings(snap.data() as Partial<TripSettings>);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveCloudRoute(uid: string, route: RouteData): Promise<RouteData> {
  const routeId = sanitizeId(route.id || `route_${Date.now()}`);
  const path = `users/${uid}/routes/${routeId}`;
  const ref = doc(db, 'users', uid, 'routes', routeId);
  const safePoints = downsamplePointsForCloud(route.points);
  const createdAtLabel = (route.createdAt || new Date().toLocaleDateString('pl-PL')).slice(0, 40);
  const safeName = (route.name.trim() || 'Trasa rowerowa').slice(0, 160);

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        id: routeId,
        userId: uid,
        name: safeName,
        points: safePoints,
        totalDistance: Number(route.totalDistance) || 0,
        elevationGain: Number(route.elevationGain) || 0,
        elevationLoss: Number(route.elevationLoss) || 0,
        minElevation: Number(route.minElevation) || 0,
        maxElevation: Number(route.maxElevation) || 0,
        createdAtLabel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: safeName,
        points: safePoints,
        totalDistance: Number(route.totalDistance) || 0,
        elevationGain: Number(route.elevationGain) || 0,
        elevationLoss: Number(route.elevationLoss) || 0,
        minElevation: Number(route.minElevation) || 0,
        maxElevation: Number(route.maxElevation) || 0,
        createdAtLabel,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      ...route,
      id: routeId,
      createdAt: createdAtLabel,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudRoute(uid: string, routeId: string): Promise<void> {
  const safeId = sanitizeId(routeId);
  const path = `users/${uid}/routes/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'routes', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchCloudRoutes(uid: string): Promise<RouteData[]> {
  const path = `users/${uid}/routes`;
  try {
    const q = query(collection(db, 'users', uid, 'routes'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id || d.id,
        name: data.name || 'Trasa',
        points: Array.isArray(data.points) ? data.points : [],
        totalDistance: Number(data.totalDistance) || 0,
        elevationGain: Number(data.elevationGain) || 0,
        elevationLoss: Number(data.elevationLoss) || 0,
        minElevation: Number(data.minElevation) || 0,
        maxElevation: Number(data.maxElevation) || 0,
        createdAt: data.createdAtLabel || undefined,
      } satisfies RouteData;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeCloudRoutes(
  uid: string,
  onRoutes: (routes: RouteData[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const path = `users/${uid}/routes`;
  const q = query(collection(db, 'users', uid, 'routes'), where('userId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: RouteData[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: data.id || d.id,
          name: data.name || 'Trasa',
          points: Array.isArray(data.points) ? data.points : [],
          totalDistance: Number(data.totalDistance) || 0,
          elevationGain: Number(data.elevationGain) || 0,
          elevationLoss: Number(data.elevationLoss) || 0,
          minElevation: Number(data.minElevation) || 0,
          maxElevation: Number(data.maxElevation) || 0,
          createdAt: data.createdAtLabel || undefined,
        };
      });
      onRoutes(list);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (structuredErr) {
        console.error(structuredErr);
      }
    }
  );
}

export async function saveCloudGear(uid: string, items: GearItem[]): Promise<void> {
  const path = `users/${uid}/gear/checklist`;
  const ref = doc(db, 'users', uid, 'gear', 'checklist');
  const boundedItems = items.slice(0, 100).map((item) => ({
    id: String(item.id).slice(0, 64),
    category: item.category,
    name: String(item.name).slice(0, 200),
    required: Boolean(item.required),
    reason: String(item.reason).slice(0, 240),
    checked: Boolean(item.checked),
  }));

  try {
    const existingSnap = await getDoc(ref);
    if (!existingSnap.exists()) {
      await setDoc(ref, {
        userId: uid,
        items: boundedItems,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        items: boundedItems,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCloudGear(uid: string): Promise<GearItem[] | null> {
  const path = `users/${uid}/gear/checklist`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'gear', 'checklist'));
    if (!snap.exists()) return null;
    const data = snap.data();
    return Array.isArray(data.items) ? (data.items as GearItem[]) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function syncBackupToCloud(params: {
  uid: string;
  settings: TripSettings;
  routes: RouteData[];
  gearItems?: GearItem[];
  replaceRoutes?: boolean;
}): Promise<void> {
  await saveCloudSettings(params.uid, params.settings);

  if (params.replaceRoutes) {
    const existingRoutes = await fetchCloudRoutes(params.uid);
    const keepIds = new Set(params.routes.map((r) => sanitizeId(r.id || r.name)));
    for (const old of existingRoutes) {
      if (old.id && !keepIds.has(sanitizeId(old.id))) {
        await deleteCloudRoute(params.uid, old.id);
      }
    }
  }

  for (const r of params.routes) {
    await saveCloudRoute(params.uid, r);
  }

  if (params.gearItems) {
    await saveCloudGear(params.uid, params.gearItems);
  }
}
