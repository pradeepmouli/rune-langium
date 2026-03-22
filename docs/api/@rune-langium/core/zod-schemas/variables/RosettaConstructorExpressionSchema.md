[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaConstructorExpressionSchema

# Variable: RosettaConstructorExpressionSchema

> `const` **RosettaConstructorExpressionSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaConstructorExpression"`\>; `constructorTypeArgs`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCallArgument"`\>; `parameter`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `value`: `ZodLazy`\<`any`\>; \}, `$loose`\>\>\>; `implicitEmpty`: `ZodOptional`\<`ZodBoolean`\>; `typeRef`: `ZodUnion`\<readonly \[`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSuperCall"`\>; `explicitArguments`: `ZodOptional`\<`ZodBoolean`\>; `name`: `ZodLiteral`\<`"super"`\>; `rawArgs`: `ZodOptional`\<`ZodArray`\<`ZodLazy`\<`any`\>\>\>; \}, `$loose`\>, `any`\]\>; `values`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"ConstructorKeyValuePair"`\>; `key`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `value`: `ZodLazy`\<`any`\>; \}, `$loose`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:501](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/zod-schemas.ts#L501)
