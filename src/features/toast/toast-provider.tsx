import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { Toast } from '@/components/toast';

const TOAST_DURATION_MS = 3500;

type ToastContextValue = { showToast: (message: string) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Mounts the single global toast surface, matching `UploadDeepLinkProvider`'s
 * pattern — a provider near the root so any screen (or a provider above all
 * screens, like the deep-link handler) can fire a transient banner without
 * needing its own mount point. Only one toast is shown at a time; a new call
 * replaces whatever's currently up rather than queuing.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(next);
    timerRef.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && <Toast key={message} message={message} />}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
