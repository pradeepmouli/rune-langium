# Prod UX Checkout Harness — Phase 5 (real-user telemetry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out `docs/superpowers/specs/2026-07-16-prod-ux-checkout-harness.md` §8's Phase 5 ("real-user telemetry, §7"): activate the deployed-but-inert telemetry pipeline so real production sessions feed the same review vocabulary the harness already established — a real per-user opt-in, client-side error/vitals capture riding the existing opLog publish points, a new `op_spans` batch ingest event, duration/signature aggregation in the telemetry Worker, a `/v1/digest` fleet rollup endpoint, a `telemetry:digest` script, a telemetry mode for the `prod-ux-review` skill, and a nightly combined review that reads both the harness manifest and the fleet digest together.

**Architecture:** Nothing here is a green-field build — every piece either extends already-shipped machinery (the opLog service from Phase 0, the `apps/telemetry-worker` ingest/aggregator/stats surface, already-declared-but-disconnected scaffolding) or fills a gap the research for this plan found empty. Three concrete, verified facts shape every task below:

1. **The telemetry client is genuinely dead code today.** `createTelemetryClient` (`apps/studio/src/services/telemetry.ts:75-108`) has zero callers anywhere in `apps/studio/src` — confirmed via the caller graph, not "low usage." `config.telemetryEnabled` (`apps/studio/src/config.ts:87`) is a **build-time** `VITE_ENABLE_TELEMETRY` deployment kill-switch, not a per-user runtime opt-in.
2. **Three pieces of telemetry scaffolding already exist but are wired to nothing:** `StatusBar.tsx` (`apps/studio/src/shell/StatusBar.tsx`) has a working `telemetryEnabled`/`onToggleTelemetry` toggle UI, but `<StatusBar>` itself is never rendered anywhere in the app (unmounted dead code, same class as the previously-found `ExportMenu` dead code — **out of scope to fix here**, noted and left alone). `model-store.ts`'s `ModelStoreDeps.telemetry: Pick<TelemetryClient, 'emit'>` (`apps/studio/src/store/model-store.ts:84`) is a dependency-injection slot nothing ever populates with a real client (`setModelStoreDeps` is never called with a `telemetry` override in `App.tsx`). `persistence.ts`'s `SettingKey` union (`apps/studio/src/workspace/persistence.ts:104`) **already includes `'telemetry-enabled'`** as a literal, but no call site anywhere reads or writes that key via `saveSetting`/`loadSetting`. Task 1 below wires exactly this last slot — it is the correct, already-typed persistence point for the new opt-in, not a new mechanism.
3. **`GET /v1/stats` does not generalize to a fleet digest.** It requires the caller to already know one `(eventName, date)` pair (`apps/telemetry-worker/src/index.ts:362-388`) and proxies straight to one Durable Object instance's `stats()`. Per the user's confirmed decision, `/v1/digest` performs **server-side fan-out**: it enumerates the known event-name vocabulary × the requested day range and reads each `(event, day)` DO instance itself, merging results — no DO keying redesign.

The 9 real event literals already accepted by the Worker's `TelemetryEventBody` (`apps/telemetry-worker/src/index.ts:51-105`) stay as they are — spec text calling this "8 bespoke events" undercounts by one (`lsp_session_opened`/`lsp_session_failed` are two of the 9, and the client-side schema in `telemetry.ts` only mirrors 4 of the 9 today). This plan does not touch those 9 or their client mirror; it adds a **10th, separate** discriminated-union member, `op_spans`, which is the new batch event the opLog-sourced capture in Tasks 2-3 emits through.

**Tech Stack:** TypeScript 5.9 strict/ESM, React 19, Zustand 5 (existing `output-store`/`activity-store`, no new store), Zod v4, Cloudflare Workers + Durable Objects (`apps/telemetry-worker`), Vitest 3 (existing `FakeStorage`/`DONamespaceFake` test doubles in `apps/telemetry-worker/test/ingest.test.ts`), the native `PerformanceObserver` browser API (no new dependency — neither `apps/studio` nor `apps/telemetry-worker` has any vitals library today, and none is needed).

## Global Constraints

- FSL-1.1-ALv2 SPDX header (`// SPDX-License-Identifier: FSL-1.1-ALv2` + `// Copyright (c) 2026 Pradeep Mouli`) on every new/modified file under `apps/studio/`. `apps/telemetry-worker/` is MIT (confirm via that package's own `package.json` `license` field before assuming FSL — if it says MIT, use `// SPDX-License-Identifier: MIT` there instead).
- No parallel implementations (repo rule, DRY #1): capture reuses `useOutputStore.getState().addLine`/`useActivityStore.getState().addActivity` — the existing publish points `op-log.ts` already reads — never a third logging channel. The opt-in reuses the already-declared `SettingKey = 'telemetry-enabled'` slot, never a new IndexedDB key or `localStorage` key.
- **Privacy invariants** (from `telemetry.ts`'s own header, unchanged by this plan): disabled on localhost; disabled when the user has opted out; the ingest schema is a closed `.strict()` discriminated union — anything that doesn't fit is rejected before any fetch; **never model source content** — curated type fqns are fine, scratch-workspace text is not; fetch failures are swallowed, telemetry must never block the user.
- The telemetry Worker's schema is evolved **in place** — no v2, no compat shims, no migration-before-live (repo rule, confirmed still true: the 9 existing events have zero real production callers today per the dead-code finding above, so there is nothing live to migrate).
- `pnpm --filter @rune-langium/studio run type-check` and `pnpm --filter @rune-langium/telemetry-worker run type-check` after every task touching either package; run each package's own `vitest` suite after every task.
- Errors ship at 100%, warns sampled, info heavily sampled (spec §7) — the exact sampling rates are this plan's own design choice (Task 2), not spec-mandated numbers; pick conservative defaults and say so in the task.
- CF Access enforces the admin allowlist for `/v1/stats` and (new) `/v1/digest` at the **route level**, external to this codebase (`apps/telemetry-worker/src/index.ts:355-357`'s own comment) — no code-level auth to add for either endpoint.

---

### Task 1: Runtime telemetry opt-in — persisted setting + Settings UI

**Files:**
- Create: `apps/studio/src/store/telemetry-settings.ts`
- Create: `apps/studio/test/store/telemetry-settings.test.ts`
- Modify: `apps/studio/src/shell/perspectives/screens/SettingsPerspective.tsx`
- Modify: `apps/studio/test/e2e/settings.spec.ts` (or wherever J15's existing settings coverage lives — confirm the exact file via `apps/studio/test/prod-ux/journeys/j15-settings.spec.ts`'s own imports first; this task adds unit coverage in `telemetry-settings.test.ts` and leaves J15's prod-ux journey to Task 8's close-out to extend, not this task)

**Interfaces:**
- Consumes: `saveSetting`/`loadSetting` from `apps/studio/src/workspace/persistence.ts` (existing, unchanged — `SettingKey` already includes `'telemetry-enabled'`).
- Produces: `useTelemetrySettingsStore` (Zustand) exposing `{ enabled: boolean; hydrated: boolean; setEnabled(next: boolean): void }`, and a `hydrateTelemetrySettings(): Promise<void>` function that Task 3 and Task 2's capture module both import to read the current opt-in state synchronously (`useTelemetrySettingsStore.getState().enabled`) without each re-reading IndexedDB themselves.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/store/telemetry-settings.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach } from 'vitest';

const saveSetting = vi.fn(async () => {});
const loadSetting = vi.fn(async () => undefined);

vi.mock('../../src/workspace/persistence.js', () => ({ saveSetting, loadSetting }));

import { useTelemetrySettingsStore, hydrateTelemetrySettings } from '../../src/store/telemetry-settings.js';

describe('telemetry settings store', () => {
  beforeEach(() => {
    saveSetting.mockClear();
    loadSetting.mockClear();
    loadSetting.mockResolvedValue(undefined);
    useTelemetrySettingsStore.setState({ enabled: false, hydrated: false });
  });

  it('defaults to disabled (opt-in, not opt-out) before hydration', () => {
    expect(useTelemetrySettingsStore.getState().enabled).toBe(false);
    expect(useTelemetrySettingsStore.getState().hydrated).toBe(false);
  });

  it('hydrateTelemetrySettings reads the persisted value and marks hydrated', async () => {
    loadSetting.mockResolvedValueOnce(true);
    await hydrateTelemetrySettings();
    expect(loadSetting).toHaveBeenCalledWith('telemetry-enabled');
    expect(useTelemetrySettingsStore.getState().enabled).toBe(true);
    expect(useTelemetrySettingsStore.getState().hydrated).toBe(true);
  });

  it('hydrateTelemetrySettings defaults to false when nothing is persisted yet', async () => {
    loadSetting.mockResolvedValueOnce(undefined);
    await hydrateTelemetrySettings();
    expect(useTelemetrySettingsStore.getState().enabled).toBe(false);
    expect(useTelemetrySettingsStore.getState().hydrated).toBe(true);
  });

  it('setEnabled persists the new value and updates state synchronously', () => {
    useTelemetrySettingsStore.getState().setEnabled(true);
    expect(useTelemetrySettingsStore.getState().enabled).toBe(true);
    expect(saveSetting).toHaveBeenCalledWith('telemetry-enabled', true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/telemetry-settings.test.ts`
Expected: FAIL — `Cannot find module '../../src/store/telemetry-settings.js'`.

- [ ] **Step 3: Write `telemetry-settings.ts`**

Create `apps/studio/src/store/telemetry-settings.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { create } from 'zustand';
import { saveSetting, loadSetting } from '../workspace/persistence.js';

interface TelemetrySettingsState {
  /** Per-user runtime opt-in. Defaults to false (opt-IN, not opt-out) until hydrated from IndexedDB. */
  enabled: boolean;
  /** True once hydrateTelemetrySettings() has resolved — consumers should not ship telemetry before this. */
  hydrated: boolean;
  setEnabled(next: boolean): void;
}

export const useTelemetrySettingsStore = create<TelemetrySettingsState>((set) => ({
  enabled: false,
  hydrated: false,
  setEnabled(next: boolean): void {
    set({ enabled: next });
    void saveSetting('telemetry-enabled', next);
  }
}));

/** Reads the persisted opt-in once at startup. Call from App.tsx's init sequence, same as other one-shot hydration reads. */
export async function hydrateTelemetrySettings(): Promise<void> {
  const stored = await loadSetting<boolean>('telemetry-enabled');
  useTelemetrySettingsStore.setState({ enabled: stored ?? false, hydrated: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/telemetry-settings.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the Settings UI section**

Read `apps/studio/src/shell/perspectives/screens/SettingsPerspective.tsx` in full first (reproduced above in this plan's research — 61 lines, two `<section>`s: Appearance, Project configuration). Add a third section between them:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';
import { FontScaleButton } from '../../../components/FontScaleButton.js';
import { useTelemetrySettingsStore } from '../../../store/telemetry-settings.js';

/**
 * SettingsPerspective — per-machine studio settings scaffold.
 *
 * Sections:
 *  1. Appearance — font scale (FontScaleButton, self-contained). Theme is
 *     currently fixed at dark; no toggle is available.
 *  2. Privacy — anonymous diagnostics opt-in (telemetry).
 *  3. Project configuration — forward-looking placeholder describing the
 *     .runestudio/config.json feature (git-backed shared project config).
 *     Nothing here is persisted or functional yet.
 */
export function SettingsPerspective(): React.ReactElement {
  const telemetryEnabled = useTelemetrySettingsStore((s) => s.enabled);
  const setTelemetryEnabled = useTelemetrySettingsStore((s) => s.setEnabled);

  return (
    <section data-testid="settings-perspective" className="h-full overflow-auto p-6 space-y-8">
      {/* ── Appearance ──────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Appearance</h2>

        <div className="flex items-center gap-3">
          <span className="text-sm">Pane font size</span>
          <FontScaleButton />
        </div>

        <p className="text-xs text-muted-foreground">
          Theme is currently fixed (dark). A theme toggle will be added in a future release.
        </p>
      </section>

      {/* ── Privacy ─────────────────────────────────────────────────────── */}
      <section data-testid="settings-privacy-section" className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Privacy</h2>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            data-testid="settings-telemetry-toggle"
            checked={telemetryEnabled}
            onChange={(e) => setTelemetryEnabled(e.target.checked)}
          />
          Send anonymous diagnostics
        </label>

        <p className="text-xs text-muted-foreground">
          Shares anonymised error/warning signatures and operation timings to help us find and fix issues.
          Never includes your model's source content — only curated type names, never scratch workspace text.
          Off by default; disabled entirely on localhost regardless of this setting.
        </p>
      </section>

      {/* ── Project configuration ────────────────────────────────────────── */}
      <section data-testid="settings-project-section" className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Project configuration</h2>

        <p className="text-xs text-muted-foreground">
          The following settings will be configurable per-project via{' '}
          <code className="font-mono">.runestudio/config.json</code> once git-backed shared project config ships. They
          are <strong>not editable yet</strong>.
        </p>

        <ul className="space-y-1 text-xs text-muted-foreground opacity-50 list-disc list-inside">
          <li>
            <span className="font-medium">Project</span> — name, description
          </li>
          <li>
            <span className="font-medium">Curated models</span> — model ID + version list
          </li>
          <li>
            <span className="font-medium">Sync</span> — auto-sync enabled, debounce interval (ms), branch
          </li>
          <li>
            <span className="font-medium">Codegen</span> — target, layout, namespaces, options
          </li>
        </ul>
      </section>
    </section>
  );
}
```

- [ ] **Step 6: Wire `hydrateTelemetrySettings()` into startup**

Find `apps/studio/src/App.tsx`'s init sequence (search for another one-shot hydration call, e.g. wherever workspace/layout state is hydrated on mount — read that section first to match the exact pattern) and add `void hydrateTelemetrySettings();` alongside it, importing from `./store/telemetry-settings.js`. Do not block first paint on this — it's fire-and-forget, matching how `setModelStoreDeps`-style init calls already behave in this codebase (none of them are awaited in render).

- [ ] **Step 7: Type-check and run the studio test suite**

```bash
pnpm --filter @rune-langium/studio run type-check
pnpm --filter @rune-langium/studio exec vitest run test/store/telemetry-settings.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src/store/telemetry-settings.ts apps/studio/test/store/telemetry-settings.test.ts apps/studio/src/shell/perspectives/screens/SettingsPerspective.tsx apps/studio/src/App.tsx
git commit -m "feat(telemetry): runtime opt-in setting + Settings UI toggle (spec Phase 5)"
```

---

### Task 2: Client capture — errors, warnings, and vitals as opLog entries

**Files:**
- Create: `apps/studio/src/services/telemetry-capture.ts`
- Create: `apps/studio/test/services/telemetry-capture.test.ts`
- Modify: `apps/studio/src/App.tsx` (install the capture once at startup, gated on the opt-in)

**Interfaces:**
- Consumes: `useOutputStore.getState().addLine` (`apps/studio/src/store/output-store.ts:39`, existing, unchanged signature `addLine(text, severity?, meta?)`), `useTelemetrySettingsStore` from Task 1.
- Produces: `installTelemetryCapture(): () => void` — installs `window.onerror`/`window.onunhandledrejection` handlers and a `PerformanceObserver` for `longtask` entries, each publishing through `addLine` with structured `op`/`durationMs` metadata (the exact mechanism `op-log.ts` already reads — no new logging channel). Returns a teardown function (for tests and for a future opt-out-at-runtime path). Task 3's shipper consumes these exactly like any other `op-log.ts` entry — it does not need to know this module exists.

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/services/telemetry-capture.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { installTelemetryCapture } from '../../src/services/telemetry-capture.js';

describe('installTelemetryCapture', () => {
  let uninstall: () => void;

  beforeEach(() => {
    useOutputStore.setState({ lines: [] });
  });

  afterEach(() => {
    uninstall?.();
  });

  it('publishes a window error as an error-level opLog entry', () => {
    uninstall = installTelemetryCapture();
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'boom', filename: 'app.js', lineno: 1, colno: 1, error: new Error('boom') })
    );
    const lines = useOutputStore.getState().lines;
    const entry = lines.find((l) => l.op === 'clientError');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('error');
  });

  it('publishes an unhandled rejection as an error-level opLog entry', () => {
    uninstall = installTelemetryCapture();
    const event = new Event('unhandledrejection') as PromiseRejectionEvent & { reason: unknown };
    Object.defineProperty(event, 'reason', { value: new Error('rejected') });
    window.dispatchEvent(event);
    const lines = useOutputStore.getState().lines;
    const entry = lines.find((l) => l.op === 'clientUnhandledRejection');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('error');
  });

  it('teardown stops publishing further errors', () => {
    uninstall = installTelemetryCapture();
    uninstall();
    const before = useOutputStore.getState().lines.length;
    window.dispatchEvent(new ErrorEvent('error', { message: 'after teardown' }));
    expect(useOutputStore.getState().lines.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/telemetry-capture.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `telemetry-capture.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, fmtLine } from '../store/output-store.js';

/**
 * Installs window.onerror / unhandledrejection / long-task capture, publishing
 * through the SAME addLine publish point op-log.ts already reads — this is
 * not a new logging channel, it's a producer into the existing one. Task 3's
 * shipper (subscribing to useOutputStore) picks these up automatically.
 *
 * Grouping "signature" (top stack frame + op context) lets the Worker-side
 * aggregation (Task 4) count distinct error shapes rather than raw messages,
 * which can carry high-cardinality noise (line numbers, dynamic ids).
 */
export function installTelemetryCapture(): () => void {
  const addLine = useOutputStore.getState().addLine;

  const onError = (event: ErrorEvent): void => {
    const signature = signatureFor(event.error, event.message);
    addLine(fmtLine('clientError', event.message || 'window error'), 'error', {
      op: 'clientError',
      subject: signature
    });
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const signature = signatureFor(reason instanceof Error ? reason : undefined, message);
    addLine(fmtLine('clientUnhandledRejection', message), 'error', {
      op: 'clientUnhandledRejection',
      subject: signature
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        addLine(fmtLine('longTask', `${Math.round(entry.duration)}ms`), 'warn', {
          op: 'longTask',
          durationMs: Math.round(entry.duration)
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: false });
  } catch {
    // longtask entry type unsupported in this browser — capture degrades
    // gracefully to error/rejection-only, matching telemetry's "never
    // block the user" invariant.
  }

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    observer?.disconnect();
  };
}

function signatureFor(error: Error | undefined, message: string): string {
  const topFrame = error?.stack?.split('\n')[1]?.trim();
  return topFrame ? `${message.slice(0, 80)} @ ${topFrame.slice(0, 120)}` : message.slice(0, 80);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/telemetry-capture.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire installation into `App.tsx`, gated on the opt-in**

Read `apps/studio/src/App.tsx`'s init sequence (same location Task 1 Step 6 touched) and add, alongside `hydrateTelemetrySettings()`:

```ts
void hydrateTelemetrySettings().then(() => {
  if (useTelemetrySettingsStore.getState().enabled) installTelemetryCapture();
});
```

This installs capture only after hydration confirms the user has actually opted in — never install-then-gate-at-emit-time, since `window.onerror`/`PerformanceObserver` registration itself is cheap and unconditional installation would mean capturing (locally, into `output-store`) even when the user opted out, which is fine for the LOCAL Output panel (existing behavior for every other op) but this plan's shipper (Task 3) must additionally re-check the live opt-in state before every network send — belt-and-suspenders, not either-or.

- [ ] **Step 6: Type-check and test**

```bash
pnpm --filter @rune-langium/studio run type-check
pnpm --filter @rune-langium/studio exec vitest run test/services/telemetry-capture.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/services/telemetry-capture.ts apps/studio/test/services/telemetry-capture.test.ts apps/studio/src/App.tsx
git commit -m "feat(telemetry): client error/rejection/long-task capture via opLog (spec §7)"
```

---

### Task 3: `op_spans` batch event — client shipper + both-side schema

**Files:**
- Create: `apps/studio/src/services/telemetry-shipper.ts`
- Create: `apps/studio/test/services/telemetry-shipper.test.ts`
- Modify: `apps/studio/src/services/telemetry.ts` (add `op_spans` to `TelemetryEventSchema`)
- Modify: `apps/telemetry-worker/src/index.ts` (add `op_spans` to `TelemetryEventBody`)
- Modify: `apps/telemetry-worker/test/ingest.test.ts` (cover the new event)

**Interfaces:**
- Consumes: `useOutputStore`/`useActivityStore` (subscribe, existing zustand `.subscribe()` API — no changes to either store), `useTelemetrySettingsStore` (Task 1), `createTelemetryClient`/`resolveTelemetryEndpoint` (`apps/studio/src/services/telemetry.ts`, existing, currently uncalled — this task is its first real caller).
- Produces: `installTelemetryShipper(): () => void` — subscribes to both stores, buffers new entries since the last flush, samples by level (errors 100%, warns 1-in-5, info 1-in-50 — this plan's own conservative defaults, tunable later), and periodically (every 15s, or immediately on buffer reaching 20 entries) ships one `op_spans` batch via `TelemetryClient.emit`.

- [ ] **Step 1: Extend the client schema first (`telemetry.ts`)**

Read `apps/studio/src/services/telemetry.ts:18-49` (`TelemetryEventSchema`, reproduced in full in this plan's research above) and add a 5th union member:

```ts
  z
    .object({
      event: z.literal('op_spans'),
      spans: z
        .array(
          z.object({
            op: z.string().max(64),
            subject: z.string().max(200).optional(),
            durationMs: z.number().int().nonnegative().max(600_000).optional(),
            level: z.enum(['info', 'warn', 'error']),
            signature: z.string().max(200).optional(),
            opId: z.number().int().optional()
          })
        )
        .min(1)
        .max(50)
    })
    .strict()
```

Insert this as the 5th element of the `TelemetryEventSchema` array (after the existing `workspace_open/restore` enum member, before the closing `]);`).

- [ ] **Step 2: Extend the Worker schema (`index.ts`)**

Read `apps/telemetry-worker/src/index.ts:51-105` (`TelemetryEventBody`, reproduced in full above) and add the matching member (mirrors the client shape exactly plus the existing `studio_version`/`ua_class` fields every other event carries):

```ts
  z
    .object({
      event: z.literal('op_spans'),
      spans: z
        .array(
          z.object({
            op: z.string().max(64),
            subject: z.string().max(200).optional(),
            durationMs: z.number().int().nonnegative().max(600_000).optional(),
            level: z.enum(['info', 'warn', 'error']),
            signature: z.string().max(200).optional(),
            opId: z.number().int().optional()
          })
        )
        .min(1)
        .max(50),
      studio_version: StudioVersion,
      ua_class: UaClass
    })
    .strict()
```

Insert as the 7th (last) element of `TelemetryEventBody`'s array.

- [ ] **Step 3: Write the failing shipper test**

Create `apps/studio/test/services/telemetry-shipper.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOutputStore } from '../../src/store/output-store.js';
import { useTelemetrySettingsStore } from '../../src/store/telemetry-settings.js';
import { installTelemetryShipper } from '../../src/services/telemetry-shipper.js';

describe('installTelemetryShipper', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    useOutputStore.setState({ lines: [] });
    useTelemetrySettingsStore.setState({ enabled: true, hydrated: true });
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    vi.useRealTimers();
  });

  it('ships an error entry at 100% sample rate on the next flush tick', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    useOutputStore.getState().addLine('boom', 'error', { op: 'clientError', subject: 'sig' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'op_spans',
        spans: expect.arrayContaining([expect.objectContaining({ op: 'clientError', level: 'error' })])
      })
    );
  });

  it('does not ship anything when telemetry is disabled', async () => {
    useTelemetrySettingsStore.setState({ enabled: false, hydrated: true });
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    useOutputStore.getState().addLine('boom', 'error', { op: 'clientError' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(emit).not.toHaveBeenCalled();
  });

  it('flushes early once the buffer reaches 20 entries without waiting for the timer', async () => {
    const emit = vi.fn(async () => {});
    uninstall = installTelemetryShipper({ emit });
    for (let i = 0; i < 20; i++) {
      useOutputStore.getState().addLine(`err ${i}`, 'error', { op: 'clientError' });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0].spans).toHaveLength(20);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/telemetry-shipper.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Write `telemetry-shipper.ts`**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, type OutputLine } from '../store/output-store.js';
import { useActivityStore, type ActivityEntry } from '../store/activity-store.js';
import { useTelemetrySettingsStore } from '../store/telemetry-settings.js';
import type { TelemetryClient } from './telemetry.js';

const FLUSH_INTERVAL_MS = 15_000;
const MAX_BATCH = 20;
// Conservative defaults (spec §7: "errors ship at 100%, warns sampled, info
// heavily sampled") — not spec-mandated numbers, tunable without a schema
// change since sampling lives entirely client-side.
const SAMPLE_RATE: Record<'info' | 'warn' | 'error', number> = { error: 1, warn: 0.2, info: 0.02 };

interface Span {
  op: string;
  subject?: string;
  durationMs?: number;
  level: 'info' | 'warn' | 'error';
  signature?: string;
  opId?: number;
}

function toSpan(level: 'info' | 'warn' | 'error', op: string, subject?: string, durationMs?: number, opId?: number): Span {
  return { op, subject, durationMs, level, opId };
}

function shouldSample(level: 'info' | 'warn' | 'error'): boolean {
  return Math.random() < SAMPLE_RATE[level];
}

/**
 * Subscribes to the SAME two stores op-log.ts already reads (output-store,
 * activity-store) — this is a second READER of existing publish points, not
 * a new logging mechanism. Buffers sampled entries and ships one `op_spans`
 * batch per flush, gated live on the opt-in (re-checked every flush, not
 * just at install time, per the belt-and-suspenders note in Task 2).
 */
export function installTelemetryShipper(client: Pick<TelemetryClient, 'emit'>): () => void {
  let buffer: Span[] = [];
  let lastOutputLen = useOutputStore.getState().lines.length;
  let lastActivityLen = useActivityStore.getState().entries.length;

  function flush(): void {
    if (buffer.length === 0) return;
    if (!useTelemetrySettingsStore.getState().enabled) {
      buffer = [];
      return;
    }
    const spans = buffer.splice(0, buffer.length);
    void client.emit({ event: 'op_spans', spans });
  }

  function considerFlush(): void {
    if (buffer.length >= MAX_BATCH) flush();
  }

  const unsubOutput = useOutputStore.subscribe((state) => {
    const lines: OutputLine[] = state.lines;
    if (lines.length <= lastOutputLen) {
      lastOutputLen = lines.length;
      return;
    }
    for (const line of lines.slice(lastOutputLen)) {
      if (line.severity !== 'error' && line.severity !== 'warn' && line.severity !== 'info') continue;
      if (!shouldSample(line.severity)) continue;
      buffer.push(toSpan(line.severity, line.op ?? 'output', line.subject, line.durationMs, line.opId));
    }
    lastOutputLen = lines.length;
    considerFlush();
  });

  const unsubActivity = useActivityStore.subscribe((state) => {
    const entries: ActivityEntry[] = state.entries;
    if (entries.length <= lastActivityLen) {
      lastActivityLen = entries.length;
      return;
    }
    for (const entry of entries.slice(lastActivityLen)) {
      const level = entry.ok ? 'info' : 'error';
      if (!shouldSample(level)) continue;
      buffer.push(toSpan(level, entry.tag, entry.subject, entry.durationMs, entry.opId));
    }
    lastActivityLen = entries.length;
    considerFlush();
  });

  const interval = setInterval(flush, FLUSH_INTERVAL_MS);

  return () => {
    unsubOutput();
    unsubActivity();
    clearInterval(interval);
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/services/telemetry-shipper.test.ts`
Expected: PASS (3 tests) — note the first test relies on `error` sampling at rate `1` (always sampled), so it's deterministic despite `Math.random()` elsewhere in the module.

- [ ] **Step 7: Wire installation into `App.tsx`**

Extend the same hydration callback from Task 2 Step 5:

```ts
void hydrateTelemetrySettings().then(() => {
  if (!useTelemetrySettingsStore.getState().enabled) return;
  installTelemetryCapture();
  installTelemetryShipper(
    createTelemetryClient({
      endpoint: resolveTelemetryEndpoint(),
      enabled: true,
      studioVersion: import.meta.env.VITE_APP_VERSION ?? 'unknown',
      uaClass: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
    })
  );
});
```

Confirm `VITE_APP_VERSION` (or whatever this repo's existing "studio_version" source is — check the 9 existing bespoke events' dead call-site comments in `telemetry-event.md` or any `studio_version:` literal already in the codebase for the established convention) before hardcoding `'unknown'` as a fallback; if a real version constant already exists elsewhere (e.g. from `package.json` via a Vite define), use that instead.

- [ ] **Step 8: Extend `apps/telemetry-worker/test/ingest.test.ts` for the new event**

Read `apps/telemetry-worker/test/ingest.test.ts:1-137` first (reproduced in this plan's Task 5 research — `makeReq`, `makeEnv`, the `beforeEach` fixing system time). This task only ADDS test cases, does not restructure. Add:

```ts
describe('op_spans event', () => {
  it('204 on a valid batch of 1-50 spans', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({
        event: 'op_spans',
        spans: [{ op: 'clientError', level: 'error', signature: 'boom @ app.js:1' }],
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    expect(res.status).toBe(204);
  });

  it('400 on an empty spans array (schema .min(1))', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      makeReq({ event: 'op_spans', spans: [], studio_version: '0.1.0', ua_class: 'chromium-desktop' }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('400 on a 51-span batch (schema .max(50))', async () => {
    const { env } = makeEnv();
    const spans = Array.from({ length: 51 }, (_, i) => ({ op: 'clientError', level: 'error' as const, subject: `${i}` }));
    const res = await worker.fetch(
      makeReq({ event: 'op_spans', spans, studio_version: '0.1.0', ua_class: 'chromium-desktop' }),
      env
    );
    expect(res.status).toBe(400);
  });

  it('forwards to the aggregator DO keyed op_spans:<day>, retrievable via /v1/stats', async () => {
    const { env, do: doNs } = makeEnv();
    await worker.fetch(
      makeReq({
        event: 'op_spans',
        spans: [{ op: 'cdmLoad', level: 'info', durationMs: 12_000 }],
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    expect(doNs.instances.has('op_spans:2026-04-25')).toBe(true);
  });
});
```

- [ ] **Step 9: Type-check and test both packages**

```bash
pnpm --filter @rune-langium/studio run type-check
pnpm --filter @rune-langium/studio exec vitest run test/services/telemetry-shipper.test.ts
pnpm --filter @rune-langium/telemetry-worker run type-check
pnpm --filter @rune-langium/telemetry-worker exec vitest run
```

- [ ] **Step 10: Commit**

```bash
git add apps/studio/src/services/telemetry-shipper.ts apps/studio/test/services/telemetry-shipper.test.ts apps/studio/src/services/telemetry.ts apps/studio/src/App.tsx apps/telemetry-worker/src/index.ts apps/telemetry-worker/test/ingest.test.ts
git commit -m "feat(telemetry): op_spans batch event — client shipper + both-side schema (spec §7)"
```

---

### Task 4: Aggregator — duration histograms + signature counts

**Files:**
- Modify: `apps/telemetry-worker/src/counters.ts`
- Create: `apps/telemetry-worker/test/counters.test.ts` (if no dedicated unit test file for `TelemetryAggregator` exists yet — confirm via `apps/telemetry-worker/test/` listing first; `ingest.test.ts` tests it indirectly through the Worker's `fetch`, this task adds a direct unit-test file for the new methods specifically)
- Modify: `apps/telemetry-worker/src/index.ts` (forward `op_spans` durations/signatures to the aggregator, not just the existing `errorCategory` path)

**Interfaces:**
- Consumes: `DurableObjectState` (existing, unchanged).
- Produces: `TelemetryAggregator.incrementSpans(spans: Span[]): Promise<void>` (new method, alongside the existing `increment`), `TelemetryAggregator.stats()` extended to also return `durationBuckets` and `signatureCounts` alongside the existing `count:*` keys — additive, so any existing `/v1/stats` consumer reading only `count:*` keys is unaffected.

- [ ] **Step 1: Write the failing test**

Create `apps/telemetry-worker/test/counters.test.ts` (adapt the existing `FakeStorage`/`DONamespaceFake` pattern from `ingest.test.ts` — read that file's helpers first and reuse them via import if they're exported, or duplicate the minimal subset needed; do not diverge from the established fake shape):

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryAggregator } from '../src/counters.js';

// Minimal in-memory DurableObjectState fake — mirrors ingest.test.ts's
// FakeStorage/blockConcurrencyWhile shape. If ingest.test.ts exports these
// helpers, import them instead of redeclaring — check before writing this.
class FakeStorage {
  private map = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }
  async put(entries: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) this.map.set(k, v);
  }
  async list<T>(opts: { prefix: string }): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const [k, v] of this.map) if (k.startsWith(opts.prefix)) out.set(k, v as T);
    return out;
  }
}

function makeState() {
  const storage = new FakeStorage();
  return { storage, blockConcurrencyWhile: async (fn: () => Promise<void>) => fn() } as never;
}

describe('TelemetryAggregator.incrementSpans', () => {
  let agg: TelemetryAggregator;

  beforeEach(() => {
    agg = new TelemetryAggregator(makeState());
  });

  it('buckets a duration into the correct histogram bucket', async () => {
    await agg.incrementSpans([{ op: 'cdmLoad', level: 'info', durationMs: 12_000 }]);
    const stats = await agg.stats();
    expect(stats.durationBuckets?.cdmLoad).toBeDefined();
  });

  it('counts error/warn signatures keyed by signature string', async () => {
    await agg.incrementSpans([{ op: 'clientError', level: 'error', signature: 'boom @ app.js:1' }]);
    const stats = await agg.stats();
    expect(stats.signatureCounts?.['boom @ app.js:1']).toBe(1);
  });

  it('ignores info-level spans for signature counting (only error/warn get grouped)', async () => {
    await agg.incrementSpans([{ op: 'output', level: 'info', signature: 'noise' }]);
    const stats = await agg.stats();
    expect(stats.signatureCounts?.noise).toBeUndefined();
  });

  it('accumulates counts across multiple calls for the same bucket/signature', async () => {
    await agg.incrementSpans([{ op: 'cdmLoad', level: 'info', durationMs: 5_000 }]);
    await agg.incrementSpans([{ op: 'cdmLoad', level: 'info', durationMs: 6_000 }]);
    const stats = await agg.stats();
    const total = Object.values(stats.durationBuckets?.cdmLoad ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/telemetry-worker exec vitest run test/counters.test.ts`
Expected: FAIL — `incrementSpans is not a function`.

- [ ] **Step 3: Extend `counters.ts`**

Read `apps/telemetry-worker/src/counters.ts` in full first (reproduced above in this plan's research — 120 lines). Add:

```ts
export interface IncomingSpan {
  op: string;
  level: 'info' | 'warn' | 'error';
  durationMs?: number;
  signature?: string;
}

// Fixed-width buckets in ms — raw-sample p50/p95 isn't practical in a DO's
// KV-style storage, so this stores a count per bucket and the read side
// (Task 5's /v1/digest, or a future admin UI) derives percentiles from the
// bucket distribution. Buckets chosen to span from sub-second ops up past
// the largest spec §4 budget (typeClosureWalk's 60000ms).
const DURATION_BUCKETS_MS = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000, Infinity];

function bucketFor(durationMs: number): string {
  const upper = DURATION_BUCKETS_MS.find((b) => durationMs <= b) ?? Infinity;
  return upper === Infinity ? '60000+' : String(upper);
}
```

Add `incrementSpans` as a new method on `TelemetryAggregator`, alongside the existing `increment`:

```ts
  async incrementSpans(spans: IncomingSpan[]): Promise<void> {
    return this.state.blockConcurrencyWhile(async () => {
      const updates: Record<string, number> = {};
      for (const span of spans) {
        if (span.durationMs !== undefined) {
          const key = `duration:${span.op}:${bucketFor(span.durationMs)}`;
          const current = (await this.state.storage.get<number>(key)) ?? 0;
          updates[key] = (updates[key] ?? current) + 1;
        }
        if ((span.level === 'error' || span.level === 'warn') && span.signature) {
          const key = `signature:${span.signature}`;
          const current = (await this.state.storage.get<number>(key)) ?? 0;
          updates[key] = (updates[key] ?? current) + 1;
        }
      }
      if (Object.keys(updates).length > 0) {
        await this.state.storage.put({ ...updates, last_event_ts: Date.now() });
      }
    });
  }
```

Extend `stats()` to also decode the new `duration:*`/`signature:*` prefixes into structured `durationBuckets`/`signatureCounts` objects, alongside the existing flat `count:*` decoding (read the current `stats()` body — lines 85-92 above — and add two more `list({ prefix })` passes, reshaping `duration:<op>:<bucket>` keys into `durationBuckets[op][bucket]` and `signature:<sig>` keys into `signatureCounts[sig]`). Keep the existing `count:*` → flat-key behavior byte-for-byte unchanged — this is additive, not a restructure.

Also route the new POST body shape through the DO's `fetch` handler: `incrementSpans` needs its own route (`POST /inc-spans`, alongside the existing `/inc`) with the same defensive JSON/shape validation pattern the existing `/inc` handler uses (lines 36-54 above) — reject 400 on malformed JSON, non-array body, or a span missing `op`/`level`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/telemetry-worker exec vitest run test/counters.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the Worker's `op_spans` ingest path to call `/inc-spans`**

In `apps/telemetry-worker/src/index.ts`'s `fetch` handler (the POST `/v1/event` branch, lines 292-356 above), the existing code always posts to `/inc` with `{ errorCategory }`. Branch on `event.event === 'op_spans'`: post to `/inc-spans` with `{ spans: event.spans }` instead of the existing `/inc` call for that one event type; every other event keeps posting to `/inc` exactly as today (unchanged).

- [ ] **Step 6: Type-check and test**

```bash
pnpm --filter @rune-langium/telemetry-worker run type-check
pnpm --filter @rune-langium/telemetry-worker exec vitest run
```

- [ ] **Step 7: Commit**

```bash
git add apps/telemetry-worker/src/counters.ts apps/telemetry-worker/test/counters.test.ts apps/telemetry-worker/src/index.ts
git commit -m "feat(telemetry): duration histogram + signature aggregation for op_spans (spec §7)"
```

---

### Task 5: `GET /v1/digest` — server-side fan-out fleet rollup

**Files:**
- Modify: `apps/telemetry-worker/src/index.ts`
- Modify: `apps/telemetry-worker/test/ingest.test.ts`

**Interfaces:**
- Consumes: `TelemetryAggregator.stats()` (extended by Task 4), `env.TELEMETRY.idFromName`/`.get` (existing DO namespace binding, unchanged).
- Produces: `GET /rune-studio/api/telemetry/v1/digest?since=<iso>` — per the user's confirmed design decision, enumerates the known event-name vocabulary × every UTC day from `since` through today, reads each `(event, day)` DO instance's `stats()`, and merges into one response. Consumed by Task 6's `telemetry:digest` script and Task 7's review-skill telemetry mode.

- [ ] **Step 1: Write the failing test**

Read `apps/telemetry-worker/test/ingest.test.ts:1-137` first (reproduced in full in this plan's research above — `makeStorage`, `makeDONamespace`, `makeEnv`, `makeReq`, and the `beforeEach` that fixes system time to `2026-04-25T12:00:00Z` via `vi.setSystemTime`). Note this file has **no existing `/v1/stats` test to mirror** — only the `POST /v1/event` path is covered today — so these are the first GET-route tests in this file; construct requests directly with `new Request(url, { method: 'GET' })` rather than `makeReq` (which is POST-only).

Add this describe block:

```ts
describe('GET /v1/digest', () => {
  it('fans out across all known event names for a single-day range and merges counts', async () => {
    const { env } = makeEnv();
    await worker.fetch(
      makeReq({
        event: 'curated_load_success',
        modelId: 'cdm',
        durationMs: 1234,
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    await worker.fetch(makeReq({ event: 'lsp_session_opened', studio_version: '0.1.0', ua_class: 'chromium-desktop' }), env);

    const res = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/digest?since=2026-04-25', {
        method: 'GET'
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Record<string, Record<string, { count: number }>> };
    expect(body.events.curated_load_success['2026-04-25']).toBeDefined();
    expect(body.events.lsp_session_opened['2026-04-25']).toBeDefined();
  });

  it('spans multiple days when since is more than 1 day in the past', async () => {
    const { env } = makeEnv();
    await worker.fetch(
      makeReq({
        event: 'curated_load_success',
        modelId: 'cdm',
        durationMs: 1000,
        studio_version: '0.1.0',
        ua_class: 'chromium-desktop'
      }),
      env
    );
    const res = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/digest?since=2026-04-23', {
        method: 'GET'
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Record<string, Record<string, unknown>> };
    // 3 days inclusive: 2026-04-23, 04-24, 04-25 (system time fixed to 04-25 in beforeEach)
    expect(Object.keys(body.events.curated_load_success)).toEqual(['2026-04-23', '2026-04-24', '2026-04-25']);
  });

  it('returns an empty-but-valid digest when since is today and no events exist yet', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/digest?since=2026-04-25', {
        method: 'GET'
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Record<string, Record<string, unknown>> };
    expect(body.events.curated_load_success['2026-04-25']).toBeDefined();
  });

  it('400s when since is missing or malformed', async () => {
    const { env } = makeEnv();
    const missing = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/digest', { method: 'GET' }),
      env
    );
    expect(missing.status).toBe(400);
    const malformed = await worker.fetch(
      new Request('https://www.daikonic.dev/rune-studio/api/telemetry/v1/digest?since=not-a-date', { method: 'GET' }),
      env
    );
    expect(malformed.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/telemetry-worker exec vitest run test/ingest.test.ts -t "v1/digest"`
Expected: FAIL — route returns 404 (no `/v1/digest` handler exists yet).

- [ ] **Step 3: Implement the route**

In `apps/telemetry-worker/src/index.ts`, add a `KNOWN_EVENTS` constant near `TelemetryEventBody` (the 9 existing events + `op_spans` — 10 total; derive this list from the discriminated union's literal values rather than hand-typing a second list, to avoid the exact kind of drift Task 1 of Phase 4 found and fixed — e.g. `TelemetryEventBody.options.map((o) => o.shape.event.value)` if Zod's discriminated-union introspection supports it cleanly for this Zod version; if not, a hand-maintained array with a one-line comment pointing back at `TelemetryEventBody` as the source of truth is the fallback, not a silent duplicate):

```ts
const KNOWN_EVENTS = [
  'curated_load_attempt',
  'curated_load_success',
  'curated_load_failure',
  'workspace_open_success',
  'workspace_open_failure',
  'workspace_restore_success',
  'workspace_restore_failure',
  'lsp_session_opened',
  'lsp_session_failed',
  'op_spans'
] as const;
```

Add the route inside the existing `fetch` handler, after the `/v1/stats` branch:

```ts
    // GET /v1/digest — server-side fan-out across every known event name and
    // every UTC day in [since, today]. /v1/stats requires one known
    // (event, day) pair per call; a fleet digest needs all of them merged,
    // which is what this route exists to do (CF Access enforces the admin
    // allowlist at the route, same as /v1/stats — nothing to check here).
    if (url.pathname.endsWith('/v1/digest')) {
      if (req.method !== 'GET') return jsonResponse(405, { error: 'method_not_allowed' });
      const since = url.searchParams.get('since');
      if (!since) return jsonResponse(400, { error: 'missing_since_query' });
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) return jsonResponse(400, { error: 'invalid_since' });

      const days = enumerateUtcDays(sinceDate, new Date(startedAt));
      const perEvent: Record<string, Record<string, unknown>> = {};
      for (const eventName of KNOWN_EVENTS) {
        const perDay: Record<string, unknown> = {};
        for (const day of days) {
          try {
            const id = env.TELEMETRY.idFromName(`${eventName}:${day}`);
            const stub = env.TELEMETRY.get(id);
            const res = await stub.fetch(new Request('https://do/stats'));
            perDay[day] = res.ok ? await res.json() : { error: 'aggregator_failure', status: res.status };
          } catch (err) {
            perDay[day] = { error: 'aggregator_failure', reason: errMessage(err) };
          }
        }
        perEvent[eventName] = perDay;
      }
      return jsonResponse(200, { since, until: utcDay(new Date(startedAt)), events: perEvent });
    }
```

Add the helper near `utcDay`:

```ts
function enumerateUtcDays(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor <= end) {
    days.push(utcDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
```

Note the fan-out cost: `KNOWN_EVENTS.length × days.length` DO reads per request (today: 10 events — a 7-day digest is 70 reads). This is the accepted tradeoff of the user's confirmed "server-side fan-out" decision over a DO-keying redesign; if `since` ranges grow large in practice, capping the route to a maximum lookback (e.g. 30 days, returning 400 beyond that) is a cheap guard worth adding here rather than later — add a `MAX_DIGEST_DAYS = 31` constant and a range check alongside the `since` validation above.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/telemetry-worker exec vitest run test/ingest.test.ts -t "v1/digest"`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and full package test**

```bash
pnpm --filter @rune-langium/telemetry-worker run type-check
pnpm --filter @rune-langium/telemetry-worker exec vitest run
```

- [ ] **Step 6: Commit**

```bash
git add apps/telemetry-worker/src/index.ts apps/telemetry-worker/test/ingest.test.ts
git commit -m "feat(telemetry): GET /v1/digest — server-side fan-out fleet rollup (spec §7)"
```

---

### Task 6: `telemetry:digest` script

**Files:**
- Create: `apps/studio/scripts/telemetry-digest.ts` (or `scripts/` at repo root if that's this repo's convention for cross-cutting operational scripts — check `package.json`'s existing `verify:prod`/`verify:prod:ui` script definitions from `docs/TESTING.md` first to match whichever directory those live in)
- Modify: `apps/studio/package.json` (new `telemetry:digest` script entry)

**Interfaces:**
- Consumes: `GET /v1/digest` (Task 5), the same CF Access authentication mechanism `verify-production.sh`/`verify:prod` already use for admin-gated endpoints (check `scripts/verify-production.sh` for exactly how it authenticates to CF-Access-protected routes today — likely a `CF-Access-Client-Id`/`CF-Access-Client-Secret` header pair from env vars — and reuse that same pattern rather than inventing a new auth mechanism).
- Produces: a script runnable as `pnpm --filter @rune-langium/studio run telemetry:digest [--since=<iso>]`, printing the digest as formatted JSON (or a human-readable summary table) to stdout.

- [ ] **Step 1: Locate the existing CF Access auth pattern**

Read `scripts/verify-production.sh` in full to find exactly how it authenticates admin-gated requests (header names, env var names). This script must reuse the identical mechanism — do not invent a second auth convention for one more admin script.

- [ ] **Step 2: Write the script**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fetches the fleet telemetry digest (GET /v1/digest) and prints it.
 * Requires the same CF Access service-token env vars verify-production.sh
 * uses for admin-gated production endpoints (see that script for the exact
 * header/env-var names this reuses).
 *
 * Usage: pnpm --filter @rune-langium/studio run telemetry:digest [--since=2026-07-01]
 */

const DEFAULT_LOOKBACK_DAYS = 1;

function parseArgs(argv: string[]): { since: string } {
  const sinceArg = argv.find((a) => a.startsWith('--since='));
  if (sinceArg) return { since: sinceArg.slice('--since='.length) };
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - DEFAULT_LOOKBACK_DAYS);
  return { since: d.toISOString().slice(0, 10) };
}

async function main(): Promise<void> {
  const { since } = parseArgs(process.argv.slice(2));
  const base = process.env.TELEMETRY_DIGEST_ENDPOINT ?? 'https://www.daikonic.dev/rune-studio/api/telemetry/v1/digest';
  const url = `${base}?since=${encodeURIComponent(since)}`;

  // Header names/env vars: match verify-production.sh's CF Access pattern
  // exactly — filled in once Step 1's research confirms the real names.
  const headers: Record<string, string> = {};
  if (process.env.CF_ACCESS_CLIENT_ID) headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
  if (process.env.CF_ACCESS_CLIENT_SECRET) headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`telemetry:digest failed: HTTP ${res.status}`);
    process.exitCode = 1;
    return;
  }
  const body = await res.json();
  console.log(JSON.stringify(body, null, 2));
}

void main();
```

Adjust the header names in the implementation to match whatever Step 1's research finds `verify-production.sh` actually uses — the sketch above is a placeholder for that exact contract, not a guess to ship as-is.

- [ ] **Step 3: Add the package script**

In `apps/studio/package.json`'s `scripts`, add (matching the existing `verify:prod`/`verify:prod:ui` naming convention):

```json
"telemetry:digest": "tsx scripts/telemetry-digest.ts"
```

Confirm `tsx` (or whatever runner `verify:prod`'s own script entry uses — check it first) is already a devDependency; if the existing scripts use a different runner (e.g. plain `node` against a pre-compiled `.js`), match that instead of introducing `tsx` as a new dependency.

- [ ] **Step 4: Manual smoke test**

```bash
CF_ACCESS_CLIENT_ID=<...> CF_ACCESS_CLIENT_SECRET=<...> pnpm --filter @rune-langium/studio run telemetry:digest --since=2026-07-18
```

Expected: prints the JSON digest (or a clear auth/network error if credentials aren't available in this environment — either outcome confirms the script runs and constructs the right request, which is what this step verifies).

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @rune-langium/studio run type-check
```

- [ ] **Step 6: Commit**

```bash
git add apps/studio/scripts/telemetry-digest.ts apps/studio/package.json
git commit -m "feat(telemetry): telemetry:digest operator script (spec §7)"
```

---

### Task 7: `prod-ux-review` skill telemetry mode + nightly combined review

**Files:**
- Modify: `.agents/skills/prod-ux-review/SKILL.md`
- Modify (via the `schedule` skill / `RemoteTrigger`, not a repo file): the Phase 4 `prod-ux-nightly-review` routine (id `trig_013PAk63DB9wj457WbV3HqNd`) — extend its prompt to fetch and pass along the fleet digest, not create a second routine.

**Interfaces:**
- Consumes: `GET /v1/digest` (Task 5), `.agents/skills/prod-ux-review/SKILL.md`'s existing review procedure (unchanged — this task ADDS a telemetry-mode section, per that file's own frontmatter description already promising "or when a nightly prod-ux artifact needs auditing," which telemetry digests extend rather than replace).

- [ ] **Step 1: Read the current `SKILL.md` in full**

Read `.agents/skills/prod-ux-review/SKILL.md` (204 lines) end to end before editing — this task adds a new top-level section, it does not restructure the existing harness-manifest review procedure.

- [ ] **Step 2: Add a "Telemetry mode" section**

Insert a new section (after the existing review procedure, before any closing/appendix content — find the natural insertion point by reading the file's actual structure) with content along these lines (adjust exact wording/section numbering to fit the file's real structure once read):

```markdown
## Telemetry mode (real-user digests)

When given a `/v1/digest` response instead of (or alongside) a harness
`run-manifest.json`, apply the same triage this skill already uses for
synthetic journeys — this section maps the harness vocabulary onto the
digest's shape rather than introducing a second review method:

- The digest's `events.op_spans.<day>.signatureCounts` is the real-user
  analogue of a journey's `softFindings` — each signature with a
  first-seen-this-deploy flag or a rising session count is a candidate
  finding, triaged with the SAME regression / corpus-drift / known-issue
  classification used for harness runs.
- The digest's `events.op_spans.<day>.durationBuckets` is the real-user
  analogue of the manifest's `timings[]` — compare bucket distributions
  against the same `TIMING_BUDGETS` table (`apps/studio/test/prod-ux/timings.ts`)
  the harness itself uses, so a budget is defined exactly once across both
  synthetic and real-user review.
- A nightly combined review reads BOTH a harness `run-manifest.json` AND a
  `/v1/digest` response together: the harness says what broke functionally
  in a controlled run; the digest says what real users actually hit and how
  often. A signature present in both is high-confidence; a signature present
  only in the digest (no harness journey exercises that path) is worth a new
  journey, not just a bug report.
```

- [ ] **Step 3: Extend the Phase 4 routine's prompt (not a new routine)**

Use the `schedule` skill (load `RemoteTrigger` if not already loaded) to `action: "get"` the existing routine `trig_013PAk63DB9wj457WbV3HqNd`, read its current prompt (created in Phase 4's Task 3), and `action: "update"` it to ALSO fetch the fleet digest and pass both to the review:

Extend the existing prompt text (append, don't replace, the artifact-download-and-review instructions from Phase 4) with:

```
Additionally, fetch the fleet telemetry digest: run
`pnpm --filter @rune-langium/studio run telemetry:digest` (or call
GET https://www.daikonic.dev/rune-studio/api/telemetry/v1/digest?since=<yesterday's
UTC date> directly with the CF Access service-token headers, if the script
isn't runnable in this context) for the last 24 hours. Pass BOTH the
harness manifest and the digest to the prod-ux-review skill's procedure —
its "Telemetry mode" section describes how to cross-reference them. Only
file a `[prod-ux-nightly]` GitHub issue for a genuine regression per that
combined triage, same rule as before (never for corpus-drift or an
already-known-issue-ledger entry).
```

- [ ] **Step 4: Verify the routine update**

`action: "get"` the same `trigger_id` again and confirm the prompt text was actually updated (the API returns the full routine object — diff its `job_config.ccr.events[0].data.message.content` against what Step 3 intended to set).

- [ ] **Step 5: Commit the SKILL.md change** (the routine update itself has no repo file to commit, matching Phase 4 Task 3's precedent)

```bash
git add .agents/skills/prod-ux-review/SKILL.md
git commit -m "feat(telemetry): prod-ux-review telemetry mode + extend nightly routine for combined review (spec §7)"
```

---

### Task 8: Phase 5 close-out — full verification + manifest/digest cross-check

Mirrors every prior phase's close-out task in this effort.

**Files:**
- Modify: whichever files a genuine finding requires (cannot be predicted in advance).
- Extend: `apps/studio/test/prod-ux/journeys/j15-settings.spec.ts` (add an assertion that the new Settings → Privacy telemetry toggle renders, persists across reload, and defaults to unchecked — matching J15's existing "settings persist across reload" pattern for font scale/layout).

- [ ] **Step 1: Type-check and full test suites for both packages**

```bash
pnpm --filter @rune-langium/studio run type-check
pnpm --filter @rune-langium/studio exec vitest run
pnpm --filter @rune-langium/telemetry-worker run type-check
pnpm --filter @rune-langium/telemetry-worker exec vitest run
```

- [ ] **Step 2: Extend J15 for the new Settings toggle**

Read `apps/studio/test/prod-ux/journeys/j15-settings.spec.ts` first (find its existing font-scale/layout-reset persistence assertions as the pattern to match). Add: open Settings, confirm `settings-telemetry-toggle` is present and unchecked by default, check it, reload, confirm it's still checked (persistence via the real `saveSetting`/`loadSetting` path, not a mock — this is a live prod-ux journey against the real deployed Studio, same discipline as every other journey in this harness).

- [ ] **Step 3: Manually verify the capture → shipper → ingest → aggregate → digest pipeline end to end**

With telemetry opted in locally (toggle it on via the Settings UI in a local dev build), trigger a real client error (e.g. throw in the console), confirm it appears in the Output panel with `op: 'clientError'` (Task 2), confirm the shipper batches and POSTs to a local `wrangler dev` instance of `apps/telemetry-worker` (Task 3), confirm `/v1/stats?event=op_spans&date=<today>` shows the incremented duration/signature keys (Task 4), and confirm `/v1/digest?since=<today>` includes it (Task 5). This is the one piece of this phase with no existing local e2e convention to lean on — do it manually once and record the exact commands/observations in this task's completion notes, the way Phase 4's close-out recorded its live production run.

- [ ] **Step 4: Run the full J0-J18 prod-ux suite once more** (confirm nothing in Tasks 1-3's `App.tsx` changes regressed an existing journey — telemetry capture installing global `window.onerror`/`unhandledrejection` handlers is exactly the kind of change that could interact badly with an existing journey's own error-injection assertions, e.g. J07's syntax-error diagnostic test)

```bash
PLAYWRIGHT_PROD_SMOKE=1 pnpm --filter @rune-langium/studio exec playwright test test/prod-ux/journeys/ --config=playwright.prod.config.ts
```

- [ ] **Step 5: Fix anything found**, following the same standard as every fix earlier in this effort — verify against real current source before concluding it's a genuine bug.

- [ ] **Step 6: Commit any close-out fixes, then dispatch the final whole-branch review** before moving to `finishing-a-development-branch`.
