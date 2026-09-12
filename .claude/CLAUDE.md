# Claude Configuration Directory

Follow the repository's [Claude instructions](../CLAUDE.md).

Keep repository hooks and plugin preferences in `settings.json`. Keep local
permissions and machine-specific MCP choices in ignored `settings.local.json`.



<!-- BEGIN INFIGRAPH v3 -->
## Infigraph — Code Intelligence (auto-generated)

This project is indexed by Infigraph. Use Infigraph MCP tools FIRST for all code tasks.
Read non-code files directly. If an Infigraph tool is unavailable or errors, tell the user
(e.g. to reconnect the MCP server) rather than working around the enforcement hook.

### Tool Preferences
1. **`search`** for ALL code search — ranked symbols plus every line containing the text; **`regex=true`** lists every occurrence (e.g. all call sites). Constants: `get_symbols_in_file`. Full routing: the `infigraph-tool-routing` skill
2. **`get_doc_context`** before editing any function — returns source+callers+callees
3. **`trace_callers`** / **`find_all_references`** before refactoring — never grep for callers
4. **`trace_callees`** / **`transitive_impact`** for blast radius
5. Read files directly only for non-code files or Edit tool line-number context

### Subagent Rules
Do NOT spawn these agent types for code tasks — they lack MCP access:
- **Explore** → use `search` (with `regex=true` to enumerate) and `get_symbols_in_file` directly
- **Plan** → use `get_architecture`, `get_skeleton`, `get_stats` directly
- **code-reviewer** → use `get_doc_context`, `get_code_snippet`, `review` directly

For tasks requiring a subagent, use **general-purpose** — it has full MCP/infigraph access.

### Verbose tools — delegate to subagent
`get_architecture`, `transitive_impact`, `detect_dead_code`, `detect_clusters`,
`detect_clones`, `export_graph`, `query_graph`, `trace_callers`/`trace_callees` (deep),
`group_query`, `group_index`

### Context Compression
Tool outputs are automatically compressed to save context window budget.
- Compression scales with session length (Off → Summary → Aggressive → Minimal)
- `search` results are capped at Summary level to preserve result quality
- Security tools (`detect_security_issues`, `detect_taint_flows`, etc.) are never compressed
- `get_code_snippet` passes through uncompressed for edit accuracy
- No action needed — compression is transparent and automatic
<!-- END INFIGRAPH -->
