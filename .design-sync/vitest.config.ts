// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { mergeConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import editorConfig from '../packages/visual-editor/vitest.config.js';

// Previews live outside a workspace package. Resolve their dependencies from Studio.
const studioPackage = (name: string) => fileURLToPath(new URL(`../apps/studio/node_modules/${name}`, import.meta.url));

const config = mergeConfig(editorConfig, {
  resolve: {
    alias: [
      {
        find: /^@rune-langium\/design-system$/,
        replacement: fileURLToPath(new URL('./preview-entry.ts', import.meta.url))
      },
      ...['react', 'react-dom', 'lucide-react'].map((name) => ({ find: name, replacement: studioPackage(name) })),
      ...['@testing-library/react', '@testing-library/user-event'].map((name) => ({
        find: name,
        replacement: fileURLToPath(new URL(`../packages/visual-editor/node_modules/${name}`, import.meta.url))
      }))
    ]
  }
});

// mergeConfig concatenates arrays; replace the editor's include glob for this suite.
config.test = { ...config.test, include: [fileURLToPath(new URL('./*.test.tsx', import.meta.url))] };
export default config;
