// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { CuratedCohortSchema, type CuratedManifest } from '@rune-langium/curated-schema';
import {
  fetchCuratedManifest,
  fetchCuratedNamespace,
  CuratedBundleUnavailableError,
  type CuratedFetcher,
  type CuratedDocument
} from './curated-fetch.js';
import { closeNamespacesFromManifest } from './curated-closure.js';
import { withInstrumentation } from './instrumentation/core.js';

class CuratedManifestMissingError extends CuratedBundleUnavailableError {}

interface CuratedWorkspace {
  bundles: Array<{ id: string; manifest: CuratedManifest; documents: CuratedDocument[] }>;
  closure: Set<string>;
  graph: NonNullable<CuratedManifest['namespaces']>;
}

/** Load one cross-bundle namespace closure before any document is hydrated. */
export const loadCuratedWorkspace = withInstrumentation(
  async function loadCuratedWorkspace(
    requestedBundles: ReadonlyArray<{ id: string; version: string }>,
    seeds: ReadonlySet<string>,
    fetcher?: CuratedFetcher,
    includeAllWhenUnseeded = false
  ): Promise<CuratedWorkspace> {
    const bundles = new Map(requestedBundles.map((bundle) => [bundle.id, bundle]));
    const manifests = new Map<string, CuratedManifest>();
    for (const bundle of bundles.values()) {
      const manifest = await fetchCuratedManifest(bundle.id, bundle.version, fetcher);
      if (!manifest?.namespaces || Object.keys(manifest.namespaces).length === 0) {
        throw new CuratedManifestMissingError(bundle.id, bundle.version);
      }
      // Resolve floating roots through the first cohort encountered, including
      // explicitly loaded dependencies whose latest pointers may still be older.
      if (manifest.cohort && requestedBundles.some((root) => root.version !== manifest.cohort)) {
        if (
          requestedBundles.some(
            (root) => CuratedCohortSchema.safeParse(root.version).success && root.version !== manifest.cohort
          )
        ) {
          throw new CuratedBundleUnavailableError(
            bundle.id,
            bundle.version,
            undefined,
            new Error('Conflicting manifest cohorts')
          );
        }
        return loadCuratedWorkspace(
          requestedBundles.map((root) => ({ id: root.id, version: manifest.cohort! })),
          seeds,
          fetcher,
          includeAllWhenUnseeded
        );
      }
      manifests.set(bundle.id, manifest);
      for (const [id, version] of Object.entries(manifest.dependencies ?? {})) {
        const existing = bundles.get(id);
        if (
          existing &&
          existing.version !== version &&
          (CuratedCohortSchema.safeParse(existing.version).success || CuratedCohortSchema.safeParse(version).success)
        ) {
          throw new CuratedBundleUnavailableError(id, version, undefined, new Error('Conflicting bundle versions'));
        }
        if (!existing) bundles.set(id, { id, version });
      }
    }
    const graph: NonNullable<CuratedManifest['namespaces']> = Object.assign(
      {},
      ...[...manifests.values()].map((manifest) => manifest.namespaces)
    );
    const roots =
      seeds.size === 0 && includeAllWhenUnseeded
        ? requestedBundles.flatMap((bundle) => Object.keys(manifests.get(bundle.id)!.namespaces!))
        : seeds;
    const closure = closeNamespacesFromManifest(roots, graph);
    const loaded: CuratedWorkspace['bundles'] = [];
    for (const [id, manifest] of manifests) {
      const selected = [...closure].filter((ns) => manifest.namespaces?.[ns]);
      const documents: CuratedDocument[] = [];
      for (let i = 0; i < selected.length; i += 8) {
        const fetched = await Promise.all(
          selected
            .slice(i, i + 8)
            .map((ns) =>
              fetchCuratedNamespace(id, bundles.get(id)!.version, manifest.namespaces![ns]!.artifact, fetcher)
            )
        );
        documents.push(...fetched.flat());
      }
      loaded.push({ id, manifest, documents });
    }
    return { bundles: loaded, closure, graph };
  },
  { op: 'loadCuratedWorkspace' }
);

export const curatedWorkspaceErrorResponse = withInstrumentation(
  function curatedWorkspaceErrorResponse(error: unknown): Response | undefined {
    if (!(error instanceof CuratedBundleUnavailableError)) return undefined;
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof CuratedManifestMissingError ? 'curated_manifest_missing' : 'curated_bundle_unavailable',
        bundleId: error.bundleId,
        version: error.version,
        upstreamStatus: error.status
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  },
  { op: 'curatedWorkspaceErrorResponse' }
);
