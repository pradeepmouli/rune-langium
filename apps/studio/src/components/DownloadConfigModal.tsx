// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * DownloadConfigModal — config dialog opened by the targets-table Download
 * button (spec 2026-05-14 §5.1). Collects, before the /api/codegen request
 * fires:
 *   - layout (for layout-aware targets: per-namespace / barrel / single-file)
 *   - target-specific options (Phase 2: SQL dialect, Markdown TOC style, …)
 *   - a namespace subset to emit, with cross-namespace dependency auto-select
 *     cascade (§5.2): selecting a namespace force-includes every namespace it
 *     references transitively, so the emitted graph never has dangling refs.
 *
 * The dep graph (transitive closure per namespace) is computed server-side in
 * /api/parse and passed in via `dependencyGraph`. The cascade math here is a
 * pure set-union over that closure — see `computeNamespaceSelection`.
 *
 * This component is presentational + self-contained: it owns its draft
 * selection state while open and emits the final config via `onGenerate`.
 * Wiring into the real Download handler is the caller's job (§5.3).
 */

import { useEffect, useMemo, useState } from 'react';
import { TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen';
import { Button } from '@rune-langium/design-system/ui/button';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Checkbox } from '@rune-langium/design-system/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@rune-langium/design-system/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@rune-langium/design-system/ui/dialog';
import { Separator } from '@rune-langium/design-system/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@rune-langium/design-system/ui/tooltip';

/** One layout choice rendered as a radio option. */
export interface LayoutChoice {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Per-target content-panel config (§5.1 "per-target content panels").
 * Studio-local UI metadata — the *labels* and *control kinds* are a
 * presentation concern, distinct from the codegen package's option types.
 * Only the implemented targets (zod / typescript / json-schema) carry
 * layouts today; Phase 2 targets extend this map as their emitters land.
 */
interface TargetPanelConfig {
  layouts: LayoutChoice[];
  /** Opinionated download default (§10.1) — overrides the library default. */
  defaultLayout?: string;
}

const PER_NS: LayoutChoice = {
  value: 'per-namespace',
  label: 'Per-namespace',
  hint: 'One file per namespace + barrel'
};
const BARREL: LayoutChoice = { value: 'barrel', label: 'Barrel', hint: 'Barrel + per-namespace files' };
const SINGLE: LayoutChoice = { value: 'single-file', label: 'Single file', hint: 'All types in one file' };

const TARGET_PANELS: Partial<Record<Target, TargetPanelConfig>> = {
  zod: { layouts: [PER_NS, BARREL, SINGLE], defaultLayout: 'barrel' },
  typescript: { layouts: [PER_NS, BARREL, SINGLE], defaultLayout: 'barrel' },
  'json-schema': { layouts: [PER_NS, SINGLE], defaultLayout: 'single-file' }
};

/** Final config emitted on [Generate]. */
export interface DownloadConfig {
  target: Target;
  layout?: string;
  /** The full emitted set: user-selected ∪ transitively-pulled dependencies. */
  namespaces: string[];
}

export interface DownloadConfigModalProps {
  open: boolean;
  target: Target;
  /** All loaded namespaces, in display order. */
  namespaces: readonly string[];
  /**
   * Transitive dep closure per namespace (from /api/parse §5.2). Each value
   * includes the key namespace itself. Namespaces absent from the map are
   * treated as having no dependencies (closure = {self}).
   */
  dependencyGraph: Record<string, readonly string[]>;
  onClose: () => void;
  onGenerate: (config: DownloadConfig) => void;
}

export interface NamespaceSelection {
  /** Full set that will be emitted: selected ∪ pulled. */
  emitted: Set<string>;
  /** Auto-included (transitively pulled, not explicitly selected). */
  pulled: Set<string>;
  /** For each pulled namespace, which selected namespaces pulled it in. */
  pulledBy: Map<string, string[]>;
}

/**
 * Cascade math (§5.2): given the user's explicit selection and the transitive
 * dep closure per namespace, compute the full emitted set, the auto-pulled
 * subset, and the "pulled by" provenance for tooltips.
 *
 * Pure + closure-based: the server already transitively closed each
 * namespace's deps, so this is one union over `dependencyGraph[n]` for each
 * selected `n` — no fixed-point iteration needed here.
 */
export function computeNamespaceSelection(
  selected: ReadonlySet<string>,
  dependencyGraph: Record<string, readonly string[]>
): NamespaceSelection {
  const emitted = new Set<string>();
  const pulledBy = new Map<string, string[]>();

  for (const ns of selected) {
    const closure = dependencyGraph[ns] ?? [ns];
    for (const dep of closure) {
      emitted.add(dep);
      if (dep !== ns && !selected.has(dep)) {
        const sources = pulledBy.get(dep);
        if (sources) sources.push(ns);
        else pulledBy.set(dep, [ns]);
      }
    }
    // A selected namespace always emits itself even if its closure entry
    // was missing from the map.
    emitted.add(ns);
  }

  const pulled = new Set<string>();
  for (const ns of emitted) {
    if (!selected.has(ns)) pulled.add(ns);
  }

  // Sort provenance lists for stable tooltip text.
  for (const sources of pulledBy.values()) sources.sort();

  return { emitted, pulled, pulledBy };
}

export function DownloadConfigModal({
  open,
  target,
  namespaces,
  dependencyGraph,
  onClose,
  onGenerate
}: DownloadConfigModalProps) {
  const descriptor = TARGET_DESCRIPTORS[target];
  const panel = TARGET_PANELS[target];

  // Draft state lives here while the modal is open. Default: all namespaces
  // selected (§5.1 "Default is all loaded namespaces"); default layout is the
  // target's opinionated download default.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(namespaces));
  const [layout, setLayout] = useState<string | undefined>(panel?.defaultLayout);

  // Reset draft state whenever the modal (re)opens or the target changes —
  // a fresh open should not inherit a stale narrowing from a prior session.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(namespaces));
    setLayout(panel?.defaultLayout);
  }, [open, target, namespaces, panel?.defaultLayout]);

  const selection = useMemo(
    () => computeNamespaceSelection(selected, dependencyGraph),
    [selected, dependencyGraph]
  );

  function toggleNamespace(ns: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ns)) next.delete(ns);
      else next.add(ns);
      return next;
    });
  }

  function handleGenerate(): void {
    onGenerate({
      target,
      layout,
      // When there are no namespaces to choose from (dep graph not yet
      // populated / fail-soft empty), emit an empty list = "no filter" so
      // the server emits everything. Otherwise send the closed emit set.
      namespaces: namespaces.length === 0 ? [] : Array.from(selection.emitted).sort()
    });
  }

  const hasLayouts = (panel?.layouts.length ?? 0) > 0;
  const hasNamespaces = namespaces.length > 0;
  // Disable Generate only when there ARE namespaces but the user deselected
  // them all. An empty namespace list is a valid "emit everything" state.
  const generateDisabled = hasNamespaces && selection.emitted.size === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="w-[480px] max-w-[92vw] max-h-[80vh] flex flex-col gap-0 p-0"
        data-testid="download-config-modal"
      >
        <DialogHeader className="px-4 py-3">
          <DialogTitle>Generate {descriptor.label}</DialogTitle>
          <DialogDescription className="sr-only">
            Choose layout and namespace subset, then generate {descriptor.label} output.
          </DialogDescription>
        </DialogHeader>
        <Separator />

        <div className="studio-scroll flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-5">
          {/* Layout — only for layout-aware targets */}
          {hasLayouts && (
            <div className="flex flex-col gap-2" data-testid="download-config-modal__layout">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Layout
              </span>
              <RadioGroup value={layout} onValueChange={setLayout}>
                {panel!.layouts.map((choice) => {
                  const id = `download-layout-${choice.value}`;
                  return (
                    <div key={choice.value} className="flex items-center gap-2 text-sm">
                      <RadioGroupItem
                        id={id}
                        value={choice.value}
                        data-testid={`download-config-modal__layout-${choice.value}`}
                      />
                      <label htmlFor={id} className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{choice.label}</span>
                        {choice.hint && <span className="text-muted-foreground">({choice.hint})</span>}
                      </label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          )}

          {/* Namespaces with auto-select cascade. Hidden when there's
              nothing to narrow (dep graph not populated) — Generate then
              emits everything. */}
          {hasNamespaces && (
          <div className="flex flex-col gap-2" data-testid="download-config-modal__namespaces">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Namespaces ({selection.emitted.size} selected, {namespaces.length} total)
            </span>
            <TooltipProvider>
              <div className="flex flex-col gap-1.5">
                {namespaces.map((ns) => {
                  const isSelected = selected.has(ns);
                  const isPulled = selection.pulled.has(ns);
                  const sources = selection.pulledBy.get(ns);
                  const id = `download-ns-${ns}`;
                  const row = (
                    <div
                      className={
                        'flex items-center gap-2 text-sm ' +
                        (isPulled ? 'text-muted-foreground' : 'text-foreground')
                      }
                      data-testid={`download-config-modal__ns-row-${ns}`}
                      data-state={isSelected ? 'selected' : isPulled ? 'pulled' : 'unselected'}
                    >
                      <Checkbox
                        id={id}
                        // A pulled dependency is read-only: the user can only
                        // remove it by deselecting whatever pulled it in
                        // (§5.2 prevents partial-graph emit).
                        checked={isSelected || isPulled}
                        disabled={isPulled}
                        onCheckedChange={() => toggleNamespace(ns)}
                        data-testid={`download-config-modal__ns-${ns}`}
                      />
                      <label htmlFor={id} className="font-mono">
                        {ns}
                      </label>
                      {isPulled && (
                        <Badge variant="secondary" className="ml-auto text-[10px]">
                          auto
                        </Badge>
                      )}
                    </div>
                  );
                  // Wrap pulled rows in a tooltip explaining provenance.
                  if (isPulled && sources && sources.length > 0) {
                    return (
                      <Tooltip key={ns}>
                        <TooltipTrigger asChild>{row}</TooltipTrigger>
                        <TooltipContent>pulled by {sources.join(', ')}</TooltipContent>
                      </Tooltip>
                    );
                  }
                  return <div key={ns}>{row}</div>;
                })}
              </div>
            </TooltipProvider>
          </div>
          )}
        </div>

        <Separator />
        <div className="flex justify-end gap-2 px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose} data-testid="download-config-modal__cancel">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generateDisabled}
            data-testid="download-config-modal__generate"
          >
            Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
