// @ts-nocheck — generated file; edit generate-zod.ts to regenerate
import { z } from 'zod';
import { zRef } from 'langium-zod';

export const ReferenceSchema = z.looseObject({ $refText: z.string(), ref: z.unknown().optional() });

export const CardinalityModifierSchema = z.union([z.literal('any'), z.literal('all')]);

export const ExistsModifierSchema = z.union([z.literal('single'), z.literal('multiple')]);

export const ExternalValueOperatorSchema = z.union([z.literal('+'), z.literal('-')]);

export const NecessitySchema = z.union([z.literal('optional'), z.literal('required')]);

export const RosettaQualifiableTypeSchema = z.union([z.literal('isEvent'), z.literal('isProduct')]);

export const RosettaSynonymRefSchema = z.union([z.literal('tag'), z.literal('componentID')]);

export const BigDecimalSchema = z
  .string()
  .regex(new RegExp('^[+-]?(\\.[0-9]+|[0-9]+(\\.[0-9]*)?)([eE][+-]?[0-9]+)?$'));

export const ValidIDSchema = z.union([
  z.string().regex(new RegExp('\\^?[a-zA-Z_][a-zA-Z_0-9]*')),
  z.literal('condition'),
  z.literal('source'),
  z.literal('value'),
  z.literal('version'),
  z.literal('pattern'),
  z.literal('scope')
]);

export const IntegerSchema = z.bigint();

export const QualifiedNameSchema = z.string();

export const QualifiedNameWithWildcardSchema = z.string();

export const TypeParameterValidIDSchema = z.string();

export const TypeCallArgumentSchema = z.looseObject({
  $type: z.literal('TypeCallArgument'),
  parameter: ReferenceSchema,
  value: z.lazy(() => RosettaExpressionSchema)
});

export const TypeCallSchema = z.looseObject({
  $type: z.literal('TypeCall'),
  type: ReferenceSchema,
  arguments: z.array(TypeCallArgumentSchema).optional()
});

export const RosettaCardinalitySchema = z.looseObject({
  $type: z.literal('RosettaCardinality'),
  inf: z.number(),
  sup: z.number().optional(),
  unbounded: z.boolean().optional()
});

export const AttributeSchema = z.looseObject({
  $type: z.literal('Attribute'),
  name: ValidIDSchema,
  typeCall: TypeCallSchema,
  card: RosettaCardinalitySchema
});

export const AnnotationSchema = z.looseObject({
  $type: z.literal('Annotation'),
  name: ValidIDSchema,
  definition: z.string().optional(),
  prefix: ValidIDSchema.optional(),
  attributes: z.array(AttributeSchema).optional()
});

export const AnnotationDeepPathSchema = z.looseObject({
  $type: z.literal('AnnotationDeepPath'),
  receiver: z.lazy(() => AnnotationPathExpressionSchema),
  operator: z.literal('->>'),
  attribute: ReferenceSchema
});

export const AnnotationPathSchema = z.looseObject({
  $type: z.literal('AnnotationPath'),
  receiver: z.lazy(() => AnnotationPathExpressionSchema),
  operator: z.literal('->'),
  attribute: ReferenceSchema
});

export const AnnotationPathAttributeReferenceSchema = z.looseObject({
  $type: z.literal('AnnotationPathAttributeReference'),
  attribute: ReferenceSchema
});

export const RosettaDataReferenceSchema = z.looseObject({
  $type: z.literal('RosettaDataReference'),
  data: ReferenceSchema
});

export const RosettaAttributeReferenceSchema = z.looseObject({
  $type: z.literal('RosettaAttributeReference'),
  receiver: RosettaDataReferenceSchema,
  attribute: ReferenceSchema
});

export const AnnotationQualifierSchema = z.looseObject({
  $type: z.literal('AnnotationQualifier'),
  qualName: z.string(),
  qualValue: z.string().optional(),
  qualPath: RosettaAttributeReferenceSchema.optional()
});

export const AnnotationRefSchema = z.looseObject({
  $type: z.literal('AnnotationRef'),
  annotation: ReferenceSchema,
  attribute: ReferenceSchema.optional(),
  qualifiers: z.array(AnnotationQualifierSchema).optional()
});

export const ArithmeticOperationSchema = z.looseObject({
  $type: z.literal('ArithmeticOperation'),
  left: z.lazy(() => RosettaExpressionSchema),
  operator: z.union([z.literal('+'), z.literal('-'), z.literal('*'), z.literal('/')]),
  right: z.lazy(() => RosettaExpressionSchema)
});

export const AsKeyOperationSchema = z.looseObject({
  $type: z.literal('AsKeyOperation'),
  argument: z.lazy(() => RosettaExpressionSchema),
  operator: z.literal('as-key')
});

export const RosettaSegmentRefSchema = z.looseObject({
  $type: z.literal('RosettaSegmentRef'),
  segment: ReferenceSchema,
  segmentRef: z.string()
});

export const RegulatoryDocumentReferenceSchema = z.looseObject({
  $type: z.literal('RegulatoryDocumentReference'),
  body: ReferenceSchema,
  corpusList: z.array(ReferenceSchema),
  segments: z.array(RosettaSegmentRefSchema).optional()
});

export const DocumentRationaleSchema = z.looseObject({
  $type: z.literal('DocumentRationale'),
  rationale: z.string(),
  rationaleAuthor: z.string().optional()
});

export const RosettaDocReferenceSchema = z.looseObject({
  $type: z.literal('RosettaDocReference'),
  name: z.union([
    z.literal('regulatoryReference'),
    z.literal('docReference'),
    z.literal('regulatoryReference'),
    z.literal('docReference'),
    z.literal('regulatoryReference'),
    z.literal('docReference'),
    z.literal('regulatoryReference'),
    z.literal('docReference'),
    z.literal('regulatoryReference'),
    z.literal('docReference'),
    z.literal('regulatoryReference'),
    z.literal('docReference'),
    z.literal('regulatoryReference'),
    z.literal('docReference'),
    z.literal('regulatoryReference'),
    z.literal('docReference')
  ]),
  path: z.lazy(() => AnnotationPathExpressionSchema).optional(),
  docReference: RegulatoryDocumentReferenceSchema,
  rationales: z.array(DocumentRationaleSchema).optional(),
  structuredProvision: z.string().optional(),
  provision: z.string().optional(),
  reportedField: z.boolean().optional()
});

export const RosettaMergeSynonymValueSchema = z.looseObject({
  $type: z.literal('RosettaMergeSynonymValue'),
  name: z.string(),
  excludePath: z.string().optional()
});

export const RosettaMappingPathTestsSchema = z.looseObject({
  $type: z.literal('RosettaMappingPathTests'),
  tests: z.array(z.lazy(() => RosettaMapTestSchema))
});

export const RosettaMappingInstanceSchema = z.looseObject({
  $type: z.literal('RosettaMappingInstance'),
  when: RosettaMappingPathTestsSchema.optional(),
  default: z.boolean().optional(),
  set: z.lazy(() => RosettaMapTestExpressionSchema).optional()
});

export const RosettaMappingSchema = z.looseObject({
  $type: z.literal('RosettaMapping'),
  instances: z.array(RosettaMappingInstanceSchema)
});

export const RosettaSynonymValueBaseSchema = z.looseObject({
  $type: z.literal('RosettaSynonymValueBase'),
  name: z.string(),
  refType: RosettaSynonymRefSchema.optional(),
  value: z.number().optional(),
  path: z.string().optional(),
  maps: z.number().optional()
});

export const RosettaSynonymBodySchema = z.looseObject({
  $type: z.literal('RosettaSynonymBody'),
  hints: z.array(z.string()).optional(),
  format: z.string().optional(),
  merge: RosettaMergeSynonymValueSchema.optional(),
  mappingLogic: RosettaMappingSchema.optional(),
  metaValues: z.array(z.string()).optional(),
  patternMatch: z.string().optional(),
  patternReplace: z.string().optional(),
  removeHtml: z.boolean().optional(),
  mapper: z.string().optional(),
  values: z.array(RosettaSynonymValueBaseSchema).optional()
});

export const RosettaSynonymSchema = z.looseObject({
  $type: z.literal('RosettaSynonym'),
  sources: z.array(ReferenceSchema),
  body: RosettaSynonymBodySchema
});

export const LabelAnnotationSchema = z.looseObject({
  $type: z.literal('LabelAnnotation'),
  name: z.union([z.literal('label'), z.literal('label'), z.literal('label')]),
  label: z.string(),
  path: z.lazy(() => AnnotationPathExpressionSchema).optional(),
  deprecatedAs: z.boolean().optional()
});

export const RuleReferenceAnnotationSchema = z.looseObject({
  $type: z.literal('RuleReferenceAnnotation'),
  name: z.union([
    z.literal('ruleReference'),
    z.literal('ruleReference'),
    z.literal('ruleReference'),
    z.literal('ruleReference')
  ]),
  path: z.lazy(() => AnnotationPathExpressionSchema).optional(),
  reportingRule: ReferenceSchema.optional(),
  empty: z.boolean().optional()
});

export const ChoiceOptionSchema = z.looseObject({
  $type: z.literal('ChoiceOption'),
  typeCall: TypeCallSchema,
  definition: z.string().optional(),
  references: z.array(RosettaDocReferenceSchema).optional(),
  annotations: z.array(AnnotationRefSchema).optional(),
  synonyms: z.array(RosettaSynonymSchema).optional(),
  labels: z.array(LabelAnnotationSchema).optional(),
  ruleReferences: z.array(RuleReferenceAnnotationSchema).optional()
});

export const ChoiceSchema = z.looseObject({
  $type: z.literal('Choice'),
  name: ValidIDSchema,
  attributes: z.array(ChoiceOptionSchema).optional()
});

export const ChoiceOperationSchema = z.looseObject({
  $type: z.literal('ChoiceOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  necessity: NecessitySchema,
  operator: z.union([
    z.literal('choice'),
    z.literal('choice'),
    z.literal('choice'),
    z.literal('choice')
  ]),
  attributes: z.array(ReferenceSchema)
});

export const ClosureParameterSchema = z.looseObject({
  $type: z.literal('ClosureParameter'),
  name: z.string()
});

export const ComparisonOperationSchema = z.looseObject({
  $type: z.literal('ComparisonOperation'),
  left: z.lazy(() => RosettaExpressionSchema).optional(),
  cardMod: CardinalityModifierSchema.optional(),
  operator: z.union([
    z.literal('>='),
    z.literal('<='),
    z.literal('>'),
    z.literal('<'),
    z.literal('>='),
    z.literal('<='),
    z.literal('>'),
    z.literal('<'),
    z.literal('>='),
    z.literal('<='),
    z.literal('>'),
    z.literal('<')
  ]),
  right: z.lazy(() => RosettaExpressionSchema)
});

export const ConditionSchema = z.looseObject({
  $type: z.literal('Condition'),
  name: ValidIDSchema.optional(),
  definition: z.string().optional(),
  expression: z.lazy(() => RosettaExpressionSchema),
  references: z.array(RosettaDocReferenceSchema).optional(),
  annotations: z.array(AnnotationRefSchema).optional(),
  postCondition: z.boolean().optional()
});

export const ConstructorKeyValuePairSchema = z.looseObject({
  $type: z.literal('ConstructorKeyValuePair'),
  key: ReferenceSchema,
  value: z.lazy(() => RosettaExpressionSchema)
});

export const DataSchema = z.looseObject({
  $type: z.literal('Data'),
  name: ValidIDSchema,
  superType: ReferenceSchema.optional(),
  attributes: z.array(AttributeSchema).optional()
});

export const DefaultOperationSchema = z.looseObject({
  $type: z.literal('DefaultOperation'),
  left: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('default'), z.literal('default')]),
  right: z.lazy(() => RosettaExpressionSchema)
});

export const DistinctOperationSchema = z.looseObject({
  $type: z.literal('DistinctOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('distinct'), z.literal('distinct')])
});

export const EqualityOperationSchema = z.looseObject({
  $type: z.literal('EqualityOperation'),
  left: z.lazy(() => RosettaExpressionSchema).optional(),
  cardMod: CardinalityModifierSchema.optional(),
  operator: z.union([
    z.literal('='),
    z.literal('<>'),
    z.literal('='),
    z.literal('<>'),
    z.literal('='),
    z.literal('<>')
  ]),
  right: z.lazy(() => RosettaExpressionSchema)
});

export const InlineFunctionSchema = z.looseObject({
  $type: z.literal('InlineFunction'),
  body: z.lazy(() => RosettaExpressionSchema),
  parameters: z.array(ClosureParameterSchema).optional()
});

export const FilterOperationSchema = z.looseObject({
  $type: z.literal('FilterOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('filter'), z.literal('filter')]),
  function: InlineFunctionSchema.optional()
});

export const FirstOperationSchema = z.looseObject({
  $type: z.literal('FirstOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('first'), z.literal('first')])
});

export const FlattenOperationSchema = z.looseObject({
  $type: z.literal('FlattenOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('flatten'), z.literal('flatten')])
});

export const ImportSchema = z.looseObject({
  $type: z.literal('Import'),
  importedNamespace: QualifiedNameWithWildcardSchema,
  namespaceAlias: ValidIDSchema.optional()
});

export const JoinOperationSchema = z.looseObject({
  $type: z.literal('JoinOperation'),
  left: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('join'), z.literal('join')]),
  right: z.lazy(() => RosettaExpressionSchema).optional()
});

export const LastOperationSchema = z.looseObject({
  $type: z.literal('LastOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('last'), z.literal('last')])
});

export const ListLiteralSchema = z.looseObject({
  $type: z.literal('ListLiteral'),
  elements: z.array(z.lazy(() => RosettaExpressionSchema)).optional()
});

export const LogicalOperationSchema = z.looseObject({
  $type: z.literal('LogicalOperation'),
  left: z.lazy(() => RosettaExpressionSchema),
  operator: z.union([z.literal('or'), z.literal('and')]),
  right: z.lazy(() => RosettaExpressionSchema)
});

export const MapOperationSchema = z.looseObject({
  $type: z.literal('MapOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('extract'), z.literal('extract')]),
  function: InlineFunctionSchema.optional()
});

export const MaxOperationSchema = z.looseObject({
  $type: z.literal('MaxOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('max'), z.literal('max')]),
  function: InlineFunctionSchema.optional()
});

export const MinOperationSchema = z.looseObject({
  $type: z.literal('MinOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('min'), z.literal('min')]),
  function: InlineFunctionSchema.optional()
});

export const OneOfOperationSchema = z.looseObject({
  $type: z.literal('OneOfOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('one-of'), z.literal('one-of')])
});

export const SegmentSchema = z.looseObject({
  $type: z.literal('Segment'),
  feature: ReferenceSchema,
  get next() {
    return SegmentSchema.optional();
  }
});

export const OperationSchema = z.looseObject({
  $type: z.literal('Operation'),
  assignRoot: ReferenceSchema,
  path: SegmentSchema.optional(),
  definition: z.string().optional(),
  expression: z.lazy(() => RosettaExpressionSchema),
  add: z.boolean().optional()
});

export const ReduceOperationSchema = z.looseObject({
  $type: z.literal('ReduceOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('reduce'), z.literal('reduce')]),
  function: InlineFunctionSchema.optional()
});

export const ReverseOperationSchema = z.looseObject({
  $type: z.literal('ReverseOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('reverse'), z.literal('reverse')])
});

export const RosettaAbsentExpressionSchema = z.looseObject({
  $type: z.literal('RosettaAbsentExpression'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('absent'), z.literal('absent')])
});

export const TypeParameterSchema = z.looseObject({
  $type: z.literal('TypeParameter'),
  name: TypeParameterValidIDSchema,
  typeCall: TypeCallSchema,
  definition: z.string().optional()
});

export const RosettaBasicTypeSchema = z.looseObject({
  $type: z.literal('RosettaBasicType'),
  name: ValidIDSchema,
  parameters: z.array(TypeParameterSchema).optional(),
  definition: z.string().optional()
});

export const RosettaBodySchema = z.looseObject({
  $type: z.literal('RosettaBody'),
  bodyType: z.string(),
  name: ValidIDSchema,
  definition: z.string().optional()
});

export const RosettaBooleanLiteralSchema = z.looseObject({
  $type: z.literal('RosettaBooleanLiteral'),
  value: z.boolean().optional()
});

export const RosettaClassSynonymSchema = z.looseObject({
  $type: z.literal('RosettaClassSynonym'),
  sources: z.array(ReferenceSchema),
  value: RosettaSynonymValueBaseSchema.optional(),
  metaValue: RosettaSynonymValueBaseSchema.optional()
});

export const RosettaConditionalExpressionSchema = z.looseObject({
  $type: z.literal('RosettaConditionalExpression'),
  if: z.lazy(() => RosettaExpressionSchema).optional(),
  ifthen: z.lazy(() => RosettaExpressionSchema).optional(),
  full: z.boolean().optional(),
  elsethen: z.lazy(() => RosettaExpressionSchema).optional()
});

export const RosettaSuperCallSchema = z.looseObject({
  $type: z.literal('RosettaSuperCall'),
  name: z.union([z.literal('super'), z.literal('super'), z.literal('super'), z.literal('super')]),
  explicitArguments: z.boolean().optional(),
  rawArgs: z.array(z.lazy(() => RosettaExpressionSchema)).optional()
});

export const RosettaSymbolReferenceSchema = z.looseObject({
  $type: z.literal('RosettaSymbolReference'),
  symbol: ReferenceSchema,
  explicitArguments: z.boolean().optional(),
  rawArgs: z.array(z.lazy(() => RosettaExpressionSchema)).optional()
});

export const RosettaConstructorExpressionSchema = z.looseObject({
  $type: z.literal('RosettaConstructorExpression'),
  typeRef: z.union([RosettaSuperCallSchema, RosettaSymbolReferenceSchema]),
  constructorTypeArgs: z.array(TypeCallArgumentSchema).optional(),
  implicitEmpty: z.boolean().optional(),
  values: z.array(ConstructorKeyValuePairSchema).optional()
});

export const RosettaContainsExpressionSchema = z.looseObject({
  $type: z.literal('RosettaContainsExpression'),
  left: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('contains'), z.literal('contains')]),
  right: z.lazy(() => RosettaExpressionSchema)
});

export const RosettaCorpusSchema = z.looseObject({
  $type: z.literal('RosettaCorpus'),
  corpusType: z.string(),
  displayName: z.string().optional(),
  body: ReferenceSchema.optional(),
  name: ValidIDSchema,
  definition: z.string().optional()
});

export const RosettaCountOperationSchema = z.looseObject({
  $type: z.literal('RosettaCountOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('count'), z.literal('count')])
});

export const RosettaDeepFeatureCallSchema = z.looseObject({
  $type: z.literal('RosettaDeepFeatureCall'),
  receiver: z.lazy(() => RosettaExpressionSchema),
  feature: ReferenceSchema.optional()
});

export const RosettaDisjointExpressionSchema = z.looseObject({
  $type: z.literal('RosettaDisjointExpression'),
  left: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('disjoint'), z.literal('disjoint')]),
  right: z.lazy(() => RosettaExpressionSchema)
});

export const RosettaEnumSynonymSchema = z.looseObject({
  $type: z.literal('RosettaEnumSynonym'),
  sources: z.array(ReferenceSchema).optional(),
  synonymValue: z.string(),
  definition: z.string().optional(),
  patternMatch: z.string().optional(),
  patternReplace: z.string().optional(),
  removeHtml: z.boolean().optional()
});

export const RosettaEnumValueSchema = z.looseObject({
  $type: z.literal('RosettaEnumValue'),
  name: ValidIDSchema,
  display: z.string().optional(),
  definition: z.string().optional(),
  references: z.array(RosettaDocReferenceSchema).optional(),
  annotations: z.array(AnnotationRefSchema).optional(),
  enumSynonyms: z.array(RosettaEnumSynonymSchema).optional()
});

export const RosettaEnumerationSchema = z.object({
  $type: z.literal('RosettaEnumeration'),
  name: ValidIDSchema,
  parent: ReferenceSchema.optional(),
  enumValues: z.array(RosettaEnumValueSchema)
});

export const RosettaEnumValueReferenceSchema = z.looseObject({
  $type: z.literal('RosettaEnumValueReference'),
  enumeration: ReferenceSchema,
  value: ReferenceSchema
});

export const RosettaExistsExpressionSchema = z.looseObject({
  $type: z.literal('RosettaExistsExpression'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  modifier: ExistsModifierSchema.optional(),
  operator: z.union([z.literal('exists'), z.literal('exists')])
});

export const RosettaExternalClassSynonymSchema = z.looseObject({
  $type: z.literal('RosettaExternalClassSynonym'),
  value: RosettaSynonymValueBaseSchema.optional(),
  metaValue: RosettaSynonymValueBaseSchema
});

export const RosettaExternalSynonymSchema = z.looseObject({
  $type: z.literal('RosettaExternalSynonym'),
  body: RosettaSynonymBodySchema
});

export const RosettaExternalRegularAttributeSchema = z.looseObject({
  $type: z.literal('RosettaExternalRegularAttribute'),
  operator: ExternalValueOperatorSchema,
  attributeRef: ReferenceSchema,
  externalSynonyms: z.array(RosettaExternalSynonymSchema).optional(),
  externalRuleReferences: z.array(RuleReferenceAnnotationSchema).optional()
});

export const RosettaExternalClassSchema = z.looseObject({
  $type: z.literal('RosettaExternalClass'),
  data: ReferenceSchema,
  externalClassSynonyms: z.array(RosettaExternalClassSynonymSchema).optional(),
  regularAttributes: z.array(RosettaExternalRegularAttributeSchema).optional()
});

export const RosettaExternalEnumValueSchema = z.looseObject({
  $type: z.literal('RosettaExternalEnumValue'),
  operator: ExternalValueOperatorSchema,
  enumRef: ReferenceSchema,
  externalEnumSynonyms: z.array(RosettaEnumSynonymSchema).optional()
});

export const RosettaExternalEnumSchema = z.looseObject({
  $type: z.literal('RosettaExternalEnum'),
  enumeration: ReferenceSchema,
  regularValues: z.array(RosettaExternalEnumValueSchema).optional()
});

export const RosettaParameterSchema = z.looseObject({
  $type: z.literal('RosettaParameter'),
  name: ValidIDSchema,
  typeCall: TypeCallSchema,
  isArray: z.boolean().optional()
});

export const RosettaExternalFunctionSchema = z.looseObject({
  $type: z.literal('RosettaExternalFunction'),
  name: ValidIDSchema,
  typeCall: TypeCallSchema,
  definition: z.string().optional(),
  parameters: z.array(RosettaParameterSchema).optional()
});

export const RosettaExternalRuleSourceSchema = z.looseObject({
  $type: z.literal('RosettaExternalRuleSource'),
  name: ValidIDSchema,
  externalClasses: z.array(RosettaExternalClassSchema).optional(),
  externalEnums: z.array(RosettaExternalEnumSchema).optional(),
  superSources: z.array(ReferenceSchema).optional()
});

export const RosettaFeatureCallSchema = z.looseObject({
  $type: z.literal('RosettaFeatureCall'),
  receiver: z.lazy(() => RosettaExpressionSchema),
  feature: ReferenceSchema.optional()
});

export const RosettaFunctionSchema = z.looseObject({
  $type: z.literal('RosettaFunction'),
  name: ValidIDSchema,
  inputs: z.array(AttributeSchema).optional(),
  output: AttributeSchema.optional()
});

export const RosettaImplicitVariableSchema = z.looseObject({
  $type: z.literal('RosettaImplicitVariable'),
  name: z.union([z.literal('item'), z.literal('item')])
});

export const RosettaIntLiteralSchema = z.looseObject({
  $type: z.literal('RosettaIntLiteral'),
  value: IntegerSchema
});

export const RosettaMapPathValueSchema = z.looseObject({
  $type: z.literal('RosettaMapPathValue'),
  path: z.string()
});

export const RosettaMapPathSchema = z.looseObject({
  $type: z.literal('RosettaMapPath'),
  path: RosettaMapPathValueSchema
});

export const RosettaMapRosettaPathSchema = z.looseObject({
  $type: z.literal('RosettaMapRosettaPath'),
  path: RosettaAttributeReferenceSchema
});

export const RosettaMapTestAbsentExpressionSchema = z.looseObject({
  $type: z.literal('RosettaMapTestAbsentExpression'),
  argument: RosettaMapPathValueSchema
});

export const RosettaMapTestEqualityOperationSchema = z.looseObject({
  $type: z.literal('RosettaMapTestEqualityOperation'),
  left: RosettaMapPathValueSchema,
  operator: z.union([z.literal('='), z.literal('<>')]),
  right: z.lazy(() => RosettaMapTestExpressionSchema)
});

export const RosettaMapTestExistsExpressionSchema = z.looseObject({
  $type: z.literal('RosettaMapTestExistsExpression'),
  argument: RosettaMapPathValueSchema
});

export const RosettaMapTestFuncSchema = z.looseObject({
  $type: z.literal('RosettaMapTestFunc'),
  func: ReferenceSchema,
  predicatePath: RosettaMapPathValueSchema.optional()
});

export const RosettaMetaTypeSchema = z.looseObject({
  $type: z.literal('RosettaMetaType'),
  name: ValidIDSchema,
  typeCall: TypeCallSchema
});

export const RosettaScopeSchema = z.looseObject({
  $type: z.literal('RosettaScope'),
  name: ValidIDSchema,
  definition: z.string().optional()
});

export const RosettaQualifiableConfigurationSchema = z.looseObject({
  $type: z.literal('RosettaQualifiableConfiguration'),
  qType: RosettaQualifiableTypeSchema,
  rosettaClass: ReferenceSchema
});

export const RosettaModelSchema = z.looseObject({
  $type: z.literal('RosettaModel'),
  overridden: z.boolean().optional(),
  name: z.union([QualifiedNameSchema, z.string()]),
  definition: z.string().optional(),
  scope: RosettaScopeSchema.optional(),
  version: z.string().optional(),
  imports: z.array(ImportSchema).optional(),
  configurations: z.array(RosettaQualifiableConfigurationSchema).optional(),
  elements: z.array(z.lazy(() => RosettaRootElementSchema)).optional()
});

export const RosettaNumberLiteralSchema = z.looseObject({
  $type: z.literal('RosettaNumberLiteral'),
  value: BigDecimalSchema
});

export const RosettaOnlyElementSchema = z.looseObject({
  $type: z.literal('RosettaOnlyElement'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('only-element'), z.literal('only-element')])
});

export const RosettaOnlyExistsExpressionSchema = z.looseObject({
  $type: z.literal('RosettaOnlyExistsExpression'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.literal('exists').optional(),
  args: z.array(z.lazy(() => RosettaExpressionSchema)).optional()
});

export const RosettaRecordFeatureSchema = z.looseObject({
  $type: z.literal('RosettaRecordFeature'),
  name: ValidIDSchema,
  typeCall: TypeCallSchema
});

export const RosettaRecordTypeSchema = z.looseObject({
  $type: z.literal('RosettaRecordType'),
  name: ValidIDSchema,
  definition: z.string().optional(),
  features: z.array(RosettaRecordFeatureSchema).optional()
});

export const RosettaReportSchema = z.looseObject({
  $type: z.literal('RosettaReport'),
  regulatoryBody: RegulatoryDocumentReferenceSchema,
  inputType: TypeCallSchema,
  eligibilityRules: z.array(ReferenceSchema),
  reportingStandard: ReferenceSchema.optional(),
  reportType: ReferenceSchema,
  ruleSource: ReferenceSchema.optional()
});

export const RosettaRuleSchema = z.looseObject({
  $type: z.literal('RosettaRule'),
  name: ValidIDSchema,
  eligibility: z.boolean().optional(),
  input: TypeCallSchema.optional(),
  definition: z.string().optional(),
  references: z.array(RosettaDocReferenceSchema).optional(),
  expression: z.lazy(() => RosettaExpressionSchema),
  identifier: z.string().optional()
});

export const RosettaSegmentSchema = z.looseObject({
  $type: z.literal('RosettaSegment'),
  name: z.union([
    ValidIDSchema,
    z.literal('rationale'),
    z.literal('rationale_author'),
    z.literal('structured_provision')
  ])
});

export const RosettaStringLiteralSchema = z.looseObject({
  $type: z.literal('RosettaStringLiteral'),
  value: z.string()
});

export const RosettaSynonymSourceSchema = z.looseObject({
  $type: z.literal('RosettaSynonymSource'),
  name: ValidIDSchema,
  superSources: z.array(ReferenceSchema).optional(),
  externalClasses: z.array(RosettaExternalClassSchema).optional(),
  externalEnums: z.array(RosettaExternalEnumSchema).optional()
});

export const RosettaTypeAliasSchema = z.looseObject({
  $type: z.literal('RosettaTypeAlias'),
  name: ValidIDSchema,
  parameters: z.array(TypeParameterSchema).optional(),
  definition: z.string().optional(),
  typeCall: TypeCallSchema,
  conditions: z.array(ConditionSchema).optional()
});

export const ShortcutDeclarationSchema = z.looseObject({
  $type: z.literal('ShortcutDeclaration'),
  name: ValidIDSchema,
  definition: z.string().optional(),
  expression: z.lazy(() => RosettaExpressionSchema)
});

export const SortOperationSchema = z.looseObject({
  $type: z.literal('SortOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('sort'), z.literal('sort')]),
  function: InlineFunctionSchema.optional()
});

export const SumOperationSchema = z.looseObject({
  $type: z.literal('SumOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('sum'), z.literal('sum')])
});

export const SwitchCaseGuardSchema = z.looseObject({
  $type: z.literal('SwitchCaseGuard'),
  literalGuard: z.lazy(() => RosettaLiteralSchema).optional(),
  referenceGuard: ReferenceSchema.optional()
});

export const SwitchCaseOrDefaultSchema = z.looseObject({
  $type: z.literal('SwitchCaseOrDefault'),
  expression: z.lazy(() => RosettaExpressionSchema),
  guard: SwitchCaseGuardSchema.optional()
});

export const SwitchOperationSchema = z.looseObject({
  $type: z.literal('SwitchOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([
    z.literal('switch'),
    z.literal('switch'),
    z.literal('switch'),
    z.literal('switch')
  ]),
  cases: z.array(SwitchCaseOrDefaultSchema)
});

export const ThenOperationSchema = z.looseObject({
  $type: z.literal('ThenOperation'),
  argument: z.lazy(() => RosettaExpressionSchema),
  operator: z.literal('then'),
  function: InlineFunctionSchema.optional()
});

export const ToDateOperationSchema = z.looseObject({
  $type: z.literal('ToDateOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('to-date'), z.literal('to-date')])
});

export const ToDateTimeOperationSchema = z.looseObject({
  $type: z.literal('ToDateTimeOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('to-date-time'), z.literal('to-date-time')])
});

export const ToEnumOperationSchema = z.looseObject({
  $type: z.literal('ToEnumOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('to-enum'), z.literal('to-enum')]),
  enumeration: ReferenceSchema
});

export const ToIntOperationSchema = z.looseObject({
  $type: z.literal('ToIntOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('to-int'), z.literal('to-int')])
});

export const ToNumberOperationSchema = z.looseObject({
  $type: z.literal('ToNumberOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('to-number'), z.literal('to-number')])
});

export const ToStringOperationSchema = z.looseObject({
  $type: z.literal('ToStringOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('to-string'), z.literal('to-string')])
});

export const ToTimeOperationSchema = z.looseObject({
  $type: z.literal('ToTimeOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('to-time'), z.literal('to-time')])
});

export const ToZonedDateTimeOperationSchema = z.looseObject({
  $type: z.literal('ToZonedDateTimeOperation'),
  argument: z.lazy(() => RosettaExpressionSchema).optional(),
  operator: z.union([z.literal('to-zoned-date-time'), z.literal('to-zoned-date-time')])
});

export const WithMetaEntrySchema = z.looseObject({
  $type: z.literal('WithMetaEntry'),
  key: ReferenceSchema,
  value: z.lazy(() => RosettaExpressionSchema)
});

export const WithMetaOperationSchema = z.looseObject({
  $type: z.literal('WithMetaOperation'),
  argument: z.lazy(() => RosettaExpressionSchema),
  operator: z.union([
    z.literal('with-meta'),
    z.literal('with-meta'),
    z.literal('with-meta'),
    z.literal('with-meta')
  ]),
  entries: z.array(WithMetaEntrySchema).optional()
});

export const AnnotationPathExpressionSchema = z.discriminatedUnion('$type', [
  RosettaImplicitVariableSchema,
  AnnotationPathSchema,
  AnnotationDeepPathSchema,
  AnnotationPathAttributeReferenceSchema
]);

export const AssignPathRootSchema = z.discriminatedUnion('$type', [
  AttributeSchema,
  ShortcutDeclarationSchema
]);

export const RosettaCallableWithArgsSchema = z.discriminatedUnion('$type', [
  RosettaFunctionSchema,
  RosettaExternalFunctionSchema,
  RosettaRuleSchema
]);

export const RosettaExpressionSchema = z.discriminatedUnion('$type', [
  RosettaSymbolReferenceSchema,
  AsKeyOperationSchema,
  ThenOperationSchema,
  LogicalOperationSchema,
  ComparisonOperationSchema,
  EqualityOperationSchema,
  ArithmeticOperationSchema,
  RosettaContainsExpressionSchema,
  RosettaDisjointExpressionSchema,
  DefaultOperationSchema,
  JoinOperationSchema,
  RosettaFeatureCallSchema,
  RosettaDeepFeatureCallSchema,
  RosettaExistsExpressionSchema,
  RosettaAbsentExpressionSchema,
  RosettaOnlyElementSchema,
  RosettaOnlyExistsExpressionSchema,
  RosettaCountOperationSchema,
  FlattenOperationSchema,
  DistinctOperationSchema,
  ReverseOperationSchema,
  FirstOperationSchema,
  LastOperationSchema,
  SumOperationSchema,
  OneOfOperationSchema,
  ToStringOperationSchema,
  ToNumberOperationSchema,
  ToIntOperationSchema,
  ToTimeOperationSchema,
  ToEnumOperationSchema,
  ToDateOperationSchema,
  ToDateTimeOperationSchema,
  ToZonedDateTimeOperationSchema,
  ChoiceOperationSchema,
  SwitchOperationSchema,
  WithMetaOperationSchema,
  SortOperationSchema,
  MinOperationSchema,
  MaxOperationSchema,
  ReduceOperationSchema,
  FilterOperationSchema,
  MapOperationSchema,
  RosettaSuperCallSchema,
  RosettaConstructorExpressionSchema,
  ListLiteralSchema,
  RosettaImplicitVariableSchema,
  RosettaConditionalExpressionSchema
]);

export const RosettaFeatureSchema = z.discriminatedUnion('$type', [
  AttributeSchema,
  RosettaRecordFeatureSchema,
  RosettaEnumValueSchema,
  RosettaMetaTypeSchema
]);

export const RosettaLiteralSchema = z.discriminatedUnion('$type', [
  RosettaBooleanLiteralSchema,
  RosettaStringLiteralSchema,
  RosettaNumberLiteralSchema,
  RosettaIntLiteralSchema
]);

export const RosettaMapTestSchema = z.discriminatedUnion('$type', [
  RosettaMapPathSchema,
  RosettaMapRosettaPathSchema,
  RosettaMapTestFuncSchema
]);

export const RosettaMapTestExpressionSchema = z.discriminatedUnion('$type', [
  RosettaEnumValueReferenceSchema,
  RosettaMapTestExistsExpressionSchema,
  RosettaMapTestAbsentExpressionSchema,
  RosettaMapTestEqualityOperationSchema,
  RosettaMapPathValueSchema
]);

export const RosettaRootElementSchema = z.discriminatedUnion('$type', [
  AnnotationSchema,
  DataSchema,
  ChoiceSchema,
  RosettaEnumerationSchema,
  RosettaFunctionSchema,
  RosettaBasicTypeSchema,
  RosettaSynonymSourceSchema,
  RosettaRecordTypeSchema,
  RosettaExternalFunctionSchema,
  RosettaTypeAliasSchema,
  RosettaMetaTypeSchema,
  RosettaBodySchema,
  RosettaCorpusSchema,
  RosettaSegmentSchema,
  RosettaExternalRuleSourceSchema,
  RosettaReportSchema,
  RosettaRuleSchema
]);

export const RosettaSymbolSchema = z.discriminatedUnion('$type', [
  AttributeSchema,
  ShortcutDeclarationSchema,
  RosettaFunctionSchema,
  RosettaExternalFunctionSchema,
  RosettaRuleSchema,
  TypeParameterSchema,
  RosettaMetaTypeSchema,
  ClosureParameterSchema,
  RosettaEnumerationSchema,
  RosettaEnumValueSchema,
  RosettaParameterSchema
]);

export const RosettaTypeSchema = z.discriminatedUnion('$type', [
  DataSchema,
  ChoiceSchema,
  RosettaBasicTypeSchema,
  RosettaRecordTypeSchema,
  RosettaEnumerationSchema,
  RosettaTypeAliasSchema
]);

export const RosettaTypedFeatureSchema = z.discriminatedUnion('$type', [
  AttributeSchema,
  RosettaRecordFeatureSchema
]);

export const SwitchCaseTargetSchema = z.discriminatedUnion('$type', [
  DataSchema,
  ChoiceSchema,
  RosettaEnumValueSchema
]);

export const AstNodeSchema = z.discriminatedUnion('$type', [
  TypeCallArgumentSchema,
  TypeCallSchema,
  RosettaCardinalitySchema,
  AttributeSchema,
  AnnotationSchema,
  AnnotationDeepPathSchema,
  AnnotationPathSchema,
  AnnotationPathAttributeReferenceSchema,
  RosettaDataReferenceSchema,
  RosettaAttributeReferenceSchema,
  AnnotationQualifierSchema,
  AnnotationRefSchema,
  ArithmeticOperationSchema,
  AsKeyOperationSchema,
  RosettaSegmentRefSchema,
  RegulatoryDocumentReferenceSchema,
  DocumentRationaleSchema,
  RosettaDocReferenceSchema,
  RosettaMergeSynonymValueSchema,
  RosettaMappingPathTestsSchema,
  RosettaMappingInstanceSchema,
  RosettaMappingSchema,
  RosettaSynonymValueBaseSchema,
  RosettaSynonymBodySchema,
  RosettaSynonymSchema,
  LabelAnnotationSchema,
  RuleReferenceAnnotationSchema,
  ChoiceOptionSchema,
  ChoiceSchema,
  ChoiceOperationSchema,
  ClosureParameterSchema,
  ComparisonOperationSchema,
  ConditionSchema,
  ConstructorKeyValuePairSchema,
  DataSchema,
  DefaultOperationSchema,
  DistinctOperationSchema,
  EqualityOperationSchema,
  InlineFunctionSchema,
  FilterOperationSchema,
  FirstOperationSchema,
  FlattenOperationSchema,
  ImportSchema,
  JoinOperationSchema,
  LastOperationSchema,
  ListLiteralSchema,
  LogicalOperationSchema,
  MapOperationSchema,
  MaxOperationSchema,
  MinOperationSchema,
  OneOfOperationSchema,
  SegmentSchema,
  OperationSchema,
  ReduceOperationSchema,
  ReverseOperationSchema,
  RosettaAbsentExpressionSchema,
  TypeParameterSchema,
  RosettaBasicTypeSchema,
  RosettaBodySchema,
  RosettaBooleanLiteralSchema,
  RosettaClassSynonymSchema,
  RosettaConditionalExpressionSchema,
  RosettaSuperCallSchema,
  RosettaSymbolReferenceSchema,
  RosettaConstructorExpressionSchema,
  RosettaContainsExpressionSchema,
  RosettaCorpusSchema,
  RosettaCountOperationSchema,
  RosettaDeepFeatureCallSchema,
  RosettaDisjointExpressionSchema,
  RosettaEnumSynonymSchema,
  RosettaEnumValueSchema,
  RosettaEnumerationSchema,
  RosettaEnumValueReferenceSchema,
  RosettaExistsExpressionSchema,
  RosettaExternalClassSynonymSchema,
  RosettaExternalSynonymSchema,
  RosettaExternalRegularAttributeSchema,
  RosettaExternalClassSchema,
  RosettaExternalEnumValueSchema,
  RosettaExternalEnumSchema,
  RosettaParameterSchema,
  RosettaExternalFunctionSchema,
  RosettaExternalRuleSourceSchema,
  RosettaFeatureCallSchema,
  RosettaFunctionSchema,
  RosettaImplicitVariableSchema,
  RosettaIntLiteralSchema,
  RosettaMapPathValueSchema,
  RosettaMapPathSchema,
  RosettaMapRosettaPathSchema,
  RosettaMapTestAbsentExpressionSchema,
  RosettaMapTestEqualityOperationSchema,
  RosettaMapTestExistsExpressionSchema,
  RosettaMapTestFuncSchema,
  RosettaMetaTypeSchema,
  RosettaScopeSchema,
  RosettaQualifiableConfigurationSchema,
  RosettaModelSchema,
  RosettaNumberLiteralSchema,
  RosettaOnlyElementSchema,
  RosettaOnlyExistsExpressionSchema,
  RosettaRecordFeatureSchema,
  RosettaRecordTypeSchema,
  RosettaReportSchema,
  RosettaRuleSchema,
  RosettaSegmentSchema,
  RosettaStringLiteralSchema,
  RosettaSynonymSourceSchema,
  RosettaTypeAliasSchema,
  ShortcutDeclarationSchema,
  SortOperationSchema,
  SumOperationSchema,
  SwitchCaseGuardSchema,
  SwitchCaseOrDefaultSchema,
  SwitchOperationSchema,
  ThenOperationSchema,
  ToDateOperationSchema,
  ToDateTimeOperationSchema,
  ToEnumOperationSchema,
  ToIntOperationSchema,
  ToNumberOperationSchema,
  ToStringOperationSchema,
  ToTimeOperationSchema,
  ToZonedDateTimeOperationSchema,
  WithMetaEntrySchema,
  WithMetaOperationSchema
]);

export interface TypeCallArgumentSchemaRefs {
  TypeParameter?: string[];
}

export function createTypeCallArgumentSchema(refs: TypeCallArgumentSchemaRefs = {}) {
  return TypeCallArgumentSchema.extend({
    parameter: ReferenceSchema.extend({ $refText: zRef(() => refs.TypeParameter ?? []) })
  });
}

export interface TypeCallSchemaRefs {
  RosettaType?: string[];
}

export function createTypeCallSchema(refs: TypeCallSchemaRefs = {}) {
  return TypeCallSchema.extend({
    type: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaType ?? []) })
  });
}

export interface AnnotationDeepPathSchemaRefs {
  Attribute?: string[];
}

export function createAnnotationDeepPathSchema(refs: AnnotationDeepPathSchemaRefs = {}) {
  return AnnotationDeepPathSchema.extend({
    attribute: ReferenceSchema.extend({ $refText: zRef(() => refs.Attribute ?? []) })
  });
}

export interface AnnotationPathSchemaRefs {
  Attribute?: string[];
}

export function createAnnotationPathSchema(refs: AnnotationPathSchemaRefs = {}) {
  return AnnotationPathSchema.extend({
    attribute: ReferenceSchema.extend({ $refText: zRef(() => refs.Attribute ?? []) })
  });
}

export interface AnnotationPathAttributeReferenceSchemaRefs {
  Attribute?: string[];
}

export function createAnnotationPathAttributeReferenceSchema(
  refs: AnnotationPathAttributeReferenceSchemaRefs = {}
) {
  return AnnotationPathAttributeReferenceSchema.extend({
    attribute: ReferenceSchema.extend({ $refText: zRef(() => refs.Attribute ?? []) })
  });
}

export interface RosettaDataReferenceSchemaRefs {
  Data?: string[];
}

export function createRosettaDataReferenceSchema(refs: RosettaDataReferenceSchemaRefs = {}) {
  return RosettaDataReferenceSchema.extend({
    data: ReferenceSchema.extend({ $refText: zRef(() => refs.Data ?? []) })
  });
}

export interface RosettaAttributeReferenceSchemaRefs {
  Attribute?: string[];
}

export function createRosettaAttributeReferenceSchema(
  refs: RosettaAttributeReferenceSchemaRefs = {}
) {
  return RosettaAttributeReferenceSchema.extend({
    attribute: ReferenceSchema.extend({ $refText: zRef(() => refs.Attribute ?? []) })
  });
}

export interface AnnotationRefSchemaRefs {
  Annotation?: string[];
  Attribute?: string[];
}

export function createAnnotationRefSchema(refs: AnnotationRefSchemaRefs = {}) {
  return AnnotationRefSchema.extend({
    annotation: ReferenceSchema.extend({ $refText: zRef(() => refs.Annotation ?? []) }),
    attribute: ReferenceSchema.extend({ $refText: zRef(() => refs.Attribute ?? []) }).optional()
  });
}

export interface RosettaSegmentRefSchemaRefs {
  RosettaSegment?: string[];
}

export function createRosettaSegmentRefSchema(refs: RosettaSegmentRefSchemaRefs = {}) {
  return RosettaSegmentRefSchema.extend({
    segment: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaSegment ?? []) })
  });
}

export interface RegulatoryDocumentReferenceSchemaRefs {
  RosettaBody?: string[];
  RosettaCorpus?: string[];
}

export function createRegulatoryDocumentReferenceSchema(
  refs: RegulatoryDocumentReferenceSchemaRefs = {}
) {
  return RegulatoryDocumentReferenceSchema.extend({
    body: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaBody ?? []) }),
    corpusList: z.array(ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaCorpus ?? []) }))
  });
}

export interface RosettaSynonymSchemaRefs {
  RosettaSynonymSource?: string[];
}

export function createRosettaSynonymSchema(refs: RosettaSynonymSchemaRefs = {}) {
  return RosettaSynonymSchema.extend({
    sources: z.array(
      ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaSynonymSource ?? []) })
    )
  });
}

export interface RuleReferenceAnnotationSchemaRefs {
  RosettaRule?: string[];
}

export function createRuleReferenceAnnotationSchema(refs: RuleReferenceAnnotationSchemaRefs = {}) {
  return RuleReferenceAnnotationSchema.extend({
    reportingRule: ReferenceSchema.extend({
      $refText: zRef(() => refs.RosettaRule ?? [])
    }).optional()
  });
}

export interface ChoiceOperationSchemaRefs {
  Attribute?: string[];
}

export function createChoiceOperationSchema(refs: ChoiceOperationSchemaRefs = {}) {
  return ChoiceOperationSchema.extend({
    attributes: z.array(ReferenceSchema.extend({ $refText: zRef(() => refs.Attribute ?? []) }))
  });
}

export interface ConstructorKeyValuePairSchemaRefs {
  RosettaFeature?: string[];
}

export function createConstructorKeyValuePairSchema(refs: ConstructorKeyValuePairSchemaRefs = {}) {
  return ConstructorKeyValuePairSchema.extend({
    key: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaFeature ?? []) })
  });
}

export interface DataSchemaRefs {
  Data?: string[];
}

export function createDataSchema(refs: DataSchemaRefs = {}) {
  return DataSchema.extend({
    superType: ReferenceSchema.extend({ $refText: zRef(() => refs.Data ?? []) }).optional()
  });
}

export interface SegmentSchemaRefs {
  RosettaTypedFeature?: string[];
}

export function createSegmentSchema(refs: SegmentSchemaRefs = {}) {
  return SegmentSchema.extend({
    feature: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaTypedFeature ?? []) })
  });
}

export interface OperationSchemaRefs {
  AssignPathRoot?: string[];
}

export function createOperationSchema(refs: OperationSchemaRefs = {}) {
  return OperationSchema.extend({
    assignRoot: ReferenceSchema.extend({ $refText: zRef(() => refs.AssignPathRoot ?? []) })
  });
}

export interface RosettaClassSynonymSchemaRefs {
  RosettaSynonymSource?: string[];
}

export function createRosettaClassSynonymSchema(refs: RosettaClassSynonymSchemaRefs = {}) {
  return RosettaClassSynonymSchema.extend({
    sources: z.array(
      ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaSynonymSource ?? []) })
    )
  });
}

export interface RosettaSymbolReferenceSchemaRefs {
  RosettaSymbol?: string[];
}

export function createRosettaSymbolReferenceSchema(refs: RosettaSymbolReferenceSchemaRefs = {}) {
  return RosettaSymbolReferenceSchema.extend({
    symbol: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaSymbol ?? []) })
  });
}

export interface RosettaCorpusSchemaRefs {
  RosettaBody?: string[];
}

export function createRosettaCorpusSchema(refs: RosettaCorpusSchemaRefs = {}) {
  return RosettaCorpusSchema.extend({
    body: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaBody ?? []) }).optional()
  });
}

export interface RosettaDeepFeatureCallSchemaRefs {
  Attribute?: string[];
}

export function createRosettaDeepFeatureCallSchema(refs: RosettaDeepFeatureCallSchemaRefs = {}) {
  return RosettaDeepFeatureCallSchema.extend({
    feature: ReferenceSchema.extend({ $refText: zRef(() => refs.Attribute ?? []) }).optional()
  });
}

export interface RosettaEnumSynonymSchemaRefs {
  RosettaSynonymSource?: string[];
}

export function createRosettaEnumSynonymSchema(refs: RosettaEnumSynonymSchemaRefs = {}) {
  return RosettaEnumSynonymSchema.extend({
    sources: z
      .array(ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaSynonymSource ?? []) }))
      .optional()
  });
}

export interface RosettaEnumerationSchemaRefs {
  RosettaEnumeration?: string[];
}

export function createRosettaEnumerationSchema(refs: RosettaEnumerationSchemaRefs = {}) {
  return RosettaEnumerationSchema.extend({
    parent: ReferenceSchema.extend({
      $refText: zRef(() => refs.RosettaEnumeration ?? [])
    }).optional()
  });
}

export interface RosettaEnumValueReferenceSchemaRefs {
  RosettaEnumeration?: string[];
  RosettaEnumValue?: string[];
}

export function createRosettaEnumValueReferenceSchema(
  refs: RosettaEnumValueReferenceSchemaRefs = {}
) {
  return RosettaEnumValueReferenceSchema.extend({
    enumeration: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaEnumeration ?? []) }),
    value: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaEnumValue ?? []) })
  });
}

export interface RosettaExternalRegularAttributeSchemaRefs {
  RosettaFeature?: string[];
}

export function createRosettaExternalRegularAttributeSchema(
  refs: RosettaExternalRegularAttributeSchemaRefs = {}
) {
  return RosettaExternalRegularAttributeSchema.extend({
    attributeRef: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaFeature ?? []) })
  });
}

export interface RosettaExternalClassSchemaRefs {
  Data?: string[];
}

export function createRosettaExternalClassSchema(refs: RosettaExternalClassSchemaRefs = {}) {
  return RosettaExternalClassSchema.extend({
    data: ReferenceSchema.extend({ $refText: zRef(() => refs.Data ?? []) })
  });
}

export interface RosettaExternalEnumValueSchemaRefs {
  RosettaEnumValue?: string[];
}

export function createRosettaExternalEnumValueSchema(
  refs: RosettaExternalEnumValueSchemaRefs = {}
) {
  return RosettaExternalEnumValueSchema.extend({
    enumRef: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaEnumValue ?? []) })
  });
}

export interface RosettaExternalEnumSchemaRefs {
  RosettaEnumeration?: string[];
}

export function createRosettaExternalEnumSchema(refs: RosettaExternalEnumSchemaRefs = {}) {
  return RosettaExternalEnumSchema.extend({
    enumeration: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaEnumeration ?? []) })
  });
}

export interface RosettaExternalRuleSourceSchemaRefs {
  RosettaExternalRuleSource?: string[];
}

export function createRosettaExternalRuleSourceSchema(
  refs: RosettaExternalRuleSourceSchemaRefs = {}
) {
  return RosettaExternalRuleSourceSchema.extend({
    superSources: z
      .array(ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaExternalRuleSource ?? []) }))
      .optional()
  });
}

export interface RosettaFeatureCallSchemaRefs {
  RosettaFeature?: string[];
}

export function createRosettaFeatureCallSchema(refs: RosettaFeatureCallSchemaRefs = {}) {
  return RosettaFeatureCallSchema.extend({
    feature: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaFeature ?? []) }).optional()
  });
}

export interface RosettaMapTestFuncSchemaRefs {
  RosettaCallableWithArgs?: string[];
}

export function createRosettaMapTestFuncSchema(refs: RosettaMapTestFuncSchemaRefs = {}) {
  return RosettaMapTestFuncSchema.extend({
    func: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaCallableWithArgs ?? []) })
  });
}

export interface RosettaQualifiableConfigurationSchemaRefs {
  Data?: string[];
}

export function createRosettaQualifiableConfigurationSchema(
  refs: RosettaQualifiableConfigurationSchemaRefs = {}
) {
  return RosettaQualifiableConfigurationSchema.extend({
    rosettaClass: ReferenceSchema.extend({ $refText: zRef(() => refs.Data ?? []) })
  });
}

export interface RosettaReportSchemaRefs {
  RosettaRule?: string[];
  RosettaCorpus?: string[];
  Data?: string[];
  RosettaExternalRuleSource?: string[];
}

export function createRosettaReportSchema(refs: RosettaReportSchemaRefs = {}) {
  return RosettaReportSchema.extend({
    eligibilityRules: z.array(
      ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaRule ?? []) })
    ),
    reportingStandard: ReferenceSchema.extend({
      $refText: zRef(() => refs.RosettaCorpus ?? [])
    }).optional(),
    reportType: ReferenceSchema.extend({ $refText: zRef(() => refs.Data ?? []) }),
    ruleSource: ReferenceSchema.extend({
      $refText: zRef(() => refs.RosettaExternalRuleSource ?? [])
    }).optional()
  });
}

export interface RosettaSynonymSourceSchemaRefs {
  RosettaSynonymSource?: string[];
}

export function createRosettaSynonymSourceSchema(refs: RosettaSynonymSourceSchemaRefs = {}) {
  return RosettaSynonymSourceSchema.extend({
    superSources: z
      .array(ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaSynonymSource ?? []) }))
      .optional()
  });
}

export interface SwitchCaseGuardSchemaRefs {
  SwitchCaseTarget?: string[];
}

export function createSwitchCaseGuardSchema(refs: SwitchCaseGuardSchemaRefs = {}) {
  return SwitchCaseGuardSchema.extend({
    referenceGuard: ReferenceSchema.extend({
      $refText: zRef(() => refs.SwitchCaseTarget ?? [])
    }).optional()
  });
}

export interface ToEnumOperationSchemaRefs {
  RosettaEnumeration?: string[];
}

export function createToEnumOperationSchema(refs: ToEnumOperationSchemaRefs = {}) {
  return ToEnumOperationSchema.extend({
    enumeration: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaEnumeration ?? []) })
  });
}

export interface WithMetaEntrySchemaRefs {
  RosettaFeature?: string[];
}

export function createWithMetaEntrySchema(refs: WithMetaEntrySchemaRefs = {}) {
  return WithMetaEntrySchema.extend({
    key: ReferenceSchema.extend({ $refText: zRef(() => refs.RosettaFeature ?? []) })
  });
}
