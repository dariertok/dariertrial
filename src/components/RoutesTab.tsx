import React, { useState, useEffect } from 'react';
import { RouteData } from '../types';
import { exportRouteToGPX, parseGPX } from '../utils/gpxParser';
import { RouteThumbnail } from './RouteThumbnail';
import {
  Upload,
  FileText,
  Bookmark,
  Save,
  Trash2,
  ArrowRight,
  Mountain,
  Calendar,
  FolderOpen,
  PenTool,
  Download,
  HardDriveDownload,
} from 'lucide-react';

interface RoutesTabProps {
  currentRoute: RouteData | null;
  savedRoutes: RouteData[];
  onSelectRoute: (route: RouteData) => void;
  onStartDrawingRoute: () => void;
  onSaveRouteToLibrary: (route: RouteData) => void;
  onDeleteRouteFromLibrary: (id?: string) => void;
  onExportBackup: () => void;
  onOpenRecovery: () => void;
}

export const RoutesTab: React.FC<RoutesTabProps> = ({
  currentRoute,
  savedRoutes,
  onSelectRoute,
  onStartDrawingRoute,
  onSaveRouteToLibrary,
  onDeleteRouteFromLibrary,
  onExportBackup,
  onOpenRecovery,
}) => {
  const [customName, setCustomName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentRoute) {
      setCustomName(currentRoute.name);
    }
  }, [currentRoute]);

  const processFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseGPX(text, file.name.replace(/\.[^/.]+$/, ''));
        if (parsed.points.length === 0) {
          throw new Error('Plik GPX nie zawiera punktów trasy (trkpt ani rtept).');
        }
        onSelectRoute(parsed);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Błąd odczytu pliku GPX.');
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleSaveCurrent = () => {
    if (!currentRoute) return;
    const routeToSave: RouteData = {
      ...currentRoute,
      id: Date.now().toString(),
      name: customName.trim() || currentRoute.name,
      createdAt: new Date().toLocaleDateString('pl-PL'),
    };
    onSaveRouteToLibrary(routeToSave);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleDownloadGPX = (targetRoute: RouteData) => {
    const xml = exportRouteToGPX(targetRoute);
    const blob = new Blob([xml], { type: 'application/gpx+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${targetRoute.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gpx`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* 1. Create Custom Route OR Upload GPX */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`surface-card border-2 border-dashed rounded-2xl p-7 text-center transition-all flex flex-col items-center justify-center ${
            dragOver ? 'border-[var(--accent)] bg-accent-soft/30' : 'border-theme'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Wgraj plik GPX z dysku
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Przeciągnij plik .gpx tutaj lub wybierz z urządzenia
          </p>
          <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-xs transition-opacity hover:opacity-95 cursor-pointer shadow-sm">
            <FileText className="w-4 h-4" />
            <span>Wybierz plik GPX</span>
            <input type="file" accept=".gpx" onChange={handleFileUpload} className="hidden" />
          </label>
          {error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-400 font-semibold">{error}</p>}
        </div>

        <div className="surface-card border border-theme rounded-2xl p-7 text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl accent-gradient text-white flex items-center justify-center mb-3 shadow-xs">
            <PenTool className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            Ustaw nową trasę na mapie
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-xs">
            Klikaj punkty na mapie lub wpisz Start i Metę, aby wyznaczyć trasę po drogach rowerowych
          </p>
          <button
            type="button"
            onClick={onStartDrawingRoute}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-semibold text-xs transition-opacity hover:opacity-95 cursor-pointer shadow-sm"
          >
            <PenTool className="w-4 h-4" />
            <span>Otwórz kreator trasy</span>
          </button>
        </div>
      </div>

      {/* 2. Save or Export Currently Loaded Route */}
      {currentRoute && (
        <div className="surface-card border border-theme rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Save className="w-4 h-4 text-accent" /> Zapisz lub wyeksportuj aktualną trasę
            </h3>
            <button
              type="button"
              onClick={() => handleDownloadGPX(currentRoute)}
              className="px-3 py-1.5 surface-subtle border border-theme rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-accent" />
              <span>Pobierz .GPX</span>
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Wpisz własną nazwę trasy..."
              className="flex-1 px-4 py-2.5 surface-subtle border border-theme rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-medium"
            />
            <button
              type="button"
              onClick={handleSaveCurrent}
              className="px-6 py-2.5 bg-accent text-white font-semibold rounded-xl text-sm shadow-xs hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
            >
              <Bookmark className="w-4 h-4" />
              <span>Zapisz w bibliotece</span>
            </button>
          </div>
          {saveSuccess && (
            <p className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Trasa została zapisana na Twojej liście poniżej.
            </p>
          )}
        </div>
      )}

      {/* 3. Saved Routes Library */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-accent" /> Twoje zapisane trasy ({savedRoutes.length})
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportBackup}
              className="px-3 py-1.5 surface-card border border-theme rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[var(--accent)] flex items-center gap-1.5 cursor-pointer"
              title="Zapisz wszystkie trasy i ustawienia do pliku .json"
            >
              <HardDriveDownload className="w-3.5 h-3.5 text-accent" />
              <span>Kopia (.json)</span>
            </button>
            <button
              type="button"
              onClick={onOpenRecovery}
              className="px-3 py-1.5 surface-card border border-theme rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[var(--accent)] flex items-center gap-1.5 cursor-pointer"
              title="Odzyskaj trasy i ustawienia z pliku kopii .json"
            >
              <Upload className="w-3.5 h-3.5 text-accent" />
              <span>Odzyskaj</span>
            </button>
          </div>
        </div>

        {savedRoutes.length === 0 ? (
          <div className="surface-card border border-theme rounded-2xl p-8 text-center">
            <FolderOpen className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Brak zapisanych tras
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Wgraj plik GPX, wyznacz trasę w kreatorze lub odzyskaj zapisaną kopię z pliku .json.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedRoutes.map((route) => (
              <div
                key={route.id || route.name}
                className="surface-card border border-theme rounded-2xl p-4 shadow-xs flex items-stretch gap-3.5 transition-colors hover:border-[var(--accent)]/40"
              >
                <button
                  type="button"
                  onClick={() => onSelectRoute(route)}
                  className="shrink-0 group cursor-pointer focus:outline-none rounded-xl"
                  title={`Otwórz trasę: ${route.name}`}
                >
                  <RouteThumbnail
                    route={route}
                    className="w-28 h-24 sm:w-32 sm:h-24 transition-transform group-hover:scale-[1.02]"
                  />
                </button>

                <div className="min-w-0 flex-1 flex flex-col justify-between gap-2.5">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate mb-1">
                      {route.name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                        <Mountain className="w-3.5 h-3.5 text-accent" /> {route.totalDistance} km
                      </span>
                      <span>+{route.elevationGain} m</span>
                      {route.createdAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" /> {route.createdAt}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDownloadGPX(route)}
                      className="p-2 text-slate-500 hover:text-accent rounded-xl transition-colors cursor-pointer"
                      title="Pobierz plik GPX"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRouteFromLibrary(route.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-colors cursor-pointer"
                      title="Usuń"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectRoute(route)}
                      className="px-3.5 py-1.5 bg-accent-soft text-accent font-bold rounded-xl text-xs transition-opacity hover:opacity-90 flex items-center gap-1 cursor-pointer"
                    >
                      <span>Otwórz</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
