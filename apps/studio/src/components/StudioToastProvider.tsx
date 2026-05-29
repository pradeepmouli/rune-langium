// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager
} from '@rune-langium/design-system/ui/toast';

type StudioToastVariant = 'default' | 'destructive';

interface StudioToastInput {
  title?: string;
  description: string;
  variant?: StudioToastVariant;
  duration?: number;
}

interface StudioToastContextValue {
  showToast: (toast: StudioToastInput) => void;
}

const StudioToastContext = createContext<StudioToastContextValue | null>(null);

export function StudioToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider duration={4000}>
      <StudioToastInner>{children}</StudioToastInner>
    </ToastProvider>
  );
}

function StudioToastInner({ children }: { children: ReactNode }) {
  const { toasts, add } = useToastManager();

  const showToast = useCallback(
    (input: StudioToastInput) => {
      add({
        title: input.title,
        description: input.description,
        type: input.variant ?? 'default',
        timeout: input.duration
      });
    },
    [add]
  );

  const contextValue = useMemo<StudioToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <StudioToastContext.Provider value={contextValue}>
      {children}
      <ToastViewport aria-label="Studio notifications">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} variant={t.type as StudioToastVariant}>
            <div className="grid gap-1">
              {t.title ? <ToastTitle>{t.title}</ToastTitle> : null}
              <ToastDescription>{t.description}</ToastDescription>
            </div>
            <ToastClose aria-label="Dismiss notification" />
          </Toast>
        ))}
      </ToastViewport>
    </StudioToastContext.Provider>
  );
}

const NOOP_TOAST: StudioToastContextValue = { showToast: () => {} };

export function useStudioToast(): StudioToastContextValue {
  return useContext(StudioToastContext) ?? NOOP_TOAST;
}
