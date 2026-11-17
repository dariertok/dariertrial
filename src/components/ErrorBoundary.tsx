import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Wystąpił nieoczekiwany błąd aplikacji.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('SkyTrail ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen surface-canvas flex items-center justify-center p-4">
          <div className="surface-card border border-theme rounded-3xl max-w-md w-full p-6 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Coś poszło nie tak
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-accent text-white font-semibold rounded-xl text-xs shadow-sm hover:opacity-95 transition-opacity inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Odśwież aplikację</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
