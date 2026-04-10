[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaSynonymSourceSchema

# Variable: RosettaSynonymSourceSchema

> `const` **RosettaSynonymSourceSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonymSource"`\>; `externalClasses`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaExternalClass"`\>; `data`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `externalClassSynonyms`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `metaValue`: `ZodObject`\<..., ...\>; `value`: `ZodOptional`\<...\>; \}, `$loose`\>\>\>; `regularAttributes`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `attributeRef`: `ZodObject`\<..., ...\>; `externalRuleReferences`: `ZodOptional`\<...\>; `externalSynonyms`: `ZodOptional`\<...\>; `operator`: `ZodUnion`\<...\>; \}, `$loose`\>\>\>; \}, `$loose`\>\>\>; `externalEnums`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaExternalEnum"`\>; `enumeration`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `regularValues`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<...\>; `enumRef`: `ZodObject`\<..., ...\>; `externalEnumSynonyms`: `ZodOptional`\<...\>; `operator`: `ZodUnion`\<...\>; \}, `$loose`\>\>\>; \}, `$loose`\>\>\>; `name`: `ZodUnion`\<readonly \[`ZodString`, `ZodLiteral`\<`"condition"`\>, `ZodLiteral`\<`"source"`\>, `ZodLiteral`\<`"value"`\>, `ZodLiteral`\<`"version"`\>, `ZodLiteral`\<`"pattern"`\>, `ZodLiteral`\<`"scope"`\>\]\>; `superSources`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:825](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/zod-schemas.ts#L825)
