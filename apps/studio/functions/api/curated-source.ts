// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { CURATED_MODEL_IDS, CuratedCohortSchema } from '@rune-langium/curated-schema';
import {
  fetchCuratedManifest,
  fetchCuratedNamespace,
  CuratedBundleUnavailableError
} from '../../src/services/curated-fetch.js';
import { curatedArtifactKey } from '../../src/services/curated-workspace.js';
import { withEdgeInstrumentation } from '../lib/instrumentation-sink.js';
import { withInstrumentation } from '../../src/services/instrumentation/core.js';

interface Env {
  CURATED_MIRROR?: { fetch: (input: string | Request, init?: RequestInit) => Promise<Response> };
}

interface SourceRequest {
  bundleId: string;
  version: string;
  namespace: string;
  expectedArtifactKey?: string;
}

const instrumentedOnRequestPost = withInstrumentation(
  async function onRequestPost({ request, env }: { request: Request; env?: Env }): Promise<Response> {
    let body: SourceRequest;
    try {
      body = (await request.json()) as SourceRequest;
    } catch {
      return Response.json({ error: 'Malformed JSON' }, { status: 400 });
    }
    if (
      !body ||
      typeof body !== 'object' ||
      !CURATED_MODEL_IDS.includes(body.bundleId as (typeof CURATED_MODEL_IDS)[number]) ||
      typeof body.version !== 'string' ||
      body.version.length === 0 ||
      body.version.length > 128 ||
      typeof body.namespace !== 'string' ||
      body.namespace.length === 0 ||
      body.namespace.length > 512 ||
      (body.expectedArtifactKey !== undefined &&
        (typeof body.expectedArtifactKey !== 'string' || body.expectedArtifactKey.length > 2048))
    ) {
      return Response.json({ error: 'Invalid curated source request' }, { status: 400 });
    }
    let manifestVersion = body.version;
    if (body.expectedArtifactKey !== undefined) {
      let key: unknown;
      try {
        key = JSON.parse(body.expectedArtifactKey);
      } catch {
        return Response.json({ error: 'Invalid artifact key' }, { status: 400 });
      }
      if (!Array.isArray(key) || key.length !== 2 || key[0] !== body.bundleId || typeof key[1] !== 'string') {
        return Response.json({ error: 'Invalid artifact key' }, { status: 400 });
      }
      const cohort = key[1].match(/(?:^|\/)artifacts\/(cohort-[a-f0-9]{64})\//)?.[1];
      if (cohort && CuratedCohortSchema.safeParse(cohort).success) manifestVersion = cohort;
    }
    const fetcher = env?.CURATED_MIRROR
      ? (url: string, init?: RequestInit) => env.CURATED_MIRROR!.fetch(url, init)
      : undefined;
    try {
      const manifest = await fetchCuratedManifest(body.bundleId, manifestVersion, fetcher);
      const artifact = manifest.namespaces?.[body.namespace]?.artifact;
      if (!artifact) return Response.json({ error: 'Namespace not found' }, { status: 404 });
      const artifactKey = curatedArtifactKey(body.bundleId, artifact);
      if (body.expectedArtifactKey && body.expectedArtifactKey !== artifactKey) {
        return Response.json({ error: 'Curated artifact changed' }, { status: 409 });
      }
      const documents = await fetchCuratedNamespace(body.bundleId, manifestVersion, artifact, fetcher);
      if (documents.some((doc) => doc.content.length === 0 && doc.exports.length > 0)) {
        return Response.json({ error: 'Original source is unavailable for this artifact' }, { status: 404 });
      }
      return Response.json({
        artifactKey,
        documents: documents.map(({ uri, content }) => ({ uri, content }))
      });
    } catch (error) {
      if (error instanceof CuratedBundleUnavailableError) {
        return Response.json({ error: 'Curated bundle unavailable' }, { status: 502 });
      }
      throw error;
    }
  },
  { op: 'curatedSourcePost' }
);

export const onRequestPost: PagesFunction<Env> = withEdgeInstrumentation(instrumentedOnRequestPost);
