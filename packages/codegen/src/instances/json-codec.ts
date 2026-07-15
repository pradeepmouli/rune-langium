// SPDX-License-Identifier: MIT

export interface ImportDiagnostic {
  kind: 'parse-error' | 'unmapped-field' | 'coercion';
  path?: string;
  message: string;
}

export interface ImportCodecResult {
  data: unknown;
  diagnostics: ImportDiagnostic[];
}

export interface ImportCodec {
  id: string;
  label: string;
  canTarget(typeFqn: string): boolean;
  import(input: Uint8Array | string, targetTypeFqn: string): ImportCodecResult;
}

function toText(input: Uint8Array | string): string {
  return typeof input === 'string' ? input : new TextDecoder().decode(input);
}

/**
 * Parse-and-pass-through: unknown fields are preserved verbatim (import is
 * non-destructive by construction). Schema-level diagnostics (unknown
 * fields, type mismatches) come from the normal instance validation
 * pipeline once the InstanceRecord exists — not from this codec.
 */
export const jsonCodec: ImportCodec = {
  id: 'json',
  label: 'Plain JSON',
  canTarget: () => true,
  import(input: Uint8Array | string, _targetTypeFqn: string): ImportCodecResult {
    const text = toText(input);
    try {
      return { data: JSON.parse(text), diagnostics: [] };
    } catch (err) {
      return {
        data: undefined,
        diagnostics: [{ kind: 'parse-error', message: err instanceof Error ? err.message : String(err) }]
      };
    }
  }
};
