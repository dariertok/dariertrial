import React from 'react';
import { User } from 'firebase/auth';
import { AppTab } from '../types';
import {
  CloudSun,
  Map,
  CalendarClock,
  Backpack,
  Route,
  Settings,
  Sparkles,
  LogIn,
  User as UserIcon,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  routeName?: string;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onOpenOptions: () => void;
  firebaseUser: User | null;
  onOpenAuth: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  routeName,
  activeTab,
  onTabChange,
  onOpenOptions,
  firebaseUser,
  onOpenAuth,
}) => {
  const tabs: {
    id: AppTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'map', label: 'Mapa', shortLabel: 'Mapa', icon: Map },
    { id: 'analysis', label: 'Analiza AI', shortLabel: 'Analiza', icon: Sparkles },
    { id: 'schedule', label: 'Harmonogram', shortLabel: 'Plan', icon: CalendarClock },
    { id: 'gear', label: 'Ekwipunek', shortLabel: 'Sprzęt', icon: Backpack },
    { id: 'routes', label: 'Trasy GPX', shortLabel: 'Trasy', icon: Route },
  ];

  const renderUserButton = (compact = false) => (
    <button
      type="button"
      onClick={onOpenAuth}
      className={`${
        compact ? 'px-2.5 py-2' : 'px-3.5 py-2'
      } surface-subtle hover:opacity-90 border border-theme text-slate-700 dark:text-slate-200 rounded-xl transition-opacity flex items-center gap-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap`}
      title={
        firebaseUser
          ? `Konto: ${firebaseUser.displayName || firebaseUser.email}`
          : 'Zaloguj się i zarządzaj kopią zapasową'
      }
    >
      {firebaseUser ? (
        <>
          {firebaseUser.photoURL ? (
            <img
              src={firebaseUser.photoURL}
              alt={firebaseUser.displayName || 'Konto'}
              className="w-4 h-4 rounded-full object-cover shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <UserIcon className="w-4 h-4 text-accent shrink-0" />
          )}
          <span className="max-w-[90px] sm:max-w-[120px] truncate">
            {firebaseUser.displayName?.split(' ')[0] || 'Konto'}
          </span>
        </>
      ) : (
        <>
          <LogIn className="w-4 h-4 text-accent shrink-0" />
          <span>{compact ? 'Konto' : 'Zaloguj'}</span>
        </>
      )}
    </button>
  );

  return (
    <header className="surface-card border-b border-theme sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Top row on mobile / Left+Right on desktop */}
        <div className="flex items-center justify-between gap-2 w-full lg:w-auto">
          <button
            type="button"
            onClick={() => onTabChange('map')}
            className="flex items-center gap-2.5 sm:gap-3 text-left cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <div className="w-10 h-10 rounded-xl accent-gradient flex items-center justify-center text-white shadow-sm shrink-0">
              <CloudSun className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                SkyTrail
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 truncate max-w-[140px] sm:max-w-[220px]">
                {routeName ? routeName : 'Rowerowy planer pogody GPX'}
              </span>
            </div>
          </button>

          {/* Mobile right actions */}
          <div className="flex lg:hidden items-center gap-1.5 shrink-0">
            <PWAInstallButton />
            {renderUserButton(true)}
            <button
              type="button"
              onClick={onOpenOptions}
              className="p-2 surface-subtle hover:opacity-90 border border-theme text-slate-700 dark:text-slate-200 rounded-xl transition-opacity flex items-center justify-center cursor-pointer"
              title="Ustawienia pogody, kopii i wyglądu"
              aria-label="Ustawienia"
            >
              <Settings className="w-4 h-4 text-accent" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav
          aria-label="Nawigacja główna"
          className="grid grid-cols-5 lg:flex items-center gap-1 surface-subtle p-1 rounded-xl border border-theme w-full lg:w-auto"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`px-1.5 sm:px-3.5 py-2 rounded-lg text-[11px] sm:text-xs font-semibold transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-accent'}`} />
                <span className="sm:hidden truncate">{tab.shortLabel}</span>
                <span className="hidden sm:inline truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Desktop Right Zone */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <PWAInstallButton />
          {renderUserButton(false)}
          <button
            type="button"
            onClick={onOpenOptions}
            className="px-3.5 py-2 surface-subtle hover:opacity-90 border border-theme text-slate-700 dark:text-slate-200 rounded-xl transition-opacity flex items-center gap-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Settings className="w-4 h-4 text-accent" />
            <span>Ustawienia</span>
          </button>
        </div>
      </div>
    </header>
  );
};
