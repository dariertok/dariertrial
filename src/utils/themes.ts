import { BgMode, ColorTheme } from '../types';

export interface ThemePalette {
  id: ColorTheme;
  name: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  softLight: string;
  softDark: string;
  tintCanvas: string;
  tintCard: string;
  tintBorder: string;
}

export const COLOR_THEMES: Record<ColorTheme, ThemePalette> = {
  sky: {
    id: 'sky',
    name: 'Błękit Alpejski',
    primary: '#0284c7',
    primaryHover: '#0369a1',
    secondary: '#2563eb',
    softLight: '#e0f2fe',
    softDark: '#0c4a6e',
    tintCanvas: '#eef7ff',
    tintCard: '#ffffff',
    tintBorder: '#bae6fd',
  },
  emerald: {
    id: 'emerald',
    name: 'Szmaragdowy Las',
    primary: '#059669',
    primaryHover: '#047857',
    secondary: '#0d9488',
    softLight: '#d1fae5',
    softDark: '#064e3b',
    tintCanvas: '#ecfdf5',
    tintCard: '#ffffff',
    tintBorder: '#a7f3d0',
  },
  amber: {
    id: 'amber',
    name: 'Słoneczny Bursztyn',
    primary: '#d97706',
    primaryHover: '#b45309',
    secondary: '#ea580c',
    softLight: '#fef3c7',
    softDark: '#78350f',
    tintCanvas: '#fffbeb',
    tintCard: '#ffffff',
    tintBorder: '#fde68a',
  },
  violet: {
    id: 'violet',
    name: 'Górski Fiolet',
    primary: '#7c3aed',
    primaryHover: '#6d28d9',
    secondary: '#9333ea',
    softLight: '#ede9fe',
    softDark: '#4c1d95',
    tintCanvas: '#f5f3ff',
    tintCard: '#ffffff',
    tintBorder: '#ddd6fe',
  },
  rose: {
    id: 'rose',
    name: 'Koralowy Zachód',
    primary: '#e11d48',
    primaryHover: '#be123c',
    secondary: '#db2777',
    softLight: '#ffe4e6',
    softDark: '#881337',
    tintCanvas: '#fff1f2',
    tintCard: '#ffffff',
    tintBorder: '#fecdd3',
  },
  teal: {
    id: 'teal',
    name: 'Morski Turkus',
    primary: '#0d9488',
    primaryHover: '#0f766e',
    secondary: '#0891b2',
    softLight: '#ccfbf1',
    softDark: '#134e4a',
    tintCanvas: '#f0fdfa',
    tintCard: '#ffffff',
    tintBorder: '#99f6e4',
  },
  indigo: {
    id: 'indigo',
    name: 'Głęboki Granat',
    primary: '#4f46e5',
    primaryHover: '#4338ca',
    secondary: '#6366f1',
    softLight: '#e0e7ff',
    softDark: '#312e81',
    tintCanvas: '#eef2ff',
    tintCard: '#ffffff',
    tintBorder: '#c7d2fe',
  },
  orange: {
    id: 'orange',
    name: 'Energiczny Pomarańcz',
    primary: '#ea580c',
    primaryHover: '#c2410c',
    secondary: '#f59e0b',
    softLight: '#ffedd5',
    softDark: '#7c2d12',
    tintCanvas: '#fff7ed',
    tintCard: '#ffffff',
    tintBorder: '#fed7aa',
  },
};

export interface BgModeConfig {
  id: BgMode;
  name: string;
  description: string;
  isDark: boolean;
  previewBg: string;
  previewCard: string;
}

export const BG_MODES: BgModeConfig[] = [
  {
    id: 'light',
    name: 'Jasny Klasyczny',
    description: 'Czyste białe karty i neutralne tło',
    isDark: false,
    previewBg: '#f8fafc',
    previewCard: '#ffffff',
  },
  {
    id: 'tinted',
    name: 'Jasny Kolorowy',
    description: 'Tło delikatnie barwione wybranym akcentem',
    isDark: false,
    previewBg: '#eef7ff',
    previewCard: '#ffffff',
  },
  {
    id: 'dark',
    name: 'Ciemny Grafit',
    description: 'Komfortowy dla oczu wieczorem',
    isDark: true,
    previewBg: '#0f172a',
    previewCard: '#1e293b',
  },
  {
    id: 'midnight',
    name: 'Nocny AMOLED',
    description: 'Głęboka czerń i wysoki kontrast',
    isDark: true,
    previewBg: '#030712',
    previewCard: '#0f172a',
  },
];

export function applyThemeVariables(colorTheme: ColorTheme, bgMode: BgMode) {
  const palette = COLOR_THEMES[colorTheme] || COLOR_THEMES.sky;
  const root = document.documentElement;

  const isDark = bgMode === 'dark' || bgMode === 'midnight';
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.style.setProperty('--accent', palette.primary);
  root.style.setProperty('--accent-hover', palette.primaryHover);
  root.style.setProperty('--accent-secondary', palette.secondary);
  root.style.setProperty('--accent-soft', isDark ? palette.softDark : palette.softLight);

  if (bgMode === 'light') {
    root.style.setProperty('--bg-canvas', '#f8fafc');
    root.style.setProperty('--bg-card', '#ffffff');
    root.style.setProperty('--bg-subtle', '#f1f5f9');
    root.style.setProperty('--border-subtle', '#e2e8f0');
  } else if (bgMode === 'tinted') {
    root.style.setProperty('--bg-canvas', palette.tintCanvas);
    root.style.setProperty('--bg-card', palette.tintCard);
    root.style.setProperty('--bg-subtle', palette.softLight);
    root.style.setProperty('--border-subtle', palette.tintBorder);
  } else if (bgMode === 'dark') {
    root.style.setProperty('--bg-canvas', '#0f172a');
    root.style.setProperty('--bg-card', '#1e293b');
    root.style.setProperty('--bg-subtle', '#334155');
    root.style.setProperty('--border-subtle', '#334155');
  } else {
    root.style.setProperty('--bg-canvas', '#030712');
    root.style.setProperty('--bg-card', '#0b1120');
    root.style.setProperty('--bg-subtle', '#172033');
    root.style.setProperty('--border-subtle', '#1e293b');
  }
}

export function getTempColor(temp: number): { bg: string; text: string; border: string } {
  if (temp <= 2) return { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' };
  if (temp <= 10) return { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' };
  if (temp <= 18) return { bg: '#d1fae5', text: '#047857', border: '#6ee7b7' };
  if (temp <= 25) return { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' };
  return { bg: '#ffe4e6', text: '#be123c', border: '#fda4af' };
}

export function getWindColor(speed: number): { bg: string; text: string } {
  if (speed < 15) return { bg: '#ecfdf5', text: '#047857' };
  if (speed < 30) return { bg: '#fef3c7', text: '#b45309' };
  return { bg: '#ffe4e6', text: '#be123c' };
}
