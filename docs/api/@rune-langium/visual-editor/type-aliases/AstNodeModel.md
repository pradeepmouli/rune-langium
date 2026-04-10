[**Documentation v0.1.0**](../../../README.md)

***

[Documentation](../../../README.md) / [@rune-langium/visual-editor](../README.md) / [](../README.md) / AstNodeModel

# Type Alias: AstNodeModel\<T\>

> **AstNodeModel**\<`T`\> = `object` & \{ -readonly \[K in Exclude\<keyof T, ExcludedFields \| "$type"\>\]: SerializeField\<T\[K\]\> \}

Defined in: [packages/visual-editor/src/types.ts:106](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/visual-editor/src/types.ts#L106)

Mapped type that plucks and recursively serializes fields from any
Langium AST node type.

`$type` is preserved as a readonly literal (derived from the generic parameter)
for runtime discrimination. All other fields are made mutable for editing.

## Type Declaration

### $type

> `readonly` **$type**: `T`\[`"$type"`\]

## Type Parameters

### T

`T` *extends* [`AstNodeShape`](../interfaces/AstNodeShape.md)

## Example

```ts
// AstNodeModel<Data> yields:
// {
//   readonly $type: 'Data';
//   name: string;
//   definition?: string;
//   superType?: Reference<DataOrChoice>;
//   attributes: AstNodeModel<Attribute>[];
//   conditions: AstNodeModel<Condition>[];
//   annotations: AstNodeModel<AnnotationRef>[];
//   synonyms: AstNodeModel<RosettaClassSynonym>[];
// }
```
