import React, { useRef, useState } from 'react';
import { User, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { RecoveryMode, SkyTrailBackupFile } from '../types';
import { parseAndValidateBackup } from '../utils/storageAndBackup';
import { formatFirebaseErrorForUser } from '../utils/firestoreErrors';
import {
  X,
  LogIn,
  LogOut,
  Download,
  Upload,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileJson,
  RefreshCw,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  firebaseUser: User | null;
  isSyncing: boolean;
  syncError: string | null;
  savedRoutesCount: number;
  hasAutoRecoverySnapshot: boolean;
  onExportBackup: () => void;
  onApplyBackup: (backup: SkyTrailBackupFile, mode: RecoveryMode) => Promise<void> | void;
  onUndoRecovery: () => Promise<void> | void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  firebaseUser,
  isSyncing,
  syncError,
  savedRoutesCount,
  hasAutoRecoverySnapshot,
  onExportBackup,
  onApplyBackup,
  onUndoRecovery,
}) => {
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<SkyTrailBackupFile | null>(null);
  const [isApplyingBackup, setIsApplyingBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setFeedback(null);
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      setFeedback('Zalogowano pomyślnie. Trwa synchronizacja ustawień i tras z chmurą.');
    } catch (err) {
      setError(formatFirebaseErrorForUser(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setFeedback(null);
    setAuthLoading(true);
    try {
      await signOut(auth);
      setFeedback('Wylogowano z konta Google.');
    } catch (err) {
      setError(formatFirebaseErrorForUser(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFeedback(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseAndValidateBackup(text);
        setPendingBackup(parsed);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Nie udało się odczytać pliku kopii.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmBackup = async (mode: RecoveryMode) => {
    if (!pendingBackup) return;
    setError(null);
    setIsApplyingBackup(true);
    try {
      await onApplyBackup(pendingBackup, mode);
      setPendingBackup(null);
      setFeedback(
        mode === 'replace'
          ? 'Wszystkie ustawienia i trasy zostały odzyskane z pliku.'
          : 'Dane z pliku zostały scalone z obecnymi ustawieniami i trasami.'
      );
    } catch (err) {
      setError(formatFirebaseErrorForUser(err));
    } finally {
      setIsApplyingBackup(false);
    }
  };

  const handleUndo = async () => {
    setError(null);
    setIsApplyingBackup(true);
    try {
      await onUndoRecovery();
      setFeedback('Przywrócono poprzedni stan sprzed ostatniego odzyskiwania.');
    } catch (err) {
      setError(formatFirebaseErrorForUser(err));
    } finally {
      setIsApplyingBackup(false);
    }
  };

  const getInitials = (nameOrEmail: string) =>
    nameOrEmail
      .split(/[\s@]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || '')
      .join('') || 'U';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="surface-card border border-theme rounded-3xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white p-2 rounded-xl surface-subtle transition-colors cursor-pointer"
          aria-label="Zamknij okno konta"
        >
          <X className="w-5 h-5" />
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl accent-gradient text-white flex items-center justify-center shadow-sm shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Konto, chmura i kopia zapasowa
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Logowanie Google, synchronizacja w chmurze oraz zapis/odzyskiwanie z pliku
            </p>
          </div>
        </div>

        {(error || syncError) && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-words">{error || syncError}</span>
          </div>
        )}

        {feedback && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{feedback}</span>
          </div>
        )}

        {/* Google Account Section */}
        <div className="surface-subtle border border-theme rounded-2xl p-4 mb-5">
          {firebaseUser ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {firebaseUser.photoURL ? (
                  <img
                    src={firebaseUser.photoURL}
                    alt={firebaseUser.displayName || 'Awatar'}
                    className="w-11 h-11 rounded-2xl object-cover border border-theme shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-2xl bg-accent text-white font-bold text-sm flex items-center justify-center shrink-0">
                    {getInitials(firebaseUser.displayName || firebaseUser.email || 'U')}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {firebaseUser.displayName || 'Użytkownik Google'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {firebaseUser.email}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
                    {isSyncing ? (
                      <span className="text-accent flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Synchronizacja z chmurą...
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Zsynchronizowano ({savedRoutesCount} tras)
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={authLoading}
                onClick={handleSignOut}
                className="px-3 py-2 surface-card border border-theme rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors disabled:opacity-60"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Wyloguj</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Zaloguj się przez Google
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Synchronizuj swoje trasy GPX, prędkość roweru, dostawcę pogody i wygląd między urządzeniami.
                </p>
              </div>
              <button
                type="button"
                disabled={authLoading}
                onClick={handleGoogleSignIn}
                className="px-4 py-2.5 bg-accent text-white font-semibold rounded-xl text-xs shadow-xs hover:opacity-95 transition-opacity flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                <span>{authLoading ? 'Logowanie...' : 'Zaloguj przez Google'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Backup File Preview OR Standard File Backup/Recovery Actions */}
        {pendingBackup ? (
          <div className="surface-subtle border border-theme rounded-2xl p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <FileJson className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Podgląd pliku do odzyskania
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Eksport: {new Date(pendingBackup.exportedAt).toLocaleString('pl-PL')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="surface-card border border-theme rounded-xl p-2.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Trasy w pliku
                </span>
                <span className="font-bold text-slate-900 dark:text-white font-mono">
                  {pendingBackup.savedRoutes.length} tras
                </span>
              </div>
              <div className="surface-card border border-theme rounded-xl p-2.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Profil źródłowy
                </span>
                <span className="font-bold text-slate-900 dark:text-white truncate block">
                  {pendingBackup.profile?.name || 'Tryb lokalny'}
                </span>
              </div>
              <div className="surface-card border border-theme rounded-xl p-2.5 col-span-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                  Ustawienia w kopii
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Rower: {pendingBackup.settings.bikeType.toUpperCase()} ({pendingBackup.settings.speedKmH} km/h) • Pogoda: {pendingBackup.settings.weatherProvider} • Motyw: {pendingBackup.settings.colorTheme}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={isApplyingBackup}
                onClick={() => handleConfirmBackup('merge')}
                className="flex-1 px-4 py-2.5 bg-accent text-white font-semibold rounded-xl text-xs hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-60"
              >
                Scal z obecnymi
              </button>
              <button
                type="button"
                disabled={isApplyingBackup}
                onClick={() => handleConfirmBackup('replace')}
                className="flex-1 px-4 py-2.5 surface-card border border-theme text-slate-800 dark:text-slate-100 font-semibold rounded-xl text-xs hover:border-[var(--accent)] transition-colors cursor-pointer disabled:opacity-60"
              >
                Zastąp wszystko z pliku
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPendingBackup(null)}
              className="w-full py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              Anuluj odzyskiwanie
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Kopia zapasowa i odzyskiwanie do pliku (.json)
            </div>
            <button
              type="button"
              onClick={() => {
                onExportBackup();
                setFeedback('Pobrano plik kopii zapasowej ze wszystkimi ustawieniami i trasami.');
              }}
              className="w-full px-4 py-3 bg-accent text-white font-semibold rounded-2xl text-xs shadow-xs hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Zapisz wszystkie ustawienia i trasy do pliku (.json)</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-3 surface-subtle border border-theme text-slate-800 dark:text-slate-100 font-semibold rounded-2xl text-xs hover:border-[var(--accent)] transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-accent" />
              <span>Odzyskaj ustawienia i trasy z pliku (.json)</span>
            </button>

            {hasAutoRecoverySnapshot && (
              <button
                type="button"
                disabled={isApplyingBackup}
                onClick={handleUndo}
                className="w-full px-4 py-2.5 surface-card border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-300 font-semibold rounded-2xl text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Cofnij ostatnie przywracanie (odzyskaj poprzedni stan)</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
