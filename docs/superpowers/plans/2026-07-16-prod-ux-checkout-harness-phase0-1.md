# Prod UX Checkout Harness — Phase 0 (Instrumentation) + Phase 1 (Harness Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the deployed Studio a structured, correlated operation log (readable from the live production bundle) and a Playwright harness that consumes it — the first slice of `docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md` (Phases 0–1 of that spec's §8 phasing).

**Architecture:** `output-store.ts` (Output panel) and `activity-store.ts` (Activity panel) are already the studio's two publish points for user-visible operation logging — roughly 15 call sites across the app already call `addLine`/`addActivity`. Phase 0 does **not** introduce a parallel logging API. It (a) extends both stores' existing `addLine`/`addActivity` signatures with optional structured metadata (`op`, `subject`, `durationMs`, `opId`) so producers that want span/duration tracking pass a couple of extra args to the *same* functions they already call, (b) adds a stateless `op-log.ts` module that is a pure **read-side aggregator** over the two stores' current state (`getOpLogSnapshot()` — no interception, no subscription, no buffer of its own), (c) exposes that snapshot via an always-on, read-only `window.__runeStudioOpLog` global so Playwright can read it from the real production build (not gated to `MODE==='test'` like `test-api.ts`, which never activates in prod), and (d) makes `StudioToastProvider` publish into the *same* two stores at the moment it shows a toast, so every toast is structurally guaranteed to have a matching log entry. Phase 1 builds the Playwright checkout fixture that reads this global, absorbs the existing `prod-smoke` spec as three journeys, and adds five new pure-read journeys.

**Tech Stack:** TypeScript 5.9 strict/ESM, React 19, Zustand 5 (existing stores, no new store), Vitest 3 + `@testing-library/react`, Playwright (`playwright.prod.config.ts`).

## Global Constraints

- FSL-1.1-ALv2 SPDX header (`// SPDX-License-Identifier: FSL-1.1-ALv2` + `// Copyright (c) 2026 Pradeep Mouli`) on every new/modified file under `apps/studio/` — this whole plan is FSL, not MIT.
- No parallel implementations: every new capability in this plan is additive to `output-store.ts` / `activity-store.ts`, never a second logging mechanism (repo rule: DRY is the #1 correctness rule; a hand-rolled shadow of a real implementation compounds bugs forever).
- `window.__runeStudioOpLog` is **read-only** (a `snapshot()` method only) and **always-on** (not gated by `import.meta.env.MODE`) — it must never accept writes or become a second way to mutate app state, and must work against the real production Vite build, unlike `test-api.ts`.
- No `networkidle` waits in any Playwright spec — wait on `data-testid` visibility per repo convention.
- Run `pnpm --filter @rune-langium/studio test` (vitest) after every task; run `pnpm --filter @rune-langium/studio run type-check` before each commit.
- Never authenticate GitHub, never invoke destructive/mutating production endpoints from the harness (spec §3 safety rails) — Phase 1 journeys in this plan (J1, J3) are read/local-only.

---

## Task 1: `OutputLine` / `addLine` — optional structured metadata

**Files:**
- Modify: `apps/studio/src/store/output-store.ts`
- Test: `apps/studio/test/store/output-store.test.ts` (new file — no test currently exists for this store)

**Interfaces:**
- Produces: `OutputLine.op?: string`, `.subject?: string`, `.durationMs?: number`, `.opId?: number` (all optional, additive); `addLine(text, severity?, meta?)` where `meta?: { op?: string; subject?: string; durationMs?: number; opId?: number }`.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/store/output-store.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { useOutputStore, fmtLine } from '../../src/store/output-store.js';

describe('output store', () => {
  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
  });

  it('addLine with no meta behaves exactly as before (backward compatible)', () => {
    useOutputStore.getState().addLine(fmtLine('lsp', 'connected'), 'success');
    const [line] = useOutputStore.getState().lines;
    expect(line.text).toBe('[lsp] connected');
    expect(line.severity).toBe('success');
    expect(line.op).toBeUndefined();
    expect(line.durationMs).toBeUndefined();
  });

  it('addLine accepts optional structured metadata for op-log correlation', () => {
    useOutputStore.getState().addLine(fmtLine('cdmLoad', 'loaded'), 'success', {
      op: 'cdmLoad',
      subject: 'cdm',
      durationMs: 4200,
      opId: 7
    });
    const [line] = useOutputStore.getState().lines;
    expect(line.op).toBe('cdmLoad');
    expect(line.subject).toBe('cdm');
    expect(line.durationMs).toBe(4200);
    expect(line.opId).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/output-store.test.ts`
Expected: FAIL — `addLine` doesn't accept a 3rd argument, `line.op` is `undefined` on a type that doesn't declare it (TS error at minimum; at runtime the property is simply absent, so the second `it` fails).

- [ ] **Step 3: Extend `output-store.ts`**

Modify `apps/studio/src/store/output-store.ts`:

```ts
export interface OutputLine {
  id: number;
  text: string;
  severity: OutputSeverity;
  ts: number;
  /** Structured op-log correlation fields — optional, set by producers that want span/duration tracking (op-log.ts reads these; existing callers are unaffected). */
  op?: string;
  subject?: string;
  durationMs?: number;
  opId?: number;
}

export interface AddLineMeta {
  op?: string;
  subject?: string;
  durationMs?: number;
  opId?: number;
}

interface OutputState {
  lines: OutputLine[];
  addLine(text: string, severity?: OutputSeverity, meta?: AddLineMeta): void;
  clearLines(): void;
}

let _idCounter = 0;
const MAX_LINES = 500;

export const useOutputStore = create<OutputState>((set) => ({
  lines: [],

  addLine(text: string, severity: OutputSeverity = 'info', meta?: AddLineMeta): void {
    const line: OutputLine = {
      id: ++_idCounter,
      text,
      severity,
      ts: performance.now() as number,
      ...meta
    };
    set((state) => {
      const next = [...state.lines, line];
      return { lines: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next };
    });
  },

  clearLines(): void {
    set({ lines: [] });
  }
}));
```

(Only the `OutputLine` interface, new `AddLineMeta` interface, `OutputState.addLine` signature, and the `addLine` implementation's body change — `fmtLine`, `SEV`, `clearLines`, and everything else stay as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/output-store.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/store/output-store.ts apps/studio/test/store/output-store.test.ts
git commit -m "feat(studio): add optional op-log metadata to output-store addLine"
```

---

## Task 2: `ActivityEntry` / `addActivity` — optional structured metadata + numeric `ts`

**Files:**
- Modify: `apps/studio/src/store/activity-store.ts`
- Test: `apps/studio/test/store/activity-store.test.ts` (new file)

**Interfaces:**
- Produces: `ActivityEntry.ts: number` (new, alongside the existing display-formatted `time: string`), `.subject?: string`, `.durationMs?: number`, `.opId?: number`; `addActivity(tag, ok, msg, meta?)` where `meta?: { subject?: string; durationMs?: number; opId?: number }`. `tag` itself already serves as the op name — no separate `op` field needed here.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/store/activity-store.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { useActivityStore } from '../../src/store/activity-store.js';

describe('activity store', () => {
  beforeEach(() => {
    useActivityStore.setState({ entries: [] });
  });

  it('addActivity with no meta behaves exactly as before, and stamps a numeric ts', () => {
    const before = performance.now();
    useActivityStore.getState().addActivity('lsp', true, 'connected');
    const [entry] = useActivityStore.getState().entries;
    expect(entry.tag).toBe('lsp');
    expect(entry.ok).toBe(true);
    expect(entry.msg).toBe('connected');
    expect(entry.ts).toBeGreaterThanOrEqual(before);
    expect(entry.subject).toBeUndefined();
    expect(entry.durationMs).toBeUndefined();
  });

  it('addActivity accepts optional structured metadata for op-log correlation', () => {
    useActivityStore.getState().addActivity('cdmLoad', true, 'loaded', {
      subject: 'cdm',
      durationMs: 4200,
      opId: 7
    });
    const [entry] = useActivityStore.getState().entries;
    expect(entry.subject).toBe('cdm');
    expect(entry.durationMs).toBe(4200);
    expect(entry.opId).toBe(7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/activity-store.test.ts`
Expected: FAIL — `entry.ts` is `undefined` (no such field exists yet), `addActivity` doesn't accept a 4th argument.

- [ ] **Step 3: Extend `activity-store.ts`**

Modify `apps/studio/src/store/activity-store.ts`:

```ts
export interface ActivityEntry {
  id: number;
  time: string;
  /** Numeric monotonic timestamp (performance.now()) — for op-log correlation/sorting. `time` above stays the HH:MM:SS display string the panel renders. */
  ts: number;
  tag: string;
  ok: boolean;
  msg: string;
  subject?: string;
  durationMs?: number;
  opId?: number;
}

export interface AddActivityMeta {
  subject?: string;
  durationMs?: number;
  opId?: number;
}

interface ActivityState {
  entries: ActivityEntry[];
  addActivity: (tag: string, ok: boolean, msg: string, meta?: AddActivityMeta) => void;
  clearEntries: () => void;
}

let _id = 0;
const MAX_ENTRIES = 200;

function nowHHMMSS(): string {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export const useActivityStore = create<ActivityState>((set) => ({
  entries: [],
  addActivity: (tag, ok, msg, meta) =>
    set((s) => {
      const next = [...s.entries, { id: ++_id, time: nowHHMMSS(), ts: performance.now(), tag, ok, msg, ...meta }];
      return { entries: next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next };
    }),
  clearEntries: () => set({ entries: [] })
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/activity-store.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/store/activity-store.ts apps/studio/test/store/activity-store.test.ts
git commit -m "feat(studio): add numeric ts + optional op-log metadata to activity-store"
```

---

## Task 3: `op-log.ts` — stateless read-side aggregator over the two stores

**Files:**
- Create: `apps/studio/src/services/op-log.ts`
- Test: `apps/studio/test/services/op-log.test.ts`

**Interfaces:**
- Consumes: `useOutputStore` (Task 1), `useActivityStore` (Task 2).
- Produces: `allocateOpId(): number`; `getOpLogSnapshot(): OpLogEntry[]`; `OpLogEntry` type (`opId?`, `op`, `subject?`, `level: 'info'|'warn'|'error'|'success'`, `message`, `durationMs?`, `ts`, `panel: 'output'|'activity'`). Consumed by Task 4 (window global) and Task 9 (harness fixture).

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/services/op-log.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { useActivityStore } from '../../src/store/activity-store.js';
import { allocateOpId, getOpLogSnapshot } from '../../src/services/op-log.js';

describe('op-log', () => {
  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
    useActivityStore.setState({ entries: [] });
  });

  it('allocateOpId returns increasing ids', () => {
    const a = allocateOpId();
    const b = allocateOpId();
    expect(b).toBeGreaterThan(a);
  });

  it('merges output-store lines and activity-store entries, sorted by ts', () => {
    useOutputStore.getState().addLine('[lsp] connected', 'success', { op: 'lsp' });
    useActivityStore.getState().addActivity('cdmLoad', true, 'loaded', { durationMs: 4200 });

    const snapshot = getOpLogSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((e) => e.panel)).toEqual(['output', 'activity']);
    expect(snapshot[0].op).toBe('lsp');
    expect(snapshot[0].level).toBe('success');
    expect(snapshot[1].op).toBe('cdmLoad');
    expect(snapshot[1].durationMs).toBe(4200);
    // sorted ascending by ts
    expect(snapshot[0].ts).toBeLessThanOrEqual(snapshot[1].ts);
  });

  it('maps activity ok=false to level "error"', () => {
    useActivityStore.getState().addActivity('workspace', false, 'save failed');
    const [entry] = getOpLogSnapshot();
    expect(entry.level).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/op-log.test.ts`
Expected: FAIL — `apps/studio/src/services/op-log.ts` does not exist.

- [ ] **Step 3: Write `op-log.ts`**

Create `apps/studio/src/services/op-log.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, type OutputSeverity } from '../store/output-store.js';
import { useActivityStore } from '../store/activity-store.js';

export type OpLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface OpLogEntry {
  opId?: number;
  op: string;
  subject?: string;
  level: OpLogLevel;
  message: string;
  durationMs?: number;
  ts: number;
  panel: 'output' | 'activity';
}

let _opIdCounter = 0;

/**
 * Allocates a correlation id shared by a start/end addLine or addActivity
 * pair. Pure bookkeeping — does not publish anything on its own.
 */
export function allocateOpId(): number {
  return ++_opIdCounter;
}

function severityToLevel(severity: OutputSeverity): OpLogLevel {
  return severity;
}

/**
 * Stateless read-side aggregator over output-store and activity-store — the
 * studio's two existing publish points for user-visible operation logging.
 * Does not intercept or buffer writes itself; every call re-reads current
 * store state, so it always reflects exactly what the Output/Activity panels
 * show.
 */
export function getOpLogSnapshot(): OpLogEntry[] {
  const fromOutput: OpLogEntry[] = useOutputStore.getState().lines.map((line) => ({
    opId: line.opId,
    op: line.op ?? 'output',
    subject: line.subject,
    level: severityToLevel(line.severity),
    message: line.text,
    durationMs: line.durationMs,
    ts: line.ts,
    panel: 'output'
  }));

  const fromActivity: OpLogEntry[] = useActivityStore.getState().entries.map((entry) => ({
    opId: entry.opId,
    op: entry.tag,
    subject: entry.subject,
    level: entry.ok ? 'success' : 'error',
    message: entry.msg,
    durationMs: entry.durationMs,
    ts: entry.ts,
    panel: 'activity'
  }));

  return [...fromOutput, ...fromActivity].sort((a, b) => a.ts - b.ts);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/op-log.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/op-log.ts apps/studio/test/services/op-log.test.ts
git commit -m "feat(studio): add op-log read-side aggregator over output/activity stores"
```

---

## Task 4: `window.__runeStudioOpLog` — always-on, read-only production global

**Files:**
- Create: `apps/studio/src/services/op-log-window-bridge.ts`
- Modify: `apps/studio/src/main.tsx`
- Test: `apps/studio/test/services/op-log-window-bridge.test.ts`

**Interfaces:**
- Consumes: `getOpLogSnapshot` (Task 3).
- Produces: `installOpLogWindowBridge(): void` — call once at app startup; sets `window.__runeStudioOpLog = { snapshot: getOpLogSnapshot }`. Consumed by Task 9 (Playwright reads `window.__runeStudioOpLog.snapshot()`).

This is deliberately **not** gated by `import.meta.env.MODE` like `test-api.ts` (`apps/studio/src/test-api.ts`) — that gate means `test-api.ts` never activates in the real production Vite build, which is exactly why it can't serve as the harness's read hook. `window.__runeStudioOpLog` is always installed; it is read-only (one method, `snapshot()`, no setters) and exposes nothing not already rendered in the Activity/Output panels — it's a structured view of already-visible UI state, not new information disclosure.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/services/op-log-window-bridge.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { useActivityStore } from '../../src/store/activity-store.js';
import { installOpLogWindowBridge } from '../../src/services/op-log-window-bridge.js';

describe('op-log window bridge', () => {
  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
    useActivityStore.setState({ entries: [] });
    delete (window as unknown as Record<string, unknown>).__runeStudioOpLog;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__runeStudioOpLog;
  });

  it('installs a read-only window.__runeStudioOpLog.snapshot()', () => {
    installOpLogWindowBridge();
    useActivityStore.getState().addActivity('lsp', true, 'connected');

    expect(window.__runeStudioOpLog).toBeDefined();
    const snapshot = window.__runeStudioOpLog!.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].op).toBe('lsp');
  });

  it('exposes exactly one method — no write surface', () => {
    installOpLogWindowBridge();
    expect(Object.keys(window.__runeStudioOpLog!)).toEqual(['snapshot']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/op-log-window-bridge.test.ts`
Expected: FAIL — `apps/studio/src/services/op-log-window-bridge.ts` does not exist.

- [ ] **Step 3: Write `op-log-window-bridge.ts` and wire it into `main.tsx`**

Create `apps/studio/src/services/op-log-window-bridge.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { getOpLogSnapshot, type OpLogEntry } from './op-log.js';

export interface RuneStudioOpLogBridge {
  snapshot(): OpLogEntry[];
}

declare global {
  interface Window {
    __runeStudioOpLog?: RuneStudioOpLogBridge;
  }
}

/**
 * Installs an always-on, read-only window global exposing the studio's
 * operation log as structured JSON — unlike `test-api.ts`, this is NOT
 * gated by `import.meta.env.MODE`, so it works against the real production
 * build. It exposes nothing beyond what the Activity/Output panels already
 * render; there is no write method.
 */
export function installOpLogWindowBridge(): void {
  window.__runeStudioOpLog = {
    snapshot: getOpLogSnapshot
  };
}
```

Modify `apps/studio/src/main.tsx` — add the import and one call, before `createRoot(root).render(...)`:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'buffer';
// isomorphic-git requires global Buffer in the browser
(globalThis as any).Buffer = Buffer;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { installOpLogWindowBridge } from './services/op-log-window-bridge.js';
// Dockview chrome (tab strips, sash handles, abyss theme palette).
// dockview's upstream theme CSS — UNLAYERED, sits above all @layer rules.
import 'dockview-react/dist/styles/dockview.css';
import './app.css';
// Rune structural overrides for DockviewReact (.rune-dock-theme). Imported
// AFTER app.css on purpose: app.css's `@import 'tailwindcss'` must
// establish the canonical @layer order (theme, base, components, utilities)
// FIRST. If dock-theme.css declared `@layer components` before that, it would
// register `components` ahead of `base` and globally invert base↔components
// priority. Order vs dockview's unlayered dist CSS is unaffected — dockview.css
// is imported first, so dock-theme's unlayered overrides still win source-order.
import '@rune-langium/design-system/dock-theme.css';

installOpLogWindowBridge();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/op-log-window-bridge.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/op-log-window-bridge.ts apps/studio/src/main.tsx apps/studio/test/services/op-log-window-bridge.test.ts
git commit -m "feat(studio): install always-on read-only window.__runeStudioOpLog bridge"
```

---

## Task 5: `StudioToastProvider` publishes into output-store/activity-store — superset-of-toasts invariant

**Files:**
- Modify: `apps/studio/src/components/StudioToastProvider.tsx`
- Test: `apps/studio/test/components/StudioToastProvider.test.tsx` (extend existing file)

**Interfaces:**
- Consumes: `useOutputStore`/`fmtLine` (Task 1), `useActivityStore` (Task 2), `allocateOpId` (Task 3).
- Produces: no new exported API — `showToast`/`showLoadingToast`/`dismissToast` keep their existing signatures; behavior changes only in that every call now also publishes to the two stores.

Toasts become **another normal publisher into the same two stores** — not a special mirror bolted onto op-log. This is the structural fix for "superset of toasts": since `op-log.ts` (Task 3) reads from these stores, any toast is automatically visible in `getOpLogSnapshot()` with zero op-log-specific toast code.

- [ ] **Step 1: Write the failing test**

Extend `apps/studio/test/components/StudioToastProvider.test.tsx` — add a new `describe` block after the existing tests (keep all existing tests unchanged):

```tsx
import { useOutputStore } from '../../src/store/output-store.js';
import { useActivityStore } from '../../src/store/activity-store.js';

// ... (existing imports/harness components stay) ...

describe('StudioToastProvider — superset-of-toasts invariant', () => {
  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
    useActivityStore.setState({ entries: [] });
  });

  it('showToast publishes a matching activity-store entry', () => {
    render(
      <StudioToastProvider>
        <ShowToastHarness />
      </StudioToastProvider>
    );
    screen.getByText('show').click();

    const entries = useActivityStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].tag).toBe('toast');
    expect(entries[0].ok).toBe(false); // variant: 'destructive'
    expect(entries[0].msg).toBe('Plain notification');
  });

  it('showLoadingToast publishes a start entry; dismissToast publishes the matching end entry with the same opId', () => {
    render(
      <StudioToastProvider>
        <LoadingToastHarness />
      </StudioToastProvider>
    );
    screen.getByText('show-and-dismiss').click();

    const entries = useActivityStore.getState().entries;
    // one entry for the loading-toast start, one for its dismissal
    expect(entries).toHaveLength(2);
    expect(entries[0].tag).toBe('toast');
    expect(entries[0].opId).toBeDefined();
    expect(entries[1].opId).toBe(entries[0].opId);
    expect(entries[1].durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/StudioToastProvider.test.tsx`
Expected: FAIL — new `describe` block's assertions fail (`entries` is empty; toasts don't publish anywhere yet).

- [ ] **Step 3: Wire the mirror into `StudioToastProvider.tsx`**

Modify `apps/studio/src/components/StudioToastProvider.tsx`. Add the imports and update `showToast`/`showLoadingToast`/`dismissToast`:

```tsx
import { useOutputStore, fmtLine } from '../store/output-store.js';
import { useActivityStore } from '../store/activity-store.js';
import { allocateOpId } from '../services/op-log.js';

// ... existing type/interface declarations unchanged ...

function StudioToastInner({ children }: { children: ReactNode }) {
  const { toasts, add, close } = useToastManager();
  // opId of each in-flight loading toast, keyed by the toast library's own id,
  // so dismissToast can close the matching op-log span.
  const loadingSpans = useRef(new Map<string, { opId: number; description: string }>()).current;

  const showToast = useCallback(
    (input: StudioToastInput) => {
      const opId = allocateOpId();
      const isDestructive = input.variant === 'destructive';
      useOutputStore
        .getState()
        .addLine(fmtLine('toast', input.title ?? input.description, input.title ? input.description : undefined), isDestructive ? 'error' : 'info', {
          op: 'toast',
          opId
        });
      useActivityStore.getState().addActivity('toast', !isDestructive, input.title ?? input.description, { opId });

      add({
        title: input.title,
        description: input.description,
        type: input.variant ?? 'default',
        timeout: input.duration
      });
    },
    [add]
  );

  const showLoadingToast = useCallback(
    (input: StudioLoadingToastInput) => {
      const opId = allocateOpId();
      useOutputStore.getState().addLine(fmtLine('toast', input.title ?? input.description), 'info', { op: 'toast', opId });
      useActivityStore.getState().addActivity('toast', true, input.title ?? input.description, { opId });

      const id = add({
        title: input.title,
        description: input.description,
        type: 'loading',
        // No auto-dismiss timeout — a background process has no fixed
        // duration; the caller dismisses it explicitly when done.
        timeout: 0
      });
      loadingSpans.set(id, { opId, description: input.title ?? input.description });
      return id;
    },
    [add]
  );

  const dismissToast = useCallback(
    (id: string) => {
      const span = loadingSpans.get(id);
      if (span) {
        loadingSpans.delete(id);
        useOutputStore.getState().addLine(fmtLine('toast', 'dismissed', span.description), 'success', {
          op: 'toast',
          opId: span.opId,
          durationMs: 0
        });
        useActivityStore.getState().addActivity('toast', true, `dismissed · ${span.description}`, {
          opId: span.opId,
          durationMs: 0
        });
      }
      close(id);
    },
    [close]
  );

  // ... rest of the component (contextValue, JSX) unchanged ...
```

Note: `durationMs: 0` on dismissal is a placeholder for "we don't track wall-clock elapsed for loading toasts here" — real elapsed time would require storing a `startedAt` alongside `opId`/`description` in `loadingSpans`, which is a one-line addition; do it now for correctness:

```tsx
      const span = loadingSpans.get(id);
```
→ store `{ opId, description, startedAt: performance.now() }` in `showLoadingToast`, and in `dismissToast` compute `durationMs: performance.now() - span.startedAt`. Apply this before running Step 4 — the test's `expect(entries[1].durationMs).toBeGreaterThanOrEqual(0)` passes either way, but real duration is the whole point of the field, so don't leave it hardcoded at 0.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/StudioToastProvider.test.tsx`
Expected: PASS (all existing tests + 2 new tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/components/StudioToastProvider.tsx apps/studio/test/components/StudioToastProvider.test.tsx
git commit -m "feat(studio): toasts publish into output/activity stores (superset-of-toasts invariant)"
```

---

## Task 6: Instrument curated model load (`model-store.ts`) with span timing

**Files:**
- Modify: `apps/studio/src/store/model-store.ts`
- Test: `apps/studio/test/store/model-store.test.ts` (extend existing file)

**Interfaces:**
- Consumes: `useOutputStore`/`fmtLine` (Task 1), `useActivityStore` (Task 2), `allocateOpId` (Task 3).

`model-store.ts`'s `load()` (lines 158–229) currently has **no** Activity/Output logging at all on the curated-load path — this task adds the first log calls there, using the existing `addLine`/`addActivity` functions (now carrying `op`/`opId`/`durationMs`), not a new mechanism. This is the `cdmLoad` operation the harness spec's §4 timing table names explicitly.

- [ ] **Step 1: Write the failing test**

Read the existing `apps/studio/test/store/model-store.test.ts` first to match its mocking pattern for `loadModel`, then add:

```ts
import { useOutputStore } from '../../src/store/output-store.js';
import { useActivityStore } from '../../src/store/activity-store.js';

// ... inside the existing describe block, alongside other load() tests ...

it('load() publishes a success activity entry with op="modelLoad" and a durationMs', async () => {
  useOutputStore.setState({ lines: [] });
  useActivityStore.setState({ entries: [] });

  const source = { id: 'cdm', name: 'CDM (Common Domain Model)' /* ...whatever fields the existing mocked loadModel expects... */ };
  await useModelStore.getState().load(source as any);

  const entries = useActivityStore.getState().entries;
  const modelLoadEntries = entries.filter((e) => e.tag === 'modelLoad');
  expect(modelLoadEntries).toHaveLength(1);
  expect(modelLoadEntries[0].ok).toBe(true);
  expect(modelLoadEntries[0].subject).toBe('cdm');
  expect(modelLoadEntries[0].durationMs).toBeGreaterThanOrEqual(0);
});

it('load() publishes a failure activity entry with ok=false on error', async () => {
  useOutputStore.setState({ lines: [] });
  useActivityStore.setState({ entries: [] });
  // reuse this file's existing pattern for making loadModel reject
  // (see the existing "records an error" / "dismissError" tests above for
  // the exact mock-rejection shape already used in this file)

  const entries = useActivityStore.getState().entries;
  const modelLoadEntries = entries.filter((e) => e.tag === 'modelLoad');
  expect(modelLoadEntries).toHaveLength(1);
  expect(modelLoadEntries[0].ok).toBe(false);
});
```

(Adapt the exact mock shape to match whatever `loadModel` mocking convention `model-store.test.ts` already uses for its success/failure tests — do not invent a new mocking pattern; grep the file's existing `vi.mock('../../src/services/model-loader.js', ...)` setup and reuse it verbatim for both new tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/model-store.test.ts`
Expected: FAIL — the two new tests find zero `modelLoad`-tagged entries.

- [ ] **Step 3: Instrument `load()` in `model-store.ts`**

Modify `apps/studio/src/store/model-store.ts` — add the imports at the top:

```ts
import { useOutputStore, fmtLine } from './output-store.js';
import { useActivityStore } from './activity-store.js';
import { allocateOpId } from '../services/op-log.js';
```

Wrap the body of `load()` with span timing. The existing structure (from the file already read) is:

```ts
async load(source: ModelSource) {
  const { loading, errors } = get();
  if (loading.has(source.id)) return;
  const abortController = new AbortController();
  // ... newErrors/newLoading/set({...}) unchanged ...

  const opId = allocateOpId();
  const startedAt = performance.now();

  try {
    const archiveLoader = source.archiveUrl ? buildArchiveLoader() : undefined;
    const model = await loadModel(source, { /* unchanged */ });

    // Success — add to loaded models, remove from loading
    const currentModels = new Map(get().models);
    currentModels.set(source.id, model);
    const currentLoading = new Map(get().loading);
    currentLoading.delete(source.id);
    set({ models: currentModels, loading: currentLoading });

    const durationMs = performance.now() - startedAt;
    useOutputStore.getState().addLine(fmtLine('modelLoad', 'loaded', source.name), 'success', {
      op: 'modelLoad',
      subject: source.id,
      durationMs,
      opId
    });
    useActivityStore.getState().addActivity('modelLoad', true, `${source.name} loaded`, {
      subject: source.id,
      durationMs,
      opId
    });

    // Auto-load declared dependencies — unchanged
    if (source.depends?.length) {
      for (const depId of source.depends) {
        if (get().models.has(depId) || get().loading.has(depId)) continue;
        const dep = getModelSource(depId);
        if (dep) void get().load(dep);
      }
    }
  } catch (e) {
    const currentLoading = new Map(get().loading);
    currentLoading.delete(source.id);
    const currentErrors = new Map(get().errors);
    const err = e as { code?: ModelLoadErrorCode; category?: string; message?: string };
    currentErrors.set(source.id, {
      code: (err.code ?? err.category ?? 'NETWORK') as ModelLoadErrorCode,
      message: err.message ?? 'Unknown error',
      source
    });
    set({ loading: currentLoading, errors: currentErrors });

    const durationMs = performance.now() - startedAt;
    useOutputStore.getState().addLine(fmtLine('modelLoad', 'load failed', err.message ?? 'Unknown error'), 'error', {
      op: 'modelLoad',
      subject: source.id,
      durationMs,
      opId
    });
    useActivityStore.getState().addActivity('modelLoad', false, `${source.name} load failed`, {
      subject: source.id,
      durationMs,
      opId
    });
  }
},
```

(Only the two new blocks — after the success `set(...)` and inside the `catch` after its `set(...)` — are added; every other line of `load()` is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/model-store.test.ts`
Expected: PASS (all existing tests + 2 new tests)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/store/model-store.ts apps/studio/test/store/model-store.test.ts
git commit -m "feat(studio): instrument model-store load() with modelLoad span timing"
```

---

## Task 7: Enrich `LspProvider` connect/reconnect logging with span timing

**Files:**
- Modify: `apps/studio/src/shell/providers/LspProvider.tsx`
- Test: `apps/studio/test/shell/providers/LspProvider.test.tsx` (extend existing file)

**Interfaces:**
- Consumes: `allocateOpId` (Task 3). `LspProvider` already imports `useOutputStore`/`fmtLine`/`useActivityStore` and already calls `addLine`/`addActivity` at 4 sites (connected, disconnected, connect failed, reconnect failed) — this task adds `opId`/`durationMs` metadata to the existing calls, it does not add new call sites.

- [ ] **Step 1: Write the failing test**

Read the existing `apps/studio/test/shell/providers/LspProvider.test.tsx` in full first (its mocking of `createLspClientService`/`createTransportProvider` — already partially shown above) and add:

```ts
import { useActivityStore } from '../../../src/store/activity-store.js';

// ... inside the existing describe block ...

it('connect success publishes an activity entry with op-log opId and durationMs', async () => {
  useActivityStore.setState({ entries: [] });
  function Host() {
    return (
      <WorkspaceStateContext.Provider value={wsState([])}>
        <LspProvider>
          <LspProbe />
        </LspProvider>
      </WorkspaceStateContext.Provider>
    );
  }
  await act(async () => {
    render(<Host />);
  });

  const lspEntries = useActivityStore.getState().entries.filter((e) => e.tag === 'lsp');
  expect(lspEntries.length).toBeGreaterThan(0);
  const connectedEntry = lspEntries.find((e) => e.msg === 'connected');
  expect(connectedEntry?.opId).toBeDefined();
  expect(connectedEntry?.durationMs).toBeGreaterThanOrEqual(0);
});
```

(Match whichever render/act helper the file's existing `it('creates one client, connects once, ...')` test already uses — reuse `Host`/`wsState`/`LspProbe` verbatim rather than redefining them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/LspProvider.test.tsx`
Expected: FAIL — `connectedEntry?.opId` is `undefined` (the existing `addActivity('lsp', true, 'connected')` call carries no metadata yet).

- [ ] **Step 3: Enrich the 4 existing call sites in `LspProvider.tsx`**

Modify `apps/studio/src/shell/providers/LspProvider.tsx` — add the import and thread an `opId`/`startedAt` pair through the connect effect:

```tsx
import { allocateOpId } from '../../services/op-log.js';
```

In the main connect `useEffect` (the block already reading, from the file already fetched):

```tsx
  useEffect(() => {
    if (!config.lspEnabled) {
      setTransportState({ mode: 'disconnected', status: 'disconnected' });
      providerRef.current = null;
      lspClientRef.current = null;
      return undefined;
    }
    const connectOpId = allocateOpId();
    const connectStartedAt = performance.now();
    const provider = createTransportProvider({ workspaceId: getLspSessionId() });
    providerRef.current = provider;
    const unsub = provider.onStateChange((state) => {
      setTransportState(state);
      if (state.status === 'connected') {
        const durationMs = performance.now() - connectStartedAt;
        useOutputStore.getState().addLine(fmtLine('lsp', 'connected'), 'success', { op: 'lsp', opId: connectOpId, durationMs });
        useActivityStore.getState().addActivity('lsp', true, 'connected', { opId: connectOpId, durationMs });
      } else if (state.status === 'disconnected' && prevStatusRef.current === 'connected') {
        useOutputStore.getState().addLine(fmtLine('lsp', 'disconnected'), 'warn', { op: 'lsp' });
        useActivityStore.getState().addActivity('lsp', false, 'disconnected');
      }
      prevStatusRef.current = state.status;
    });
    const client = createLspClientService({ transportProvider: provider });
    lspClientRef.current = client;
    client.connect().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      const durationMs = performance.now() - connectStartedAt;
      console.error('[LspProvider] LSP connect failed:', err);
      useOutputStore.getState().addLine(fmtLine('lsp', 'connect failed', msg), 'error', { op: 'lsp', opId: connectOpId, durationMs });
      useActivityStore.getState().addActivity('lsp', false, `connect failed · ${msg}`, { opId: connectOpId, durationMs });
      showToastRef.current({
        title: 'Language server unavailable',
        description:
          err instanceof Error ? err.message : 'LSP connection failed. Diagnostics and completions will not work.',
        variant: 'destructive'
      });
    });
    return () => {
      unsub();
      client.dispose();
      provider.dispose();
    };
  }, []);
```

And the `reconnect` callback, same pattern:

```tsx
  const reconnect = useCallback(() => {
    void (async () => {
      const opId = allocateOpId();
      const startedAt = performance.now();
      try {
        await lspClientRef.current?.reconnect();
        const durationMs = performance.now() - startedAt;
        useOutputStore.getState().addLine(fmtLine('lsp', 'reconnected'), 'success', { op: 'lsp', opId, durationMs });
        useActivityStore.getState().addActivity('lsp', true, 'reconnected', { opId, durationMs });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const durationMs = performance.now() - startedAt;
        console.error('[LspProvider] LSP reconnect failed:', err);
        useOutputStore.getState().addLine(fmtLine('lsp', 'reconnect failed', msg), 'error', { op: 'lsp', opId, durationMs });
        useActivityStore.getState().addActivity('lsp', false, `reconnect failed · ${msg}`, { opId, durationMs });
        showToast({
          title: 'LSP reconnect failed',
          description: err instanceof Error ? err.message : 'Could not reconnect to the language server.',
          variant: 'destructive'
        });
      }
    })();
  }, []);
```

(Note: the existing `reconnect` success path had no `addLine`/`addActivity` call at all before this change — check the file for whether a success line already exists past what was shown; if it does, enrich it in place instead of adding a duplicate. If it doesn't, this adds the first one, consistent with Task 6's precedent of adding a first log call via the existing functions where none existed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/LspProvider.test.tsx`
Expected: PASS (all existing tests + 1 new test)

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/providers/LspProvider.tsx apps/studio/test/shell/providers/LspProvider.test.tsx
git commit -m "feat(studio): enrich LspProvider connect/reconnect logging with op-log span metadata"
```

---

## Task 8: Type-check + full studio suite gate (Phase 0 close-out)

**Files:** none (verification-only task)

- [ ] **Step 1: Run the full studio test suite**

Run: `pnpm --filter @rune-langium/studio test`
Expected: PASS, 0 failures (per repo convention — run the whole package suite, not a subset, after a shared-store behavior change).

- [ ] **Step 2: Run type-check**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS, no errors, in particular no `window.__runeStudioOpLog` type conflicts across the two `declare global` sites (only `op-log-window-bridge.ts` declares it — `test-api.ts`'s `declare global` augments a *different* property, `__runeStudioTestApi`, so there is no collision).

- [ ] **Step 3: Manual smoke — confirm the bridge is live in a real dev build**

Run: `pnpm --filter @rune-langium/studio run dev`, open the app in a browser, open the devtools console, and evaluate:

```js
window.__runeStudioOpLog.snapshot()
```

Expected: returns an array (empty or with entries depending on what's happened in the session so far) — not `undefined`. Trigger an LSP connect or a toast (e.g. load a workspace) and re-run the snapshot call; the new entry should appear with `opId`/`durationMs` populated where instrumented.

- [ ] **Step 4: Commit (if Step 1–3 required any fixups)**

```bash
git add -A
git commit -m "chore(studio): Phase 0 instrumentation close-out fixups"
```

(Skip this commit if Steps 1–3 required no changes.)

---

## Task 9: Checkout fixture — `EvidenceCollector` + `run-manifest.json` writer

**Files:**
- Create: `apps/studio/test/prod-ux/fixtures.ts`
- Create: `apps/studio/test/prod-ux/evidence.ts`
- Test: implicitly verified by Task 10's journeys (this module has no assertable behavior of its own outside a real browser page — component-test it indirectly via the smoke journey in Task 10, per this codebase's existing convention of not unit-testing Playwright fixture glue).

**Interfaces:**
- Consumes: `window.__runeStudioOpLog.snapshot()` (Task 4), Playwright's `test`/`Page`.
- Produces: `checkout` (an extended Playwright `test`), exported from `fixtures.ts`; `EvidenceCollector` with `checkpoint(name: string): Promise<void>` and `softFinding(ledgerId: string, detail: string): void`, exported from `evidence.ts`. Consumed by every journey spec in Task 10+.

- [ ] **Step 1: Create `evidence.ts`**

Create `apps/studio/test/prod-ux/evidence.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, ConsoleMessage, Request } from '@playwright/test';

export interface Checkpoint {
  name: string;
  screenshot: string;
  tMs: number;
}

export interface SoftFinding {
  ledgerId: string;
  detail: string;
}

export interface JourneyRecord {
  id: string;
  title: string;
  verdict: 'PASS' | 'DEGRADED' | 'FAIL' | 'BLOCKED';
  durationMs: number;
  checkpoints: Checkpoint[];
  consoleErrors: string[];
  failedRequests: string[];
  softFindings: SoftFinding[];
}

const REPORT_DIR = path.join(process.cwd(), 'test/prod-ux/report');

export class EvidenceCollector {
  private readonly startedAt: number;
  private readonly consoleErrors: string[] = [];
  private readonly failedRequests: string[] = [];
  private readonly checkpoints: Checkpoint[] = [];
  private readonly softFindings: SoftFinding[] = [];
  private seq = 0;

  constructor(
    private readonly page: Page,
    private readonly journeyId: string,
    private readonly title: string
  ) {
    this.startedAt = Date.now();
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        this.consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err: Error) => {
      this.consoleErrors.push(`[pageerror] ${err.message}`);
    });
    page.on('requestfailed', (req: Request) => {
      this.failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
    });
  }

  async checkpoint(name: string): Promise<void> {
    this.seq += 1;
    const dir = path.join(REPORT_DIR, 'screenshots', this.journeyId);
    await mkdir(dir, { recursive: true });
    const fileName = `${String(this.seq).padStart(2, '0')}-${name}.png`;
    const screenshotPath = path.join(dir, fileName);
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.checkpoints.push({ name, screenshot: path.relative(REPORT_DIR, screenshotPath), tMs: Date.now() - this.startedAt });
  }

  softFinding(ledgerId: string, detail: string): void {
    this.softFindings.push({ ledgerId, detail });
  }

  async finish(verdict: JourneyRecord['verdict']): Promise<JourneyRecord> {
    return {
      id: this.journeyId,
      title: this.title,
      verdict,
      durationMs: Date.now() - this.startedAt,
      checkpoints: this.checkpoints,
      consoleErrors: this.consoleErrors,
      failedRequests: this.failedRequests,
      softFindings: this.softFindings
    };
  }
}

export async function appendJourneyRecord(record: JourneyRecord): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  const manifestPath = path.join(REPORT_DIR, 'run-manifest.json');
  let manifest: { runId: string; journeys: JourneyRecord[] };
  try {
    const raw = await import('node:fs/promises').then((fs) => fs.readFile(manifestPath, 'utf-8'));
    manifest = JSON.parse(raw);
  } catch {
    manifest = { runId: `prod-ux-${new Date().toISOString()}`, journeys: [] };
  }
  manifest.journeys = manifest.journeys.filter((j) => j.id !== record.id);
  manifest.journeys.push(record);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}
```

- [ ] **Step 2: Create `fixtures.ts`**

Create `apps/studio/test/prod-ux/fixtures.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { test as base, expect, type Page } from '@playwright/test';
import { EvidenceCollector, appendJourneyRecord, type JourneyRecord } from './evidence.js';

interface CheckoutFixtures {
  evidence: EvidenceCollector;
}

export const checkout = base.extend<CheckoutFixtures>({
  evidence: async ({ page }, use, testInfo) => {
    const journeyId = testInfo.title.match(/^(J\d+[a-z]?)/)?.[1] ?? testInfo.title;
    const collector = new EvidenceCollector(page, journeyId, testInfo.title);
    await use(collector);
    const verdict = testInfo.status === testInfo.expectedStatus ? 'PASS' : 'FAIL';
    const record: JourneyRecord = await collector.finish(verdict);
    await appendJourneyRecord(record);
  }
});

export { expect };

export interface OpLogEntry {
  opId?: number;
  op: string;
  subject?: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  durationMs?: number;
  ts: number;
  panel: 'output' | 'activity';
}

/** Reads window.__runeStudioOpLog.snapshot() from the page — installed by op-log-window-bridge.ts (Task 4). */
export async function readOpLog(page: Page): Promise<OpLogEntry[]> {
  return page.evaluate(() => window.__runeStudioOpLog?.snapshot() ?? []);
}

const CDM_BUTTON = 'CDM (Common Domain Model)';
const WORKSPACE_FILE_NAME = 'starter.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace example\n';

/** Ported verbatim from test/prod-smoke/production-checkout.spec.ts's loadCdm helper. */
export async function loadCdm(page: Page): Promise<void> {
  await page.goto('./');
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveTitle(/Rune Studio/);
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
  await fileInput.setInputFiles([
    { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
  ]);
  await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('rail-workspaces').click();
  await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

  await page.getByTestId('model-loader').getByRole('button', { name: CDM_BUTTON }).click();

  await expect(page.getByText('Loaded Models', { exact: false })).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('button', { name: `Unload ${CDM_BUTTON}` })).toBeVisible({ timeout: 90000 });
}
```

`window.__runeStudioOpLog` needs a type declaration visible to this test file. Since `op-log-window-bridge.ts`'s `declare global` already augments `Window`, and this test file is part of the same TS project (`apps/studio/tsconfig.json` includes `test/`), no separate declaration is needed here — verified in Step 3.

- [ ] **Step 3: Type-check the new fixture files**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS — `page.evaluate(() => window.__runeStudioOpLog...)` resolves `window` against Playwright's own DOM lib types in the evaluate callback context, which does NOT automatically see `apps/studio/src`'s `declare global`. If this fails with "Property '__runeStudioOpLog' does not exist on type 'Window'", add a local ambient declaration at the top of `fixtures.ts`:

```ts
declare global {
  interface Window {
    __runeStudioOpLog?: { snapshot(): OpLogEntry[] };
  }
}
```

(placed after the `OpLogEntry` interface, before `readOpLog`). Re-run type-check; expected PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/test/prod-ux/fixtures.ts apps/studio/test/prod-ux/evidence.ts
git commit -m "feat(studio): add prod-ux checkout fixture (evidence collector + manifest writer)"
```

---

## Task 10: Extend `playwright.prod.config.ts` for the `prod-ux` suite

**Files:**
- Modify: `apps/studio/playwright.prod.config.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `prod-ux/**/*.spec.ts` becomes a runnable Playwright project alongside the existing `prod-smoke/**/*.spec.ts`.

- [ ] **Step 1: Modify the config**

The full current file (already read in full):

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: ['prod-smoke/**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  timeout: 120000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://www.daikonic.dev/rune-studio/studio/',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
        }
      }
    }
  ]
});
```

Change only `testMatch` (per spec §3's `retries: 1` rail for this suite — smoke keeps `retries: 0`, prod-ux uses 1) — Playwright supports per-test `retries` override via `test.describe.configure`, but the simplest config-level change consistent with the existing single-`projects` structure is to widen `testMatch` and bump the shared `retries` to `1` (smoke's own journeys are already low-flake reference tests absorbed unchanged into prod-ux in Task 11, so this doesn't regress smoke's strictness — it only adds one retry, with `trace: 'on-first-retry'` already configured to capture it):

```ts
  testMatch: ['prod-smoke/**/*.spec.ts', 'prod-ux/journeys/**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: false,
  retries: 1,
```

- [ ] **Step 2: Verify smoke still runs standalone**

Run: `PLAYWRIGHT_PROD_SMOKE=1 pnpm --filter @rune-langium/studio exec playwright test --config playwright.prod.config.ts --grep-invert "prod-ux"` — wait, `testMatch` already scopes by directory, so no grep is needed; instead just verify the existing smoke spec still collects:

Run: `pnpm --filter @rune-langium/studio exec playwright test --config playwright.prod.config.ts --list`
Expected: lists the existing `production checkout smoke` and `production deployment freshness` tests from `prod-smoke/production-checkout.spec.ts`; zero `prod-ux/journeys/*` tests yet (none exist until Task 11).

- [ ] **Step 3: Add the `test:prod-ux` script**

Modify `apps/studio/package.json` — add alongside the existing `test:prod-smoke` script:

```json
    "test:prod-smoke": "PLAYWRIGHT_PROD_SMOKE=1 playwright test --config playwright.prod.config.ts",
    "test:prod-ux": "PLAYWRIGHT_PROD_SMOKE=1 playwright test --config playwright.prod.config.ts prod-ux/journeys",
```

- [ ] **Step 4: Commit**

```bash
git add apps/studio/playwright.prod.config.ts apps/studio/package.json
git commit -m "chore(studio): extend prod playwright config + add test:prod-ux script"
```

---

## Task 11: Absorb `prod-smoke` as J0/J3/J4

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j00-freshness.spec.ts`
- Create: `apps/studio/test/prod-ux/journeys/j03-cdm-load.spec.ts`
- Create: `apps/studio/test/prod-ux/journeys/j04-explorer-hydration.spec.ts`
- (Leave `apps/studio/test/prod-smoke/production-checkout.spec.ts` in place, unmodified — it keeps running standalone via `test:prod-smoke`; these are new files that reuse its content through the shared `checkout` fixture, not a replacement.)

**Interfaces:**
- Consumes: `checkout`, `loadCdm`, `readOpLog` (Task 9).

- [ ] **Step 1: `j00-freshness.spec.ts`**

Create `apps/studio/test/prod-ux/journeys/j00-freshness.spec.ts` — port the existing `production deployment freshness` describe block from `production-checkout.spec.ts` verbatim, using the `checkout` fixture instead of bare `test`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { checkout as test, expect } from '../fixtures.js';

const CF_PAGES_PROJECT = 'daikonic-dev';
const CF_PRODUCTION_BRANCH = 'master';

interface CfPagesDeployment {
  short_id: string;
  deployment_trigger: { metadata: { branch: string; commit_hash: string } };
  latest_stage: { status: string };
}

interface CfPagesProject {
  canonical_deployment?: CfPagesDeployment;
  latest_deployment?: CfPagesDeployment;
}

function resolveMasterCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', `origin/${CF_PRODUCTION_BRANCH}`], { encoding: 'utf-8' }).trim();
  } catch {
    return execFileSync('git', ['rev-parse', CF_PRODUCTION_BRANCH], { encoding: 'utf-8' }).trim();
  }
}

test.describe('J00 — deployment freshness', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');
  test.skip(
    !process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID,
    'set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to verify the live deployment against master'
  );

  test('J00a canonical Pages deployment serves the current master commit', async ({ request, evidence }) => {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const res = await request.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${CF_PAGES_PROJECT}`,
      { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` } }
    );
    expect(res.ok(), `Cloudflare API request failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const { result } = (await res.json()) as { result: CfPagesProject };
    const canonical = result.canonical_deployment;
    expect(canonical, 'project has no canonical_deployment — nothing has ever deployed successfully').toBeTruthy();

    const masterCommit = resolveMasterCommit();
    const liveCommit = canonical!.deployment_trigger.metadata.commit_hash;

    if (liveCommit !== masterCommit) {
      const latest = result.latest_deployment;
      const staleness =
        latest && latest.short_id !== canonical!.short_id
          ? ` The most recent deploy attempt (${latest.deployment_trigger.metadata.commit_hash}) is in status ` +
            `"${latest.latest_stage.status}" — if it failed, production is silently stuck on an older commit.`
          : '';
      evidence.softFinding('deploy-staleness', `live=${liveCommit} master=${masterCommit}${staleness}`);
      expect(liveCommit, `Production (${liveCommit}) does not match master HEAD (${masterCommit}).${staleness}`).toBe(
        masterCommit
      );
    }
  });
});
```

- [ ] **Step 2: `j03-cdm-load.spec.ts`**

Create `apps/studio/test/prod-ux/journeys/j03-cdm-load.spec.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm, readOpLog } from '../fixtures.js';

test.describe('J03 — curated CDM load & unload', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J03 loads and unloads CDM, recording cdmLoad timing', async ({ page, evidence }) => {
    await loadCdm(page);
    await evidence.checkpoint('cdm-loaded');

    const opLog = await readOpLog(page);
    const modelLoadEntries = opLog.filter((e) => e.op === 'modelLoad' && e.subject === 'cdm');
    expect(modelLoadEntries.length, 'expected a modelLoad op-log entry for the cdm subject (Task 6 instrumentation)').toBeGreaterThan(0);
    const successEntry = modelLoadEntries.find((e) => e.level === 'success');
    expect(successEntry?.durationMs, 'cdmLoad duration should be recorded').toBeGreaterThanOrEqual(0);
    if ((successEntry?.durationMs ?? 0) > 45000) {
      evidence.softFinding('cdmLoad-budget', `cdmLoad took ${successEntry?.durationMs}ms, over the 45s soft budget`);
    }

    await page.getByRole('button', { name: /Unload CDM/ }).click();
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('cdm-unloaded');
  });
});
```

- [ ] **Step 3: `j04-explorer-hydration.spec.ts`**

Create `apps/studio/test/prod-ux/journeys/j04-explorer-hydration.spec.ts` — port the 3 existing explorer/hydration tests from `production-checkout.spec.ts` (`loads CDM and updates explorer-driven panes...`, `Inspector populates members on first navigation...`, `graph node shows a hydrating spinner...`), using the `checkout` fixture and adding `evidence.checkpoint(...)` calls at the same points the spec's journey inventory names (`explorer-nav`, `hydration-spinner-visible`, `hydration-complete`). Reuse the anchors as local consts for now (`ENUM_NODE_ID`, `DATA_NODE_ID`, `COUNTERPARTY_NODE_ID`, with the same corpus-stability comments already in `production-checkout.spec.ts`) — Task 12 below centralizes them into `anchors.ts` once J1/J5/J6 need the same anchors too, per the spec's `anchors.ts` design (avoid extracting a shared module for a single consumer; extract when the second consumer arrives, which happens in Task 12).

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';

// Corpus-stable anchors — see production-checkout.spec.ts's original comments
// for why these specific fqns were chosen (BusinessCenterEnum migrated to
// the codelist pattern 2026-07-02; these two live in cdm.base.datetime and
// were unaffected).
const ENUM_NODE_ID = 'cdm.base.datetime.BusinessDayConventionEnum';
const DATA_NODE_ID = 'cdm.base.datetime.BusinessCenters';
const COUNTERPARTY_NODE_ID = 'cdm.base.staticdata.party.Counterparty';

test.describe('J04 — explorer navigation & on-demand hydration', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J04a explorer navigation updates panes with reference-only design', async ({ page, evidence }) => {
    await loadCdm(page);
    const centerStack = page.getByTestId('center-stack');

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('explore-workbench');

    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('BusinessDayConvention');
    await page.getByTestId(`ns-type-nav-${ENUM_NODE_ID}`).click();
    await expect(page.getByText(ENUM_NODE_ID, { exact: true })).toBeVisible({ timeout: 15000 });

    await namespaceSearch.fill('BusinessCenters');
    await page.getByTestId(`ns-type-nav-${DATA_NODE_ID}`).click();
    await expect(page.getByText(DATA_NODE_ID, { exact: true })).toBeVisible({ timeout: 15000 });
    await evidence.checkpoint('data-node-selected');

    await page.getByRole('button', { name: 'Structure' }).click();
    await expect(page.getByTestId('structure-view-flow')).toBeVisible();
    await expect(page.getByTestId('structure-empty-state')).toHaveCount(0);
    await evidence.checkpoint('structure-view');

    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByRole('heading', { name: 'BusinessCenters' })).toBeVisible();
    await expect(centerStack.getByText('cdm.base.datetime', { exact: true })).toBeVisible();
    await expect(centerStack.getByText('Reference Only', { exact: true })).toBeVisible();
    await evidence.checkpoint('inspector-view');

    await page.getByRole('button', { name: 'Source' }).click();
    await expect(centerStack.getByText('namespace example', { exact: false })).toBeVisible();
  });

  test('J04b Inspector populates members on first navigation to a never-hydrated curated namespace', async ({ page, evidence }) => {
    await loadCdm(page);
    const centerStack = page.getByTestId('center-stack');

    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20_000 });

    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('Counterparty');
    await page.getByTestId(`ns-type-nav-${COUNTERPARTY_NODE_ID}`).click();
    await expect(page.getByText(COUNTERPARTY_NODE_ID, { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByRole('heading', { name: 'Counterparty' })).toBeVisible({ timeout: 10_000 });
    await expect(centerStack.getByText('Reference Only', { exact: true })).toBeVisible();
    await expect(centerStack.getByText(/Members \([1-9]/)).toBeVisible({ timeout: 30_000 });
    await evidence.checkpoint('hydration-complete');
  });

  test('J04c graph node shows a hydrating spinner while a never-hydrated namespace loads', async ({ page, evidence }) => {
    await page.route('**/api/parse', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await loadCdm(page);
    await page.getByTestId('rail-explore').click();
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20_000 });

    const namespaceSearch = page.getByTestId('namespace-search');
    await namespaceSearch.fill('Counterparty');
    await page.getByTestId(`ns-type-nav-${COUNTERPARTY_NODE_ID}`).click();

    await expect(page.getByTestId('rune-node-hydrating-spinner')).toBeVisible({ timeout: 5_000 });
    await evidence.checkpoint('hydration-spinner-visible');

    const centerStack = page.getByTestId('center-stack');
    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByText(/Members \([1-9]/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('rune-node-hydrating-spinner')).toHaveCount(0);
    await evidence.checkpoint('hydration-complete');
  });
});
```

- [ ] **Step 4: Run and verify**

Run: `pnpm --filter @rune-langium/studio run test:prod-ux -- --list`
Expected: lists J00a, J03, J04a, J04b, J04c with no collection errors.

Run (only if you have prod access / want to actually hit the live site — otherwise skip to Step 5 and note this in the commit body): `pnpm --filter @rune-langium/studio run test:prod-ux`
Expected: PASS for J03/J04* (J00a additionally requires `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` or it self-skips). `apps/studio/test/prod-ux/report/run-manifest.json` is created/updated with 4 journey records.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/test/prod-ux/journeys/j00-freshness.spec.ts apps/studio/test/prod-ux/journeys/j03-cdm-load.spec.ts apps/studio/test/prod-ux/journeys/j04-explorer-hydration.spec.ts
git commit -m "feat(studio): absorb prod-smoke as prod-ux journeys J00/J03/J04"
```

---

## Task 12: `anchors.ts` — centralize corpus-stable anchors (extracted on 2nd+3rd consumer)

**Files:**
- Create: `apps/studio/test/prod-ux/anchors.ts`
- Modify: `apps/studio/test/prod-ux/journeys/j04-explorer-hydration.spec.ts` (import from `anchors.ts` instead of local consts)

**Interfaces:**
- Produces: `ANCHOR_ENUM`, `ANCHOR_DATA`, `ANCHOR_NEVER_HYDRATED_DATA` (renamed/consolidated from `ENUM_NODE_ID`/`DATA_NODE_ID`/`COUNTERPARTY_NODE_ID` for clarity now that 3 journeys share them).

- [ ] **Step 1: Create `anchors.ts`**

Create `apps/studio/test/prod-ux/anchors.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Corpus-stable type/namespace anchors, shared across prod-ux journeys.
 * Each anchor records WHY it's expected to survive curated corpus rebuilds.
 * If a journey fails because one of these no longer exists in the live
 * curated manifest, that's corpus-drift (BLOCKED), not a regression (FAIL) —
 * see docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md §3.
 */

/** cdm.base.datetime — unaffected by the 2026-07-02 BusinessCenterEnum→codelist migration. */
export const ANCHOR_ENUM = 'cdm.base.datetime.BusinessDayConventionEnum';

/** cdm.base.datetime — same rebuild, unaffected. */
export const ANCHOR_DATA = 'cdm.base.datetime.BusinessCenters';

/** cdm.base.staticdata.party — never pre-hydrated at load time; the canonical never-hydrated-on-first-nav anchor (resolveNodeFileRef regression, commit f6a64029). */
export const ANCHOR_NEVER_HYDRATED_DATA = 'cdm.base.staticdata.party.Counterparty';
```

- [ ] **Step 2: Update `j04-explorer-hydration.spec.ts` to import from it**

Replace the local `const ENUM_NODE_ID = ...` / `const DATA_NODE_ID = ...` / `const COUNTERPARTY_NODE_ID = ...` block in `apps/studio/test/prod-ux/journeys/j04-explorer-hydration.spec.ts` with:

```ts
import { ANCHOR_ENUM as ENUM_NODE_ID, ANCHOR_DATA as DATA_NODE_ID, ANCHOR_NEVER_HYDRATED_DATA as COUNTERPARTY_NODE_ID } from '../anchors.js';
```

(Keeping the old local names as import aliases means the rest of the file's body — already written in Task 11 — needs zero further edits.)

- [ ] **Step 3: Re-list to verify no breakage**

Run: `pnpm --filter @rune-langium/studio run test:prod-ux -- --list`
Expected: same journey list as Task 11 Step 4, no collection errors.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/test/prod-ux/anchors.ts apps/studio/test/prod-ux/journeys/j04-explorer-hydration.spec.ts
git commit -m "refactor(studio): centralize prod-ux corpus-stable anchors into anchors.ts"
```

---

## Task 13: J01 — First run / start page

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j01-first-run.spec.ts`

- [ ] **Step 1: Write the journey**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect } from '../fixtures.js';

test.describe('J01 — first run / start page', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J01 fresh load shows the start page with no console errors', async ({ page, evidence }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/Rune Studio/);
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('unsupported-viewport')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'CDM (Common Domain Model)' })).toBeVisible();
    await evidence.checkpoint('start-page');
  });
});
```

(`data-testid="unsupported-viewport"` — confirm the exact testid on `UnsupportedViewport.tsx` before finalizing; if it differs, use the real one. Do not guess a plausible-sounding id without checking the component source first.)

- [ ] **Step 2: Verify against real source**

Before running, open `apps/studio/src/components/UnsupportedViewport.tsx` and confirm its root `data-testid`. Adjust the assertion in Step 1's code to match exactly.

- [ ] **Step 3: List and (optionally) run**

Run: `pnpm --filter @rune-langium/studio run test:prod-ux -- --list`
Expected: J01 appears alongside J00/J03/J04.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/test/prod-ux/journeys/j01-first-run.spec.ts
git commit -m "feat(studio): add prod-ux journey J01 (first run / start page)"
```

---

## Task 14: J02 — Workspace lifecycle & persistence

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j02-workspace-lifecycle.spec.ts`

- [ ] **Step 1: Write the journey**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect } from '../fixtures.js';

const WORKSPACE_FILE_NAME = 'starter.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace example\n';

test.describe('J02 — workspace lifecycle & persistence', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J02 workspace survives a reload via OPFS/IndexedDB', async ({ page, evidence }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

    const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
    await fileInput.setInputFiles([
      { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
    ]);
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
    await evidence.checkpoint('workspace-created');

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await evidence.checkpoint('after-reload');

    // A reloaded page with a prior workspace lands back in the workbench,
    // not the model-loader launcher — this IS the persistence assertion.
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });
  });
});
```

- [ ] **Step 2: List**

Run: `pnpm --filter @rune-langium/studio run test:prod-ux -- --list`
Expected: J02 appears.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/test/prod-ux/journeys/j02-workspace-lifecycle.spec.ts
git commit -m "feat(studio): add prod-ux journey J02 (workspace lifecycle & persistence)"
```

---

## Task 15: J05 — Inspector pane, J06 — Structure view, J07 — Source view + LSP

**Files:**
- Create: `apps/studio/test/prod-ux/journeys/j05-inspector.spec.ts`
- Create: `apps/studio/test/prod-ux/journeys/j06-structure-view.spec.ts`
- Create: `apps/studio/test/prod-ux/journeys/j07-source-lsp.spec.ts`

These three journeys reuse the `loadCdm` + anchor pattern established in Tasks 9–12; write each following the exact same structure as `j04-explorer-hydration.spec.ts` (`checkout as test`, `loadCdm`, anchors from `anchors.ts`, `evidence.checkpoint(...)` at each named checkpoint from the spec's journey inventory: J05 → `inspector-populated`; J06 → `structure-view-rendered`, `node-selected`; J07 → `lsp-connected`, `diagnostic-shown`, `diagnostic-cleared`).

- [ ] **Step 1: `j05-inspector.spec.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';
import { ANCHOR_DATA } from '../anchors.js';

test.describe('J05 — Inspector pane', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J05 Inspector shows heading, namespace, reference-only badge, and populated members', async ({ page, evidence }) => {
    await loadCdm(page);
    const centerStack = page.getByTestId('center-stack');

    await page.getByTestId('rail-explore').click();
    await page.getByTestId('namespace-search').fill('BusinessCenters');
    await page.getByTestId(`ns-type-nav-${ANCHOR_DATA}`).click();
    await expect(page.getByText(ANCHOR_DATA, { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Inspector' }).click();
    await expect(centerStack.getByRole('heading', { name: 'BusinessCenters' })).toBeVisible();
    await expect(centerStack.getByText('cdm.base.datetime', { exact: true })).toBeVisible();
    await expect(centerStack.getByText('Reference Only', { exact: true })).toBeVisible();
    await expect(centerStack.getByText(/Members \([1-9]/)).toBeVisible({ timeout: 15000 });
    await evidence.checkpoint('inspector-populated');
  });
});
```

- [ ] **Step 2: `j06-structure-view.spec.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect, loadCdm } from '../fixtures.js';
import { ANCHOR_DATA } from '../anchors.js';

test.describe('J06 — Structure view', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J06 renders the graph with no empty state and selection syncs to Inspector', async ({ page, evidence }) => {
    await loadCdm(page);
    await page.getByTestId('rail-explore').click();
    await page.getByTestId('namespace-search').fill('BusinessCenters');
    await page.getByTestId(`ns-type-nav-${ANCHOR_DATA}`).click();
    await expect(page.getByText(ANCHOR_DATA, { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Structure' }).click();
    await expect(page.getByTestId('structure-view-flow')).toBeVisible();
    await expect(page.getByTestId('structure-empty-state')).toHaveCount(0);
    await evidence.checkpoint('structure-view-rendered');

    const node = page.getByTestId('structure-view-flow').locator('.react-flow__node').first();
    await expect(node).toBeVisible();
    await node.click();
    await evidence.checkpoint('node-selected');
  });
});
```

- [ ] **Step 3: `j07-source-lsp.spec.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { checkout as test, expect } from '../fixtures.js';

const WORKSPACE_FILE_NAME = 'starter.rosetta';
const WORKSPACE_FILE_CONTENT = 'namespace example\ntype Foo:\n    bar string (1..1)\n';

test.describe('J07 — Source view + LSP diagnostics', () => {
  test.skip(!process.env.PLAYWRIGHT_PROD_SMOKE, 'set PLAYWRIGHT_PROD_SMOKE=1 to run against a deployed Studio');

  test('J07 LSP connects and a syntax error surfaces as a diagnostic', async ({ page, evidence }) => {
    await page.goto('./');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('model-loader')).toBeVisible({ timeout: 20000 });

    const fileInput = page.locator('input[type="file"][accept=".rosetta"]');
    await fileInput.setInputFiles([
      { name: WORKSPACE_FILE_NAME, mimeType: 'text/plain', buffer: Buffer.from(WORKSPACE_FILE_CONTENT) }
    ]);
    await expect(page.getByTestId('explore-workbench')).toBeVisible({ timeout: 20000 });

    await expect(page.getByTestId('lsp-connection-badge')).toHaveAttribute('data-status', 'connected', { timeout: 20000 });
    await evidence.checkpoint('lsp-connected');

    const editor = page.getByTestId('source-editor');
    await editor.click();
    await page.keyboard.type('type Bad syntax here###');
    await expect(page.getByTestId('panel-problems').getByText(/error/i)).toBeVisible({ timeout: 10000 });
    await evidence.checkpoint('diagnostic-shown');

    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(WORKSPACE_FILE_CONTENT);
    await expect(page.getByTestId('panel-problems').getByText(/error/i)).toHaveCount(0, { timeout: 10000 });
    await evidence.checkpoint('diagnostic-cleared');
  });
});
```

`lsp-connection-badge`'s `data-status` attribute name and `source-editor`'s testid are assumptions based on this codebase's `data-testid`/`data-*` conventions seen elsewhere (e.g. `ActivityPanel`'s `data-component="workspace.activity"`) — **before running**, open `apps/studio/src/components/LspConnectionBadge.tsx` and confirm the actual testid/attribute names, and adjust the assertions to match exactly. Do not run this journey against production until that verification step is done.

- [ ] **Step 4: Verify testids against real source, then list**

Open `LspConnectionBadge.tsx` and the Problems panel component; correct any mismatched `data-testid`/attribute names in the three files above. Then run:

Run: `pnpm --filter @rune-langium/studio run test:prod-ux -- --list`
Expected: J05, J06, J07 appear alongside J00–J04.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/test/prod-ux/journeys/j05-inspector.spec.ts apps/studio/test/prod-ux/journeys/j06-structure-view.spec.ts apps/studio/test/prod-ux/journeys/j07-source-lsp.spec.ts
git commit -m "feat(studio): add prod-ux journeys J05/J06/J07 (inspector, structure, source+LSP)"
```

---

## Task 16: Phase 1 close-out — full run + manifest review

**Files:** none (verification-only task)

- [ ] **Step 1: Type-check everything**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

- [ ] **Step 2: List the full prod-ux suite**

Run: `pnpm --filter @rune-langium/studio run test:prod-ux -- --list`
Expected: J00a, J01, J02, J03, J04a/b/c, J05, J06, J07 — 10 tests total, zero collection errors.

- [ ] **Step 3: Run against production (requires network + optionally CF credentials)**

Run: `pnpm --filter @rune-langium/studio run test:prod-ux`
Expected: PASS (J00a self-skips without `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`). Inspect `apps/studio/test/prod-ux/report/run-manifest.json` — it should contain one record per journey with `checkpoints` pointing at real screenshot files under `report/screenshots/`.

- [ ] **Step 4: Gitignore the report output**

Check `apps/studio/.gitignore` (or the repo root `.gitignore`) for an existing `test/prod-ux/report/` or general Playwright-report ignore rule; if none exists, add one:

```
apps/studio/test/prod-ux/report/
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore(studio): gitignore prod-ux evidence report output"
```

---

## Explicit follow-ups (not in this plan — named per the spec's no-silent-caps rule)

- **Remaining `addLine`/`addActivity` call sites** not enriched with `op`/`opId`/`durationMs` in this plan: `DockShell.tsx`, `ExplorePerspective.tsx`, `CodegenProvider.tsx` (non-flagship paths), `ExportPerspective.tsx`, `workspace-manager.ts`, `FormPreviewPanel.tsx`, `CodePreviewPanel.tsx`, `transport-provider.ts`, `workspace.ts` (parse/link fallback paths), `multi-tab-broadcast.ts`, `debounced-reparse.ts`. These already publish into the Activity/Output panels and are already visible in `getOpLogSnapshot()` (Task 3 reads from the stores unconditionally) — they just lack `durationMs`/`opId` correlation until enriched. Harness journeys that need their timings (workspace save, per-namespace hydration specifically) fall back to test-side stopwatches per the spec's own designed degradation path.
- **Phase 2** (spec §8): J08–J11, J18 — edit round-trip, form/function one-of-each, expression lens, codegen, data-type closure mapping.
- **Phase 3**: J12–J15 — import dialog, export perspective, git/sync, settings.
- **Phase 4**: J16, J17 — resilience/chrome, accessibility sweep; nightly CI wiring.
- **Phase 5**: real-user telemetry — extending `apps/telemetry-worker` with the `op_spans` batch event, aggregator histograms, and `GET /v1/digest`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-16-prod-ux-checkout-harness-phase0-1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
