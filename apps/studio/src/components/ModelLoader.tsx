/**
 * ModelLoader — Load reference models from curated git repositories.
 * Shows a dropdown of curated models, custom URL input, progress bar, and error display.
 */

import { useCallback, useState } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { Input } from '@rune-langium/design-system/ui/input';
import { cn } from '@rune-langium/design-system/utils';
import { getModelRegistry, createCustomModelSource } from '../services/model-registry.js';
import { useModelStore } from '../store/model-store.js';
import type { ModelSource, LoadProgress } from '../types/model-types.js';

function ProgressBar({ progress, sourceId }: { progress: LoadProgress; sourceId: string }) {
  const cancel = useModelStore((s) => s.cancel);
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const phaseLabel =
    progress.phase === 'fetching'
      ? 'Cloning repository...'
      : progress.phase === 'discovering'
        ? 'Discovering .rosetta files...'
        : `Reading files (${progress.current}/${progress.total})...`;

  return (
    <div className="w-full" data-testid="model-load-progress">
      <div className="w-full bg-muted rounded-full h-2 mb-2">
        <div
          className="bg-primary h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={progress.current}
          aria-valuemin={0}
          aria-valuemax={progress.total}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{phaseLabel}</p>
        <Button variant="ghost" size="sm" onClick={() => cancel(sourceId)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LoadedModelBadge({
  model
}: {
  model: { source: ModelSource; files: { path: string }[] };
}) {
  const unload = useModelStore((s) => s.unload);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
      <span className="font-medium">{model.source.name}</span>
      <span className="text-muted-foreground">({model.files.length} files)</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => unload(model.source.id)}
        aria-label={`Unload ${model.source.name}`}
      >
        ×
      </Button>
    </div>
  );
}

export function ModelLoader() {
  const models = useModelStore((s) => s.models);
  const loading = useModelStore((s) => s.loading);
  const errors = useModelStore((s) => s.errors);
  const load = useModelStore((s) => s.load);
  const dismissError = useModelStore((s) => s.dismissError);

  const [customUrl, setCustomUrl] = useState('');
  const [customRef, setCustomRef] = useState('main');
  const [showCustom, setShowCustom] = useState(false);

  const registry = getModelRegistry();

  const handleLoadCurated = useCallback(
    (source: ModelSource) => {
      load(source);
    },
    [load]
  );

  const handleLoadCustom = useCallback(() => {
    if (!customUrl.trim()) return;
    const source = createCustomModelSource(customUrl.trim(), customRef.trim() || 'main');
    load(source);
    setCustomUrl('');
    setCustomRef('main');
    setShowCustom(false);
  }, [customUrl, customRef, load]);

  return (
    <div className="space-y-4" data-testid="model-loader">
      {/* Loaded models */}
      {models.size > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Loaded Models
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from(models.values()).map((m) => (
              <LoadedModelBadge key={m.source.id} model={m} />
            ))}
          </div>
        </div>
      )}

      {/* Loading progress */}
      {Array.from(loading.entries()).map(([id, state]) =>
        state.progress ? (
          <ProgressBar key={id} progress={state.progress} sourceId={id} />
        ) : (
          <p key={id} className="text-sm text-muted-foreground">
            Connecting to {state.source.name}...
          </p>
        )
      )}

      {/* Errors */}
      {Array.from(errors.entries()).map(([id, err]) => (
        <div
          key={id}
          className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm"
        >
          <span className="flex-1">{err.message}</span>
          <Button variant="ghost" size="sm" onClick={() => dismissError(id)}>
            Dismiss
          </Button>
        </div>
      ))}

      {/* Curated model buttons */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Reference Models
        </p>
        <div className="flex flex-wrap gap-2">
          {registry.map((source) => {
            const isLoaded = models.has(source.id);
            const isLoading = loading.has(source.id);
            return (
              <Button
                key={source.id}
                variant={isLoaded ? 'secondary' : 'outline'}
                size="sm"
                disabled={isLoaded || isLoading}
                onClick={() => handleLoadCurated(source)}
              >
                {isLoaded ? `✓ ${source.name}` : source.name}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Custom URL input */}
      <div className="space-y-2">
        {showCustom ? (
          <div className="space-y-2">
            <Input
              placeholder="https://github.com/owner/repo.git"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              data-testid="custom-url-input"
            />
            <div className="flex gap-2">
              <Input
                placeholder="Branch/tag (default: main)"
                value={customRef}
                onChange={(e) => setCustomRef(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleLoadCustom} disabled={!customUrl.trim()}>
                Load
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowCustom(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="link" size="sm" onClick={() => setShowCustom(true)} className="p-0">
            + Load from custom URL
          </Button>
        )}
      </div>
    </div>
  );
}
