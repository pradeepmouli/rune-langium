[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / modelsToAst

# Function: modelsToAst()

> **modelsToAst**(`nodes`, `edges`): [`ModelOutput`](../interfaces/ModelOutput.md)[]

Defined in: [packages/visual-editor/src/adapters/model-to-ast.ts:101](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/visual-editor/src/adapters/model-to-ast.ts#L101)

Convert graph nodes and edges to serializer-compatible model objects.
Groups nodes by namespace and produces one model per namespace.

## Parameters

### nodes

[`TypeGraphNode`](../type-aliases/TypeGraphNode.md)[]

### edges

[`TypeGraphEdge`](../type-aliases/TypeGraphEdge.md)[]

## Returns

[`ModelOutput`](../interfaces/ModelOutput.md)[]
