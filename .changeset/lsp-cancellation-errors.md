---
'@rune-langium/lsp-server': patch
---

Send Langium cancellation and other vscode response errors as JSON-RPC errors
through the shared connection adapter, preserving their code, message and data.
