[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaExternalRegularAttributeSchema

# Variable: RosettaExternalRegularAttributeSchema

> `const` **RosettaExternalRegularAttributeSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaExternalRegularAttribute"`\>; `attributeRef`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `externalRuleReferences`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RuleReferenceAnnotation"`\>; `empty`: `ZodOptional`\<`ZodBoolean`\>; `name`: `ZodLiteral`\<`"ruleReference"`\>; `path`: `ZodOptional`\<`ZodLazy`\<`any`\>\>; `reportingRule`: `ZodOptional`\<`ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>\>; \}, `$loose`\>\>\>; `externalSynonyms`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaExternalSynonym"`\>; `body`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSynonymBody"`\>; `format`: `ZodOptional`\<`ZodString`\>; `hints`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `mapper`: `ZodOptional`\<`ZodString`\>; `mappingLogic`: `ZodOptional`\<`ZodObject`\<\{ `$type`: ...; `instances`: ...; \}, `$loose`\>\>; `merge`: `ZodOptional`\<`ZodObject`\<\{ `$type`: ...; `excludePath`: ...; `name`: ...; \}, `$loose`\>\>; `metaValues`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `patternMatch`: `ZodOptional`\<`ZodString`\>; `patternReplace`: `ZodOptional`\<`ZodString`\>; `removeHtml`: `ZodOptional`\<`ZodBoolean`\>; `values`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<..., ...\>\>\>; \}, `$loose`\>; \}, `$loose`\>\>\>; `operator`: `ZodUnion`\<readonly \[`ZodLiteral`\<`"+"`\>, `ZodLiteral`\<`"-"`\>\]\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:599](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/zod-schemas.ts#L599)
