# Dockview Pitfalls

## Table of Contents
1. [components prop identity — blank panel flash](#1-components-prop-identity--blank-panel-flash)
2. [onReady closure over stale state](#2-onready-closure-over-stale-state)
3. [Worker / async data in panels via useRef](#3-worker--async-data-in-panels-via-useref)
4. [fromJSON throws on panel ID mismatch](#4-fromjson-throws-on-panel-id-mismatch)
5. [ResizeObserver missing in jsdom](#5-resizeobserver-missing-in-jsdom)
6. [onDidLayoutChange fires during fromJSON](#6-ondidlayoutchange-fires-during-fromjson)

---

## 1. components prop identity — blank panel flash

**Symptom:** Panels flicker blank on any render cycle (keystrokes, state updates).

**Cause:** Dockview compares `components` by reference. A new object/function identity tells dockview a panel's type changed → unmount + remount.

```tsx
// ❌ New function identity every render
<DockviewReact
  components={{ 'p': () => <MyPanel /> }}
  onReady={onReady}
/>
```

**Fix:** Stable reference at module scope or via `useMemo`. If components come from props, `useMemo` both inside the consumer *and* in the parent passing them:

```tsx
// module scope — always stable
const COMPS = { 'p': wrap(MyPanel) };

// or if overrides arrive as props:
const merged = useMemo(
  () => ({ ...COMPS, ...overrides }),
  [overrides]   // overrides must itself be stable
);
```

---

## 2. onReady closure over stale state

**Symptom:** Layout reset or programmatic panel operations use an outdated state snapshot.

**Cause:** `onReady` is called once when dockview mounts. If its deps array includes React state that changes later (e.g. `[layout, version]`), `useCallback` will recreate it — but dockview has already called the old one. The new callback is **never called again**.

```tsx
// ❌ layout state changes → new onReady → never called
const onReady = useCallback((e) => {
  applyLayout(e.api, layout);  // layout is stale after first call
}, [layout]);
```

**Fix:** Capture state into the callback at the moment `onReady` fires; use a ref for values that change:

```tsx
const layoutRef = useRef(layout);
layoutRef.current = layout;

// onReady only needs to capture the ref, which is always current
const onReady = useCallback((e: DockviewReadyEvent) => {
  applyLayout(e.api, layoutRef.current);
  e.api.onDidLayoutChange(() => { /* ... */ });
}, []);  // stable — no state deps
```

---

## 3. Worker / async data in panels via useRef

**Symptom:** A panel that depends on a worker or async resource renders as empty/null permanently.

**Cause:** Dockview registers panels via the `components` map once on mount. If the panel component reads a `useRef` value that is `null` on first render and populated later by a `useEffect`, the panel captures `null` and never re-renders because ref mutation doesn't trigger React reconciliation.

```tsx
// ❌ codegenWorkerRef.current is null on first render
const codegenWorkerRef = useRef<Worker | null>(null);

useEffect(() => {
  codegenWorkerRef.current = new Worker(...);
}, []);

const Panel = useCallback(() => {
  if (!codegenWorkerRef.current) return null;  // stays null
  return <CodePreview worker={codegenWorkerRef.current} />;
}, []);
```

**Fix:** Use `useState`. The state update triggers a re-render, which recomputes the panel component (because the callback is in the `useMemo` deps):

```tsx
// ✅
const [worker, setWorker] = useState<Worker | null>(null);

useEffect(() => {
  const w = new Worker(...);
  setWorker(w);
  return () => { w.terminate(); setWorker(null); };
}, []);

const Panel = useCallback(() => {
  if (!worker) return null;
  return <CodePreview worker={worker} />;
}, [worker]);
```

---

## 4. fromJSON throws on panel ID mismatch

**Symptom:** `api.fromJSON(savedBlob)` throws or silently renders a blank shell after a rename.

**Cause:** The saved blob references component names (e.g. `'workspace.editor'`) that must match the keys in the `components` prop. If you rename a panel ID between app versions, `fromJSON` can't reconstruct those panels.

**Fix:** Always wrap `fromJSON` in try/catch and fall back to `addPanel`:

```tsx
try {
  api.fromJSON(savedBlob);
} catch (err) {
  console.error('[dockview] fromJSON rejected, rebuilding default layout', err);
  buildDefaultLayout(api);
}
```

For long-lived apps, also version your panel IDs and add a migration layer that transforms old IDs to new ones before calling `fromJSON`.

---

## 5. ResizeObserver missing in jsdom

**Symptom:** Tests crash with `ReferenceError: ResizeObserver is not defined`.

**Cause:** Dockview's layout engine depends on browser APIs unavailable in jsdom (also `getBoundingClientRect`).

**Fix:** Mock the module wholesale in your vitest setup:

```ts
// test/setup.ts
vi.mock('dockview-react', () => ({
  DockviewReact: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dockview-root">{children}</div>
  ),
}));
```

Panel components are tested independently; the shell test asserts on the stub container.

---

## 6. onDidLayoutChange fires during fromJSON

**Symptom:** Your persistence handler fires during the initial mount, overwriting a perfectly good saved layout with the intermediate state during `fromJSON` reconstruction.

**Cause:** `onDidLayoutChange` is emitted while dockview processes `fromJSON` (multiple intermediate states). If you persist on every event, you may capture an incomplete snapshot.

**Fix:** Use a flag to suppress persistence during the initial load:

```tsx
const isLoadingRef = useRef(false);

const onReady = useCallback((e: DockviewReadyEvent) => {
  isLoadingRef.current = true;
  try {
    e.api.fromJSON(savedBlob);
  } finally {
    isLoadingRef.current = false;
  }

  e.api.onDidLayoutChange(() => {
    if (isLoadingRef.current) return;
    onSave(e.api.toJSON());
  });
}, []);
```
