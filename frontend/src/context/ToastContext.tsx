import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => {
          const styleClasses =
            t.type === 'success'
              ? 'border-emerald-200 bg-white text-slate-900'
              : t.type === 'error'
              ? 'border-red-200 bg-white text-slate-900'
              : t.type === 'warning'
              ? 'border-amber-200 bg-white text-slate-900'
              : 'border-blue-200 bg-white text-slate-900';

          const iconClasses =
            t.type === 'success'
              ? 'text-emerald-600'
              : t.type === 'error'
              ? 'text-red-600'
              : t.type === 'warning'
              ? 'text-amber-500'
              : 'text-blue-600';

          const Icon =
            t.type === 'success'
              ? CheckCircle2
              : t.type === 'error'
              ? XCircle
              : t.type === 'warning'
              ? AlertTriangle
              : Info;

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-elevated transition-all ${styleClasses}`}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconClasses}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900">{t.title}</p>
                {t.message && (
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{t.message}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
