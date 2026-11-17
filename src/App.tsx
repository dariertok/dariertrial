/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import {
  AppTab,
  DepartureWindowSummary,
  GearItem,
  RecoveryMode,
  RouteData,
  SkyTrailBackupFile,
  SunTimes,
  TripSettings,
  WaypointWeather,
} from './types';
import { Header } from './components/Header';
import { TripControls } from './components/TripControls';
import { WeatherMap } from './components/WeatherMap';
import { TripSummaryCard } from './components/TripSummaryCard';
import { ScheduleTab } from './components/ScheduleTab';
import { GearTab } from './components/GearTab';
import { RoutesTab } from './components/RoutesTab';
import { AnalysisTab } from './components/AnalysisTab';
import { OptionsModal } from './components/OptionsModal';
import { AuthModal } from './components/AuthModal';
import { OfflineIndicator } from './components/PWAInstallButton';
import { fetchRouteWeather } from './utils/weatherApi';
import { applyThemeVariables } from './utils/themes';
import { makeRoundTripRouteData, reverseRouteData } from './utils/gpxParser';
import {
  applyBackupRecovery,
  buildBackupPayload,
  downloadBackupFile,
  loadAutoRecoverySnapshot,
  loadGearState,
  loadSavedRoutes,
  loadUserSettings,
  saveGearState,
  saveSavedRoutes,
  saveUserSettings,
} from './utils/storageAndBackup';
import {
  deleteCloudRoute,
  ensureUserProfileDoc,
  fetchCloudGear,
  fetchCloudRoutes,
  fetchCloudSettings,
  saveCloudGear,
  saveCloudRoute,
  saveCloudSettings,
  subscribeCloudRoutes,
  syncBackupToCloud,
} from './utils/cloudSync';
import { formatFirebaseErrorForUser } from './utils/firestoreErrors';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudReady, setCloudReady] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [savedRoutes, setSavedRoutes] = useState<RouteData[]>(() => loadSavedRoutes(null));
  const [route, setRoute] = useState<RouteData | null>(() => {
    const initial = loadSavedRoutes(null);
    return initial.length > 0 ? initial[0] : null;
  });

  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    const initial = loadSavedRoutes(null);
    return initial.length > 0 ? 'map' : 'routes';
  });

  const [settings, setSettings] = useState<TripSettings>(() => loadUserSettings(null));
  const [gearItems, setGearItems] = useState<GearItem[]>(() => loadGearState(null));

  const [isOptionsOpen, setIsOptionsOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [hasAutoRecoverySnapshot, setHasAutoRecoverySnapshot] = useState<boolean>(() =>
    Boolean(loadAutoRecoverySnapshot())
  );

  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [riderDistanceKm, setRiderDistanceKm] = useState<number | null>(null);

  const [weatherWaypoints, setWeatherWaypoints] = useState<WaypointWeather[]>([]);
  const [sunTimes, setSunTimes] = useState<SunTimes | null>(null);
  const [departureWindows, setDepartureWindows] = useState<DepartureWindowSummary[]>([]);
  const [realisticDurationMinutes, setRealisticDurationMinutes] = useState<number | null>(null);
  const [flatDurationMinutes, setFlatDurationMinutes] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSavedFeedback, setIsSavedFeedback] = useState<boolean>(false);

  const skipNextCloudSettingsWriteRef = useRef<boolean>(false);

  // Firebase Auth listener + initial cloud bootstrap
  useEffect(() => {
    let unsubscribeRoutes: (() => void) | null = null;
    let cancelled = false;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubscribeRoutes) {
        unsubscribeRoutes();
        unsubscribeRoutes = null;
      }

      setFirebaseUser(user);
      setSyncError(null);

      if (!user) {
        setCloudReady(false);
        setIsSyncing(false);
        const guestRoutes = loadSavedRoutes(null);
        const guestSettings = loadUserSettings(null);
        const guestGear = loadGearState(null);
        skipNextCloudSettingsWriteRef.current = true;
        setSavedRoutes(guestRoutes);
        setSettings(guestSettings);
        setGearItems(guestGear);
        setRoute((prev) => prev ?? guestRoutes[0] ?? null);
        return;
      }

      setIsSyncing(true);
      setCloudReady(false);
      try {
        await ensureUserProfileDoc(user);
        if (cancelled) return;

        const [cloudSettings, cloudRoutes, cloudGear] = await Promise.all([
          fetchCloudSettings(user.uid),
          fetchCloudRoutes(user.uid),
          fetchCloudGear(user.uid),
        ]);
        if (cancelled) return;

        if (cloudSettings) {
          skipNextCloudSettingsWriteRef.current = true;
          setSettings(cloudSettings);
          saveUserSettings(user.uid, cloudSettings);
        } else {
          const currentLocalSettings = loadUserSettings(user.uid);
          await saveCloudSettings(user.uid, currentLocalSettings);
        }

        if (cloudRoutes.length > 0) {
          setSavedRoutes(cloudRoutes);
          saveSavedRoutes(user.uid, cloudRoutes);
          setRoute((prev) => prev ?? cloudRoutes[0]);
        } else {
          const localGuestRoutes = loadSavedRoutes(null);
          if (localGuestRoutes.length > 0) {
            for (const r of localGuestRoutes) {
              await saveCloudRoute(user.uid, r);
            }
            setSavedRoutes(localGuestRoutes);
            saveSavedRoutes(user.uid, localGuestRoutes);
          }
        }

        if (cloudGear) {
          setGearItems(cloudGear);
          saveGearState(user.uid, cloudGear);
        }

        unsubscribeRoutes = subscribeCloudRoutes(
          user.uid,
          (liveRoutes) => {
            setSavedRoutes(liveRoutes);
            saveSavedRoutes(user.uid, liveRoutes);
          },
          (err) => {
            setSyncError(formatFirebaseErrorForUser(err));
          }
        );

        setCloudReady(true);
      } catch (err) {
        if (!cancelled) {
          setSyncError(formatFirebaseErrorForUser(err));
        }
      } finally {
        if (!cancelled) {
          setIsSyncing(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribeAuth();
      if (unsubscribeRoutes) unsubscribeRoutes();
    };
  }, []);

  // Apply color theme, background mode, persist locally, and sync to Firestore when signed in
  useEffect(() => {
    applyThemeVariables(settings.colorTheme, settings.bgMode);
    saveUserSettings(firebaseUser?.uid ?? null, settings);

    if (!firebaseUser || !cloudReady) return;

    if (skipNextCloudSettingsWriteRef.current) {
      skipNextCloudSettingsWriteRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      saveCloudSettings(firebaseUser.uid, settings).catch((err) => {
        setSyncError(formatFirebaseErrorForUser(err));
      });
    }, 600);

    return () => clearTimeout(timer);
  }, [settings, firebaseUser, cloudReady]);

  const loadWeather = useCallback(
    async (targetRoute: RouteData, currentSettings: TripSettings) => {
      setIsLoading(true);
      try {
        const result = await fetchRouteWeather(targetRoute.points, currentSettings);
        setWeatherWaypoints(result.waypoints);
        setSunTimes(result.sunTimes);
        setDepartureWindows(result.departureWindows);
        setRealisticDurationMinutes(result.realisticDurationMinutes);
        setFlatDurationMinutes(result.flatDurationMinutes);
      } catch (err) {
        console.error('Failed to load weather:', err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Automatically refresh weather when route, date, time, bike speed, break, or provider changes
  useEffect(() => {
    if (!route) return;
    const timer = setTimeout(() => {
      loadWeather(route, settings);
    }, 250);
    return () => clearTimeout(timer);
  }, [
    route,
    settings.departureDate,
    settings.departureTime,
    settings.bikeType,
    settings.speedKmH,
    settings.breakMinutes,
    settings.realisticPace,
    settings.weatherProvider,
    loadWeather,
  ]);

  const handleCalculate = () => {
    if (route) {
      loadWeather(route, settings);
    }
  };

  const handleReverseRoute = () => {
    if (!route) return;
    setRiderDistanceKm(null);
    setRoute(reverseRouteData(route));
  };

  const handleMakeRoundTrip = () => {
    if (!route) return;
    setRiderDistanceKm(null);
    setRoute(makeRoundTripRouteData(route));
  };

  const handleSaveRouteToLibrary = async (routeToSave: RouteData) => {
    const uid = firebaseUser?.uid ?? null;
    const updated = [routeToSave, ...savedRoutes.filter((r) => r.name !== routeToSave.name)];
    setSavedRoutes(updated);
    saveSavedRoutes(uid, updated);

    if (firebaseUser) {
      setIsSyncing(true);
      try {
        await saveCloudRoute(firebaseUser.uid, routeToSave);
      } catch (err) {
        setSyncError(formatFirebaseErrorForUser(err));
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleDeleteRouteFromLibrary = async (id?: string) => {
    if (!id) return;
    const uid = firebaseUser?.uid ?? null;
    const updated = savedRoutes.filter((r) => r.id !== id);
    setSavedRoutes(updated);
    saveSavedRoutes(uid, updated);

    if (firebaseUser) {
      setIsSyncing(true);
      try {
        await deleteCloudRoute(firebaseUser.uid, id);
      } catch (err) {
        setSyncError(formatFirebaseErrorForUser(err));
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleQuickSave = () => {
    if (!route) return;
    const routeToSave: RouteData = {
      ...route,
      id: Date.now().toString(),
      createdAt: new Date().toLocaleDateString('pl-PL'),
    };
    handleSaveRouteToLibrary(routeToSave);
    setIsSavedFeedback(true);
    setTimeout(() => setIsSavedFeedback(false), 2500);
  };

  const handlePersistGearItems = (items: GearItem[]) => {
    setGearItems(items);
    const uid = firebaseUser?.uid ?? null;
    saveGearState(uid, items);
    if (firebaseUser && cloudReady) {
      saveCloudGear(firebaseUser.uid, items).catch((err) => {
        setSyncError(formatFirebaseErrorForUser(err));
      });
    }
  };

  const handleExportBackup = () => {
    const payload = buildBackupPayload({
      profile: firebaseUser
        ? {
            name: firebaseUser.displayName || 'Rowerzysta',
            email: firebaseUser.email || '',
          }
        : null,
      settings,
      savedRoutes,
      activeRoute: route,
      gearItems,
    });
    downloadBackupFile(payload);
  };

  const handleApplyBackup = async (backup: SkyTrailBackupFile, mode: RecoveryMode) => {
    const uid = firebaseUser?.uid ?? null;
    const profileMeta = firebaseUser
      ? {
          name: firebaseUser.displayName || 'Rowerzysta',
          email: firebaseUser.email || '',
        }
      : null;

    const { nextSettings, nextRoutes, nextActiveRoute, nextGearItems } = applyBackupRecovery({
      backup,
      mode,
      currentUserId: uid,
      profileMeta,
      currentSettings: settings,
      currentRoutes: savedRoutes,
      currentActiveRoute: route,
      currentGearItems: gearItems,
    });

    skipNextCloudSettingsWriteRef.current = true;
    setSettings(nextSettings);
    setSavedRoutes(nextRoutes);
    setGearItems(nextGearItems);
    if (nextActiveRoute) {
      setRoute(nextActiveRoute);
    } else if (mode === 'replace') {
      setRoute(null);
    }
    setHasAutoRecoverySnapshot(Boolean(loadAutoRecoverySnapshot()));

    if (firebaseUser) {
      setIsSyncing(true);
      try {
        await syncBackupToCloud({
          uid: firebaseUser.uid,
          settings: nextSettings,
          routes: nextRoutes,
          gearItems: nextGearItems,
          replaceRoutes: mode === 'replace',
        });
      } catch (err) {
        setSyncError(formatFirebaseErrorForUser(err));
        throw err;
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleUndoRecovery = async () => {
    const snapshot = loadAutoRecoverySnapshot();
    if (!snapshot) return;
    await handleApplyBackup(snapshot, 'replace');
  };

  const handleSelectRoute = (newRoute: RouteData) => {
    setRiderDistanceKm(null);
    setIsDrawingMode(false);
    setRoute(newRoute);
    setActiveTab('map');
  };

  const handleJumpToMapDistance = (km: number) => {
    setRiderDistanceKm(km);
    setActiveTab('map');
  };

  const renderContent = () => {
    if (activeTab === 'routes') {
      return (
        <RoutesTab
          currentRoute={route}
          savedRoutes={savedRoutes}
          onSelectRoute={handleSelectRoute}
          onStartDrawingRoute={() => {
            setActiveTab('map');
            setIsDrawingMode(true);
          }}
          onSaveRouteToLibrary={handleSaveRouteToLibrary}
          onDeleteRouteFromLibrary={handleDeleteRouteFromLibrary}
          onExportBackup={handleExportBackup}
          onOpenRecovery={() => setIsAuthOpen(true)}
        />
      );
    }

    if (activeTab === 'gear') {
      return (
        <GearTab
          waypoints={weatherWaypoints}
          route={route}
          settings={settings}
          realisticDurationMinutes={realisticDurationMinutes}
          persistedGearItems={gearItems}
          onPersistGearItems={handlePersistGearItems}
        />
      );
    }

    if (activeTab === 'analysis') {
      if (!route) {
        return (
          <RoutesTab
            currentRoute={null}
            savedRoutes={savedRoutes}
            onSelectRoute={handleSelectRoute}
            onStartDrawingRoute={() => {
              setActiveTab('map');
              setIsDrawingMode(true);
            }}
            onSaveRouteToLibrary={handleSaveRouteToLibrary}
            onDeleteRouteFromLibrary={handleDeleteRouteFromLibrary}
            onExportBackup={handleExportBackup}
            onOpenRecovery={() => setIsAuthOpen(true)}
          />
        );
      }
      return (
        <AnalysisTab
          route={route}
          settings={settings}
          waypoints={weatherWaypoints}
          sunTimes={sunTimes}
          realisticDurationMinutes={realisticDurationMinutes}
          onSelectDepartureDate={(date) =>
            setSettings((prev) => ({ ...prev, departureDate: date }))
          }
          onJumpToMapDistance={handleJumpToMapDistance}
        />
      );
    }

    if (activeTab === 'schedule') {
      if (!route) {
        return (
          <RoutesTab
            currentRoute={null}
            savedRoutes={savedRoutes}
            onSelectRoute={handleSelectRoute}
            onStartDrawingRoute={() => {
              setActiveTab('map');
              setIsDrawingMode(true);
            }}
            onSaveRouteToLibrary={handleSaveRouteToLibrary}
            onDeleteRouteFromLibrary={handleDeleteRouteFromLibrary}
            onExportBackup={handleExportBackup}
            onOpenRecovery={() => setIsAuthOpen(true)}
          />
        );
      }
      return (
        <ScheduleTab
          route={route}
          settings={settings}
          waypoints={weatherWaypoints}
          colorTheme={settings.colorTheme}
          onJumpToMapDistance={handleJumpToMapDistance}
        />
      );
    }

    if (!route && !isDrawingMode) {
      return (
        <RoutesTab
          currentRoute={null}
          savedRoutes={savedRoutes}
          onSelectRoute={handleSelectRoute}
          onStartDrawingRoute={() => {
            setActiveTab('map');
            setIsDrawingMode(true);
          }}
          onSaveRouteToLibrary={handleSaveRouteToLibrary}
          onDeleteRouteFromLibrary={handleDeleteRouteFromLibrary}
          onExportBackup={handleExportBackup}
          onOpenRecovery={() => setIsAuthOpen(true)}
        />
      );
    }

    return (
      <div>
        {route && (
          <TripControls
            route={route}
            settings={settings}
            sunTimes={sunTimes}
            realisticDurationMinutes={realisticDurationMinutes}
            flatDurationMinutes={flatDurationMinutes}
            isDrawingMode={isDrawingMode}
            onToggleDrawingMode={() => setIsDrawingMode((v) => !v)}
            onUpdateSettings={setSettings}
            onCalculate={handleCalculate}
            onReverseRoute={handleReverseRoute}
            onMakeRoundTrip={handleMakeRoundTrip}
            onQuickSave={handleQuickSave}
            onOpenOptions={() => setIsOptionsOpen(true)}
            isSavedFeedback={isSavedFeedback}
            isLoading={isLoading}
          />
        )}

        <WeatherMap
          route={route}
          weatherWaypoints={weatherWaypoints}
          colorTheme={settings.colorTheme}
          isDrawingMode={isDrawingMode}
          onCancelDrawing={() => setIsDrawingMode(false)}
          onCustomRouteCreated={handleSelectRoute}
          riderDistanceKm={riderDistanceKm}
          onRiderDistanceChange={setRiderDistanceKm}
        />

        {route && (
          <TripSummaryCard
            route={route}
            settings={settings}
            waypoints={weatherWaypoints}
            sunTimes={sunTimes}
            realisticDurationMinutes={realisticDurationMinutes}
            departureWindows={departureWindows}
            onSelectDepartureTime={(time) =>
              setSettings((prev) => ({ ...prev, departureTime: time }))
            }
            onReverseRoute={handleReverseRoute}
            onSelectWeatherProvider={(weatherProvider) =>
              setSettings((prev) => ({ ...prev, weatherProvider }))
            }
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen surface-canvas text-slate-900 dark:text-slate-100 font-sans transition-colors">
      <Header
        routeName={route?.name}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenOptions={() => setIsOptionsOpen(true)}
        firebaseUser={firebaseUser}
        onOpenAuth={() => setIsAuthOpen(true)}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {renderContent()}
      </main>

      <OptionsModal
        isOpen={isOptionsOpen}
        onClose={() => setIsOptionsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        firebaseUser={firebaseUser}
        hasAutoRecoverySnapshot={hasAutoRecoverySnapshot}
        onOpenAuth={() => setIsAuthOpen(true)}
        onExportBackup={handleExportBackup}
        onApplyBackup={handleApplyBackup}
        onUndoRecovery={handleUndoRecovery}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        firebaseUser={firebaseUser}
        isSyncing={isSyncing}
        syncError={syncError}
        savedRoutesCount={savedRoutes.length}
        hasAutoRecoverySnapshot={hasAutoRecoverySnapshot}
        onExportBackup={handleExportBackup}
        onApplyBackup={handleApplyBackup}
        onUndoRecovery={handleUndoRecovery}
      />

      <OfflineIndicator />
    </div>
  );
}
