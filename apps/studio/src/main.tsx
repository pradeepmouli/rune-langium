// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { Buffer } from 'buffer';
// isomorphic-git requires global Buffer in the browser
(globalThis as any).Buffer = Buffer;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { installOpLogWindowBridge } from './services/op-log-window-bridge.js';
// Dockview chrome (tab strips, sash handles, abyss theme palette).
// dockview's upstream theme CSS — UNLAYERED, sits above all @layer rules.
import 'dockview-react/dist/styles/dockview.css';
import './app.css';
// Rune structural overrides for DockviewReact (.rune-dock-theme). Imported
// AFTER app.css on purpose: app.css's `@import 'tailwindcss'` must
// establish the canonical @layer order (theme, base, components, utilities)
// FIRST. If dock-theme.css declared `@layer components` before that, it would
// register `components` ahead of `base` and globally invert base↔components
// priority. Order vs dockview's unlayered dist CSS is unaffected — dockview.css
// is imported first, so dock-theme's unlayered overrides still win source-order.
import '@rune-langium/design-system/dock-theme.css';

installOpLogWindowBridge();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
