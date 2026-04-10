[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / astToModel

# Function: astToModel()

> **astToModel**(`models`, `options?`): `AstToModelResult`

Defined in: [packages/visual-editor/src/adapters/ast-to-model.ts:179](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/visual-editor/src/adapters/ast-to-model.ts#L179)

Convert RosettaModel AST roots into ReactFlow nodes and edges.

Each graph node's `data` IS the AstNodeModel (AST fields spread)
plus GraphMetadata (namespace, position, errors, etc.).

## Parameters

### models

`unknown`

### options?

`AstToModelOptions`

## Returns

`AstToModelResult`
