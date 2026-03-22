[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaExternalClassSchema

# Variable: RosettaExternalClassSchema

> `const` **RosettaExternalClassSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaExternalClass"`\>; `data`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `externalClassSynonyms`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaExternalClassSynonym"`\>; `metaValue`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonymValueBase"`\>; `maps`: `ZodOptional`\<`ZodNumber`\>; `name`: `ZodString`; `path`: `ZodOptional`\<`ZodString`\>; `refType`: `ZodOptional`\<`ZodUnion`\<readonly \[..., ...\]\>\>; `value`: `ZodOptional`\<`ZodNumber`\>; \}, `$loose`\>; `value`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonymValueBase"`\>; `maps`: `ZodOptional`\<`ZodNumber`\>; `name`: `ZodString`; `path`: `ZodOptional`\<`ZodString`\>; `refType`: `ZodOptional`\<`ZodUnion`\<...\>\>; `value`: `ZodOptional`\<`ZodNumber`\>; \}, `$loose`\>\>; \}, `$loose`\>\>\>; `regularAttributes`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaExternalRegularAttribute"`\>; `attributeRef`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `externalRuleReferences`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `empty`: `ZodOptional`\<...\>; `name`: `ZodLiteral`\<...\>; `path`: `ZodOptional`\<...\>; `reportingRule`: `ZodOptional`\<...\>; \}, `$loose`\>\>\>; `externalSynonyms`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `body`: `ZodObject`\<..., ...\>; \}, `$loose`\>\>\>; `operator`: `ZodUnion`\<readonly \[`ZodLiteral`\<`"+"`\>, `ZodLiteral`\<`"-"`\>\]\>; \}, `$loose`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:607](https://github.com/pradeepmouli/rune-langium/blob/53991e70a87b8cc1b1152f71c83d03782501115e/packages/core/src/generated/zod-schemas.ts#L607)
