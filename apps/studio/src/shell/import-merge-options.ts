// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';

/** How `mergeImportedText` resolves a top-level-element name collision. */
export const MergeOptionsSchema = z.object({
  onCollision: z
    .enum(['skip', 'overwrite', 'rename'])
    .optional()
    .default('skip')
    .describe(
      'skip: keep the existing declaration, drop the incoming one (current, only behavior). ' +
        'overwrite: replace the existing declaration with the incoming one. ' +
        'rename: keep both, renaming the incoming declaration.'
    )
});

export type MergeOptions = z.infer<typeof MergeOptionsSchema>;
