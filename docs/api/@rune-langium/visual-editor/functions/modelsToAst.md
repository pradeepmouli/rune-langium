[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / modelsToAst

# Function: modelsToAst()

> **modelsToAst**(`nodes`, `edges`): [`ModelOutput`](../interfaces/ModelOutput.md)[]

Defined in: [packages/visual-editor/src/adapters/model-to-ast.ts:104](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/visual-editor/src/adapters/model-to-ast.ts#L104)

Convert graph nodes and edges to serializer-compatible model objects.
Groups nodes by namespace and produces one model per namespace.

## Parameters

### nodes

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

### edges

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

## Returns

[`ModelOutput`](../interfaces/ModelOutput.md)[]
