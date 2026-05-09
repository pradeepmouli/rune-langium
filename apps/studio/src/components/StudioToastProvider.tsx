// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from '@rune-langium/design-system/ui/toast';

type StudioToastVariant = 'default' | 'destructive';

interface StudioToastInput {
  title?: string;
  description: string;
  variant?: StudioToastVariant;
  duration?: number;
}

interface StudioToastState extends StudioToastInput {
  id: number;
}

interface StudioToastContextValue {
  showToast: (toast: StudioToastInput) => void;
}

const StudioToastContext = createContext<StudioToastContextValue | null>(null);

export function StudioToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<StudioToastState | null>(null);
  const nextToastIdRef = useRef(0);

  const showToast = useCallback((input: StudioToastInput) => {
    nextToastIdRef.current += 1;
    setToast({
      id: nextToastIdRef.current,
      variant: 'default',
      ...input
    });
  }, []);

  const contextValue = useMemo<StudioToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <StudioToastContext.Provider value={contextValue}>
      <ToastProvider duration={toast?.duration ?? 4000} swipeDirection="right">
        {children}
        {toast && (
          <Toast
            key={toast.id}
            variant={toast.variant}
            type={toast.variant === 'destructive' ? 'foreground' : 'background'}
            onOpenChange={(open) => {
              if (!open) {
                setToast((current) => (current?.id === toast.id ? null : current));
              }
            }}
          >
            <div className="grid gap-1">
              {toast.title ? <ToastTitle>{toast.title}</ToastTitle> : null}
              <ToastDescription>{toast.description}</ToastDescription>
            </div>
            <ToastClose aria-label="Dismiss notification" />
          </Toast>
        )}
        <ToastViewport aria-label="Studio notifications" />
      </ToastProvider>
    </StudioToastContext.Provider>
  );
}

export function useStudioToast(): StudioToastContextValue {
  const context = useContext(StudioToastContext);
  if (!context) {
    throw new Error('useStudioToast must be used within StudioToastProvider');
  }
  return context;
}
