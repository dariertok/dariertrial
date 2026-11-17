import React, { useState } from 'react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import { Download, Smartphone, WifiOff } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="px-3 py-2 bg-accent text-white rounded-xl text-xs font-semibold shadow-xs hover:opacity-95 transition-opacity flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        title="Zainstaluj SkyTrail na ekranie głównym"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Zainstaluj</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="px-3 py-2 surface-subtle border border-theme text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          title="Zainstaluj na iPhone / iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-accent" />
          <span className="hidden sm:inline">Aplikacja</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="surface-card border border-theme rounded-2xl max-w-sm w-full p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Zainstaluj SkyTrail na iPhone / iPad
              </h3>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Stuknij ikonę <strong>Udostępnij</strong> na pasku Safari.
                <br />
                2. Przewiń w dół i wybierz <strong>Do ekranu początkowego</strong>, aby korzystać
                z zapisanych tras także offline.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-accent py-2.5 text-xs font-semibold text-white cursor-pointer"
              >
                Rozumiem
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Tryb offline — korzystasz z zapisanych tras</span>
    </div>
  );
};
