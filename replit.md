# Rune Langium

## Overview
A Langium-based parser and visual editor for the Rune DSL (.rosetta files). This is a pnpm monorepo with a Vite React frontend (Studio app) and several supporting packages.

## Project Architecture

### Monorepo Structure
- `packages/core` - Langium-based parser and typed AST for the Rune DSL
- `packages/visual-editor` - ReactFlow-based visual editor component library
- `packages/design-system` - Shared design tokens and theme
- `packages/lsp-server` - LSP server powered by Langium and @lspeasy/server
- `packages/cli` - CLI tools for the Rune DSL
- `apps/studio` - Vite React standalone web application (the frontend)

### Tech Stack
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm 10.28.0
- **Build**: Vite 7.x (studio), tsgo/tsc (packages)
- **Frontend**: React 19, Tailwind CSS 4, Radix UI, ReactFlow, Zustand, CodeMirror
- **Language**: TypeScript 5.9
- **Testing**: Vitest 4, Playwright (e2e)

### Key Commands
- `pnpm install` - Install all dependencies
- `pnpm --filter @rune-langium/core build` - Build core package
- `pnpm --filter @rune-langium/visual-editor build` - Build visual editor
- `pnpm --filter @rune-langium/lsp-server build` - Build LSP server
- `pnpm --filter @rune-langium/studio dev` - Run studio dev server (port 5000)
- `pnpm --filter @rune-langium/studio build` - Build studio for production

### Development Notes
- Vite dev server configured for port 5000, host 0.0.0.0, with allowedHosts: true for Replit proxy
- Workspace packages must be built before running studio (core, visual-editor, lsp-server)
- Deployment target: static (apps/studio/dist)

## Recent Changes
- 2026-02-18: Initial Replit setup - configured Vite for port 5000, set up workflow and deployment
