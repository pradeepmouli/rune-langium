// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Single source of truth for the curated-mirror data shapes.
 * Both `apps/curated-mirror-worker` (publisher) and `apps/studio`
 * (loader) consume types and runtime validators from this package, so
 * any drift would fail the build instead of producing two copies that
 * silently diverge.
 *
 * Shapes are defined as Zod schemas; TypeScript types are derived via
 * `z.infer`. That gives us type safety in TS callers AND runtime
 * validation at the network boundary in Studio.
 */

import { z } from 'zod';

/** Locked enumeration of curated model identifiers. */
export const CuratedModelIdSchema = z.enum(['cdm', 'fpml', 'rune-dsl']);
export type CuratedModelId = z.infer<typeof CuratedModelIdSchema>;
export const CURATED_MODEL_IDS: readonly CuratedModelId[] = CuratedModelIdSchema.options;

/**
 * Loader failure categories — kept narrow so each maps 1:1 to a piece of
 * user-facing copy (FR-002). Adding a value here means adding panel copy
 * and updating the Studio panel test that asserts non-generic messaging.
 */
export const ErrorCategorySchema = z.enum([
  'network',
  'archive_not_found',
  'archive_decode',
  'storage_quota',
  'permission_denied',
  'cancelled',
  'unknown'
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const LangiumJsonArtifactRefSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('langium-json-serializer'),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
  documentCount: z.number().int().nonnegative(),
  langiumVersion: z.string().min(1)
});
export type LangiumJsonArtifactRef = z.infer<typeof LangiumJsonArtifactRefSchema>;

export const CuratedSerializedDocumentSchema = z.object({
  path: z.string().min(1),
  modelJson: z.string().min(1)
});
export type CuratedSerializedDocument = z.infer<typeof CuratedSerializedDocumentSchema>;

export const CuratedSerializedWorkspaceArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('langium-json-serializer'),
  modelId: CuratedModelIdSchema,
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  langiumVersion: z.string().min(1),
  documents: z.array(CuratedSerializedDocumentSchema)
});
export type CuratedSerializedWorkspaceArtifact = z.infer<
  typeof CuratedSerializedWorkspaceArtifactSchema
>;

/**
 * Curated-mirror manifest. Written by the publisher Worker, fetched and
 * validated by Studio. `schemaVersion` is a literal so out-of-range values
 * are caught at the boundary; bumping it requires a migration in both
 * publisher and loader.
 */
export const CuratedManifestSchema = z.object({
  schemaVersion: z.literal(1),
  modelId: CuratedModelIdSchema,
  /** Date stamp `yyyy-mm-dd`, monotonic per modelId. */
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** SHA-256 of latest.tar.gz, hex (lower-case). */
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
  /** ISO-8601 UTC. */
  generatedAt: z.string(),
  /** Upstream commit SHA, or empty string if unavailable. */
  upstreamCommit: z.string(),
  /** Upstream branch / tag. */
  upstreamRef: z.string(),
  /** Public archive URL — informational; clients MUST derive their own. */
  archiveUrl: z.string().url(),
  /** Recent archive history, oldest-first, capped by retention. */
  history: z.array(
    z.object({
      version: z.string(),
      archiveUrl: z.string().url()
    })
  ),
  artifacts: z
    .object({
      serializedWorkspace: LangiumJsonArtifactRefSchema.optional()
    })
    .optional()
});
export type CuratedManifest = z.infer<typeof CuratedManifestSchema>;

/** Validate an unknown payload against the manifest schema. Returns Result-shaped. */
export function parseManifest(
  data: unknown
): { ok: true; manifest: CuratedManifest } | { ok: false; reason: string } {
  const r = CuratedManifestSchema.safeParse(data);
  if (r.success) return { ok: true, manifest: r.data };
  return { ok: false, reason: r.error.message };
}

export function parseSerializedWorkspaceArtifact(
  data: unknown
): { ok: true; artifact: CuratedSerializedWorkspaceArtifact } | { ok: false; reason: string } {
  const r = CuratedSerializedWorkspaceArtifactSchema.safeParse(data);
  if (r.success) return { ok: true, artifact: r.data };
  return { ok: false, reason: r.error.message };
}
