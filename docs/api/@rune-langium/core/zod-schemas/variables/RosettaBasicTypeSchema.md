[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaBasicTypeSchema

# Variable: RosettaBasicTypeSchema

> `const` **RosettaBasicTypeSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaBasicType"`\>; `definition`: `ZodOptional`\<`ZodString`\>; `name`: `ZodUnion`\<readonly \[`ZodString`, `ZodLiteral`\<`"condition"`\>, `ZodLiteral`\<`"source"`\>, `ZodLiteral`\<`"value"`\>, `ZodLiteral`\<`"version"`\>, `ZodLiteral`\<`"pattern"`\>, `ZodLiteral`\<`"scope"`\>\]\>; `parameters`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeParameter"`\>; `definition`: `ZodOptional`\<`ZodString`\>; `name`: `ZodString`; `typeCall`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCall"`\>; `arguments`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<..., ...\>\>\>; `type`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; \}, `$loose`\>; \}, `$loose`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:460](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/zod-schemas.ts#L460)
