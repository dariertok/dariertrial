import React, { useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  BgMode,
  ColorTheme,
  RecoveryMode,
  SkyTrailBackupFile,
  TripSettings,
  WeatherProvider,
} from '../types';
import { BG_MODES, COLOR_THEMES } from '../utils/themes';
import { WEATHER_PROVIDERS } from '../utils/weatherApi';
import { parseAndValidateBackup } from '../utils/storageAndBackup';
import { formatFirebaseErrorForUser } from '../utils/firestoreErrors';
import {
  Settings,
  X,
  Palette,
  Layers,
  Check,
  CloudSun,
  HardDriveDownload,
  Download,
  Upload,
  Cloud,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface OptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TripSettings;
  onUpdateSettings: (settings: TripSettings) => void;
  firebaseUser: User | null;
  hasAutoRecoverySnapshot: boolean;
  onOpenAuth: () => void;
  onExportBackup: () => void;
  onApplyBackup: (backup: SkyTrailBackupFile, mode: RecoveryMode) => Promise<void> | void;
  onUndoRecovery: () => Promise<void> | void;
}

export const OptionsModal: React.FC<OptionsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  firebaseUser,
  hasAutoRecoverySnapshot,
  onOpenAuth,
  onExportBackup,
  onApplyBackup,
  onUndoRecovery,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<SkyTrailBackupFile | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!isOpen) return null;

  const themeList = Object.values(COLOR_THEMES);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackupError(null);
    setBackupFeedback(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseAndValidateBackup(ev.target?.result as string);
        setPendingBackup(parsed);
      } catch (err: unknown) {
        setBackupError(err instanceof Error ? err.message : 'Błąd odczytu pliku kopii.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmBackup = async (mode: RecoveryMode) => {
    if (!pendingBackup) return;
    setIsBusy(true);
    setBackupError(null);
    try {
      await onApplyBackup(pendingBackup, mode);
      setPendingBackup(null);
      setBackupFeedback(
        mode === 'replace'
          ? 'Pełne odzyskiwanie zakończone sukcesem.'
          : 'Dane z kopii zostały scalone z obecnymi.'
      );
    } catch (err) {
      setBackupError(formatFirebaseErrorForUser(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleUndo = async () => {
    setIsBusy(true);
    setBackupError(null);
    try {
      await onUndoRecovery();
      setBackupFeedback('Przywrócono stan sprzed ostatniego odzyskiwania.');
    } catch (err) {
      setBackupError(formatFirebaseErrorForUser(err));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="surface-card border border-theme rounded-3xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-2 rounded-xl surface-subtle transition-colors cursor-pointer"
          aria-label="Zamknij ustawienia"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl accent-gradient text-white flex items-center justify-center shadow-sm shrink-0">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Ustawienia</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Źródło prognozy pogody, wygląd oraz kopia zapasowa danych
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Weather Provider Selector */}
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
              <CloudSun className="w-3.5 h-3.5 text-accent" />
              <span>Dostawca pogody (model prognozy)</span>
            </div>
            <div className="space-y-2">
              {WEATHER_PROVIDERS.map((provider) => {
                const isSelected = settings.weatherProvider === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        weatherProvider: provider.id as WeatherProvider,
                      })
                    }
                    className={`w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/25 surface-subtle'
                        : 'border-theme hover:opacity-90'
                    }`}
                  >
                    <div
                      className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-[var(--accent)] bg-accent text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {provider.name}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-accent-soft text-accent">
                          {provider.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-1">
                        {provider.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Background Mode Selector */}
          <div className="pt-2 border-t border-theme">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-accent" />
              <span>Kolor tła i tryb ekranu</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {BG_MODES.map((mode) => {
                const isSelected = settings.bgMode === mode.id;
                const previewBg =
                  mode.id === 'tinted'
                    ? COLOR_THEMES[settings.colorTheme].tintCanvas
                    : mode.previewBg;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onUpdateSettings({ ...settings, bgMode: mode.id as BgMode })}
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/25 surface-subtle'
                        : 'border-theme hover:opacity-90'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-xl border border-slate-300/60 dark:border-slate-700 shrink-0 flex items-end justify-end p-1 shadow-xs"
                      style={{ backgroundColor: previewBg }}
                    >
                      <div
                        className="w-5 h-5 rounded-md border border-slate-300/50"
                        style={{ backgroundColor: mode.previewCard }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between gap-1">
                        <span className="truncate">{mode.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                        {mode.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 8 Accent Color Themes */}
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-accent" />
              <span>Schemat kolorów ({themeList.length} motywów)</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {themeList.map((theme) => {
                const isSelected = settings.colorTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ ...settings, colorTheme: theme.id as ColorTheme })
                    }
                    className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/25 surface-subtle'
                        : 'border-theme hover:opacity-90'
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-xl shrink-0 shadow-xs flex items-center justify-center text-white"
                      style={{
                        background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
                      }}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {theme.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Account, File Backup & Recovery */}
          <div className="pt-4 border-t border-theme space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <HardDriveDownload className="w-3.5 h-3.5 text-accent" />
                <span>Kopia zapasowa i odzyskiwanie (.json)</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Cloud className="w-3 h-3" />
                <span>{firebaseUser ? firebaseUser.displayName?.split(' ')[0] || 'Konto Google' : 'Zaloguj Google'}</span>
              </button>
            </div>

            {backupError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-[11px] font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{backupError}</span>
              </div>
            )}

            {backupFeedback && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{backupFeedback}</span>
              </div>
            )}

            {pendingBackup ? (
              <div className="surface-subtle border border-theme rounded-2xl p-3 space-y-2.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  Znaleziono kopię ({pendingBackup.savedRoutes.length} tras,{' '}
                  {new Date(pendingBackup.exportedAt).toLocaleDateString('pl-PL')})
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleConfirmBackup('merge')}
                    className="flex-1 px-3 py-2 bg-accent text-white font-semibold rounded-xl text-xs cursor-pointer disabled:opacity-60"
                  >
                    Scal z obecnymi
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleConfirmBackup('replace')}
                    className="flex-1 px-3 py-2 surface-card border border-theme text-slate-800 dark:text-slate-100 font-semibold rounded-xl text-xs cursor-pointer disabled:opacity-60"
                  >
                    Zastąp wszystko
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingBackup(null)}
                  className="text-[11px] font-semibold text-slate-500 hover:underline cursor-pointer"
                >
                  Anuluj
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onExportBackup();
                    setBackupFeedback('Zapisano plik kopii ustawień i tras (.json).');
                  }}
                  className="px-3.5 py-2.5 surface-subtle border border-theme hover:border-[var(--accent)] rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-accent" />
                  <span>Zapisz kopię (.json)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2.5 surface-subtle border border-theme hover:border-[var(--accent)] rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-accent" />
                  <span>Odzyskaj z pliku</span>
                </button>
              </div>
            )}

            {hasAutoRecoverySnapshot && (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleUndo}
                className="w-full px-3 py-2 surface-card border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-300 font-semibold rounded-xl text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cofnij ostatnie przywracanie</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-theme flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-accent text-white font-semibold rounded-xl text-xs shadow-sm transition-opacity hover:opacity-95 cursor-pointer"
          >
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );
};
