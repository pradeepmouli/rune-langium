// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { useEffect, useState } from 'react';
import { instanceFieldsKey, useInstanceStore } from '../../store/instance-store.js';

export interface InstanceFormPanelProps {
  instanceId: string;
}

export function InstanceFormPanel({ instanceId }: InstanceFormPanelProps) {
  const record = useInstanceStore((s) => s.instances[instanceId]);
  const updateInstanceData = useInstanceStore((s) => s.updateInstanceData);
  const dispatchResolveFields = useInstanceStore((s) => s.dispatchResolveFields);
  const resolvedFields = useInstanceStore((s) => s.resolvedFields);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (record) dispatchResolveFields(record.typeFqn, []);
  }, [record?.typeFqn, dispatchResolveFields]);

  if (!record) return null;

  const topLevelFields = resolvedFields[instanceFieldsKey(record.typeFqn, [])] ?? [];

  return (
    <form className="flex flex-col gap-2 p-2">
      {topLevelFields.map((field) => {
        if (field.kind === 'object' && (field as { expandable?: boolean }).expandable) {
          const isOpen = expanded.has(field.path);
          return (
            <div key={field.path}>
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(field.path)) next.delete(field.path);
                    else next.add(field.path);
                    return next;
                  })
                }
              >
                {isOpen ? '▾' : '▸'} {field.label}
              </button>
              {isOpen && <NestedFields typeFqn={record.typeFqn} path={field.path} instanceId={instanceId} />}
            </div>
          );
        }
        if (field.kind === 'array') {
          const items = ((record.data as Record<string, unknown>)[field.path] as string[] | undefined) ?? [];
          return (
            <fieldset key={field.path} className="flex flex-col gap-1 text-sm">
              <legend>{field.label}</legend>
              {items.map((value, i) => (
                <div key={i} className="flex gap-1">
                  <input
                    aria-label={`${field.path}[${i}]`}
                    value={value}
                    onChange={(e) => {
                      const next = [...items];
                      next[i] = e.target.value;
                      updateInstanceData(instanceId, field.path, next);
                    }}
                    className="border border-border bg-transparent px-2 py-1"
                  />
                  <button
                    type="button"
                    aria-label={`Move ${field.label} item ${i} up`}
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...items];
                      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                      updateInstanceData(instanceId, field.path, next);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${field.label} item ${i}`}
                    onClick={() =>
                      updateInstanceData(
                        instanceId,
                        field.path,
                        items.filter((_, j) => j !== i)
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                aria-label={`Add ${field.label}`}
                onClick={() => updateInstanceData(instanceId, field.path, [...items, ''])}
              >
                Add {field.label}
              </button>
            </fieldset>
          );
        }
        return (
          <label key={field.path} className="flex flex-col gap-1 text-sm">
            {field.label}
            <input
              aria-label={field.label}
              value={((record.data as Record<string, unknown>)[field.path] as string | undefined) ?? ''}
              onChange={(e) => updateInstanceData(instanceId, field.path, e.target.value)}
              className="border border-border bg-transparent px-2 py-1"
            />
          </label>
        );
      })}
    </form>
  );
}

function NestedFields({ typeFqn, path, instanceId }: { typeFqn: string; path: string; instanceId: string }) {
  const updateInstanceData = useInstanceStore((s) => s.updateInstanceData);
  const record = useInstanceStore((s) => s.instances[instanceId]);
  const dispatchResolveFields = useInstanceStore((s) => s.dispatchResolveFields);
  const resolvedFields = useInstanceStore((s) => s.resolvedFields);
  const pathSegments = path.split('.');

  useEffect(() => {
    dispatchResolveFields(typeFqn, pathSegments);
    // pathSegments is derived fresh from `path` each render (not itself a stable
    // dependency identity) — `path` is the real, stable dependency here. No
    // suppression comment needed: this repo lints with oxlint, whose `react`
    // plugin (the source of an exhaustive-deps-equivalent rule) is disabled
    // by default and not turned on in oxlintrc.json / apps/studio/.oxlintrc.json,
    // so no rule here would flag the array below.
  }, [typeFqn, path, dispatchResolveFields]);

  if (!record) return null;
  const fields = resolvedFields[instanceFieldsKey(typeFqn, pathSegments)] ?? [];
  return (
    <div className="ml-4 flex flex-col gap-2">
      {fields.map((field) => (
        <label key={field.path} className="flex flex-col gap-1 text-sm">
          {field.label}
          <input
            aria-label={field.label}
            value={((record.data as Record<string, unknown>)[field.path] as string | undefined) ?? ''}
            onChange={(e) => updateInstanceData(instanceId, field.path, e.target.value)}
            className="border border-border bg-transparent px-2 py-1"
          />
        </label>
      ))}
    </div>
  );
}
