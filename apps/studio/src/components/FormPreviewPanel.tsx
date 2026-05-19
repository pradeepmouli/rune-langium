// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useCallback, useEffect, useId, useMemo, useState, type ChangeEvent, type ReactElement } from 'react';
import { z } from 'zod';
import type { FormPreviewSchema, PreviewField, PreviewSourceMapEntry } from '@rune-langium/codegen';
import { Button } from '@rune-langium/design-system/ui/button';
import { Input } from '@rune-langium/design-system/ui/input';
import { FieldSet, FieldLegend } from '@rune-langium/design-system/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rune-langium/design-system/ui/select';
import { Spinner } from '@rune-langium/design-system/ui/spinner';
import { Plus, Minus } from 'lucide-react';
import {
  usePreviewStore,
  type FormPreviewTarget,
  type PreviewSampleState,
  type PreviewStatus
} from '../store/preview-store.js';

export interface FormPreviewPanelProps {
  schema?: FormPreviewSchema;
  status: PreviewStatus;
  target?: FormPreviewTarget;
  getFieldSource?: (fieldPath: string) => PreviewSourceMapEntry | undefined;
  onExecute?: (funcName: string, inputs: Record<string, unknown>) => void;
}

export function FormPreviewPanel({
  schema,
  status,
  target: _target,
  getFieldSource,
  onExecute
}: FormPreviewPanelProps): ReactElement {
  const ensureSample = usePreviewStore((s) => s.ensureSample);
  const updateSample = usePreviewStore((s) => s.updateSample);
  const resetSample = usePreviewStore((s) => s.resetSample);
  const sample = usePreviewStore((s) => (schema ? s.samples.get(schema.targetId) : undefined));
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<'idle' | 'running'>('idle');
  const [executionResult, setExecutionResult] = useState<unknown>(undefined);
  const [executionError, setExecutionError] = useState<string | null>(null);

  const funcName = schema?.kind === 'function' ? schema.title : undefined;
  const storeExecResult = usePreviewStore((s) => (funcName ? s.executionResults.get(funcName) : undefined));

  useEffect(() => {
    if (!storeExecResult) return;
    if (storeExecResult.error) {
      setExecutionError(storeExecResult.error);
    } else {
      setExecutionResult(storeExecResult.output);
    }
    setExecutionState('idle');
  }, [storeExecResult]);

  useEffect(() => {
    setExecutionState('idle');
    setExecutionResult(undefined);
    setExecutionError(null);
  }, [funcName]);

  const defaultValues = useMemo(
    () => (schema ? (buildDefaultValues(schema.fields) as Record<string, unknown>) : {}),
    [schema]
  );
  const lookupFieldSource = useCallback(
    (fieldPath: string) =>
      getFieldSource?.(fieldPath) ?? schema?.sourceMap?.find((entry) => entry.fieldPath === fieldPath),
    [getFieldSource, schema]
  );

  useEffect(() => {
    if (!schema) return;
    ensureSample(schema.targetId, defaultValues);
  }, [defaultValues, ensureSample, schema]);

  const activeSample = useMemo<PreviewSampleState | undefined>(() => {
    if (!schema) return undefined;
    return (
      sample ?? {
        targetId: schema.targetId,
        values: defaultValues,
        serialized: JSON.stringify(defaultValues, null, 2),
        errors: {},
        valid: true,
        validated: false,
        updatedAt: 0
      }
    );
  }, [defaultValues, sample, schema]);

  const showStatusOnly = !schema || status.state === 'unavailable' || schema.schemaVersion !== 1;

  const applyValidation = useCallback(
    (nextValues: Record<string, unknown>, validated: boolean) => {
      if (!schema) return;
      const result = validated
        ? validatePreviewSample(schema, nextValues)
        : { errors: {} as Record<string, string>, valid: true };
      updateSample(schema.targetId, nextValues, result.errors, result.valid, validated);
    },
    [schema, updateSample]
  );

  const handleFieldBlur = useCallback(() => {
    if (!schema || !activeSample) return;
    applyValidation(activeSample.values, true);
  }, [activeSample, applyValidation, schema]);

  const handleFieldChange = useCallback(
    (fieldPath: string, value: unknown, arrayIndices?: number[]) => {
      if (!schema || !activeSample) return;
      const nextValues = setValueAtPath(activeSample.values, pathToSegments(fieldPath, arrayIndices), value) as Record<
        string,
        unknown
      >;
      applyValidation(nextValues, activeSample.validated);
    },
    [activeSample, applyValidation, schema]
  );

  const handleArrayAdd = useCallback(
    (field: PreviewField, arrayIndices?: number[]) => {
      if (!schema || !activeSample) return;
      const segments = pathToSegments(field.path, arrayIndices);
      const current = getValueAtPath(activeSample.values, segments);
      const items = Array.isArray(current) ? [...current] : [];
      if (field.kind !== 'array') {
        return;
      }
      const [child] = field.children ?? [];
      if (!child) {
        return;
      }
      items.push(buildDefaultValue(child));
      const nextValues = setValueAtPath(activeSample.values, segments, items) as Record<string, unknown>;
      applyValidation(nextValues, true);
    },
    [activeSample, applyValidation, schema]
  );

  const handleArrayRemove = useCallback(
    (field: PreviewField, index: number, arrayIndices?: number[]) => {
      if (!schema || !activeSample) return;
      const segments = pathToSegments(field.path, arrayIndices);
      const current = getValueAtPath(activeSample.values, segments);
      const items = Array.isArray(current) ? [...current] : [];
      items.splice(index, 1);
      const nextValues = setValueAtPath(activeSample.values, segments, items) as Record<string, unknown>;
      applyValidation(nextValues, true);
    },
    [activeSample, applyValidation, schema]
  );

  const handleObjectToggle = useCallback(
    (field: PreviewField, present: boolean, arrayIndices?: number[]) => {
      if (!schema || !activeSample) return;
      const segments = pathToSegments(field.path, arrayIndices);
      const nextValues = (
        present
          ? setValueAtPath(activeSample.values, segments, buildDefaultObjectValue(field))
          : removeValueAtPath(activeSample.values, segments)
      ) as Record<string, unknown>;
      applyValidation(nextValues, activeSample.validated);
    },
    [activeSample, applyValidation, schema]
  );

  const handleRun = useCallback(() => {
    if (!funcName || !activeSample || !onExecute) return;
    setExecutionState('running');
    setExecutionResult(undefined);
    setExecutionError(null);
    onExecute(funcName, activeSample.values);
  }, [activeSample, funcName, onExecute]);

  const handleReset = useCallback(() => {
    if (!schema) return;
    resetSample(schema.targetId, defaultValues);
    setCopyFeedback(null);
  }, [defaultValues, resetSample, schema]);

  const handleCopySample = useCallback(async () => {
    if (!activeSample) {
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyFeedback('Clipboard access is unavailable in this browser.');
      return;
    }
    try {
      await navigator.clipboard.writeText(activeSample.serialized);
      setCopyFeedback('Sample data copied.');
    } catch (error) {
      console.error('[FormPreviewPanel] Failed to copy sample data:', error);
      setCopyFeedback('Copy failed. Check clipboard permissions and try again.');
    }
  }, [activeSample]);

  const summaryMessage = schema ? getSummaryMessage(schema, status, activeSample) : undefined;

  if (showStatusOnly) {
    const isWaiting = status.state === 'waiting' && status.targetId;
    return (
      <section
        aria-label="Form preview"
        data-testid="panel-formPreview"
        className="flex h-full flex-col overflow-auto p-3"
      >
        {isWaiting ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-3.5 shrink-0" />
            <span role="status" aria-live="polite">
              {getStatusOnlyMessage(schema, status)}
            </span>
          </div>
        ) : (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {getStatusOnlyMessage(schema, status)}
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      role="region"
      aria-label="Form preview"
      data-testid="panel-formPreview"
      className="flex h-full flex-col overflow-auto"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="truncate text-sm font-semibold">{schema.title}</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" size="xs" onClick={handleCopySample}>
            Copy
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={handleReset}>
            Reset
          </Button>
        </div>
      </header>
      <p
        role={status.state === 'invalid' ? 'alert' : 'status'}
        aria-live="polite"
        className="px-3 pt-2 text-xs text-muted-foreground"
      >
        {summaryMessage}
      </p>
      <form className="preview-panel__body space-y-3 overflow-auto p-3">
        {schema.kind === 'choice' ? (
          <ChoiceFieldGroup
            fields={schema.fields}
            sample={activeSample}
            lookupFieldSource={lookupFieldSource}
            onFieldBlur={handleFieldBlur}
            onFieldChange={handleFieldChange}
            onArrayAdd={handleArrayAdd}
            onArrayRemove={handleArrayRemove}
            onObjectToggle={handleObjectToggle}
          />
        ) : (
          schema.fields.map((field) => (
            <PreviewFieldControl
              key={field.path}
              field={field}
              sample={activeSample}
              lookupFieldSource={lookupFieldSource}
              onFieldBlur={handleFieldBlur}
              onFieldChange={handleFieldChange}
              onArrayAdd={handleArrayAdd}
              onArrayRemove={handleArrayRemove}
              onObjectToggle={handleObjectToggle}
            />
          ))
        )}
        {schema.unsupportedFeatures?.length ? (
          <div role="status" className="text-xs text-muted-foreground">
            Unsupported preview features: {schema.unsupportedFeatures.join(', ')}
          </div>
        ) : null}
        {schema.kind === 'function' ? (
          <div className="preview-panel__function-controls border-t border-border pt-3">
            <Button type="button" variant="ghost" size="xs" disabled={executionState === 'running'} onClick={handleRun}>
              {executionState === 'running' ? 'Executing…' : 'Run'}
            </Button>
            {executionError ? (
              <div className="execution-error mt-2 text-xs">
                <span className="text-xs font-medium text-destructive">Error:</span>{' '}
                <span className="text-xs text-destructive">{executionError}</span>
              </div>
            ) : null}
            {executionResult !== undefined ? (
              <div className="execution-result mt-2">
                <span className="text-[11px] font-medium text-muted-foreground">Output:</span>
                <pre className="preview-panel__sample-output mt-0.5 overflow-auto p-2 text-[11px] leading-5 text-foreground">
                  {JSON.stringify(executionResult, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
        <details className="preview-panel__sample" data-testid="sample-data-view" open>
          <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-foreground">Sample data</summary>
          <div className="space-y-2 border-t border-border p-2">
            <pre
              aria-label="Sample data output"
              className="preview-panel__sample-output max-h-56 overflow-auto p-2 text-[11px] leading-5 text-foreground"
              data-testid="sample-data-output"
            >
              {activeSample?.serialized ?? '{}'}
            </pre>
            <p role="status" aria-live="polite" className="text-[11px] text-muted-foreground">
              {copyFeedback ?? 'Sample data stays in-memory until you explicitly copy it.'}
            </p>
          </div>
        </details>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ChoiceFieldGroup — renders choice schemas as a radio group
// ---------------------------------------------------------------------------

interface ChoiceFieldGroupProps {
  fields: PreviewField[];
  sample?: PreviewSampleState;
  lookupFieldSource: (fieldPath: string) => PreviewSourceMapEntry | undefined;
  onFieldBlur: () => void;
  onFieldChange: (fieldPath: string, value: unknown, arrayIndices?: number[]) => void;
  onArrayAdd: (field: PreviewField, arrayIndices?: number[]) => void;
  onArrayRemove: (field: PreviewField, index: number, arrayIndices?: number[]) => void;
  onObjectToggle: (field: PreviewField, present: boolean, arrayIndices?: number[]) => void;
}

function ChoiceFieldGroup({
  fields,
  sample,
  lookupFieldSource,
  onFieldBlur,
  onFieldChange,
  onArrayAdd,
  onArrayRemove,
  onObjectToggle
}: ChoiceFieldGroupProps): ReactElement {
  const groupId = useId();
  // Determine which option is currently active by checking which field has a
  // value present in the sample.  Default to the first option.
  const activeField =
    fields.find((f) => {
      const v = getValueAtPath(sample?.values ?? {}, pathToSegments(f.path));
      return v !== undefined;
    }) ?? fields[0];

  const handleOptionChange = (field: PreviewField) => {
    // Remove all other options' values, then ensure this one is present.
    for (const other of fields) {
      if (other.path !== field.path) {
        onObjectToggle(other, false);
      }
    }
    if (field.kind === 'object') {
      onObjectToggle(field, true);
    } else {
      onFieldChange(field.path, '');
    }
    onFieldBlur();
  };

  return (
    <FieldSet className="gap-2 p-2">
      <FieldLegend variant="label" className="text-muted-foreground">
        Choose one option
      </FieldLegend>
      <div className="space-y-1">
        {fields.map((field) => {
          const radioId = `${groupId}-${field.path}`;
          const isActive = activeField?.path === field.path;
          return (
            <div key={field.path} className="space-y-1">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="radio"
                  name={groupId}
                  id={radioId}
                  style={{ accentColor: 'var(--primary)' }}
                  checked={isActive}
                  onChange={() => handleOptionChange(field)}
                />
                {field.label}
              </label>
              {isActive &&
              (field.kind === 'object' || field.kind === 'array') &&
              field.children &&
              field.children.length > 0 ? (
                <div className="ml-5 space-y-1.5 border-l border-border pl-3">
                  {field.children.map((child) => (
                    <PreviewFieldControl
                      key={child.path}
                      field={child}
                      sample={sample}
                      lookupFieldSource={lookupFieldSource}
                      onFieldBlur={onFieldBlur}
                      onFieldChange={onFieldChange}
                      onArrayAdd={onArrayAdd}
                      onArrayRemove={onArrayRemove}
                      onObjectToggle={onObjectToggle}
                    />
                  ))}
                </div>
              ) : isActive && field.kind !== 'object' && field.kind !== 'array' ? (
                <div className="ml-5 border-l border-border pl-3">
                  <PreviewFieldControl
                    field={field}
                    sample={sample}
                    lookupFieldSource={lookupFieldSource}
                    onFieldBlur={onFieldBlur}
                    onFieldChange={onFieldChange}
                    onArrayAdd={onArrayAdd}
                    onArrayRemove={onArrayRemove}
                    onObjectToggle={onObjectToggle}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </FieldSet>
  );
}

interface PreviewFieldControlProps {
  field: PreviewField;
  sample?: PreviewSampleState;
  lookupFieldSource: (fieldPath: string) => PreviewSourceMapEntry | undefined;
  onFieldBlur: () => void;
  onFieldChange: (fieldPath: string, value: unknown, arrayIndices?: number[]) => void;
  onArrayAdd: (field: PreviewField, arrayIndices?: number[]) => void;
  onArrayRemove: (field: PreviewField, index: number, arrayIndices?: number[]) => void;
  onObjectToggle: (field: PreviewField, present: boolean, arrayIndices?: number[]) => void;
  arrayIndices?: number[];
}

function PreviewFieldControl({
  field,
  sample,
  lookupFieldSource, // oxlint-disable-line only-used-in-recursion
  onFieldBlur,
  onFieldChange,
  onArrayAdd,
  onArrayRemove,
  onObjectToggle,
  arrayIndices
}: PreviewFieldControlProps): ReactElement {
  const fieldPath = formatFieldPath(field.path, arrayIndices);
  const fieldError = sample?.validated ? sample.errors[fieldPath] : undefined;

  if (field.kind === 'object') {
    const value = getValueAtPath(sample?.values ?? {}, pathToSegments(field.path, arrayIndices));
    const isPresent = value !== undefined;
    const objectLabel = resolvedFieldLabel(field, arrayIndices);
    return (
      <FieldSet className="gap-1.5 p-2">
        <FieldLegend variant="label" className="text-muted-foreground">
          {/* Inline +/- icon button replaces the verbose
              "Add <FieldLabel>" / "Remove <FieldLabel>" text — the
              field label itself already names the section, so the
              button only needs to convey the operation. Icon-only
              buttons keep dense forms readable; aria-label preserves
              the original phrasing for screen readers. The "Section
              omitted from the sample" caption was removed too — the
              empty section (no nested children rendered) is enough
              affordance that the section isn't populated. */}
          <span className="inline-flex items-center gap-1.5">
            {objectLabel}
            {!field.required ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onObjectToggle(field, !isPresent, arrayIndices)}
                aria-label={isPresent ? `Remove ${objectLabel}` : `Add ${objectLabel}`}
                title={isPresent ? `Remove ${objectLabel}` : `Add ${objectLabel}`}
              >
                {isPresent ? <Minus className="size-3" /> : <Plus className="size-3" />}
              </Button>
            ) : null}
          </span>
        </FieldLegend>
        {(field.required || isPresent) &&
          (field.children ?? []).map((child) => (
            <PreviewFieldControl
              key={`${child.path}-${arrayIndices?.join('-') ?? 'root'}`}
              field={child}
              sample={sample}
              lookupFieldSource={lookupFieldSource}
              onFieldBlur={onFieldBlur}
              onFieldChange={onFieldChange}
              onArrayAdd={onArrayAdd}
              onArrayRemove={onArrayRemove}
              onObjectToggle={onObjectToggle}
              arrayIndices={arrayIndices}
            />
          ))}
        {fieldError ? <FieldError message={fieldError} /> : null}
      </FieldSet>
    );
  }

  if (field.kind === 'array') {
    const values = getValueAtPath(sample?.values ?? {}, pathToSegments(field.path, arrayIndices));
    const items = Array.isArray(values) ? values : [];
    const arrayError = sample?.validated ? sample.errors[formatFieldPath(field.path, arrayIndices)] : undefined;
    const [child] = field.children ?? [];

    return (
      <FieldSet className="gap-1.5 p-2">
        <FieldLegend variant="label" className="text-muted-foreground">
          {field.label}
        </FieldLegend>
        <Button type="button" variant="ghost" size="xs" onClick={() => onArrayAdd(field, arrayIndices)}>
          Add {field.label} item
        </Button>
        {arrayError ? <FieldError message={arrayError} /> : null}
        {child
          ? items.map((_, index) => (
              <div key={`${field.path}-item-${index}`} className="space-y-1 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {child.label} {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onArrayRemove(field, index, arrayIndices)}
                  >
                    Remove {child.label} {index + 1}
                  </Button>
                </div>
                <PreviewFieldControl
                  field={child}
                  sample={sample}
                  lookupFieldSource={lookupFieldSource}
                  onFieldBlur={onFieldBlur}
                  onFieldChange={onFieldChange}
                  onArrayAdd={onArrayAdd}
                  onArrayRemove={onArrayRemove}
                  onObjectToggle={onObjectToggle}
                  arrayIndices={[...(arrayIndices ?? []), index]}
                />
              </div>
            ))
          : null}
      </FieldSet>
    );
  }

  if (field.kind === 'enum') {
    const value = getValueAtPath(sample?.values ?? {}, pathToSegments(field.path, arrayIndices));
    const stringValue = typeof value === 'string' && value !== '' ? value : undefined;
    const fieldLabel = resolvedFieldLabel(field, arrayIndices);
    // Radix Select disallows empty-string item values, so optional enums use a
    // sentinel item that maps back to '' on selection — restoring the native
    // "Select…/clear" behaviour the prior <option value=""> provided.
    const CLEAR_SENTINEL = '__rune_enum_unset__';
    return (
      <div className="block text-xs font-medium">
        <span className="block">{fieldLabel}</span>
        <Select
          value={stringValue}
          onValueChange={(next) => {
            onFieldChange(field.path, next === CLEAR_SENTINEL ? '' : next, arrayIndices);
            onFieldBlur();
          }}
        >
          <SelectTrigger size="sm" aria-label={fieldLabel} className="mt-0.5 w-full text-xs">
            <SelectValue placeholder={field.required ? undefined : 'Select…'} />
          </SelectTrigger>
          <SelectContent>
            {!field.required ? (
              <SelectItem value={CLEAR_SENTINEL} className="text-xs text-muted-foreground">
                Select…
              </SelectItem>
            ) : null}
            {(field.enumValues ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldError ? <FieldError message={fieldError} /> : null}
      </div>
    );
  }

  if (field.kind === 'unknown') {
    return (
      <div role="status" className="text-xs text-muted-foreground">
        {field.label}: {field.description ?? 'Unsupported field'}
      </div>
    );
  }

  const value = getValueAtPath(sample?.values ?? {}, pathToSegments(field.path, arrayIndices));
  const inputType = field.kind === 'number' ? 'number' : field.kind === 'boolean' ? 'checkbox' : 'text';

  if (field.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          aria-label={resolvedFieldLabel(field, arrayIndices)}
          type="checkbox"
          checked={Boolean(value)}
          style={{ accentColor: 'var(--primary)' }}
          onChange={(event) => onFieldChange(field.path, event.target.checked, arrayIndices)}
          onBlur={onFieldBlur}
        />
        <span>{resolvedFieldLabel(field, arrayIndices)}</span>
        {fieldError ? <FieldError message={fieldError} /> : null}
      </label>
    );
  }

  return (
    <label className="block text-xs font-medium">
      <span>{resolvedFieldLabel(field, arrayIndices)}</span>
      <Input
        aria-label={resolvedFieldLabel(field, arrayIndices)}
        type={inputType}
        value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
        className="mt-0.5 h-7 text-xs"
        onChange={(event) => onFieldChange(field.path, getInputValue(field, event), arrayIndices)}
        onBlur={onFieldBlur}
      />
      {fieldError ? <FieldError message={fieldError} /> : null}
    </label>
  );
}

function FieldError({ message }: { message: string }): ReactElement {
  return (
    <p role="alert" className="mt-1 text-xs text-destructive">
      {message}
    </p>
  );
}

function getStatusOnlyMessage(schema: FormPreviewSchema | undefined, status: PreviewStatus): string {
  if (!schema) {
    if (status.state === 'waiting' && status.targetId) {
      return 'Generating preview for the selected type…';
    }

    if (status.state === 'unavailable') {
      return status.message;
    }

    return 'Select a type from the graph, file tree, or source editor to preview a generated form.';
  }

  return status.state === 'unavailable' ? status.message : 'Preview unavailable.';
}

function getSummaryMessage(schema: FormPreviewSchema, status: PreviewStatus, sample?: PreviewSampleState): string {
  if (schema.status === 'unsupported') {
    return 'Limited preview — unsupported features are listed below.';
  }

  if (status.state === 'stale') {
    return `Stale preview: ${status.message}`;
  }

  if (!sample?.validated) {
    return 'Ready to validate sample';
  }

  if (status.state === 'invalid' || !sample.valid) {
    const count = Object.keys(sample.errors).length;
    return count > 0 ? `Invalid sample (${count} issue${count === 1 ? '' : 's'})` : 'Invalid sample';
  }

  return 'Valid sample';
}

function buildDefaultValues(fields: PreviewField[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [fieldRootKey(field.path), buildDefaultValue(field)]));
}

function buildDefaultValue(field: PreviewField): unknown {
  switch (field.kind) {
    case 'boolean':
      return false;
    case 'enum':
      return field.required ? (field.enumValues?.[0]?.value ?? '') : '';
    case 'object':
      return field.required
        ? Object.fromEntries(
            (field.children ?? []).map((child) => [fieldLeafKey(child.path), buildDefaultValue(child)])
          )
        : undefined;
    case 'array':
      return [];
    default:
      return '';
  }
}

function buildDefaultObjectValue(field: PreviewField): Record<string, unknown> {
  if (field.kind !== 'object') {
    return {};
  }
  return Object.fromEntries(
    (field.children ?? []).map((child) => [fieldLeafKey(child.path), buildDefaultValue(child)])
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatSourceLocation(source: PreviewSourceMapEntry): string {
  return `${basenameFromUri(source.sourceUri)}:${source.sourceLine}:${source.sourceChar}`;
}

function basenameFromUri(uri: string): string {
  const normalized = uri.replace(/^file:\/\//, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : normalized;
}

function resolvedFieldLabel(field: PreviewField, arrayIndices?: number[]): string {
  const arrayIndex = arrayIndices && arrayIndices.length > 0 ? arrayIndices[arrayIndices.length - 1] : undefined;
  return arrayIndex === undefined ? field.label : `${field.label} ${arrayIndex + 1}`;
}

function getInputValue(field: PreviewField, event: ChangeEvent<HTMLInputElement>): unknown {
  if (field.kind === 'number') {
    if (event.target.value === '') {
      return undefined;
    }
    return Number.isNaN(event.target.valueAsNumber) ? undefined : event.target.valueAsNumber;
  }
  return event.target.value;
}

function fieldRootKey(path: string): string {
  return path.split('.')[0]!.split('[]').join('');
}

function fieldLeafKey(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1]!.split('[]').join('');
}

function pathToSegments(path: string, arrayIndices: number[] = []): Array<string | number> {
  const segments: Array<string | number> = [];
  let nextArrayIndex = 0;
  for (const part of path.split('.')) {
    if (part.endsWith('[]')) {
      segments.push(part.slice(0, -2));
      const arrayIndex = arrayIndices[nextArrayIndex];
      nextArrayIndex += 1;
      if (arrayIndex !== undefined) {
        segments.push(arrayIndex);
      }
    } else {
      segments.push(part);
    }
  }
  return segments;
}

function formatFieldPath(path: string, arrayIndices: number[] = []): string {
  let nextArrayIndex = 0;
  return path.replace(/\[\]/g, () => {
    const index = arrayIndices[nextArrayIndex];
    nextArrayIndex += 1;
    return index === undefined ? '[]' : `[${index}]`;
  });
}

function getValueAtPath(value: unknown, segments: Array<string | number>): unknown {
  let current = value;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = (current as Record<string, unknown>)[segment as keyof typeof current];
  }
  return current;
}

function setValueAtPath(value: unknown, segments: Array<string | number>, nextValue: unknown): unknown {
  if (segments.length === 0) return nextValue;
  const [head, ...rest] = segments;
  if (head === undefined) {
    return nextValue;
  }

  if (typeof head === 'number') {
    const array = Array.isArray(value) ? [...value] : [];
    array[head] = setValueAtPath(array[head], rest, nextValue);
    return array;
  }

  const record =
    value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  record[head] = setValueAtPath(record[head], rest, nextValue);
  return record;
}

function removeValueAtPath(value: unknown, segments: Array<string | number>): unknown {
  if (segments.length === 0) {
    return undefined;
  }
  const [head, ...rest] = segments;
  if (head === undefined) {
    return value;
  }

  if (typeof head === 'number') {
    if (!Array.isArray(value)) return value;
    const next = [...value];
    if (rest.length === 0) {
      next.splice(head, 1);
      return next;
    }
    next[head] = removeValueAtPath(next[head], rest);
    return next;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const record = { ...(value as Record<string, unknown>) };
  if (rest.length === 0) {
    delete record[head];
    return record;
  }
  record[head] = removeValueAtPath(record[head], rest);
  return record;
}

function validatePreviewSample(
  schema: FormPreviewSchema,
  values: Record<string, unknown>
): { errors: Record<string, string>; valid: boolean } {
  const validator = buildSchemaValidator(schema.fields);
  const result = validator.safeParse(values);

  if (result.success) {
    return { errors: {}, valid: true };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = formatIssuePath(issue.path);
    errors[key] = issue.message;
  }
  return { errors, valid: false };
}

function buildSchemaValidator(fields: PreviewField[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.object(Object.fromEntries(fields.map((field) => [fieldRootKey(field.path), buildFieldValidator(field)])));
}

function buildFieldValidator(field: PreviewField): z.ZodTypeAny {
  switch (field.kind) {
    case 'string': {
      return field.required
        ? z.preprocess(
            (value) => (typeof value === 'string' ? value : ''),
            z.string().trim().min(1, `${field.label} is required`)
          )
        : z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().optional());
    }
    case 'number': {
      const base = z.preprocess(
        (value) => {
          if (value === '' || value === undefined || value === null) return undefined;
          if (typeof value === 'number') return value;
          if (typeof value === 'string') return Number(value);
          return value;
        },
        z.number({ error: `${field.label} must be a number` })
      );
      return field.required ? base : base.optional();
    }
    case 'boolean':
      return field.required ? z.boolean() : z.boolean().optional();
    case 'enum': {
      const values = (field.enumValues ?? []).map((value) => value.value);
      if (values.length === 0) return z.string();
      const schema = z.enum(values as [string, ...string[]]);
      return field.required
        ? z.preprocess((value) => (value === '' ? undefined : value), schema)
        : z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
    }
    case 'object': {
      const childShape = Object.fromEntries(
        (field.children ?? []).map((child) => [fieldLeafKey(child.path), buildFieldValidator(child)])
      );
      const objectSchema = z.object(childShape);
      return field.required ? objectSchema : objectSchema.optional();
    }
    case 'array': {
      const [child] = field.children ?? [];
      const item = child ? buildFieldValidator(child) : z.string();
      let arraySchema = z.array(item);
      if (field.cardinality?.min !== undefined) {
        arraySchema = arraySchema.min(
          field.cardinality.min,
          `Add at least ${field.cardinality.min} ${field.label.toLowerCase()} item${field.cardinality.min === 1 ? '' : 's'}`
        );
      }
      if (typeof field.cardinality?.max === 'number') {
        arraySchema = arraySchema.max(
          field.cardinality.max,
          `Use at most ${field.cardinality.max} ${field.label.toLowerCase()} item${field.cardinality.max === 1 ? '' : 's'}`
        );
      }
      return arraySchema;
    }
    default:
      return z.any();
  }
}

function formatIssuePath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .filter((segment): segment is string | number => typeof segment === 'string' || typeof segment === 'number')
    .map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment))
    .join('.')
    .replace('.[', '[');
}
