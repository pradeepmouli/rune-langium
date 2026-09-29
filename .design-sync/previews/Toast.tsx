// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { useEffect } from 'react';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  Spinner,
  useToastManager
} from '@rune-langium/design-system';

type Seed = { title: string; description: string; type: 'default' | 'destructive' | 'loading' };

// Static harness: seeds the toast manager once, renders them the way StudioToastProvider does.
function Seeded({ seeds }: { seeds: Seed[] }) {
  const { toasts, add } = useToastManager();
  useEffect(() => {
    seeds.forEach((s) => add({ ...s, timeout: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ToastViewport aria-label="Studio notifications" className="top-0 bottom-auto">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} variant={t.type as Seed['type']}>
          {t.type === 'loading' && <Spinner className="mt-0.5 size-4 shrink-0" />}
          <div className="grid flex-1 gap-1">
            {t.title ? <ToastTitle>{t.title}</ToastTitle> : null}
            <ToastDescription>{t.description}</ToastDescription>
          </div>
          <ToastClose aria-label="Dismiss notification" />
        </Toast>
      ))}
    </ToastViewport>
  );
}

const Harness = ({ seeds }: { seeds: Seed[] }) => (
  <ToastProvider>
    <div className="h-[200px]" />
    <Seeded seeds={seeds} />
  </ToastProvider>
);

// J11 codegen: success toast after generating output.
export const CodegenSuccess = () => (
  <Harness
    seeds={[
      {
        type: 'default',
        title: 'Generated TypeScript',
        description: '6 namespaces written to cdm-trade-model.zip'
      }
    ]}
  />
);

// J16 resilience: destructive toast when the language server drops.
export const LspDisconnected = () => (
  <Harness
    seeds={[
      {
        type: 'destructive',
        title: 'Language server disconnected',
        description: 'Reconnecting to rune-lsp-worker. Hover and diagnostics are unavailable.'
      }
    ]}
  />
);

// J03 CDM load: persistent loading toast while hydrating the corpus.
export const CdmLoading = () => (
  <Harness
    seeds={[
      {
        type: 'loading',
        title: 'Loading CDM',
        description: 'Fetching cdm.product.template and 3 dependencies...'
      }
    ]}
  />
);
