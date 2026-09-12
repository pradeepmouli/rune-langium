---
name: Shared agent guidance
description: Shared instructions and architecture routing for all repository agents
type: project
---

Keep shared instructions in `AGENTS.md` and its linked `docs/agents/` guides.
Claude and Copilot entry points reference these files.

Comment review tooling and scope are documented in `docs/agents/workflow.md`.
Run `pnpm run audit:comments` for a read-only AST inventory.

Source auditing uses typed Oxlint configuration and `pnpm run audit:source`;
see the workflow guide for scope and generator handling.

Copilot LSP config is canonical in `.github/lsp.json`; root `lsp.json` links to it.
It uses the pinned TypeScript 7 native LSP rather than `tsserver`.
