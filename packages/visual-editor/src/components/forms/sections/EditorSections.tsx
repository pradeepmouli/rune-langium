// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { SectionRenderer } from '@zod-to-form/react';
import { editorSections } from './config.js';
import * as componentModule from './index.js';

/** Compose configured sections inside the Inspector's existing form. */
export function EditorSections({ names }: { names: readonly string[] }) {
  const sections = new Map(Array.from(editorSections).filter(([name]) => names.includes(name)));
  return <SectionRenderer sections={sections} componentConfig={{ componentModule }} />;
}
