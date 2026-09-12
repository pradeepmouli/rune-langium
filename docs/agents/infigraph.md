# Infigraph and Session Continuity

## Session Start

1. Call `get_latest_session` with this checkout's root path. Read a referenced narrative if the structured summary is insufficient. Prior pending work is context; confirm it belongs to the current request before resuming it.
2. For Codex, run `session-recall-cc list --json --limit 5` to ground recent work. This requires `auto-memory[Codex]` and `SESSION_RECALL_ENABLE_CLAUDE_BACKEND=1`. Search phrases with spaces; FTS5 splits hyphens/dots. Use `session-recall-cc files` for filenames.
3. Call `list_projects` before considering indexing. For onboarding, use `get_architecture` and `get_stats` on the existing graph. A registry omission alone does not prove the local graph is missing.
4. Use `index_project` when no usable index exists, when a refresh is needed, or when requested. Prefer the default incremental refresh; do not force a full rebuild merely to explore. Inspect warnings separately from graph-query success.

## Code Discovery and Changes

- Use `search` first for code discovery. It combines keyword, semantic, and text search. Use the actual tool description for supported parameters.
- Pass the exact returned symbol ID to `get_code_snippet` or `symbol_context` for source/context. Instrumented functions can be indexed as Variables, so avoid a Function-only filter when searching for them.
- Call `get_doc_context` before editing a function; request `detail: true` when source is needed.
- Before refactoring, use `find_all_references` / `trace_callers`, then `transitive_impact`. Use `trace_callees` for downstream call relationships rather than manually rebuilding call chains.
- Read configs, manifests, and documentation directly. Fall back to direct code search/reads when tools are unavailable or return no relevant results, and state the limitation.
- Prefer compact results and delegate only to agents with the required MCP access. Treat architecture counts as approximate.
- For multi-repository work, consult the available group tool schemas.

## Save Continuity Immediately

Call `save_session` before responding when you make a finding, reach a milestone,
make a decision, or finish a task. Also save after compaction, before resuming work,
and whenever five user exchanges have passed without a save. Do not defer these
saves until session end.

Every save must include a chronological `narrative`: what was explored, found,
reasoned, decided, and why. Record verification, blockers, and remaining work
accurately. Same-day saves merge: summary/pending tasks overwrite, decisions
append, and touched files union. Use a named session when the current task should
remain separate from unrelated prior work. Keep machine-local graph/session data
under ignored `.infigraph/`; put durable shared guidance in repository documents.
