// @ts-nocheck — generated domain surface; edit the grammar / domain-surfaces.json to regenerate

/** Editable cross-reference: the runtime ref shape. Resolution stays derived/external. */
export interface DomainRef { $refText: string }

export interface AnnotationDomain {
  $type: 'Annotation';
  name: string;
  definition?: string;
  prefix?: string;
  attributes?: AttributeDomain[];
  members?: AttributeDomain[];
}

export function toDomainAnnotation(node: any): AnnotationDomain {
  return {
    $type: node.$type,
    name: node.name,
    definition: node.definition,
    prefix: node.prefix,
    attributes: (node.attributes ?? []).map((item) => item ? toDomainAttribute(item) : undefined),
    members: (node.attributes ?? []).map((item) => item ? toDomainAttribute(item) : undefined),
  };
}

export function toAstAnnotation(node: any): any {
  return {
    $type: 'Annotation',
    name: node.name,
    definition: node.definition,
    prefix: node.prefix,
    attributes: (node.attributes ?? []).map((item) => item ? toAstAttribute(item) : undefined),
  };
}

export function setAnnotationName(node: any, value: string): void {
  node.name = value;
}

export function setAnnotationDefinition(node: any, value: string): void {
  node.definition = value;
}

export function setAnnotationPrefix(node: any, value: string): void {
  node.prefix = value;
}

export function addAnnotationAttributes(node: any, item: unknown): void {
  (node.attributes ??= []).push(item);
}

export function removeAnnotationAttributesAt(node: any, index: number): void {
  node.attributes?.splice(index, 1);
}

export interface AnnotationDeepPathDomain {
  $type: 'AnnotationDeepPath';
  receiver: AnnotationPathExpressionDomain;
  operator: "->>";
  attribute: DomainRef;
}

export function toDomainAnnotationDeepPath(node: any): AnnotationDeepPathDomain {
  return {
    $type: node.$type,
    receiver: node.receiver ? toDomainAnnotationPathExpression(node.receiver) : undefined,
    operator: node.operator,
    attribute: node.attribute,
  };
}

export function toAstAnnotationDeepPath(node: any): any {
  return {
    $type: 'AnnotationDeepPath',
    receiver: node.receiver ? toAstAnnotationPathExpression(node.receiver) : undefined,
    operator: node.operator,
    attribute: node.attribute,
  };
}

export function setAnnotationDeepPathAttribute(node: any, value: string): void {
  if (node.attribute) node.attribute.$refText = value;
  else node.attribute = { $refText: value };
}

export interface AnnotationPathDomain {
  $type: 'AnnotationPath';
  receiver: AnnotationPathExpressionDomain;
  operator: "->";
  attribute: DomainRef;
}

export function toDomainAnnotationPath(node: any): AnnotationPathDomain {
  return {
    $type: node.$type,
    receiver: node.receiver ? toDomainAnnotationPathExpression(node.receiver) : undefined,
    operator: node.operator,
    attribute: node.attribute,
  };
}

export function toAstAnnotationPath(node: any): any {
  return {
    $type: 'AnnotationPath',
    receiver: node.receiver ? toAstAnnotationPathExpression(node.receiver) : undefined,
    operator: node.operator,
    attribute: node.attribute,
  };
}

export function setAnnotationPathAttribute(node: any, value: string): void {
  if (node.attribute) node.attribute.$refText = value;
  else node.attribute = { $refText: value };
}

export interface AnnotationPathAttributeReferenceDomain {
  $type: 'AnnotationPathAttributeReference';
  attribute: DomainRef;
}

export function toDomainAnnotationPathAttributeReference(node: any): AnnotationPathAttributeReferenceDomain {
  return {
    $type: node.$type,
    attribute: node.attribute,
  };
}

export function toAstAnnotationPathAttributeReference(node: any): any {
  return {
    $type: 'AnnotationPathAttributeReference',
    attribute: node.attribute,
  };
}

export function setAnnotationPathAttributeReferenceAttribute(node: any, value: string): void {
  if (node.attribute) node.attribute.$refText = value;
  else node.attribute = { $refText: value };
}

export interface AnnotationQualifierDomain {
  $type: 'AnnotationQualifier';
  qualName: string;
  qualValue?: string;
  qualPath?: RosettaAttributeReferenceDomain;
}

export function toDomainAnnotationQualifier(node: any): AnnotationQualifierDomain {
  return {
    $type: node.$type,
    qualName: node.qualName,
    qualValue: node.qualValue,
    qualPath: node.qualPath ? toDomainRosettaAttributeReference(node.qualPath) : undefined,
  };
}

export function toAstAnnotationQualifier(node: any): any {
  return {
    $type: 'AnnotationQualifier',
    qualName: node.qualName,
    qualValue: node.qualValue,
    qualPath: node.qualPath ? toAstRosettaAttributeReference(node.qualPath) : undefined,
  };
}

export function setAnnotationQualifierQualName(node: any, value: string): void {
  node.qualName = value;
}

export function setAnnotationQualifierQualValue(node: any, value: string): void {
  node.qualValue = value;
}

export interface AnnotationRefDomain {
  $type: 'AnnotationRef';
  annotation: DomainRef;
  attribute?: DomainRef;
  qualifiers?: AnnotationQualifierDomain[];
}

export function toDomainAnnotationRef(node: any): AnnotationRefDomain {
  return {
    $type: node.$type,
    annotation: node.annotation,
    attribute: node.attribute,
    qualifiers: (node.qualifiers ?? []).map((item) => item ? toDomainAnnotationQualifier(item) : undefined),
  };
}

export function toAstAnnotationRef(node: any): any {
  return {
    $type: 'AnnotationRef',
    annotation: node.annotation,
    attribute: node.attribute,
    qualifiers: (node.qualifiers ?? []).map((item) => item ? toAstAnnotationQualifier(item) : undefined),
  };
}

export function setAnnotationRefAnnotation(node: any, value: string): void {
  if (node.annotation) node.annotation.$refText = value;
  else node.annotation = { $refText: value };
}

export function setAnnotationRefAttribute(node: any, value: string): void {
  if (node.attribute) node.attribute.$refText = value;
  else node.attribute = { $refText: value };
}

export function addAnnotationRefQualifiers(node: any, item: unknown): void {
  (node.qualifiers ??= []).push(item);
}

export function removeAnnotationRefQualifiersAt(node: any, index: number): void {
  node.qualifiers?.splice(index, 1);
}

export interface ArithmeticOperationDomain {
  $type: 'ArithmeticOperation';
  left: RosettaExpressionDomain;
  operator: ("+" | "-" | "*" | "/");
  right: RosettaExpressionDomain;
}

export function toDomainArithmeticOperation(node: any): ArithmeticOperationDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toDomainRosettaExpression(node.right) : undefined,
  };
}

export function toAstArithmeticOperation(node: any): any {
  return {
    $type: 'ArithmeticOperation',
    left: node.left ? toAstRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toAstRosettaExpression(node.right) : undefined,
  };
}

export interface AsKeyOperationDomain {
  $type: 'AsKeyOperation';
  argument: RosettaExpressionDomain;
  operator: "as-key";
}

export function toDomainAsKeyOperation(node: any): AsKeyOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstAsKeyOperation(node: any): any {
  return {
    $type: 'AsKeyOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface AttributeDomain {
  $type: 'Attribute';
  override?: boolean;
  name: string;
  typeCall: TypeCallDomain;
  typeCallArgs?: TypeCallArgumentDomain[];
  card: RosettaCardinalityDomain;
  definition?: string;
  references?: RosettaDocReferenceDomain[];
  annotations?: AnnotationRefDomain[];
  synonyms?: RosettaSynonymDomain[];
  labels?: LabelAnnotationDomain[];
  ruleReferences?: RuleReferenceAnnotationDomain[];
}

export function toDomainAttribute(node: any): AttributeDomain {
  return {
    $type: node.$type,
    override: node.override,
    name: node.name,
    typeCall: node.typeCall ? toDomainTypeCall(node.typeCall) : undefined,
    typeCallArgs: (node.typeCallArgs ?? []).map((item) => item ? toDomainTypeCallArgument(item) : undefined),
    card: node.card ? toDomainRosettaCardinality(node.card) : undefined,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toDomainRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toDomainAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toDomainRosettaSynonym(item) : undefined),
    labels: (node.labels ?? []).map((item) => item ? toDomainLabelAnnotation(item) : undefined),
    ruleReferences: (node.ruleReferences ?? []).map((item) => item ? toDomainRuleReferenceAnnotation(item) : undefined),
  };
}

export function toAstAttribute(node: any): any {
  return {
    $type: 'Attribute',
    override: node.override,
    name: node.name,
    typeCall: node.typeCall ? toAstTypeCall(node.typeCall) : undefined,
    typeCallArgs: (node.typeCallArgs ?? []).map((item) => item ? toAstTypeCallArgument(item) : undefined),
    card: node.card ? toAstRosettaCardinality(node.card) : undefined,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toAstRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toAstAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toAstRosettaSynonym(item) : undefined),
    labels: (node.labels ?? []).map((item) => item ? toAstLabelAnnotation(item) : undefined),
    ruleReferences: (node.ruleReferences ?? []).map((item) => item ? toAstRuleReferenceAnnotation(item) : undefined),
  };
}

export function setAttributeOverride(node: any, value: boolean): void {
  node.override = value;
}

export function setAttributeName(node: any, value: string): void {
  node.name = value;
}

export function addAttributeTypeCallArgs(node: any, item: unknown): void {
  (node.typeCallArgs ??= []).push(item);
}

export function removeAttributeTypeCallArgsAt(node: any, index: number): void {
  node.typeCallArgs?.splice(index, 1);
}

export function setAttributeDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addAttributeReferences(node: any, item: unknown): void {
  (node.references ??= []).push(item);
}

export function removeAttributeReferencesAt(node: any, index: number): void {
  node.references?.splice(index, 1);
}

export function addAttributeAnnotations(node: any, item: unknown): void {
  (node.annotations ??= []).push(item);
}

export function removeAttributeAnnotationsAt(node: any, index: number): void {
  node.annotations?.splice(index, 1);
}

export function addAttributeSynonyms(node: any, item: unknown): void {
  (node.synonyms ??= []).push(item);
}

export function removeAttributeSynonymsAt(node: any, index: number): void {
  node.synonyms?.splice(index, 1);
}

export function addAttributeLabels(node: any, item: unknown): void {
  (node.labels ??= []).push(item);
}

export function removeAttributeLabelsAt(node: any, index: number): void {
  node.labels?.splice(index, 1);
}

export function addAttributeRuleReferences(node: any, item: unknown): void {
  (node.ruleReferences ??= []).push(item);
}

export function removeAttributeRuleReferencesAt(node: any, index: number): void {
  node.ruleReferences?.splice(index, 1);
}

export interface ChoiceDomain {
  $type: 'Choice';
  name: string;
  definition?: string;
  attributes?: ChoiceOptionDomain[];
  annotations?: AnnotationRefDomain[];
  synonyms?: RosettaClassSynonymDomain[];
  members?: ChoiceOptionDomain[];
}

export function toDomainChoice(node: any): ChoiceDomain {
  return {
    $type: node.$type,
    name: node.name,
    definition: node.definition,
    attributes: (node.attributes ?? []).map((item) => item ? toDomainChoiceOption(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toDomainAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toDomainRosettaClassSynonym(item) : undefined),
    members: (node.attributes ?? []).map((item) => item ? toDomainChoiceOption(item) : undefined),
  };
}

export function toAstChoice(node: any): any {
  return {
    $type: 'Choice',
    name: node.name,
    definition: node.definition,
    attributes: (node.attributes ?? []).map((item) => item ? toAstChoiceOption(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toAstAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toAstRosettaClassSynonym(item) : undefined),
  };
}

export function setChoiceName(node: any, value: string): void {
  node.name = value;
}

export function setChoiceDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addChoiceAttributes(node: any, item: unknown): void {
  (node.attributes ??= []).push(item);
}

export function removeChoiceAttributesAt(node: any, index: number): void {
  node.attributes?.splice(index, 1);
}

export function addChoiceAnnotations(node: any, item: unknown): void {
  (node.annotations ??= []).push(item);
}

export function removeChoiceAnnotationsAt(node: any, index: number): void {
  node.annotations?.splice(index, 1);
}

export function addChoiceSynonyms(node: any, item: unknown): void {
  (node.synonyms ??= []).push(item);
}

export function removeChoiceSynonymsAt(node: any, index: number): void {
  node.synonyms?.splice(index, 1);
}

export interface ChoiceOperationDomain {
  $type: 'ChoiceOperation';
  argument?: RosettaExpressionDomain;
  necessity: string;
  operator: "choice";
  attributes: DomainRef[];
}

export function toDomainChoiceOperation(node: any): ChoiceOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    necessity: node.necessity,
    operator: node.operator,
    attributes: (node.attributes ?? []).map((item) => item),
  };
}

export function toAstChoiceOperation(node: any): any {
  return {
    $type: 'ChoiceOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    necessity: node.necessity,
    operator: node.operator,
    attributes: (node.attributes ?? []).map((item) => item),
  };
}

export function setChoiceOperationNecessity(node: any, value: string): void {
  node.necessity = value;
}

export function addChoiceOperationAttributes(node: any, item: string): void {
  (node.attributes ??= []).push({ $refText: item });
}

export function removeChoiceOperationAttributesAt(node: any, index: number): void {
  node.attributes?.splice(index, 1);
}

export interface ChoiceOptionDomain {
  $type: 'ChoiceOption';
  typeCall: TypeCallDomain;
  definition?: string;
  references?: RosettaDocReferenceDomain[];
  annotations?: AnnotationRefDomain[];
  synonyms?: RosettaSynonymDomain[];
  labels?: LabelAnnotationDomain[];
  ruleReferences?: RuleReferenceAnnotationDomain[];
}

export function toDomainChoiceOption(node: any): ChoiceOptionDomain {
  return {
    $type: node.$type,
    typeCall: node.typeCall ? toDomainTypeCall(node.typeCall) : undefined,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toDomainRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toDomainAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toDomainRosettaSynonym(item) : undefined),
    labels: (node.labels ?? []).map((item) => item ? toDomainLabelAnnotation(item) : undefined),
    ruleReferences: (node.ruleReferences ?? []).map((item) => item ? toDomainRuleReferenceAnnotation(item) : undefined),
  };
}

export function toAstChoiceOption(node: any): any {
  return {
    $type: 'ChoiceOption',
    typeCall: node.typeCall ? toAstTypeCall(node.typeCall) : undefined,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toAstRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toAstAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toAstRosettaSynonym(item) : undefined),
    labels: (node.labels ?? []).map((item) => item ? toAstLabelAnnotation(item) : undefined),
    ruleReferences: (node.ruleReferences ?? []).map((item) => item ? toAstRuleReferenceAnnotation(item) : undefined),
  };
}

export function setChoiceOptionDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addChoiceOptionReferences(node: any, item: unknown): void {
  (node.references ??= []).push(item);
}

export function removeChoiceOptionReferencesAt(node: any, index: number): void {
  node.references?.splice(index, 1);
}

export function addChoiceOptionAnnotations(node: any, item: unknown): void {
  (node.annotations ??= []).push(item);
}

export function removeChoiceOptionAnnotationsAt(node: any, index: number): void {
  node.annotations?.splice(index, 1);
}

export function addChoiceOptionSynonyms(node: any, item: unknown): void {
  (node.synonyms ??= []).push(item);
}

export function removeChoiceOptionSynonymsAt(node: any, index: number): void {
  node.synonyms?.splice(index, 1);
}

export function addChoiceOptionLabels(node: any, item: unknown): void {
  (node.labels ??= []).push(item);
}

export function removeChoiceOptionLabelsAt(node: any, index: number): void {
  node.labels?.splice(index, 1);
}

export function addChoiceOptionRuleReferences(node: any, item: unknown): void {
  (node.ruleReferences ??= []).push(item);
}

export function removeChoiceOptionRuleReferencesAt(node: any, index: number): void {
  node.ruleReferences?.splice(index, 1);
}

export interface ClosureParameterDomain {
  $type: 'ClosureParameter';
  name: string;
}

export function toDomainClosureParameter(node: any): ClosureParameterDomain {
  return {
    $type: node.$type,
    name: node.name,
  };
}

export function toAstClosureParameter(node: any): any {
  return {
    $type: 'ClosureParameter',
    name: node.name,
  };
}

export function setClosureParameterName(node: any, value: string): void {
  node.name = value;
}

export interface ComparisonOperationDomain {
  $type: 'ComparisonOperation';
  left?: RosettaExpressionDomain;
  cardMod?: string;
  operator: (">=" | "<=" | ">" | "<");
  right: RosettaExpressionDomain;
}

export function toDomainComparisonOperation(node: any): ComparisonOperationDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaExpression(node.left) : undefined,
    cardMod: node.cardMod,
    operator: node.operator,
    right: node.right ? toDomainRosettaExpression(node.right) : undefined,
  };
}

export function toAstComparisonOperation(node: any): any {
  return {
    $type: 'ComparisonOperation',
    left: node.left ? toAstRosettaExpression(node.left) : undefined,
    cardMod: node.cardMod,
    operator: node.operator,
    right: node.right ? toAstRosettaExpression(node.right) : undefined,
  };
}

export function setComparisonOperationCardMod(node: any, value: string): void {
  node.cardMod = value;
}

export interface ConditionDomain {
  $type: 'Condition';
  name?: string;
  definition?: string;
  expression: RosettaExpressionDomain;
  references?: RosettaDocReferenceDomain[];
  annotations?: AnnotationRefDomain[];
  postCondition?: boolean;
}

export function toDomainCondition(node: any): ConditionDomain {
  return {
    $type: node.$type,
    name: node.name,
    definition: node.definition,
    expression: node.expression ? toDomainRosettaExpression(node.expression) : undefined,
    references: (node.references ?? []).map((item) => item ? toDomainRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toDomainAnnotationRef(item) : undefined),
    postCondition: node.postCondition,
  };
}

export function toAstCondition(node: any): any {
  return {
    $type: 'Condition',
    name: node.name,
    definition: node.definition,
    expression: node.expression ? toAstRosettaExpression(node.expression) : undefined,
    references: (node.references ?? []).map((item) => item ? toAstRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toAstAnnotationRef(item) : undefined),
    postCondition: node.postCondition,
  };
}

export function setConditionName(node: any, value: string): void {
  node.name = value;
}

export function setConditionDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addConditionReferences(node: any, item: unknown): void {
  (node.references ??= []).push(item);
}

export function removeConditionReferencesAt(node: any, index: number): void {
  node.references?.splice(index, 1);
}

export function addConditionAnnotations(node: any, item: unknown): void {
  (node.annotations ??= []).push(item);
}

export function removeConditionAnnotationsAt(node: any, index: number): void {
  node.annotations?.splice(index, 1);
}

export function setConditionPostCondition(node: any, value: boolean): void {
  node.postCondition = value;
}

export interface ConstructorKeyValuePairDomain {
  $type: 'ConstructorKeyValuePair';
  key: DomainRef;
  value: RosettaExpressionDomain;
}

export function toDomainConstructorKeyValuePair(node: any): ConstructorKeyValuePairDomain {
  return {
    $type: node.$type,
    key: node.key,
    value: node.value ? toDomainRosettaExpression(node.value) : undefined,
  };
}

export function toAstConstructorKeyValuePair(node: any): any {
  return {
    $type: 'ConstructorKeyValuePair',
    key: node.key,
    value: node.value ? toAstRosettaExpression(node.value) : undefined,
  };
}

export function setConstructorKeyValuePairKey(node: any, value: string): void {
  if (node.key) node.key.$refText = value;
  else node.key = { $refText: value };
}

export interface DataDomain {
  $type: 'Data';
  name: string;
  superType?: DomainRef;
  definition?: string;
  attributes?: AttributeDomain[];
  conditions?: ConditionDomain[];
  references?: RosettaDocReferenceDomain[];
  annotations?: AnnotationRefDomain[];
  synonyms?: RosettaClassSynonymDomain[];
  extends?: DomainRef;
  members?: AttributeDomain[];
}

export function toDomainData(node: any): DataDomain {
  return {
    $type: node.$type,
    name: node.name,
    superType: node.superType,
    definition: node.definition,
    attributes: (node.attributes ?? []).map((item) => item ? toDomainAttribute(item) : undefined),
    conditions: (node.conditions ?? []).map((item) => item ? toDomainCondition(item) : undefined),
    references: (node.references ?? []).map((item) => item ? toDomainRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toDomainAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toDomainRosettaClassSynonym(item) : undefined),
    extends: node.superType,
    members: (node.attributes ?? []).map((item) => item ? toDomainAttribute(item) : undefined),
  };
}

export function toAstData(node: any): any {
  return {
    $type: 'Data',
    name: node.name,
    superType: node.superType,
    definition: node.definition,
    attributes: (node.attributes ?? []).map((item) => item ? toAstAttribute(item) : undefined),
    conditions: (node.conditions ?? []).map((item) => item ? toAstCondition(item) : undefined),
    references: (node.references ?? []).map((item) => item ? toAstRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toAstAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toAstRosettaClassSynonym(item) : undefined),
  };
}

export function setDataName(node: any, value: string): void {
  node.name = value;
}

export function setDataSuperType(node: any, value: string): void {
  if (node.superType) node.superType.$refText = value;
  else node.superType = { $refText: value };
}

export function setDataDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addDataAttributes(node: any, item: unknown): void {
  (node.attributes ??= []).push(item);
}

export function removeDataAttributesAt(node: any, index: number): void {
  node.attributes?.splice(index, 1);
}

export function addDataConditions(node: any, item: unknown): void {
  (node.conditions ??= []).push(item);
}

export function removeDataConditionsAt(node: any, index: number): void {
  node.conditions?.splice(index, 1);
}

export function addDataReferences(node: any, item: unknown): void {
  (node.references ??= []).push(item);
}

export function removeDataReferencesAt(node: any, index: number): void {
  node.references?.splice(index, 1);
}

export function addDataAnnotations(node: any, item: unknown): void {
  (node.annotations ??= []).push(item);
}

export function removeDataAnnotationsAt(node: any, index: number): void {
  node.annotations?.splice(index, 1);
}

export function addDataSynonyms(node: any, item: unknown): void {
  (node.synonyms ??= []).push(item);
}

export function removeDataSynonymsAt(node: any, index: number): void {
  node.synonyms?.splice(index, 1);
}

export interface DefaultOperationDomain {
  $type: 'DefaultOperation';
  left?: RosettaExpressionDomain;
  operator: "default";
  right: RosettaExpressionDomain;
}

export function toDomainDefaultOperation(node: any): DefaultOperationDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toDomainRosettaExpression(node.right) : undefined,
  };
}

export function toAstDefaultOperation(node: any): any {
  return {
    $type: 'DefaultOperation',
    left: node.left ? toAstRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toAstRosettaExpression(node.right) : undefined,
  };
}

export interface DistinctOperationDomain {
  $type: 'DistinctOperation';
  argument?: RosettaExpressionDomain;
  operator: "distinct";
}

export function toDomainDistinctOperation(node: any): DistinctOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstDistinctOperation(node: any): any {
  return {
    $type: 'DistinctOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface DocumentRationaleDomain {
  $type: 'DocumentRationale';
  rationale: string;
  rationaleAuthor?: string;
}

export function toDomainDocumentRationale(node: any): DocumentRationaleDomain {
  return {
    $type: node.$type,
    rationale: node.rationale,
    rationaleAuthor: node.rationaleAuthor,
  };
}

export function toAstDocumentRationale(node: any): any {
  return {
    $type: 'DocumentRationale',
    rationale: node.rationale,
    rationaleAuthor: node.rationaleAuthor,
  };
}

export function setDocumentRationaleRationale(node: any, value: string): void {
  node.rationale = value;
}

export function setDocumentRationaleRationaleAuthor(node: any, value: string): void {
  node.rationaleAuthor = value;
}

export interface EqualityOperationDomain {
  $type: 'EqualityOperation';
  left?: RosettaExpressionDomain;
  cardMod?: string;
  operator: ("=" | "<>");
  right: RosettaExpressionDomain;
}

export function toDomainEqualityOperation(node: any): EqualityOperationDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaExpression(node.left) : undefined,
    cardMod: node.cardMod,
    operator: node.operator,
    right: node.right ? toDomainRosettaExpression(node.right) : undefined,
  };
}

export function toAstEqualityOperation(node: any): any {
  return {
    $type: 'EqualityOperation',
    left: node.left ? toAstRosettaExpression(node.left) : undefined,
    cardMod: node.cardMod,
    operator: node.operator,
    right: node.right ? toAstRosettaExpression(node.right) : undefined,
  };
}

export function setEqualityOperationCardMod(node: any, value: string): void {
  node.cardMod = value;
}

export interface FilterOperationDomain {
  $type: 'FilterOperation';
  argument?: RosettaExpressionDomain;
  operator: "filter";
  function?: InlineFunctionDomain;
}

export function toDomainFilterOperation(node: any): FilterOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toDomainInlineFunction(node.function) : undefined,
  };
}

export function toAstFilterOperation(node: any): any {
  return {
    $type: 'FilterOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toAstInlineFunction(node.function) : undefined,
  };
}

export interface FirstOperationDomain {
  $type: 'FirstOperation';
  argument?: RosettaExpressionDomain;
  operator: "first";
}

export function toDomainFirstOperation(node: any): FirstOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstFirstOperation(node: any): any {
  return {
    $type: 'FirstOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface FlattenOperationDomain {
  $type: 'FlattenOperation';
  argument?: RosettaExpressionDomain;
  operator: "flatten";
}

export function toDomainFlattenOperation(node: any): FlattenOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstFlattenOperation(node: any): any {
  return {
    $type: 'FlattenOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface ImportDomain {
  $type: 'Import';
  importedNamespace: string;
  namespaceAlias?: string;
}

export function toDomainImport(node: any): ImportDomain {
  return {
    $type: node.$type,
    importedNamespace: node.importedNamespace,
    namespaceAlias: node.namespaceAlias,
  };
}

export function toAstImport(node: any): any {
  return {
    $type: 'Import',
    importedNamespace: node.importedNamespace,
    namespaceAlias: node.namespaceAlias,
  };
}

export function setImportImportedNamespace(node: any, value: string): void {
  node.importedNamespace = value;
}

export function setImportNamespaceAlias(node: any, value: string): void {
  node.namespaceAlias = value;
}

export interface InlineFunctionDomain {
  $type: 'InlineFunction';
  body: RosettaExpressionDomain;
  parameters?: ClosureParameterDomain[];
}

export function toDomainInlineFunction(node: any): InlineFunctionDomain {
  return {
    $type: node.$type,
    body: node.body ? toDomainRosettaExpression(node.body) : undefined,
    parameters: (node.parameters ?? []).map((item) => item ? toDomainClosureParameter(item) : undefined),
  };
}

export function toAstInlineFunction(node: any): any {
  return {
    $type: 'InlineFunction',
    body: node.body ? toAstRosettaExpression(node.body) : undefined,
    parameters: (node.parameters ?? []).map((item) => item ? toAstClosureParameter(item) : undefined),
  };
}

export function addInlineFunctionParameters(node: any, item: unknown): void {
  (node.parameters ??= []).push(item);
}

export function removeInlineFunctionParametersAt(node: any, index: number): void {
  node.parameters?.splice(index, 1);
}

export interface JoinOperationDomain {
  $type: 'JoinOperation';
  left?: RosettaExpressionDomain;
  operator: "join";
  right?: RosettaExpressionDomain;
}

export function toDomainJoinOperation(node: any): JoinOperationDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toDomainRosettaExpression(node.right) : undefined,
  };
}

export function toAstJoinOperation(node: any): any {
  return {
    $type: 'JoinOperation',
    left: node.left ? toAstRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toAstRosettaExpression(node.right) : undefined,
  };
}

export interface LabelAnnotationDomain {
  $type: 'LabelAnnotation';
  name: "label";
  label: string;
  path?: AnnotationPathExpressionDomain;
  deprecatedAs?: boolean;
}

export function toDomainLabelAnnotation(node: any): LabelAnnotationDomain {
  return {
    $type: node.$type,
    name: node.name,
    label: node.label,
    path: node.path ? toDomainAnnotationPathExpression(node.path) : undefined,
    deprecatedAs: node.deprecatedAs,
  };
}

export function toAstLabelAnnotation(node: any): any {
  return {
    $type: 'LabelAnnotation',
    name: node.name,
    label: node.label,
    path: node.path ? toAstAnnotationPathExpression(node.path) : undefined,
    deprecatedAs: node.deprecatedAs,
  };
}

export function setLabelAnnotationLabel(node: any, value: string): void {
  node.label = value;
}

export function setLabelAnnotationDeprecatedAs(node: any, value: boolean): void {
  node.deprecatedAs = value;
}

export interface LastOperationDomain {
  $type: 'LastOperation';
  argument?: RosettaExpressionDomain;
  operator: "last";
}

export function toDomainLastOperation(node: any): LastOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstLastOperation(node: any): any {
  return {
    $type: 'LastOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface ListLiteralDomain {
  $type: 'ListLiteral';
  elements?: RosettaExpressionDomain[];
}

export function toDomainListLiteral(node: any): ListLiteralDomain {
  return {
    $type: node.$type,
    elements: (node.elements ?? []).map((item) => item ? toDomainRosettaExpression(item) : undefined),
  };
}

export function toAstListLiteral(node: any): any {
  return {
    $type: 'ListLiteral',
    elements: (node.elements ?? []).map((item) => item ? toAstRosettaExpression(item) : undefined),
  };
}

export function addListLiteralElements(node: any, item: unknown): void {
  (node.elements ??= []).push(item);
}

export function removeListLiteralElementsAt(node: any, index: number): void {
  node.elements?.splice(index, 1);
}

export interface LogicalOperationDomain {
  $type: 'LogicalOperation';
  left: RosettaExpressionDomain;
  operator: ("or" | "and");
  right: RosettaExpressionDomain;
}

export function toDomainLogicalOperation(node: any): LogicalOperationDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toDomainRosettaExpression(node.right) : undefined,
  };
}

export function toAstLogicalOperation(node: any): any {
  return {
    $type: 'LogicalOperation',
    left: node.left ? toAstRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toAstRosettaExpression(node.right) : undefined,
  };
}

export interface MapOperationDomain {
  $type: 'MapOperation';
  argument?: RosettaExpressionDomain;
  operator: "extract";
  function?: InlineFunctionDomain;
}

export function toDomainMapOperation(node: any): MapOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toDomainInlineFunction(node.function) : undefined,
  };
}

export function toAstMapOperation(node: any): any {
  return {
    $type: 'MapOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toAstInlineFunction(node.function) : undefined,
  };
}

export interface MaxOperationDomain {
  $type: 'MaxOperation';
  argument?: RosettaExpressionDomain;
  operator: "max";
  function?: InlineFunctionDomain;
}

export function toDomainMaxOperation(node: any): MaxOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toDomainInlineFunction(node.function) : undefined,
  };
}

export function toAstMaxOperation(node: any): any {
  return {
    $type: 'MaxOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toAstInlineFunction(node.function) : undefined,
  };
}

export interface MinOperationDomain {
  $type: 'MinOperation';
  argument?: RosettaExpressionDomain;
  operator: "min";
  function?: InlineFunctionDomain;
}

export function toDomainMinOperation(node: any): MinOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toDomainInlineFunction(node.function) : undefined,
  };
}

export function toAstMinOperation(node: any): any {
  return {
    $type: 'MinOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toAstInlineFunction(node.function) : undefined,
  };
}

export interface OneOfOperationDomain {
  $type: 'OneOfOperation';
  argument?: RosettaExpressionDomain;
  operator: "one-of";
}

export function toDomainOneOfOperation(node: any): OneOfOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstOneOfOperation(node: any): any {
  return {
    $type: 'OneOfOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface OperationDomain {
  $type: 'Operation';
  assignRoot: DomainRef;
  path?: SegmentDomain;
  definition?: string;
  expression: RosettaExpressionDomain;
  add?: boolean;
}

export function toDomainOperation(node: any): OperationDomain {
  return {
    $type: node.$type,
    assignRoot: node.assignRoot,
    path: node.path ? toDomainSegment(node.path) : undefined,
    definition: node.definition,
    expression: node.expression ? toDomainRosettaExpression(node.expression) : undefined,
    add: node.add,
  };
}

export function toAstOperation(node: any): any {
  return {
    $type: 'Operation',
    assignRoot: node.assignRoot,
    path: node.path ? toAstSegment(node.path) : undefined,
    definition: node.definition,
    expression: node.expression ? toAstRosettaExpression(node.expression) : undefined,
    add: node.add,
  };
}

export function setOperationAssignRoot(node: any, value: string): void {
  if (node.assignRoot) node.assignRoot.$refText = value;
  else node.assignRoot = { $refText: value };
}

export function setOperationDefinition(node: any, value: string): void {
  node.definition = value;
}

export function setOperationAdd(node: any, value: boolean): void {
  node.add = value;
}

export interface ReduceOperationDomain {
  $type: 'ReduceOperation';
  argument?: RosettaExpressionDomain;
  operator: "reduce";
  function?: InlineFunctionDomain;
}

export function toDomainReduceOperation(node: any): ReduceOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toDomainInlineFunction(node.function) : undefined,
  };
}

export function toAstReduceOperation(node: any): any {
  return {
    $type: 'ReduceOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toAstInlineFunction(node.function) : undefined,
  };
}

export interface RegulatoryDocumentReferenceDomain {
  $type: 'RegulatoryDocumentReference';
  body: DomainRef;
  corpusList: DomainRef[];
  segments?: RosettaSegmentRefDomain[];
}

export function toDomainRegulatoryDocumentReference(node: any): RegulatoryDocumentReferenceDomain {
  return {
    $type: node.$type,
    body: node.body,
    corpusList: (node.corpusList ?? []).map((item) => item),
    segments: (node.segments ?? []).map((item) => item ? toDomainRosettaSegmentRef(item) : undefined),
  };
}

export function toAstRegulatoryDocumentReference(node: any): any {
  return {
    $type: 'RegulatoryDocumentReference',
    body: node.body,
    corpusList: (node.corpusList ?? []).map((item) => item),
    segments: (node.segments ?? []).map((item) => item ? toAstRosettaSegmentRef(item) : undefined),
  };
}

export function setRegulatoryDocumentReferenceBody(node: any, value: string): void {
  if (node.body) node.body.$refText = value;
  else node.body = { $refText: value };
}

export function addRegulatoryDocumentReferenceCorpusList(node: any, item: string): void {
  (node.corpusList ??= []).push({ $refText: item });
}

export function removeRegulatoryDocumentReferenceCorpusListAt(node: any, index: number): void {
  node.corpusList?.splice(index, 1);
}

export function addRegulatoryDocumentReferenceSegments(node: any, item: unknown): void {
  (node.segments ??= []).push(item);
}

export function removeRegulatoryDocumentReferenceSegmentsAt(node: any, index: number): void {
  node.segments?.splice(index, 1);
}

export interface ReverseOperationDomain {
  $type: 'ReverseOperation';
  argument?: RosettaExpressionDomain;
  operator: "reverse";
}

export function toDomainReverseOperation(node: any): ReverseOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstReverseOperation(node: any): any {
  return {
    $type: 'ReverseOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface RosettaAbsentExpressionDomain {
  $type: 'RosettaAbsentExpression';
  argument?: RosettaExpressionDomain;
  operator: "absent";
}

export function toDomainRosettaAbsentExpression(node: any): RosettaAbsentExpressionDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstRosettaAbsentExpression(node: any): any {
  return {
    $type: 'RosettaAbsentExpression',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface RosettaAttributeReferenceDomain {
  $type: 'RosettaAttributeReference';
  receiver: RosettaDataReferenceDomain;
  attribute: DomainRef;
}

export function toDomainRosettaAttributeReference(node: any): RosettaAttributeReferenceDomain {
  return {
    $type: node.$type,
    receiver: node.receiver ? toDomainRosettaDataReference(node.receiver) : undefined,
    attribute: node.attribute,
  };
}

export function toAstRosettaAttributeReference(node: any): any {
  return {
    $type: 'RosettaAttributeReference',
    receiver: node.receiver ? toAstRosettaDataReference(node.receiver) : undefined,
    attribute: node.attribute,
  };
}

export function setRosettaAttributeReferenceAttribute(node: any, value: string): void {
  if (node.attribute) node.attribute.$refText = value;
  else node.attribute = { $refText: value };
}

export interface RosettaBasicTypeDomain {
  $type: 'RosettaBasicType';
  name: string;
  parameters?: TypeParameterDomain[];
  definition?: string;
}

export function toDomainRosettaBasicType(node: any): RosettaBasicTypeDomain {
  return {
    $type: node.$type,
    name: node.name,
    parameters: (node.parameters ?? []).map((item) => item ? toDomainTypeParameter(item) : undefined),
    definition: node.definition,
  };
}

export function toAstRosettaBasicType(node: any): any {
  return {
    $type: 'RosettaBasicType',
    name: node.name,
    parameters: (node.parameters ?? []).map((item) => item ? toAstTypeParameter(item) : undefined),
    definition: node.definition,
  };
}

export function setRosettaBasicTypeName(node: any, value: string): void {
  node.name = value;
}

export function addRosettaBasicTypeParameters(node: any, item: unknown): void {
  (node.parameters ??= []).push(item);
}

export function removeRosettaBasicTypeParametersAt(node: any, index: number): void {
  node.parameters?.splice(index, 1);
}

export function setRosettaBasicTypeDefinition(node: any, value: string): void {
  node.definition = value;
}

export interface RosettaBodyDomain {
  $type: 'RosettaBody';
  bodyType: string;
  name: string;
  definition?: string;
}

export function toDomainRosettaBody(node: any): RosettaBodyDomain {
  return {
    $type: node.$type,
    bodyType: node.bodyType,
    name: node.name,
    definition: node.definition,
  };
}

export function toAstRosettaBody(node: any): any {
  return {
    $type: 'RosettaBody',
    bodyType: node.bodyType,
    name: node.name,
    definition: node.definition,
  };
}

export function setRosettaBodyBodyType(node: any, value: string): void {
  node.bodyType = value;
}

export function setRosettaBodyName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaBodyDefinition(node: any, value: string): void {
  node.definition = value;
}

export interface RosettaBooleanLiteralDomain {
  $type: 'RosettaBooleanLiteral';
  value?: boolean;
}

export function toDomainRosettaBooleanLiteral(node: any): RosettaBooleanLiteralDomain {
  return {
    $type: node.$type,
    value: node.value,
  };
}

export function toAstRosettaBooleanLiteral(node: any): any {
  return {
    $type: 'RosettaBooleanLiteral',
    value: node.value,
  };
}

export function setRosettaBooleanLiteralValue(node: any, value: boolean): void {
  node.value = value;
}

export interface RosettaCardinalityDomain {
  $type: 'RosettaCardinality';
  inf: number;
  sup?: number;
  unbounded?: boolean;
}

export function toDomainRosettaCardinality(node: any): RosettaCardinalityDomain {
  return {
    $type: node.$type,
    inf: node.inf,
    sup: node.sup,
    unbounded: node.unbounded,
  };
}

export function toAstRosettaCardinality(node: any): any {
  return {
    $type: 'RosettaCardinality',
    inf: node.inf,
    sup: node.sup,
    unbounded: node.unbounded,
  };
}

export function setRosettaCardinalityInf(node: any, value: number): void {
  node.inf = value;
}

export function setRosettaCardinalitySup(node: any, value: number): void {
  node.sup = value;
}

export function setRosettaCardinalityUnbounded(node: any, value: boolean): void {
  node.unbounded = value;
}

export interface RosettaClassSynonymDomain {
  $type: 'RosettaClassSynonym';
  sources: DomainRef[];
  value?: RosettaSynonymValueBaseDomain;
  metaValue?: RosettaSynonymValueBaseDomain;
}

export function toDomainRosettaClassSynonym(node: any): RosettaClassSynonymDomain {
  return {
    $type: node.$type,
    sources: (node.sources ?? []).map((item) => item),
    value: node.value ? toDomainRosettaSynonymValueBase(node.value) : undefined,
    metaValue: node.metaValue ? toDomainRosettaSynonymValueBase(node.metaValue) : undefined,
  };
}

export function toAstRosettaClassSynonym(node: any): any {
  return {
    $type: 'RosettaClassSynonym',
    sources: (node.sources ?? []).map((item) => item),
    value: node.value ? toAstRosettaSynonymValueBase(node.value) : undefined,
    metaValue: node.metaValue ? toAstRosettaSynonymValueBase(node.metaValue) : undefined,
  };
}

export function addRosettaClassSynonymSources(node: any, item: string): void {
  (node.sources ??= []).push({ $refText: item });
}

export function removeRosettaClassSynonymSourcesAt(node: any, index: number): void {
  node.sources?.splice(index, 1);
}

export interface RosettaConditionalExpressionDomain {
  $type: 'RosettaConditionalExpression';
  if?: RosettaExpressionDomain;
  ifthen?: RosettaExpressionDomain;
  full?: boolean;
  elsethen?: RosettaExpressionDomain;
}

export function toDomainRosettaConditionalExpression(node: any): RosettaConditionalExpressionDomain {
  return {
    $type: node.$type,
    if: node.if ? toDomainRosettaExpression(node.if) : undefined,
    ifthen: node.ifthen ? toDomainRosettaExpression(node.ifthen) : undefined,
    full: node.full,
    elsethen: node.elsethen ? toDomainRosettaExpression(node.elsethen) : undefined,
  };
}

export function toAstRosettaConditionalExpression(node: any): any {
  return {
    $type: 'RosettaConditionalExpression',
    if: node.if ? toAstRosettaExpression(node.if) : undefined,
    ifthen: node.ifthen ? toAstRosettaExpression(node.ifthen) : undefined,
    full: node.full,
    elsethen: node.elsethen ? toAstRosettaExpression(node.elsethen) : undefined,
  };
}

export function setRosettaConditionalExpressionFull(node: any, value: boolean): void {
  node.full = value;
}

export interface RosettaConstructorExpressionDomain {
  $type: 'RosettaConstructorExpression';
  typeRef: (RosettaSuperCallDomain | RosettaSymbolReferenceDomain);
  constructorTypeArgs?: TypeCallArgumentDomain[];
  implicitEmpty?: boolean;
  values?: ConstructorKeyValuePairDomain[];
}

export function toDomainRosettaConstructorExpression(node: any): RosettaConstructorExpressionDomain {
  return {
    $type: node.$type,
    typeRef: node.typeRef,
    constructorTypeArgs: (node.constructorTypeArgs ?? []).map((item) => item ? toDomainTypeCallArgument(item) : undefined),
    implicitEmpty: node.implicitEmpty,
    values: (node.values ?? []).map((item) => item ? toDomainConstructorKeyValuePair(item) : undefined),
  };
}

export function toAstRosettaConstructorExpression(node: any): any {
  return {
    $type: 'RosettaConstructorExpression',
    typeRef: node.typeRef,
    constructorTypeArgs: (node.constructorTypeArgs ?? []).map((item) => item ? toAstTypeCallArgument(item) : undefined),
    implicitEmpty: node.implicitEmpty,
    values: (node.values ?? []).map((item) => item ? toAstConstructorKeyValuePair(item) : undefined),
  };
}

export function addRosettaConstructorExpressionConstructorTypeArgs(node: any, item: unknown): void {
  (node.constructorTypeArgs ??= []).push(item);
}

export function removeRosettaConstructorExpressionConstructorTypeArgsAt(node: any, index: number): void {
  node.constructorTypeArgs?.splice(index, 1);
}

export function setRosettaConstructorExpressionImplicitEmpty(node: any, value: boolean): void {
  node.implicitEmpty = value;
}

export function addRosettaConstructorExpressionValues(node: any, item: unknown): void {
  (node.values ??= []).push(item);
}

export function removeRosettaConstructorExpressionValuesAt(node: any, index: number): void {
  node.values?.splice(index, 1);
}

export interface RosettaContainsExpressionDomain {
  $type: 'RosettaContainsExpression';
  left?: RosettaExpressionDomain;
  operator: "contains";
  right: RosettaExpressionDomain;
}

export function toDomainRosettaContainsExpression(node: any): RosettaContainsExpressionDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toDomainRosettaExpression(node.right) : undefined,
  };
}

export function toAstRosettaContainsExpression(node: any): any {
  return {
    $type: 'RosettaContainsExpression',
    left: node.left ? toAstRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toAstRosettaExpression(node.right) : undefined,
  };
}

export interface RosettaCorpusDomain {
  $type: 'RosettaCorpus';
  corpusType: string;
  displayName?: string;
  body?: DomainRef;
  name: string;
  definition?: string;
}

export function toDomainRosettaCorpus(node: any): RosettaCorpusDomain {
  return {
    $type: node.$type,
    corpusType: node.corpusType,
    displayName: node.displayName,
    body: node.body,
    name: node.name,
    definition: node.definition,
  };
}

export function toAstRosettaCorpus(node: any): any {
  return {
    $type: 'RosettaCorpus',
    corpusType: node.corpusType,
    displayName: node.displayName,
    body: node.body,
    name: node.name,
    definition: node.definition,
  };
}

export function setRosettaCorpusCorpusType(node: any, value: string): void {
  node.corpusType = value;
}

export function setRosettaCorpusDisplayName(node: any, value: string): void {
  node.displayName = value;
}

export function setRosettaCorpusBody(node: any, value: string): void {
  if (node.body) node.body.$refText = value;
  else node.body = { $refText: value };
}

export function setRosettaCorpusName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaCorpusDefinition(node: any, value: string): void {
  node.definition = value;
}

export interface RosettaCountOperationDomain {
  $type: 'RosettaCountOperation';
  argument?: RosettaExpressionDomain;
  operator: "count";
}

export function toDomainRosettaCountOperation(node: any): RosettaCountOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstRosettaCountOperation(node: any): any {
  return {
    $type: 'RosettaCountOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface RosettaDataReferenceDomain {
  $type: 'RosettaDataReference';
  data: DomainRef;
}

export function toDomainRosettaDataReference(node: any): RosettaDataReferenceDomain {
  return {
    $type: node.$type,
    data: node.data,
  };
}

export function toAstRosettaDataReference(node: any): any {
  return {
    $type: 'RosettaDataReference',
    data: node.data,
  };
}

export function setRosettaDataReferenceData(node: any, value: string): void {
  if (node.data) node.data.$refText = value;
  else node.data = { $refText: value };
}

export interface RosettaDeepFeatureCallDomain {
  $type: 'RosettaDeepFeatureCall';
  receiver: RosettaExpressionDomain;
  feature?: DomainRef;
}

export function toDomainRosettaDeepFeatureCall(node: any): RosettaDeepFeatureCallDomain {
  return {
    $type: node.$type,
    receiver: node.receiver ? toDomainRosettaExpression(node.receiver) : undefined,
    feature: node.feature,
  };
}

export function toAstRosettaDeepFeatureCall(node: any): any {
  return {
    $type: 'RosettaDeepFeatureCall',
    receiver: node.receiver ? toAstRosettaExpression(node.receiver) : undefined,
    feature: node.feature,
  };
}

export function setRosettaDeepFeatureCallFeature(node: any, value: string): void {
  if (node.feature) node.feature.$refText = value;
  else node.feature = { $refText: value };
}

export interface RosettaDisjointExpressionDomain {
  $type: 'RosettaDisjointExpression';
  left?: RosettaExpressionDomain;
  operator: "disjoint";
  right: RosettaExpressionDomain;
}

export function toDomainRosettaDisjointExpression(node: any): RosettaDisjointExpressionDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toDomainRosettaExpression(node.right) : undefined,
  };
}

export function toAstRosettaDisjointExpression(node: any): any {
  return {
    $type: 'RosettaDisjointExpression',
    left: node.left ? toAstRosettaExpression(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toAstRosettaExpression(node.right) : undefined,
  };
}

export interface RosettaDocReferenceDomain {
  $type: 'RosettaDocReference';
  name: ("regulatoryReference" | "docReference");
  path?: AnnotationPathExpressionDomain;
  docReference: RegulatoryDocumentReferenceDomain;
  rationales?: DocumentRationaleDomain[];
  structuredProvision?: string;
  provision?: string;
  reportedField?: boolean;
}

export function toDomainRosettaDocReference(node: any): RosettaDocReferenceDomain {
  return {
    $type: node.$type,
    name: node.name,
    path: node.path ? toDomainAnnotationPathExpression(node.path) : undefined,
    docReference: node.docReference ? toDomainRegulatoryDocumentReference(node.docReference) : undefined,
    rationales: (node.rationales ?? []).map((item) => item ? toDomainDocumentRationale(item) : undefined),
    structuredProvision: node.structuredProvision,
    provision: node.provision,
    reportedField: node.reportedField,
  };
}

export function toAstRosettaDocReference(node: any): any {
  return {
    $type: 'RosettaDocReference',
    name: node.name,
    path: node.path ? toAstAnnotationPathExpression(node.path) : undefined,
    docReference: node.docReference ? toAstRegulatoryDocumentReference(node.docReference) : undefined,
    rationales: (node.rationales ?? []).map((item) => item ? toAstDocumentRationale(item) : undefined),
    structuredProvision: node.structuredProvision,
    provision: node.provision,
    reportedField: node.reportedField,
  };
}

export function addRosettaDocReferenceRationales(node: any, item: unknown): void {
  (node.rationales ??= []).push(item);
}

export function removeRosettaDocReferenceRationalesAt(node: any, index: number): void {
  node.rationales?.splice(index, 1);
}

export function setRosettaDocReferenceStructuredProvision(node: any, value: string): void {
  node.structuredProvision = value;
}

export function setRosettaDocReferenceProvision(node: any, value: string): void {
  node.provision = value;
}

export function setRosettaDocReferenceReportedField(node: any, value: boolean): void {
  node.reportedField = value;
}

export interface RosettaEnumerationDomain {
  $type: 'RosettaEnumeration';
  name: string;
  parent?: DomainRef;
  definition?: string;
  enumValues?: RosettaEnumValueDomain[];
  references?: RosettaDocReferenceDomain[];
  annotations?: AnnotationRefDomain[];
  synonyms?: RosettaSynonymDomain[];
  extends?: DomainRef;
  members?: RosettaEnumValueDomain[];
}

export function toDomainRosettaEnumeration(node: any): RosettaEnumerationDomain {
  return {
    $type: node.$type,
    name: node.name,
    parent: node.parent,
    definition: node.definition,
    enumValues: (node.enumValues ?? []).map((item) => item ? toDomainRosettaEnumValue(item) : undefined),
    references: (node.references ?? []).map((item) => item ? toDomainRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toDomainAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toDomainRosettaSynonym(item) : undefined),
    extends: node.parent,
    members: (node.enumValues ?? []).map((item) => item ? toDomainRosettaEnumValue(item) : undefined),
  };
}

export function toAstRosettaEnumeration(node: any): any {
  return {
    $type: 'RosettaEnumeration',
    name: node.name,
    parent: node.parent,
    definition: node.definition,
    enumValues: (node.enumValues ?? []).map((item) => item ? toAstRosettaEnumValue(item) : undefined),
    references: (node.references ?? []).map((item) => item ? toAstRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toAstAnnotationRef(item) : undefined),
    synonyms: (node.synonyms ?? []).map((item) => item ? toAstRosettaSynonym(item) : undefined),
  };
}

export function setRosettaEnumerationName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaEnumerationParent(node: any, value: string): void {
  if (node.parent) node.parent.$refText = value;
  else node.parent = { $refText: value };
}

export function setRosettaEnumerationDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addRosettaEnumerationEnumValues(node: any, item: unknown): void {
  (node.enumValues ??= []).push(item);
}

export function removeRosettaEnumerationEnumValuesAt(node: any, index: number): void {
  node.enumValues?.splice(index, 1);
}

export function addRosettaEnumerationReferences(node: any, item: unknown): void {
  (node.references ??= []).push(item);
}

export function removeRosettaEnumerationReferencesAt(node: any, index: number): void {
  node.references?.splice(index, 1);
}

export function addRosettaEnumerationAnnotations(node: any, item: unknown): void {
  (node.annotations ??= []).push(item);
}

export function removeRosettaEnumerationAnnotationsAt(node: any, index: number): void {
  node.annotations?.splice(index, 1);
}

export function addRosettaEnumerationSynonyms(node: any, item: unknown): void {
  (node.synonyms ??= []).push(item);
}

export function removeRosettaEnumerationSynonymsAt(node: any, index: number): void {
  node.synonyms?.splice(index, 1);
}

export interface RosettaEnumSynonymDomain {
  $type: 'RosettaEnumSynonym';
  sources?: DomainRef[];
  synonymValue: string;
  definition?: string;
  patternMatch?: string;
  patternReplace?: string;
  removeHtml?: boolean;
}

export function toDomainRosettaEnumSynonym(node: any): RosettaEnumSynonymDomain {
  return {
    $type: node.$type,
    sources: (node.sources ?? []).map((item) => item),
    synonymValue: node.synonymValue,
    definition: node.definition,
    patternMatch: node.patternMatch,
    patternReplace: node.patternReplace,
    removeHtml: node.removeHtml,
  };
}

export function toAstRosettaEnumSynonym(node: any): any {
  return {
    $type: 'RosettaEnumSynonym',
    sources: (node.sources ?? []).map((item) => item),
    synonymValue: node.synonymValue,
    definition: node.definition,
    patternMatch: node.patternMatch,
    patternReplace: node.patternReplace,
    removeHtml: node.removeHtml,
  };
}

export function addRosettaEnumSynonymSources(node: any, item: string): void {
  (node.sources ??= []).push({ $refText: item });
}

export function removeRosettaEnumSynonymSourcesAt(node: any, index: number): void {
  node.sources?.splice(index, 1);
}

export function setRosettaEnumSynonymSynonymValue(node: any, value: string): void {
  node.synonymValue = value;
}

export function setRosettaEnumSynonymDefinition(node: any, value: string): void {
  node.definition = value;
}

export function setRosettaEnumSynonymPatternMatch(node: any, value: string): void {
  node.patternMatch = value;
}

export function setRosettaEnumSynonymPatternReplace(node: any, value: string): void {
  node.patternReplace = value;
}

export function setRosettaEnumSynonymRemoveHtml(node: any, value: boolean): void {
  node.removeHtml = value;
}

export interface RosettaEnumValueDomain {
  $type: 'RosettaEnumValue';
  name: string;
  display?: string;
  definition?: string;
  references?: RosettaDocReferenceDomain[];
  annotations?: AnnotationRefDomain[];
  enumSynonyms?: RosettaEnumSynonymDomain[];
}

export function toDomainRosettaEnumValue(node: any): RosettaEnumValueDomain {
  return {
    $type: node.$type,
    name: node.name,
    display: node.display,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toDomainRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toDomainAnnotationRef(item) : undefined),
    enumSynonyms: (node.enumSynonyms ?? []).map((item) => item ? toDomainRosettaEnumSynonym(item) : undefined),
  };
}

export function toAstRosettaEnumValue(node: any): any {
  return {
    $type: 'RosettaEnumValue',
    name: node.name,
    display: node.display,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toAstRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toAstAnnotationRef(item) : undefined),
    enumSynonyms: (node.enumSynonyms ?? []).map((item) => item ? toAstRosettaEnumSynonym(item) : undefined),
  };
}

export function setRosettaEnumValueName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaEnumValueDisplay(node: any, value: string): void {
  node.display = value;
}

export function setRosettaEnumValueDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addRosettaEnumValueReferences(node: any, item: unknown): void {
  (node.references ??= []).push(item);
}

export function removeRosettaEnumValueReferencesAt(node: any, index: number): void {
  node.references?.splice(index, 1);
}

export function addRosettaEnumValueAnnotations(node: any, item: unknown): void {
  (node.annotations ??= []).push(item);
}

export function removeRosettaEnumValueAnnotationsAt(node: any, index: number): void {
  node.annotations?.splice(index, 1);
}

export function addRosettaEnumValueEnumSynonyms(node: any, item: unknown): void {
  (node.enumSynonyms ??= []).push(item);
}

export function removeRosettaEnumValueEnumSynonymsAt(node: any, index: number): void {
  node.enumSynonyms?.splice(index, 1);
}

export interface RosettaEnumValueReferenceDomain {
  $type: 'RosettaEnumValueReference';
  enumeration: DomainRef;
  value: DomainRef;
}

export function toDomainRosettaEnumValueReference(node: any): RosettaEnumValueReferenceDomain {
  return {
    $type: node.$type,
    enumeration: node.enumeration,
    value: node.value,
  };
}

export function toAstRosettaEnumValueReference(node: any): any {
  return {
    $type: 'RosettaEnumValueReference',
    enumeration: node.enumeration,
    value: node.value,
  };
}

export function setRosettaEnumValueReferenceEnumeration(node: any, value: string): void {
  if (node.enumeration) node.enumeration.$refText = value;
  else node.enumeration = { $refText: value };
}

export function setRosettaEnumValueReferenceValue(node: any, value: string): void {
  if (node.value) node.value.$refText = value;
  else node.value = { $refText: value };
}

export interface RosettaExistsExpressionDomain {
  $type: 'RosettaExistsExpression';
  argument?: RosettaExpressionDomain;
  modifier?: string;
  operator: "exists";
}

export function toDomainRosettaExistsExpression(node: any): RosettaExistsExpressionDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    modifier: node.modifier,
    operator: node.operator,
  };
}

export function toAstRosettaExistsExpression(node: any): any {
  return {
    $type: 'RosettaExistsExpression',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    modifier: node.modifier,
    operator: node.operator,
  };
}

export function setRosettaExistsExpressionModifier(node: any, value: string): void {
  node.modifier = value;
}

export interface RosettaExternalClassDomain {
  $type: 'RosettaExternalClass';
  data: DomainRef;
  externalClassSynonyms?: RosettaExternalClassSynonymDomain[];
  regularAttributes?: RosettaExternalRegularAttributeDomain[];
}

export function toDomainRosettaExternalClass(node: any): RosettaExternalClassDomain {
  return {
    $type: node.$type,
    data: node.data,
    externalClassSynonyms: (node.externalClassSynonyms ?? []).map((item) => item ? toDomainRosettaExternalClassSynonym(item) : undefined),
    regularAttributes: (node.regularAttributes ?? []).map((item) => item ? toDomainRosettaExternalRegularAttribute(item) : undefined),
  };
}

export function toAstRosettaExternalClass(node: any): any {
  return {
    $type: 'RosettaExternalClass',
    data: node.data,
    externalClassSynonyms: (node.externalClassSynonyms ?? []).map((item) => item ? toAstRosettaExternalClassSynonym(item) : undefined),
    regularAttributes: (node.regularAttributes ?? []).map((item) => item ? toAstRosettaExternalRegularAttribute(item) : undefined),
  };
}

export function setRosettaExternalClassData(node: any, value: string): void {
  if (node.data) node.data.$refText = value;
  else node.data = { $refText: value };
}

export function addRosettaExternalClassExternalClassSynonyms(node: any, item: unknown): void {
  (node.externalClassSynonyms ??= []).push(item);
}

export function removeRosettaExternalClassExternalClassSynonymsAt(node: any, index: number): void {
  node.externalClassSynonyms?.splice(index, 1);
}

export function addRosettaExternalClassRegularAttributes(node: any, item: unknown): void {
  (node.regularAttributes ??= []).push(item);
}

export function removeRosettaExternalClassRegularAttributesAt(node: any, index: number): void {
  node.regularAttributes?.splice(index, 1);
}

export interface RosettaExternalClassSynonymDomain {
  $type: 'RosettaExternalClassSynonym';
  value?: RosettaSynonymValueBaseDomain;
  metaValue: RosettaSynonymValueBaseDomain;
}

export function toDomainRosettaExternalClassSynonym(node: any): RosettaExternalClassSynonymDomain {
  return {
    $type: node.$type,
    value: node.value ? toDomainRosettaSynonymValueBase(node.value) : undefined,
    metaValue: node.metaValue ? toDomainRosettaSynonymValueBase(node.metaValue) : undefined,
  };
}

export function toAstRosettaExternalClassSynonym(node: any): any {
  return {
    $type: 'RosettaExternalClassSynonym',
    value: node.value ? toAstRosettaSynonymValueBase(node.value) : undefined,
    metaValue: node.metaValue ? toAstRosettaSynonymValueBase(node.metaValue) : undefined,
  };
}

export interface RosettaExternalEnumDomain {
  $type: 'RosettaExternalEnum';
  enumeration: DomainRef;
  regularValues?: RosettaExternalEnumValueDomain[];
}

export function toDomainRosettaExternalEnum(node: any): RosettaExternalEnumDomain {
  return {
    $type: node.$type,
    enumeration: node.enumeration,
    regularValues: (node.regularValues ?? []).map((item) => item ? toDomainRosettaExternalEnumValue(item) : undefined),
  };
}

export function toAstRosettaExternalEnum(node: any): any {
  return {
    $type: 'RosettaExternalEnum',
    enumeration: node.enumeration,
    regularValues: (node.regularValues ?? []).map((item) => item ? toAstRosettaExternalEnumValue(item) : undefined),
  };
}

export function setRosettaExternalEnumEnumeration(node: any, value: string): void {
  if (node.enumeration) node.enumeration.$refText = value;
  else node.enumeration = { $refText: value };
}

export function addRosettaExternalEnumRegularValues(node: any, item: unknown): void {
  (node.regularValues ??= []).push(item);
}

export function removeRosettaExternalEnumRegularValuesAt(node: any, index: number): void {
  node.regularValues?.splice(index, 1);
}

export interface RosettaExternalEnumValueDomain {
  $type: 'RosettaExternalEnumValue';
  operator: string;
  enumRef: DomainRef;
  externalEnumSynonyms?: RosettaEnumSynonymDomain[];
}

export function toDomainRosettaExternalEnumValue(node: any): RosettaExternalEnumValueDomain {
  return {
    $type: node.$type,
    operator: node.operator,
    enumRef: node.enumRef,
    externalEnumSynonyms: (node.externalEnumSynonyms ?? []).map((item) => item ? toDomainRosettaEnumSynonym(item) : undefined),
  };
}

export function toAstRosettaExternalEnumValue(node: any): any {
  return {
    $type: 'RosettaExternalEnumValue',
    operator: node.operator,
    enumRef: node.enumRef,
    externalEnumSynonyms: (node.externalEnumSynonyms ?? []).map((item) => item ? toAstRosettaEnumSynonym(item) : undefined),
  };
}

export function setRosettaExternalEnumValueOperator(node: any, value: string): void {
  node.operator = value;
}

export function setRosettaExternalEnumValueEnumRef(node: any, value: string): void {
  if (node.enumRef) node.enumRef.$refText = value;
  else node.enumRef = { $refText: value };
}

export function addRosettaExternalEnumValueExternalEnumSynonyms(node: any, item: unknown): void {
  (node.externalEnumSynonyms ??= []).push(item);
}

export function removeRosettaExternalEnumValueExternalEnumSynonymsAt(node: any, index: number): void {
  node.externalEnumSynonyms?.splice(index, 1);
}

export interface RosettaExternalFunctionDomain {
  $type: 'RosettaExternalFunction';
  name: string;
  typeCall: TypeCallDomain;
  definition?: string;
  parameters?: RosettaParameterDomain[];
}

export function toDomainRosettaExternalFunction(node: any): RosettaExternalFunctionDomain {
  return {
    $type: node.$type,
    name: node.name,
    typeCall: node.typeCall ? toDomainTypeCall(node.typeCall) : undefined,
    definition: node.definition,
    parameters: (node.parameters ?? []).map((item) => item ? toDomainRosettaParameter(item) : undefined),
  };
}

export function toAstRosettaExternalFunction(node: any): any {
  return {
    $type: 'RosettaExternalFunction',
    name: node.name,
    typeCall: node.typeCall ? toAstTypeCall(node.typeCall) : undefined,
    definition: node.definition,
    parameters: (node.parameters ?? []).map((item) => item ? toAstRosettaParameter(item) : undefined),
  };
}

export function setRosettaExternalFunctionName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaExternalFunctionDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addRosettaExternalFunctionParameters(node: any, item: unknown): void {
  (node.parameters ??= []).push(item);
}

export function removeRosettaExternalFunctionParametersAt(node: any, index: number): void {
  node.parameters?.splice(index, 1);
}

export interface RosettaExternalRegularAttributeDomain {
  $type: 'RosettaExternalRegularAttribute';
  operator: string;
  attributeRef: DomainRef;
  externalSynonyms?: RosettaExternalSynonymDomain[];
  externalRuleReferences?: RuleReferenceAnnotationDomain[];
}

export function toDomainRosettaExternalRegularAttribute(node: any): RosettaExternalRegularAttributeDomain {
  return {
    $type: node.$type,
    operator: node.operator,
    attributeRef: node.attributeRef,
    externalSynonyms: (node.externalSynonyms ?? []).map((item) => item ? toDomainRosettaExternalSynonym(item) : undefined),
    externalRuleReferences: (node.externalRuleReferences ?? []).map((item) => item ? toDomainRuleReferenceAnnotation(item) : undefined),
  };
}

export function toAstRosettaExternalRegularAttribute(node: any): any {
  return {
    $type: 'RosettaExternalRegularAttribute',
    operator: node.operator,
    attributeRef: node.attributeRef,
    externalSynonyms: (node.externalSynonyms ?? []).map((item) => item ? toAstRosettaExternalSynonym(item) : undefined),
    externalRuleReferences: (node.externalRuleReferences ?? []).map((item) => item ? toAstRuleReferenceAnnotation(item) : undefined),
  };
}

export function setRosettaExternalRegularAttributeOperator(node: any, value: string): void {
  node.operator = value;
}

export function setRosettaExternalRegularAttributeAttributeRef(node: any, value: string): void {
  if (node.attributeRef) node.attributeRef.$refText = value;
  else node.attributeRef = { $refText: value };
}

export function addRosettaExternalRegularAttributeExternalSynonyms(node: any, item: unknown): void {
  (node.externalSynonyms ??= []).push(item);
}

export function removeRosettaExternalRegularAttributeExternalSynonymsAt(node: any, index: number): void {
  node.externalSynonyms?.splice(index, 1);
}

export function addRosettaExternalRegularAttributeExternalRuleReferences(node: any, item: unknown): void {
  (node.externalRuleReferences ??= []).push(item);
}

export function removeRosettaExternalRegularAttributeExternalRuleReferencesAt(node: any, index: number): void {
  node.externalRuleReferences?.splice(index, 1);
}

export interface RosettaExternalRuleSourceDomain {
  $type: 'RosettaExternalRuleSource';
  name: string;
  externalClasses?: RosettaExternalClassDomain[];
  externalEnums?: RosettaExternalEnumDomain[];
  superSources?: DomainRef[];
}

export function toDomainRosettaExternalRuleSource(node: any): RosettaExternalRuleSourceDomain {
  return {
    $type: node.$type,
    name: node.name,
    externalClasses: (node.externalClasses ?? []).map((item) => item ? toDomainRosettaExternalClass(item) : undefined),
    externalEnums: (node.externalEnums ?? []).map((item) => item ? toDomainRosettaExternalEnum(item) : undefined),
    superSources: (node.superSources ?? []).map((item) => item),
  };
}

export function toAstRosettaExternalRuleSource(node: any): any {
  return {
    $type: 'RosettaExternalRuleSource',
    name: node.name,
    externalClasses: (node.externalClasses ?? []).map((item) => item ? toAstRosettaExternalClass(item) : undefined),
    externalEnums: (node.externalEnums ?? []).map((item) => item ? toAstRosettaExternalEnum(item) : undefined),
    superSources: (node.superSources ?? []).map((item) => item),
  };
}

export function setRosettaExternalRuleSourceName(node: any, value: string): void {
  node.name = value;
}

export function addRosettaExternalRuleSourceExternalClasses(node: any, item: unknown): void {
  (node.externalClasses ??= []).push(item);
}

export function removeRosettaExternalRuleSourceExternalClassesAt(node: any, index: number): void {
  node.externalClasses?.splice(index, 1);
}

export function addRosettaExternalRuleSourceExternalEnums(node: any, item: unknown): void {
  (node.externalEnums ??= []).push(item);
}

export function removeRosettaExternalRuleSourceExternalEnumsAt(node: any, index: number): void {
  node.externalEnums?.splice(index, 1);
}

export function addRosettaExternalRuleSourceSuperSources(node: any, item: string): void {
  (node.superSources ??= []).push({ $refText: item });
}

export function removeRosettaExternalRuleSourceSuperSourcesAt(node: any, index: number): void {
  node.superSources?.splice(index, 1);
}

export interface RosettaExternalSynonymDomain {
  $type: 'RosettaExternalSynonym';
  body: RosettaSynonymBodyDomain;
}

export function toDomainRosettaExternalSynonym(node: any): RosettaExternalSynonymDomain {
  return {
    $type: node.$type,
    body: node.body ? toDomainRosettaSynonymBody(node.body) : undefined,
  };
}

export function toAstRosettaExternalSynonym(node: any): any {
  return {
    $type: 'RosettaExternalSynonym',
    body: node.body ? toAstRosettaSynonymBody(node.body) : undefined,
  };
}

export interface RosettaFeatureCallDomain {
  $type: 'RosettaFeatureCall';
  receiver: RosettaExpressionDomain;
  feature?: DomainRef;
}

export function toDomainRosettaFeatureCall(node: any): RosettaFeatureCallDomain {
  return {
    $type: node.$type,
    receiver: node.receiver ? toDomainRosettaExpression(node.receiver) : undefined,
    feature: node.feature,
  };
}

export function toAstRosettaFeatureCall(node: any): any {
  return {
    $type: 'RosettaFeatureCall',
    receiver: node.receiver ? toAstRosettaExpression(node.receiver) : undefined,
    feature: node.feature,
  };
}

export function setRosettaFeatureCallFeature(node: any, value: string): void {
  if (node.feature) node.feature.$refText = value;
  else node.feature = { $refText: value };
}

export interface RosettaFunctionDomain {
  $type: 'RosettaFunction';
  name: string;
  dispatchAttribute?: DomainRef;
  dispatchValue?: RosettaEnumValueReferenceDomain;
  superFunction?: DomainRef;
  definition?: string;
  references?: RosettaDocReferenceDomain[];
  annotations?: AnnotationRefDomain[];
  inputs?: AttributeDomain[];
  output?: AttributeDomain;
  shortcuts?: ShortcutDeclarationDomain[];
  conditions?: ConditionDomain[];
  operations?: OperationDomain[];
  postConditions?: ConditionDomain[];
  extends?: DomainRef;
  members?: AttributeDomain[];
}

export function toDomainRosettaFunction(node: any): RosettaFunctionDomain {
  return {
    $type: node.$type,
    name: node.name,
    dispatchAttribute: node.dispatchAttribute,
    dispatchValue: node.dispatchValue ? toDomainRosettaEnumValueReference(node.dispatchValue) : undefined,
    superFunction: node.superFunction,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toDomainRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toDomainAnnotationRef(item) : undefined),
    inputs: (node.inputs ?? []).map((item) => item ? toDomainAttribute(item) : undefined),
    output: node.output ? toDomainAttribute(node.output) : undefined,
    shortcuts: (node.shortcuts ?? []).map((item) => item ? toDomainShortcutDeclaration(item) : undefined),
    conditions: (node.conditions ?? []).map((item) => item ? toDomainCondition(item) : undefined),
    operations: (node.operations ?? []).map((item) => item ? toDomainOperation(item) : undefined),
    postConditions: (node.postConditions ?? []).map((item) => item ? toDomainCondition(item) : undefined),
    extends: node.superFunction,
    members: (node.inputs ?? []).map((item) => item ? toDomainAttribute(item) : undefined),
  };
}

export function toAstRosettaFunction(node: any): any {
  return {
    $type: 'RosettaFunction',
    name: node.name,
    dispatchAttribute: node.dispatchAttribute,
    dispatchValue: node.dispatchValue ? toAstRosettaEnumValueReference(node.dispatchValue) : undefined,
    superFunction: node.superFunction,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toAstRosettaDocReference(item) : undefined),
    annotations: (node.annotations ?? []).map((item) => item ? toAstAnnotationRef(item) : undefined),
    inputs: (node.inputs ?? []).map((item) => item ? toAstAttribute(item) : undefined),
    output: node.output ? toAstAttribute(node.output) : undefined,
    shortcuts: (node.shortcuts ?? []).map((item) => item ? toAstShortcutDeclaration(item) : undefined),
    conditions: (node.conditions ?? []).map((item) => item ? toAstCondition(item) : undefined),
    operations: (node.operations ?? []).map((item) => item ? toAstOperation(item) : undefined),
    postConditions: (node.postConditions ?? []).map((item) => item ? toAstCondition(item) : undefined),
  };
}

export function setRosettaFunctionName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaFunctionDispatchAttribute(node: any, value: string): void {
  if (node.dispatchAttribute) node.dispatchAttribute.$refText = value;
  else node.dispatchAttribute = { $refText: value };
}

export function setRosettaFunctionSuperFunction(node: any, value: string): void {
  if (node.superFunction) node.superFunction.$refText = value;
  else node.superFunction = { $refText: value };
}

export function setRosettaFunctionDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addRosettaFunctionReferences(node: any, item: unknown): void {
  (node.references ??= []).push(item);
}

export function removeRosettaFunctionReferencesAt(node: any, index: number): void {
  node.references?.splice(index, 1);
}

export function addRosettaFunctionAnnotations(node: any, item: unknown): void {
  (node.annotations ??= []).push(item);
}

export function removeRosettaFunctionAnnotationsAt(node: any, index: number): void {
  node.annotations?.splice(index, 1);
}

export function addRosettaFunctionInputs(node: any, item: unknown): void {
  (node.inputs ??= []).push(item);
}

export function removeRosettaFunctionInputsAt(node: any, index: number): void {
  node.inputs?.splice(index, 1);
}

export function addRosettaFunctionShortcuts(node: any, item: unknown): void {
  (node.shortcuts ??= []).push(item);
}

export function removeRosettaFunctionShortcutsAt(node: any, index: number): void {
  node.shortcuts?.splice(index, 1);
}

export function addRosettaFunctionConditions(node: any, item: unknown): void {
  (node.conditions ??= []).push(item);
}

export function removeRosettaFunctionConditionsAt(node: any, index: number): void {
  node.conditions?.splice(index, 1);
}

export function addRosettaFunctionOperations(node: any, item: unknown): void {
  (node.operations ??= []).push(item);
}

export function removeRosettaFunctionOperationsAt(node: any, index: number): void {
  node.operations?.splice(index, 1);
}

export function addRosettaFunctionPostConditions(node: any, item: unknown): void {
  (node.postConditions ??= []).push(item);
}

export function removeRosettaFunctionPostConditionsAt(node: any, index: number): void {
  node.postConditions?.splice(index, 1);
}

export interface RosettaImplicitVariableDomain {
  $type: 'RosettaImplicitVariable';
  name: "item";
}

export function toDomainRosettaImplicitVariable(node: any): RosettaImplicitVariableDomain {
  return {
    $type: node.$type,
    name: node.name,
  };
}

export function toAstRosettaImplicitVariable(node: any): any {
  return {
    $type: 'RosettaImplicitVariable',
    name: node.name,
  };
}

export interface RosettaIntLiteralDomain {
  $type: 'RosettaIntLiteral';
  value: bigint;
}

export function toDomainRosettaIntLiteral(node: any): RosettaIntLiteralDomain {
  return {
    $type: node.$type,
    value: node.value,
  };
}

export function toAstRosettaIntLiteral(node: any): any {
  return {
    $type: 'RosettaIntLiteral',
    value: node.value,
  };
}

export function setRosettaIntLiteralValue(node: any, value: bigint): void {
  node.value = value;
}

export interface RosettaMapPathDomain {
  $type: 'RosettaMapPath';
  path: RosettaMapPathValueDomain;
}

export function toDomainRosettaMapPath(node: any): RosettaMapPathDomain {
  return {
    $type: node.$type,
    path: node.path ? toDomainRosettaMapPathValue(node.path) : undefined,
  };
}

export function toAstRosettaMapPath(node: any): any {
  return {
    $type: 'RosettaMapPath',
    path: node.path ? toAstRosettaMapPathValue(node.path) : undefined,
  };
}

export interface RosettaMapPathValueDomain {
  $type: 'RosettaMapPathValue';
  path: string;
}

export function toDomainRosettaMapPathValue(node: any): RosettaMapPathValueDomain {
  return {
    $type: node.$type,
    path: node.path,
  };
}

export function toAstRosettaMapPathValue(node: any): any {
  return {
    $type: 'RosettaMapPathValue',
    path: node.path,
  };
}

export function setRosettaMapPathValuePath(node: any, value: string): void {
  node.path = value;
}

export interface RosettaMappingDomain {
  $type: 'RosettaMapping';
  instances: RosettaMappingInstanceDomain[];
}

export function toDomainRosettaMapping(node: any): RosettaMappingDomain {
  return {
    $type: node.$type,
    instances: (node.instances ?? []).map((item) => item ? toDomainRosettaMappingInstance(item) : undefined),
  };
}

export function toAstRosettaMapping(node: any): any {
  return {
    $type: 'RosettaMapping',
    instances: (node.instances ?? []).map((item) => item ? toAstRosettaMappingInstance(item) : undefined),
  };
}

export function addRosettaMappingInstances(node: any, item: unknown): void {
  (node.instances ??= []).push(item);
}

export function removeRosettaMappingInstancesAt(node: any, index: number): void {
  node.instances?.splice(index, 1);
}

export interface RosettaMappingInstanceDomain {
  $type: 'RosettaMappingInstance';
  when?: RosettaMappingPathTestsDomain;
  default?: boolean;
  set?: RosettaMapTestExpressionDomain;
}

export function toDomainRosettaMappingInstance(node: any): RosettaMappingInstanceDomain {
  return {
    $type: node.$type,
    when: node.when ? toDomainRosettaMappingPathTests(node.when) : undefined,
    default: node.default,
    set: node.set ? toDomainRosettaMapTestExpression(node.set) : undefined,
  };
}

export function toAstRosettaMappingInstance(node: any): any {
  return {
    $type: 'RosettaMappingInstance',
    when: node.when ? toAstRosettaMappingPathTests(node.when) : undefined,
    default: node.default,
    set: node.set ? toAstRosettaMapTestExpression(node.set) : undefined,
  };
}

export function setRosettaMappingInstanceDefault(node: any, value: boolean): void {
  node.default = value;
}

export interface RosettaMappingPathTestsDomain {
  $type: 'RosettaMappingPathTests';
  tests: RosettaMapTestDomain[];
}

export function toDomainRosettaMappingPathTests(node: any): RosettaMappingPathTestsDomain {
  return {
    $type: node.$type,
    tests: (node.tests ?? []).map((item) => item ? toDomainRosettaMapTest(item) : undefined),
  };
}

export function toAstRosettaMappingPathTests(node: any): any {
  return {
    $type: 'RosettaMappingPathTests',
    tests: (node.tests ?? []).map((item) => item ? toAstRosettaMapTest(item) : undefined),
  };
}

export function addRosettaMappingPathTestsTests(node: any, item: unknown): void {
  (node.tests ??= []).push(item);
}

export function removeRosettaMappingPathTestsTestsAt(node: any, index: number): void {
  node.tests?.splice(index, 1);
}

export interface RosettaMapRosettaPathDomain {
  $type: 'RosettaMapRosettaPath';
  path: RosettaAttributeReferenceDomain;
}

export function toDomainRosettaMapRosettaPath(node: any): RosettaMapRosettaPathDomain {
  return {
    $type: node.$type,
    path: node.path ? toDomainRosettaAttributeReference(node.path) : undefined,
  };
}

export function toAstRosettaMapRosettaPath(node: any): any {
  return {
    $type: 'RosettaMapRosettaPath',
    path: node.path ? toAstRosettaAttributeReference(node.path) : undefined,
  };
}

export interface RosettaMapTestAbsentExpressionDomain {
  $type: 'RosettaMapTestAbsentExpression';
  argument: RosettaMapPathValueDomain;
}

export function toDomainRosettaMapTestAbsentExpression(node: any): RosettaMapTestAbsentExpressionDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaMapPathValue(node.argument) : undefined,
  };
}

export function toAstRosettaMapTestAbsentExpression(node: any): any {
  return {
    $type: 'RosettaMapTestAbsentExpression',
    argument: node.argument ? toAstRosettaMapPathValue(node.argument) : undefined,
  };
}

export interface RosettaMapTestEqualityOperationDomain {
  $type: 'RosettaMapTestEqualityOperation';
  left: RosettaMapPathValueDomain;
  operator: ("=" | "<>");
  right: RosettaMapTestExpressionDomain;
}

export function toDomainRosettaMapTestEqualityOperation(node: any): RosettaMapTestEqualityOperationDomain {
  return {
    $type: node.$type,
    left: node.left ? toDomainRosettaMapPathValue(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toDomainRosettaMapTestExpression(node.right) : undefined,
  };
}

export function toAstRosettaMapTestEqualityOperation(node: any): any {
  return {
    $type: 'RosettaMapTestEqualityOperation',
    left: node.left ? toAstRosettaMapPathValue(node.left) : undefined,
    operator: node.operator,
    right: node.right ? toAstRosettaMapTestExpression(node.right) : undefined,
  };
}

export interface RosettaMapTestExistsExpressionDomain {
  $type: 'RosettaMapTestExistsExpression';
  argument: RosettaMapPathValueDomain;
}

export function toDomainRosettaMapTestExistsExpression(node: any): RosettaMapTestExistsExpressionDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaMapPathValue(node.argument) : undefined,
  };
}

export function toAstRosettaMapTestExistsExpression(node: any): any {
  return {
    $type: 'RosettaMapTestExistsExpression',
    argument: node.argument ? toAstRosettaMapPathValue(node.argument) : undefined,
  };
}

export interface RosettaMapTestFuncDomain {
  $type: 'RosettaMapTestFunc';
  func: DomainRef;
  predicatePath?: RosettaMapPathValueDomain;
}

export function toDomainRosettaMapTestFunc(node: any): RosettaMapTestFuncDomain {
  return {
    $type: node.$type,
    func: node.func,
    predicatePath: node.predicatePath ? toDomainRosettaMapPathValue(node.predicatePath) : undefined,
  };
}

export function toAstRosettaMapTestFunc(node: any): any {
  return {
    $type: 'RosettaMapTestFunc',
    func: node.func,
    predicatePath: node.predicatePath ? toAstRosettaMapPathValue(node.predicatePath) : undefined,
  };
}

export function setRosettaMapTestFuncFunc(node: any, value: string): void {
  if (node.func) node.func.$refText = value;
  else node.func = { $refText: value };
}

export interface RosettaMergeSynonymValueDomain {
  $type: 'RosettaMergeSynonymValue';
  name: string;
  excludePath?: string;
}

export function toDomainRosettaMergeSynonymValue(node: any): RosettaMergeSynonymValueDomain {
  return {
    $type: node.$type,
    name: node.name,
    excludePath: node.excludePath,
  };
}

export function toAstRosettaMergeSynonymValue(node: any): any {
  return {
    $type: 'RosettaMergeSynonymValue',
    name: node.name,
    excludePath: node.excludePath,
  };
}

export function setRosettaMergeSynonymValueName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaMergeSynonymValueExcludePath(node: any, value: string): void {
  node.excludePath = value;
}

export interface RosettaMetaTypeDomain {
  $type: 'RosettaMetaType';
  name: string;
  typeCall: TypeCallDomain;
}

export function toDomainRosettaMetaType(node: any): RosettaMetaTypeDomain {
  return {
    $type: node.$type,
    name: node.name,
    typeCall: node.typeCall ? toDomainTypeCall(node.typeCall) : undefined,
  };
}

export function toAstRosettaMetaType(node: any): any {
  return {
    $type: 'RosettaMetaType',
    name: node.name,
    typeCall: node.typeCall ? toAstTypeCall(node.typeCall) : undefined,
  };
}

export function setRosettaMetaTypeName(node: any, value: string): void {
  node.name = value;
}

export interface RosettaModelDomain {
  $type: 'RosettaModel';
  overridden?: boolean;
  name: (string | string);
  definition?: string;
  scope?: RosettaScopeDomain;
  version?: string;
  imports?: ImportDomain[];
  configurations?: RosettaQualifiableConfigurationDomain[];
  elements?: RosettaRootElementDomain[];
}

export function toDomainRosettaModel(node: any): RosettaModelDomain {
  return {
    $type: node.$type,
    overridden: node.overridden,
    name: node.name,
    definition: node.definition,
    scope: node.scope ? toDomainRosettaScope(node.scope) : undefined,
    version: node.version,
    imports: (node.imports ?? []).map((item) => item ? toDomainImport(item) : undefined),
    configurations: (node.configurations ?? []).map((item) => item ? toDomainRosettaQualifiableConfiguration(item) : undefined),
    elements: (node.elements ?? []).map((item) => item ? toDomainRosettaRootElement(item) : undefined),
  };
}

export function toAstRosettaModel(node: any): any {
  return {
    $type: 'RosettaModel',
    overridden: node.overridden,
    name: node.name,
    definition: node.definition,
    scope: node.scope ? toAstRosettaScope(node.scope) : undefined,
    version: node.version,
    imports: (node.imports ?? []).map((item) => item ? toAstImport(item) : undefined),
    configurations: (node.configurations ?? []).map((item) => item ? toAstRosettaQualifiableConfiguration(item) : undefined),
    elements: (node.elements ?? []).map((item) => item ? toAstRosettaRootElement(item) : undefined),
  };
}

export function setRosettaModelOverridden(node: any, value: boolean): void {
  node.overridden = value;
}

export function setRosettaModelDefinition(node: any, value: string): void {
  node.definition = value;
}

export function setRosettaModelVersion(node: any, value: string): void {
  node.version = value;
}

export function addRosettaModelImports(node: any, item: unknown): void {
  (node.imports ??= []).push(item);
}

export function removeRosettaModelImportsAt(node: any, index: number): void {
  node.imports?.splice(index, 1);
}

export function addRosettaModelConfigurations(node: any, item: unknown): void {
  (node.configurations ??= []).push(item);
}

export function removeRosettaModelConfigurationsAt(node: any, index: number): void {
  node.configurations?.splice(index, 1);
}

export function addRosettaModelElements(node: any, item: unknown): void {
  (node.elements ??= []).push(item);
}

export function removeRosettaModelElementsAt(node: any, index: number): void {
  node.elements?.splice(index, 1);
}

export interface RosettaNumberLiteralDomain {
  $type: 'RosettaNumberLiteral';
  value: string;
}

export function toDomainRosettaNumberLiteral(node: any): RosettaNumberLiteralDomain {
  return {
    $type: node.$type,
    value: node.value,
  };
}

export function toAstRosettaNumberLiteral(node: any): any {
  return {
    $type: 'RosettaNumberLiteral',
    value: node.value,
  };
}

export function setRosettaNumberLiteralValue(node: any, value: string): void {
  node.value = value;
}

export interface RosettaOnlyElementDomain {
  $type: 'RosettaOnlyElement';
  argument?: RosettaExpressionDomain;
  operator: "only-element";
}

export function toDomainRosettaOnlyElement(node: any): RosettaOnlyElementDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstRosettaOnlyElement(node: any): any {
  return {
    $type: 'RosettaOnlyElement',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface RosettaOnlyExistsExpressionDomain {
  $type: 'RosettaOnlyExistsExpression';
  argument?: RosettaExpressionDomain;
  operator?: "exists";
  args?: RosettaExpressionDomain[];
}

export function toDomainRosettaOnlyExistsExpression(node: any): RosettaOnlyExistsExpressionDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    args: (node.args ?? []).map((item) => item ? toDomainRosettaExpression(item) : undefined),
  };
}

export function toAstRosettaOnlyExistsExpression(node: any): any {
  return {
    $type: 'RosettaOnlyExistsExpression',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    args: (node.args ?? []).map((item) => item ? toAstRosettaExpression(item) : undefined),
  };
}

export function addRosettaOnlyExistsExpressionArgs(node: any, item: unknown): void {
  (node.args ??= []).push(item);
}

export function removeRosettaOnlyExistsExpressionArgsAt(node: any, index: number): void {
  node.args?.splice(index, 1);
}

export interface RosettaParameterDomain {
  $type: 'RosettaParameter';
  name: string;
  typeCall: TypeCallDomain;
  isArray?: boolean;
}

export function toDomainRosettaParameter(node: any): RosettaParameterDomain {
  return {
    $type: node.$type,
    name: node.name,
    typeCall: node.typeCall ? toDomainTypeCall(node.typeCall) : undefined,
    isArray: node.isArray,
  };
}

export function toAstRosettaParameter(node: any): any {
  return {
    $type: 'RosettaParameter',
    name: node.name,
    typeCall: node.typeCall ? toAstTypeCall(node.typeCall) : undefined,
    isArray: node.isArray,
  };
}

export function setRosettaParameterName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaParameterIsArray(node: any, value: boolean): void {
  node.isArray = value;
}

export interface RosettaQualifiableConfigurationDomain {
  $type: 'RosettaQualifiableConfiguration';
  qType: string;
  rosettaClass: DomainRef;
}

export function toDomainRosettaQualifiableConfiguration(node: any): RosettaQualifiableConfigurationDomain {
  return {
    $type: node.$type,
    qType: node.qType,
    rosettaClass: node.rosettaClass,
  };
}

export function toAstRosettaQualifiableConfiguration(node: any): any {
  return {
    $type: 'RosettaQualifiableConfiguration',
    qType: node.qType,
    rosettaClass: node.rosettaClass,
  };
}

export function setRosettaQualifiableConfigurationQType(node: any, value: string): void {
  node.qType = value;
}

export function setRosettaQualifiableConfigurationRosettaClass(node: any, value: string): void {
  if (node.rosettaClass) node.rosettaClass.$refText = value;
  else node.rosettaClass = { $refText: value };
}

export interface RosettaRecordFeatureDomain {
  $type: 'RosettaRecordFeature';
  name: string;
  typeCall: TypeCallDomain;
}

export function toDomainRosettaRecordFeature(node: any): RosettaRecordFeatureDomain {
  return {
    $type: node.$type,
    name: node.name,
    typeCall: node.typeCall ? toDomainTypeCall(node.typeCall) : undefined,
  };
}

export function toAstRosettaRecordFeature(node: any): any {
  return {
    $type: 'RosettaRecordFeature',
    name: node.name,
    typeCall: node.typeCall ? toAstTypeCall(node.typeCall) : undefined,
  };
}

export function setRosettaRecordFeatureName(node: any, value: string): void {
  node.name = value;
}

export interface RosettaRecordTypeDomain {
  $type: 'RosettaRecordType';
  name: string;
  definition?: string;
  features?: RosettaRecordFeatureDomain[];
  members?: RosettaRecordFeatureDomain[];
}

export function toDomainRosettaRecordType(node: any): RosettaRecordTypeDomain {
  return {
    $type: node.$type,
    name: node.name,
    definition: node.definition,
    features: (node.features ?? []).map((item) => item ? toDomainRosettaRecordFeature(item) : undefined),
    members: (node.features ?? []).map((item) => item ? toDomainRosettaRecordFeature(item) : undefined),
  };
}

export function toAstRosettaRecordType(node: any): any {
  return {
    $type: 'RosettaRecordType',
    name: node.name,
    definition: node.definition,
    features: (node.features ?? []).map((item) => item ? toAstRosettaRecordFeature(item) : undefined),
  };
}

export function setRosettaRecordTypeName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaRecordTypeDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addRosettaRecordTypeFeatures(node: any, item: unknown): void {
  (node.features ??= []).push(item);
}

export function removeRosettaRecordTypeFeaturesAt(node: any, index: number): void {
  node.features?.splice(index, 1);
}

export interface RosettaReportDomain {
  $type: 'RosettaReport';
  regulatoryBody: RegulatoryDocumentReferenceDomain;
  inputType: TypeCallDomain;
  eligibilityRules: DomainRef[];
  reportingStandard?: DomainRef;
  reportType: DomainRef;
  ruleSource?: DomainRef;
}

export function toDomainRosettaReport(node: any): RosettaReportDomain {
  return {
    $type: node.$type,
    regulatoryBody: node.regulatoryBody ? toDomainRegulatoryDocumentReference(node.regulatoryBody) : undefined,
    inputType: node.inputType ? toDomainTypeCall(node.inputType) : undefined,
    eligibilityRules: (node.eligibilityRules ?? []).map((item) => item),
    reportingStandard: node.reportingStandard,
    reportType: node.reportType,
    ruleSource: node.ruleSource,
  };
}

export function toAstRosettaReport(node: any): any {
  return {
    $type: 'RosettaReport',
    regulatoryBody: node.regulatoryBody ? toAstRegulatoryDocumentReference(node.regulatoryBody) : undefined,
    inputType: node.inputType ? toAstTypeCall(node.inputType) : undefined,
    eligibilityRules: (node.eligibilityRules ?? []).map((item) => item),
    reportingStandard: node.reportingStandard,
    reportType: node.reportType,
    ruleSource: node.ruleSource,
  };
}

export function addRosettaReportEligibilityRules(node: any, item: string): void {
  (node.eligibilityRules ??= []).push({ $refText: item });
}

export function removeRosettaReportEligibilityRulesAt(node: any, index: number): void {
  node.eligibilityRules?.splice(index, 1);
}

export function setRosettaReportReportingStandard(node: any, value: string): void {
  if (node.reportingStandard) node.reportingStandard.$refText = value;
  else node.reportingStandard = { $refText: value };
}

export function setRosettaReportReportType(node: any, value: string): void {
  if (node.reportType) node.reportType.$refText = value;
  else node.reportType = { $refText: value };
}

export function setRosettaReportRuleSource(node: any, value: string): void {
  if (node.ruleSource) node.ruleSource.$refText = value;
  else node.ruleSource = { $refText: value };
}

export interface RosettaRuleDomain {
  $type: 'RosettaRule';
  name: string;
  eligibility?: boolean;
  input?: TypeCallDomain;
  definition?: string;
  references?: RosettaDocReferenceDomain[];
  expression: RosettaExpressionDomain;
  identifier?: string;
}

export function toDomainRosettaRule(node: any): RosettaRuleDomain {
  return {
    $type: node.$type,
    name: node.name,
    eligibility: node.eligibility,
    input: node.input ? toDomainTypeCall(node.input) : undefined,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toDomainRosettaDocReference(item) : undefined),
    expression: node.expression ? toDomainRosettaExpression(node.expression) : undefined,
    identifier: node.identifier,
  };
}

export function toAstRosettaRule(node: any): any {
  return {
    $type: 'RosettaRule',
    name: node.name,
    eligibility: node.eligibility,
    input: node.input ? toAstTypeCall(node.input) : undefined,
    definition: node.definition,
    references: (node.references ?? []).map((item) => item ? toAstRosettaDocReference(item) : undefined),
    expression: node.expression ? toAstRosettaExpression(node.expression) : undefined,
    identifier: node.identifier,
  };
}

export function setRosettaRuleName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaRuleEligibility(node: any, value: boolean): void {
  node.eligibility = value;
}

export function setRosettaRuleDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addRosettaRuleReferences(node: any, item: unknown): void {
  (node.references ??= []).push(item);
}

export function removeRosettaRuleReferencesAt(node: any, index: number): void {
  node.references?.splice(index, 1);
}

export function setRosettaRuleIdentifier(node: any, value: string): void {
  node.identifier = value;
}

export interface RosettaScopeDomain {
  $type: 'RosettaScope';
  name: string;
  definition?: string;
}

export function toDomainRosettaScope(node: any): RosettaScopeDomain {
  return {
    $type: node.$type,
    name: node.name,
    definition: node.definition,
  };
}

export function toAstRosettaScope(node: any): any {
  return {
    $type: 'RosettaScope',
    name: node.name,
    definition: node.definition,
  };
}

export function setRosettaScopeName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaScopeDefinition(node: any, value: string): void {
  node.definition = value;
}

export interface RosettaSegmentDomain {
  $type: 'RosettaSegment';
  name: (string | "rationale" | "rationale_author" | "structured_provision");
}

export function toDomainRosettaSegment(node: any): RosettaSegmentDomain {
  return {
    $type: node.$type,
    name: node.name,
  };
}

export function toAstRosettaSegment(node: any): any {
  return {
    $type: 'RosettaSegment',
    name: node.name,
  };
}

export interface RosettaSegmentRefDomain {
  $type: 'RosettaSegmentRef';
  segment: DomainRef;
  segmentRef: string;
}

export function toDomainRosettaSegmentRef(node: any): RosettaSegmentRefDomain {
  return {
    $type: node.$type,
    segment: node.segment,
    segmentRef: node.segmentRef,
  };
}

export function toAstRosettaSegmentRef(node: any): any {
  return {
    $type: 'RosettaSegmentRef',
    segment: node.segment,
    segmentRef: node.segmentRef,
  };
}

export function setRosettaSegmentRefSegment(node: any, value: string): void {
  if (node.segment) node.segment.$refText = value;
  else node.segment = { $refText: value };
}

export function setRosettaSegmentRefSegmentRef(node: any, value: string): void {
  node.segmentRef = value;
}

export interface RosettaStringLiteralDomain {
  $type: 'RosettaStringLiteral';
  value: string;
}

export function toDomainRosettaStringLiteral(node: any): RosettaStringLiteralDomain {
  return {
    $type: node.$type,
    value: node.value,
  };
}

export function toAstRosettaStringLiteral(node: any): any {
  return {
    $type: 'RosettaStringLiteral',
    value: node.value,
  };
}

export function setRosettaStringLiteralValue(node: any, value: string): void {
  node.value = value;
}

export interface RosettaSuperCallDomain {
  $type: 'RosettaSuperCall';
  name: "super";
  explicitArguments?: boolean;
  rawArgs?: RosettaExpressionDomain[];
}

export function toDomainRosettaSuperCall(node: any): RosettaSuperCallDomain {
  return {
    $type: node.$type,
    name: node.name,
    explicitArguments: node.explicitArguments,
    rawArgs: (node.rawArgs ?? []).map((item) => item ? toDomainRosettaExpression(item) : undefined),
  };
}

export function toAstRosettaSuperCall(node: any): any {
  return {
    $type: 'RosettaSuperCall',
    name: node.name,
    explicitArguments: node.explicitArguments,
    rawArgs: (node.rawArgs ?? []).map((item) => item ? toAstRosettaExpression(item) : undefined),
  };
}

export function setRosettaSuperCallExplicitArguments(node: any, value: boolean): void {
  node.explicitArguments = value;
}

export function addRosettaSuperCallRawArgs(node: any, item: unknown): void {
  (node.rawArgs ??= []).push(item);
}

export function removeRosettaSuperCallRawArgsAt(node: any, index: number): void {
  node.rawArgs?.splice(index, 1);
}

export interface RosettaSymbolReferenceDomain {
  $type: 'RosettaSymbolReference';
  symbol: DomainRef;
  explicitArguments?: boolean;
  rawArgs?: RosettaExpressionDomain[];
}

export function toDomainRosettaSymbolReference(node: any): RosettaSymbolReferenceDomain {
  return {
    $type: node.$type,
    symbol: node.symbol,
    explicitArguments: node.explicitArguments,
    rawArgs: (node.rawArgs ?? []).map((item) => item ? toDomainRosettaExpression(item) : undefined),
  };
}

export function toAstRosettaSymbolReference(node: any): any {
  return {
    $type: 'RosettaSymbolReference',
    symbol: node.symbol,
    explicitArguments: node.explicitArguments,
    rawArgs: (node.rawArgs ?? []).map((item) => item ? toAstRosettaExpression(item) : undefined),
  };
}

export function setRosettaSymbolReferenceSymbol(node: any, value: string): void {
  if (node.symbol) node.symbol.$refText = value;
  else node.symbol = { $refText: value };
}

export function setRosettaSymbolReferenceExplicitArguments(node: any, value: boolean): void {
  node.explicitArguments = value;
}

export function addRosettaSymbolReferenceRawArgs(node: any, item: unknown): void {
  (node.rawArgs ??= []).push(item);
}

export function removeRosettaSymbolReferenceRawArgsAt(node: any, index: number): void {
  node.rawArgs?.splice(index, 1);
}

export interface RosettaSynonymDomain {
  $type: 'RosettaSynonym';
  sources: DomainRef[];
  body: RosettaSynonymBodyDomain;
}

export function toDomainRosettaSynonym(node: any): RosettaSynonymDomain {
  return {
    $type: node.$type,
    sources: (node.sources ?? []).map((item) => item),
    body: node.body ? toDomainRosettaSynonymBody(node.body) : undefined,
  };
}

export function toAstRosettaSynonym(node: any): any {
  return {
    $type: 'RosettaSynonym',
    sources: (node.sources ?? []).map((item) => item),
    body: node.body ? toAstRosettaSynonymBody(node.body) : undefined,
  };
}

export function addRosettaSynonymSources(node: any, item: string): void {
  (node.sources ??= []).push({ $refText: item });
}

export function removeRosettaSynonymSourcesAt(node: any, index: number): void {
  node.sources?.splice(index, 1);
}

export interface RosettaSynonymBodyDomain {
  $type: 'RosettaSynonymBody';
  hints?: string[];
  format?: string;
  merge?: RosettaMergeSynonymValueDomain;
  mappingLogic?: RosettaMappingDomain;
  metaValues?: string[];
  patternMatch?: string;
  patternReplace?: string;
  removeHtml?: boolean;
  mapper?: string;
  values?: RosettaSynonymValueBaseDomain[];
}

export function toDomainRosettaSynonymBody(node: any): RosettaSynonymBodyDomain {
  return {
    $type: node.$type,
    hints: (node.hints ?? []).map((item) => item),
    format: node.format,
    merge: node.merge ? toDomainRosettaMergeSynonymValue(node.merge) : undefined,
    mappingLogic: node.mappingLogic ? toDomainRosettaMapping(node.mappingLogic) : undefined,
    metaValues: (node.metaValues ?? []).map((item) => item),
    patternMatch: node.patternMatch,
    patternReplace: node.patternReplace,
    removeHtml: node.removeHtml,
    mapper: node.mapper,
    values: (node.values ?? []).map((item) => item ? toDomainRosettaSynonymValueBase(item) : undefined),
  };
}

export function toAstRosettaSynonymBody(node: any): any {
  return {
    $type: 'RosettaSynonymBody',
    hints: (node.hints ?? []).map((item) => item),
    format: node.format,
    merge: node.merge ? toAstRosettaMergeSynonymValue(node.merge) : undefined,
    mappingLogic: node.mappingLogic ? toAstRosettaMapping(node.mappingLogic) : undefined,
    metaValues: (node.metaValues ?? []).map((item) => item),
    patternMatch: node.patternMatch,
    patternReplace: node.patternReplace,
    removeHtml: node.removeHtml,
    mapper: node.mapper,
    values: (node.values ?? []).map((item) => item ? toAstRosettaSynonymValueBase(item) : undefined),
  };
}

export function addRosettaSynonymBodyHints(node: any, item: string): void {
  (node.hints ??= []).push(item);
}

export function removeRosettaSynonymBodyHintsAt(node: any, index: number): void {
  node.hints?.splice(index, 1);
}

export function setRosettaSynonymBodyFormat(node: any, value: string): void {
  node.format = value;
}

export function addRosettaSynonymBodyMetaValues(node: any, item: string): void {
  (node.metaValues ??= []).push(item);
}

export function removeRosettaSynonymBodyMetaValuesAt(node: any, index: number): void {
  node.metaValues?.splice(index, 1);
}

export function setRosettaSynonymBodyPatternMatch(node: any, value: string): void {
  node.patternMatch = value;
}

export function setRosettaSynonymBodyPatternReplace(node: any, value: string): void {
  node.patternReplace = value;
}

export function setRosettaSynonymBodyRemoveHtml(node: any, value: boolean): void {
  node.removeHtml = value;
}

export function setRosettaSynonymBodyMapper(node: any, value: string): void {
  node.mapper = value;
}

export function addRosettaSynonymBodyValues(node: any, item: unknown): void {
  (node.values ??= []).push(item);
}

export function removeRosettaSynonymBodyValuesAt(node: any, index: number): void {
  node.values?.splice(index, 1);
}

export interface RosettaSynonymSourceDomain {
  $type: 'RosettaSynonymSource';
  name: string;
  superSources?: DomainRef[];
  externalClasses?: RosettaExternalClassDomain[];
  externalEnums?: RosettaExternalEnumDomain[];
}

export function toDomainRosettaSynonymSource(node: any): RosettaSynonymSourceDomain {
  return {
    $type: node.$type,
    name: node.name,
    superSources: (node.superSources ?? []).map((item) => item),
    externalClasses: (node.externalClasses ?? []).map((item) => item ? toDomainRosettaExternalClass(item) : undefined),
    externalEnums: (node.externalEnums ?? []).map((item) => item ? toDomainRosettaExternalEnum(item) : undefined),
  };
}

export function toAstRosettaSynonymSource(node: any): any {
  return {
    $type: 'RosettaSynonymSource',
    name: node.name,
    superSources: (node.superSources ?? []).map((item) => item),
    externalClasses: (node.externalClasses ?? []).map((item) => item ? toAstRosettaExternalClass(item) : undefined),
    externalEnums: (node.externalEnums ?? []).map((item) => item ? toAstRosettaExternalEnum(item) : undefined),
  };
}

export function setRosettaSynonymSourceName(node: any, value: string): void {
  node.name = value;
}

export function addRosettaSynonymSourceSuperSources(node: any, item: string): void {
  (node.superSources ??= []).push({ $refText: item });
}

export function removeRosettaSynonymSourceSuperSourcesAt(node: any, index: number): void {
  node.superSources?.splice(index, 1);
}

export function addRosettaSynonymSourceExternalClasses(node: any, item: unknown): void {
  (node.externalClasses ??= []).push(item);
}

export function removeRosettaSynonymSourceExternalClassesAt(node: any, index: number): void {
  node.externalClasses?.splice(index, 1);
}

export function addRosettaSynonymSourceExternalEnums(node: any, item: unknown): void {
  (node.externalEnums ??= []).push(item);
}

export function removeRosettaSynonymSourceExternalEnumsAt(node: any, index: number): void {
  node.externalEnums?.splice(index, 1);
}

export interface RosettaSynonymValueBaseDomain {
  $type: 'RosettaSynonymValueBase';
  name: string;
  refType?: string;
  value?: number;
  path?: string;
  maps?: number;
}

export function toDomainRosettaSynonymValueBase(node: any): RosettaSynonymValueBaseDomain {
  return {
    $type: node.$type,
    name: node.name,
    refType: node.refType,
    value: node.value,
    path: node.path,
    maps: node.maps,
  };
}

export function toAstRosettaSynonymValueBase(node: any): any {
  return {
    $type: 'RosettaSynonymValueBase',
    name: node.name,
    refType: node.refType,
    value: node.value,
    path: node.path,
    maps: node.maps,
  };
}

export function setRosettaSynonymValueBaseName(node: any, value: string): void {
  node.name = value;
}

export function setRosettaSynonymValueBaseRefType(node: any, value: string): void {
  node.refType = value;
}

export function setRosettaSynonymValueBaseValue(node: any, value: number): void {
  node.value = value;
}

export function setRosettaSynonymValueBasePath(node: any, value: string): void {
  node.path = value;
}

export function setRosettaSynonymValueBaseMaps(node: any, value: number): void {
  node.maps = value;
}

export interface RosettaTypeAliasDomain {
  $type: 'RosettaTypeAlias';
  name: string;
  parameters?: TypeParameterDomain[];
  definition?: string;
  typeCall: TypeCallDomain;
  conditions?: ConditionDomain[];
}

export function toDomainRosettaTypeAlias(node: any): RosettaTypeAliasDomain {
  return {
    $type: node.$type,
    name: node.name,
    parameters: (node.parameters ?? []).map((item) => item ? toDomainTypeParameter(item) : undefined),
    definition: node.definition,
    typeCall: node.typeCall ? toDomainTypeCall(node.typeCall) : undefined,
    conditions: (node.conditions ?? []).map((item) => item ? toDomainCondition(item) : undefined),
  };
}

export function toAstRosettaTypeAlias(node: any): any {
  return {
    $type: 'RosettaTypeAlias',
    name: node.name,
    parameters: (node.parameters ?? []).map((item) => item ? toAstTypeParameter(item) : undefined),
    definition: node.definition,
    typeCall: node.typeCall ? toAstTypeCall(node.typeCall) : undefined,
    conditions: (node.conditions ?? []).map((item) => item ? toAstCondition(item) : undefined),
  };
}

export function setRosettaTypeAliasName(node: any, value: string): void {
  node.name = value;
}

export function addRosettaTypeAliasParameters(node: any, item: unknown): void {
  (node.parameters ??= []).push(item);
}

export function removeRosettaTypeAliasParametersAt(node: any, index: number): void {
  node.parameters?.splice(index, 1);
}

export function setRosettaTypeAliasDefinition(node: any, value: string): void {
  node.definition = value;
}

export function addRosettaTypeAliasConditions(node: any, item: unknown): void {
  (node.conditions ??= []).push(item);
}

export function removeRosettaTypeAliasConditionsAt(node: any, index: number): void {
  node.conditions?.splice(index, 1);
}

export interface RuleReferenceAnnotationDomain {
  $type: 'RuleReferenceAnnotation';
  name: "ruleReference";
  path?: AnnotationPathExpressionDomain;
  reportingRule?: DomainRef;
  empty?: boolean;
}

export function toDomainRuleReferenceAnnotation(node: any): RuleReferenceAnnotationDomain {
  return {
    $type: node.$type,
    name: node.name,
    path: node.path ? toDomainAnnotationPathExpression(node.path) : undefined,
    reportingRule: node.reportingRule,
    empty: node.empty,
  };
}

export function toAstRuleReferenceAnnotation(node: any): any {
  return {
    $type: 'RuleReferenceAnnotation',
    name: node.name,
    path: node.path ? toAstAnnotationPathExpression(node.path) : undefined,
    reportingRule: node.reportingRule,
    empty: node.empty,
  };
}

export function setRuleReferenceAnnotationReportingRule(node: any, value: string): void {
  if (node.reportingRule) node.reportingRule.$refText = value;
  else node.reportingRule = { $refText: value };
}

export function setRuleReferenceAnnotationEmpty(node: any, value: boolean): void {
  node.empty = value;
}

export interface SegmentDomain {
  $type: 'Segment';
  feature: DomainRef;
  next?: SegmentDomain;
}

export function toDomainSegment(node: any): SegmentDomain {
  return {
    $type: node.$type,
    feature: node.feature,
    next: node.next ? toDomainSegment(node.next) : undefined,
  };
}

export function toAstSegment(node: any): any {
  return {
    $type: 'Segment',
    feature: node.feature,
    next: node.next ? toAstSegment(node.next) : undefined,
  };
}

export function setSegmentFeature(node: any, value: string): void {
  if (node.feature) node.feature.$refText = value;
  else node.feature = { $refText: value };
}

export interface ShortcutDeclarationDomain {
  $type: 'ShortcutDeclaration';
  name: string;
  definition?: string;
  expression: RosettaExpressionDomain;
}

export function toDomainShortcutDeclaration(node: any): ShortcutDeclarationDomain {
  return {
    $type: node.$type,
    name: node.name,
    definition: node.definition,
    expression: node.expression ? toDomainRosettaExpression(node.expression) : undefined,
  };
}

export function toAstShortcutDeclaration(node: any): any {
  return {
    $type: 'ShortcutDeclaration',
    name: node.name,
    definition: node.definition,
    expression: node.expression ? toAstRosettaExpression(node.expression) : undefined,
  };
}

export function setShortcutDeclarationName(node: any, value: string): void {
  node.name = value;
}

export function setShortcutDeclarationDefinition(node: any, value: string): void {
  node.definition = value;
}

export interface SortOperationDomain {
  $type: 'SortOperation';
  argument?: RosettaExpressionDomain;
  operator: "sort";
  function?: InlineFunctionDomain;
}

export function toDomainSortOperation(node: any): SortOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toDomainInlineFunction(node.function) : undefined,
  };
}

export function toAstSortOperation(node: any): any {
  return {
    $type: 'SortOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toAstInlineFunction(node.function) : undefined,
  };
}

export interface SumOperationDomain {
  $type: 'SumOperation';
  argument?: RosettaExpressionDomain;
  operator: "sum";
}

export function toDomainSumOperation(node: any): SumOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstSumOperation(node: any): any {
  return {
    $type: 'SumOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface SwitchCaseGuardDomain {
  $type: 'SwitchCaseGuard';
  literalGuard?: RosettaLiteralDomain;
  referenceGuard?: DomainRef;
}

export function toDomainSwitchCaseGuard(node: any): SwitchCaseGuardDomain {
  return {
    $type: node.$type,
    literalGuard: node.literalGuard ? toDomainRosettaLiteral(node.literalGuard) : undefined,
    referenceGuard: node.referenceGuard,
  };
}

export function toAstSwitchCaseGuard(node: any): any {
  return {
    $type: 'SwitchCaseGuard',
    literalGuard: node.literalGuard ? toAstRosettaLiteral(node.literalGuard) : undefined,
    referenceGuard: node.referenceGuard,
  };
}

export function setSwitchCaseGuardReferenceGuard(node: any, value: string): void {
  if (node.referenceGuard) node.referenceGuard.$refText = value;
  else node.referenceGuard = { $refText: value };
}

export interface SwitchCaseOrDefaultDomain {
  $type: 'SwitchCaseOrDefault';
  expression: RosettaExpressionDomain;
  guard?: SwitchCaseGuardDomain;
}

export function toDomainSwitchCaseOrDefault(node: any): SwitchCaseOrDefaultDomain {
  return {
    $type: node.$type,
    expression: node.expression ? toDomainRosettaExpression(node.expression) : undefined,
    guard: node.guard ? toDomainSwitchCaseGuard(node.guard) : undefined,
  };
}

export function toAstSwitchCaseOrDefault(node: any): any {
  return {
    $type: 'SwitchCaseOrDefault',
    expression: node.expression ? toAstRosettaExpression(node.expression) : undefined,
    guard: node.guard ? toAstSwitchCaseGuard(node.guard) : undefined,
  };
}

export interface SwitchOperationDomain {
  $type: 'SwitchOperation';
  argument?: RosettaExpressionDomain;
  operator: "switch";
  cases: SwitchCaseOrDefaultDomain[];
}

export function toDomainSwitchOperation(node: any): SwitchOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    cases: (node.cases ?? []).map((item) => item ? toDomainSwitchCaseOrDefault(item) : undefined),
  };
}

export function toAstSwitchOperation(node: any): any {
  return {
    $type: 'SwitchOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    cases: (node.cases ?? []).map((item) => item ? toAstSwitchCaseOrDefault(item) : undefined),
  };
}

export function addSwitchOperationCases(node: any, item: unknown): void {
  (node.cases ??= []).push(item);
}

export function removeSwitchOperationCasesAt(node: any, index: number): void {
  node.cases?.splice(index, 1);
}

export interface ThenOperationDomain {
  $type: 'ThenOperation';
  argument: RosettaExpressionDomain;
  operator: "then";
  function?: InlineFunctionDomain;
}

export function toDomainThenOperation(node: any): ThenOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toDomainInlineFunction(node.function) : undefined,
  };
}

export function toAstThenOperation(node: any): any {
  return {
    $type: 'ThenOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    function: node.function ? toAstInlineFunction(node.function) : undefined,
  };
}

export interface ToDateOperationDomain {
  $type: 'ToDateOperation';
  argument?: RosettaExpressionDomain;
  operator: "to-date";
}

export function toDomainToDateOperation(node: any): ToDateOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstToDateOperation(node: any): any {
  return {
    $type: 'ToDateOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface ToDateTimeOperationDomain {
  $type: 'ToDateTimeOperation';
  argument?: RosettaExpressionDomain;
  operator: "to-date-time";
}

export function toDomainToDateTimeOperation(node: any): ToDateTimeOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstToDateTimeOperation(node: any): any {
  return {
    $type: 'ToDateTimeOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface ToEnumOperationDomain {
  $type: 'ToEnumOperation';
  argument?: RosettaExpressionDomain;
  operator: "to-enum";
  enumeration: DomainRef;
}

export function toDomainToEnumOperation(node: any): ToEnumOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    enumeration: node.enumeration,
  };
}

export function toAstToEnumOperation(node: any): any {
  return {
    $type: 'ToEnumOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    enumeration: node.enumeration,
  };
}

export function setToEnumOperationEnumeration(node: any, value: string): void {
  if (node.enumeration) node.enumeration.$refText = value;
  else node.enumeration = { $refText: value };
}

export interface ToIntOperationDomain {
  $type: 'ToIntOperation';
  argument?: RosettaExpressionDomain;
  operator: "to-int";
}

export function toDomainToIntOperation(node: any): ToIntOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstToIntOperation(node: any): any {
  return {
    $type: 'ToIntOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface ToNumberOperationDomain {
  $type: 'ToNumberOperation';
  argument?: RosettaExpressionDomain;
  operator: "to-number";
}

export function toDomainToNumberOperation(node: any): ToNumberOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstToNumberOperation(node: any): any {
  return {
    $type: 'ToNumberOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface ToStringOperationDomain {
  $type: 'ToStringOperation';
  argument?: RosettaExpressionDomain;
  operator: "to-string";
}

export function toDomainToStringOperation(node: any): ToStringOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstToStringOperation(node: any): any {
  return {
    $type: 'ToStringOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface ToTimeOperationDomain {
  $type: 'ToTimeOperation';
  argument?: RosettaExpressionDomain;
  operator: "to-time";
}

export function toDomainToTimeOperation(node: any): ToTimeOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstToTimeOperation(node: any): any {
  return {
    $type: 'ToTimeOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface ToZonedDateTimeOperationDomain {
  $type: 'ToZonedDateTimeOperation';
  argument?: RosettaExpressionDomain;
  operator: "to-zoned-date-time";
}

export function toDomainToZonedDateTimeOperation(node: any): ToZonedDateTimeOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export function toAstToZonedDateTimeOperation(node: any): any {
  return {
    $type: 'ToZonedDateTimeOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
  };
}

export interface TypeCallDomain {
  $type: 'TypeCall';
  type: DomainRef;
  arguments?: TypeCallArgumentDomain[];
}

export function toDomainTypeCall(node: any): TypeCallDomain {
  return {
    $type: node.$type,
    type: node.type,
    arguments: (node.arguments ?? []).map((item) => item ? toDomainTypeCallArgument(item) : undefined),
  };
}

export function toAstTypeCall(node: any): any {
  return {
    $type: 'TypeCall',
    type: node.type,
    arguments: (node.arguments ?? []).map((item) => item ? toAstTypeCallArgument(item) : undefined),
  };
}

export function setTypeCallType(node: any, value: string): void {
  if (node.type) node.type.$refText = value;
  else node.type = { $refText: value };
}

export function addTypeCallArguments(node: any, item: unknown): void {
  (node.arguments ??= []).push(item);
}

export function removeTypeCallArgumentsAt(node: any, index: number): void {
  node.arguments?.splice(index, 1);
}

export interface TypeCallArgumentDomain {
  $type: 'TypeCallArgument';
  parameter: DomainRef;
  value: RosettaExpressionDomain;
}

export function toDomainTypeCallArgument(node: any): TypeCallArgumentDomain {
  return {
    $type: node.$type,
    parameter: node.parameter,
    value: node.value ? toDomainRosettaExpression(node.value) : undefined,
  };
}

export function toAstTypeCallArgument(node: any): any {
  return {
    $type: 'TypeCallArgument',
    parameter: node.parameter,
    value: node.value ? toAstRosettaExpression(node.value) : undefined,
  };
}

export function setTypeCallArgumentParameter(node: any, value: string): void {
  if (node.parameter) node.parameter.$refText = value;
  else node.parameter = { $refText: value };
}

export interface TypeParameterDomain {
  $type: 'TypeParameter';
  name: string;
  typeCall: TypeCallDomain;
  definition?: string;
}

export function toDomainTypeParameter(node: any): TypeParameterDomain {
  return {
    $type: node.$type,
    name: node.name,
    typeCall: node.typeCall ? toDomainTypeCall(node.typeCall) : undefined,
    definition: node.definition,
  };
}

export function toAstTypeParameter(node: any): any {
  return {
    $type: 'TypeParameter',
    name: node.name,
    typeCall: node.typeCall ? toAstTypeCall(node.typeCall) : undefined,
    definition: node.definition,
  };
}

export function setTypeParameterName(node: any, value: string): void {
  node.name = value;
}

export function setTypeParameterDefinition(node: any, value: string): void {
  node.definition = value;
}

export interface WithMetaEntryDomain {
  $type: 'WithMetaEntry';
  key: DomainRef;
  value: RosettaExpressionDomain;
}

export function toDomainWithMetaEntry(node: any): WithMetaEntryDomain {
  return {
    $type: node.$type,
    key: node.key,
    value: node.value ? toDomainRosettaExpression(node.value) : undefined,
  };
}

export function toAstWithMetaEntry(node: any): any {
  return {
    $type: 'WithMetaEntry',
    key: node.key,
    value: node.value ? toAstRosettaExpression(node.value) : undefined,
  };
}

export function setWithMetaEntryKey(node: any, value: string): void {
  if (node.key) node.key.$refText = value;
  else node.key = { $refText: value };
}

export interface WithMetaOperationDomain {
  $type: 'WithMetaOperation';
  argument: RosettaExpressionDomain;
  operator: "with-meta";
  entries?: WithMetaEntryDomain[];
}

export function toDomainWithMetaOperation(node: any): WithMetaOperationDomain {
  return {
    $type: node.$type,
    argument: node.argument ? toDomainRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    entries: (node.entries ?? []).map((item) => item ? toDomainWithMetaEntry(item) : undefined),
  };
}

export function toAstWithMetaOperation(node: any): any {
  return {
    $type: 'WithMetaOperation',
    argument: node.argument ? toAstRosettaExpression(node.argument) : undefined,
    operator: node.operator,
    entries: (node.entries ?? []).map((item) => item ? toAstWithMetaEntry(item) : undefined),
  };
}

export function addWithMetaOperationEntries(node: any, item: unknown): void {
  (node.entries ??= []).push(item);
}

export function removeWithMetaOperationEntriesAt(node: any, index: number): void {
  node.entries?.splice(index, 1);
}

export type AnnotationPathExpressionDomain = RosettaImplicitVariableDomain | AnnotationPathDomain | AnnotationDeepPathDomain | AnnotationPathAttributeReferenceDomain;

export function toDomainAnnotationPathExpression(node: any): AnnotationPathExpressionDomain {
  switch (node.$type) {
    case "RosettaImplicitVariable": return toDomainRosettaImplicitVariable(node);
    case "AnnotationPath": return toDomainAnnotationPath(node);
    case "AnnotationDeepPath": return toDomainAnnotationDeepPath(node);
    case "AnnotationPathAttributeReference": return toDomainAnnotationPathAttributeReference(node);
  }
  throw new Error(`Unknown AnnotationPathExpression member: ${node.$type}`);
}

export function toAstAnnotationPathExpression(node: any): any {
  switch (node.$type) {
    case "RosettaImplicitVariable": return toAstRosettaImplicitVariable(node);
    case "AnnotationPath": return toAstAnnotationPath(node);
    case "AnnotationDeepPath": return toAstAnnotationDeepPath(node);
    case "AnnotationPathAttributeReference": return toAstAnnotationPathAttributeReference(node);
  }
  throw new Error(`Unknown AnnotationPathExpression member: ${node.$type}`);
}

export type AssignPathRootDomain = AttributeDomain | ShortcutDeclarationDomain;

export function toDomainAssignPathRoot(node: any): AssignPathRootDomain {
  switch (node.$type) {
    case "Attribute": return toDomainAttribute(node);
    case "ShortcutDeclaration": return toDomainShortcutDeclaration(node);
  }
  throw new Error(`Unknown AssignPathRoot member: ${node.$type}`);
}

export function toAstAssignPathRoot(node: any): any {
  switch (node.$type) {
    case "Attribute": return toAstAttribute(node);
    case "ShortcutDeclaration": return toAstShortcutDeclaration(node);
  }
  throw new Error(`Unknown AssignPathRoot member: ${node.$type}`);
}

export type AttributeOrChoiceOptionDomain = AttributeDomain | ChoiceOptionDomain;

export function toDomainAttributeOrChoiceOption(node: any): AttributeOrChoiceOptionDomain {
  switch (node.$type) {
    case "Attribute": return toDomainAttribute(node);
    case "ChoiceOption": return toDomainChoiceOption(node);
  }
  throw new Error(`Unknown AttributeOrChoiceOption member: ${node.$type}`);
}

export function toAstAttributeOrChoiceOption(node: any): any {
  switch (node.$type) {
    case "Attribute": return toAstAttribute(node);
    case "ChoiceOption": return toAstChoiceOption(node);
  }
  throw new Error(`Unknown AttributeOrChoiceOption member: ${node.$type}`);
}

export type DataOrChoiceDomain = DataDomain | ChoiceDomain;

export function toDomainDataOrChoice(node: any): DataOrChoiceDomain {
  switch (node.$type) {
    case "Data": return toDomainData(node);
    case "Choice": return toDomainChoice(node);
  }
  throw new Error(`Unknown DataOrChoice member: ${node.$type}`);
}

export function toAstDataOrChoice(node: any): any {
  switch (node.$type) {
    case "Data": return toAstData(node);
    case "Choice": return toAstChoice(node);
  }
  throw new Error(`Unknown DataOrChoice member: ${node.$type}`);
}

export type RosettaCallableWithArgsDomain = RosettaFunctionDomain | RosettaExternalFunctionDomain | RosettaRuleDomain;

export function toDomainRosettaCallableWithArgs(node: any): RosettaCallableWithArgsDomain {
  switch (node.$type) {
    case "RosettaFunction": return toDomainRosettaFunction(node);
    case "RosettaExternalFunction": return toDomainRosettaExternalFunction(node);
    case "RosettaRule": return toDomainRosettaRule(node);
  }
  throw new Error(`Unknown RosettaCallableWithArgs member: ${node.$type}`);
}

export function toAstRosettaCallableWithArgs(node: any): any {
  switch (node.$type) {
    case "RosettaFunction": return toAstRosettaFunction(node);
    case "RosettaExternalFunction": return toAstRosettaExternalFunction(node);
    case "RosettaRule": return toAstRosettaRule(node);
  }
  throw new Error(`Unknown RosettaCallableWithArgs member: ${node.$type}`);
}

export type RosettaExpressionDomain = RosettaSymbolReferenceDomain | AsKeyOperationDomain | ThenOperationDomain | LogicalOperationDomain | ComparisonOperationDomain | EqualityOperationDomain | ArithmeticOperationDomain | RosettaContainsExpressionDomain | RosettaDisjointExpressionDomain | DefaultOperationDomain | JoinOperationDomain | RosettaFeatureCallDomain | RosettaDeepFeatureCallDomain | RosettaExistsExpressionDomain | RosettaAbsentExpressionDomain | RosettaOnlyElementDomain | RosettaOnlyExistsExpressionDomain | RosettaCountOperationDomain | FlattenOperationDomain | DistinctOperationDomain | ReverseOperationDomain | FirstOperationDomain | LastOperationDomain | SumOperationDomain | OneOfOperationDomain | ToStringOperationDomain | ToNumberOperationDomain | ToIntOperationDomain | ToTimeOperationDomain | ToEnumOperationDomain | ToDateOperationDomain | ToDateTimeOperationDomain | ToZonedDateTimeOperationDomain | ChoiceOperationDomain | SwitchOperationDomain | WithMetaOperationDomain | SortOperationDomain | MinOperationDomain | MaxOperationDomain | ReduceOperationDomain | FilterOperationDomain | MapOperationDomain | RosettaSuperCallDomain | RosettaConstructorExpressionDomain | ListLiteralDomain | RosettaImplicitVariableDomain | RosettaConditionalExpressionDomain;

export function toDomainRosettaExpression(node: any): RosettaExpressionDomain {
  switch (node.$type) {
    case "RosettaSymbolReference": return toDomainRosettaSymbolReference(node);
    case "AsKeyOperation": return toDomainAsKeyOperation(node);
    case "ThenOperation": return toDomainThenOperation(node);
    case "LogicalOperation": return toDomainLogicalOperation(node);
    case "ComparisonOperation": return toDomainComparisonOperation(node);
    case "EqualityOperation": return toDomainEqualityOperation(node);
    case "ArithmeticOperation": return toDomainArithmeticOperation(node);
    case "RosettaContainsExpression": return toDomainRosettaContainsExpression(node);
    case "RosettaDisjointExpression": return toDomainRosettaDisjointExpression(node);
    case "DefaultOperation": return toDomainDefaultOperation(node);
    case "JoinOperation": return toDomainJoinOperation(node);
    case "RosettaFeatureCall": return toDomainRosettaFeatureCall(node);
    case "RosettaDeepFeatureCall": return toDomainRosettaDeepFeatureCall(node);
    case "RosettaExistsExpression": return toDomainRosettaExistsExpression(node);
    case "RosettaAbsentExpression": return toDomainRosettaAbsentExpression(node);
    case "RosettaOnlyElement": return toDomainRosettaOnlyElement(node);
    case "RosettaOnlyExistsExpression": return toDomainRosettaOnlyExistsExpression(node);
    case "RosettaCountOperation": return toDomainRosettaCountOperation(node);
    case "FlattenOperation": return toDomainFlattenOperation(node);
    case "DistinctOperation": return toDomainDistinctOperation(node);
    case "ReverseOperation": return toDomainReverseOperation(node);
    case "FirstOperation": return toDomainFirstOperation(node);
    case "LastOperation": return toDomainLastOperation(node);
    case "SumOperation": return toDomainSumOperation(node);
    case "OneOfOperation": return toDomainOneOfOperation(node);
    case "ToStringOperation": return toDomainToStringOperation(node);
    case "ToNumberOperation": return toDomainToNumberOperation(node);
    case "ToIntOperation": return toDomainToIntOperation(node);
    case "ToTimeOperation": return toDomainToTimeOperation(node);
    case "ToEnumOperation": return toDomainToEnumOperation(node);
    case "ToDateOperation": return toDomainToDateOperation(node);
    case "ToDateTimeOperation": return toDomainToDateTimeOperation(node);
    case "ToZonedDateTimeOperation": return toDomainToZonedDateTimeOperation(node);
    case "ChoiceOperation": return toDomainChoiceOperation(node);
    case "SwitchOperation": return toDomainSwitchOperation(node);
    case "WithMetaOperation": return toDomainWithMetaOperation(node);
    case "SortOperation": return toDomainSortOperation(node);
    case "MinOperation": return toDomainMinOperation(node);
    case "MaxOperation": return toDomainMaxOperation(node);
    case "ReduceOperation": return toDomainReduceOperation(node);
    case "FilterOperation": return toDomainFilterOperation(node);
    case "MapOperation": return toDomainMapOperation(node);
    case "RosettaSuperCall": return toDomainRosettaSuperCall(node);
    case "RosettaConstructorExpression": return toDomainRosettaConstructorExpression(node);
    case "ListLiteral": return toDomainListLiteral(node);
    case "RosettaImplicitVariable": return toDomainRosettaImplicitVariable(node);
    case "RosettaConditionalExpression": return toDomainRosettaConditionalExpression(node);
  }
  throw new Error(`Unknown RosettaExpression member: ${node.$type}`);
}

export function toAstRosettaExpression(node: any): any {
  switch (node.$type) {
    case "RosettaSymbolReference": return toAstRosettaSymbolReference(node);
    case "AsKeyOperation": return toAstAsKeyOperation(node);
    case "ThenOperation": return toAstThenOperation(node);
    case "LogicalOperation": return toAstLogicalOperation(node);
    case "ComparisonOperation": return toAstComparisonOperation(node);
    case "EqualityOperation": return toAstEqualityOperation(node);
    case "ArithmeticOperation": return toAstArithmeticOperation(node);
    case "RosettaContainsExpression": return toAstRosettaContainsExpression(node);
    case "RosettaDisjointExpression": return toAstRosettaDisjointExpression(node);
    case "DefaultOperation": return toAstDefaultOperation(node);
    case "JoinOperation": return toAstJoinOperation(node);
    case "RosettaFeatureCall": return toAstRosettaFeatureCall(node);
    case "RosettaDeepFeatureCall": return toAstRosettaDeepFeatureCall(node);
    case "RosettaExistsExpression": return toAstRosettaExistsExpression(node);
    case "RosettaAbsentExpression": return toAstRosettaAbsentExpression(node);
    case "RosettaOnlyElement": return toAstRosettaOnlyElement(node);
    case "RosettaOnlyExistsExpression": return toAstRosettaOnlyExistsExpression(node);
    case "RosettaCountOperation": return toAstRosettaCountOperation(node);
    case "FlattenOperation": return toAstFlattenOperation(node);
    case "DistinctOperation": return toAstDistinctOperation(node);
    case "ReverseOperation": return toAstReverseOperation(node);
    case "FirstOperation": return toAstFirstOperation(node);
    case "LastOperation": return toAstLastOperation(node);
    case "SumOperation": return toAstSumOperation(node);
    case "OneOfOperation": return toAstOneOfOperation(node);
    case "ToStringOperation": return toAstToStringOperation(node);
    case "ToNumberOperation": return toAstToNumberOperation(node);
    case "ToIntOperation": return toAstToIntOperation(node);
    case "ToTimeOperation": return toAstToTimeOperation(node);
    case "ToEnumOperation": return toAstToEnumOperation(node);
    case "ToDateOperation": return toAstToDateOperation(node);
    case "ToDateTimeOperation": return toAstToDateTimeOperation(node);
    case "ToZonedDateTimeOperation": return toAstToZonedDateTimeOperation(node);
    case "ChoiceOperation": return toAstChoiceOperation(node);
    case "SwitchOperation": return toAstSwitchOperation(node);
    case "WithMetaOperation": return toAstWithMetaOperation(node);
    case "SortOperation": return toAstSortOperation(node);
    case "MinOperation": return toAstMinOperation(node);
    case "MaxOperation": return toAstMaxOperation(node);
    case "ReduceOperation": return toAstReduceOperation(node);
    case "FilterOperation": return toAstFilterOperation(node);
    case "MapOperation": return toAstMapOperation(node);
    case "RosettaSuperCall": return toAstRosettaSuperCall(node);
    case "RosettaConstructorExpression": return toAstRosettaConstructorExpression(node);
    case "ListLiteral": return toAstListLiteral(node);
    case "RosettaImplicitVariable": return toAstRosettaImplicitVariable(node);
    case "RosettaConditionalExpression": return toAstRosettaConditionalExpression(node);
  }
  throw new Error(`Unknown RosettaExpression member: ${node.$type}`);
}

export type RosettaFeatureDomain = AttributeDomain | RosettaRecordFeatureDomain | RosettaEnumValueDomain | RosettaMetaTypeDomain | ChoiceOptionDomain;

export function toDomainRosettaFeature(node: any): RosettaFeatureDomain {
  switch (node.$type) {
    case "Attribute": return toDomainAttribute(node);
    case "RosettaRecordFeature": return toDomainRosettaRecordFeature(node);
    case "RosettaEnumValue": return toDomainRosettaEnumValue(node);
    case "RosettaMetaType": return toDomainRosettaMetaType(node);
    case "ChoiceOption": return toDomainChoiceOption(node);
  }
  throw new Error(`Unknown RosettaFeature member: ${node.$type}`);
}

export function toAstRosettaFeature(node: any): any {
  switch (node.$type) {
    case "Attribute": return toAstAttribute(node);
    case "RosettaRecordFeature": return toAstRosettaRecordFeature(node);
    case "RosettaEnumValue": return toAstRosettaEnumValue(node);
    case "RosettaMetaType": return toAstRosettaMetaType(node);
    case "ChoiceOption": return toAstChoiceOption(node);
  }
  throw new Error(`Unknown RosettaFeature member: ${node.$type}`);
}

export type RosettaLiteralDomain = RosettaBooleanLiteralDomain | RosettaStringLiteralDomain | RosettaNumberLiteralDomain | RosettaIntLiteralDomain;

export function toDomainRosettaLiteral(node: any): RosettaLiteralDomain {
  switch (node.$type) {
    case "RosettaBooleanLiteral": return toDomainRosettaBooleanLiteral(node);
    case "RosettaStringLiteral": return toDomainRosettaStringLiteral(node);
    case "RosettaNumberLiteral": return toDomainRosettaNumberLiteral(node);
    case "RosettaIntLiteral": return toDomainRosettaIntLiteral(node);
  }
  throw new Error(`Unknown RosettaLiteral member: ${node.$type}`);
}

export function toAstRosettaLiteral(node: any): any {
  switch (node.$type) {
    case "RosettaBooleanLiteral": return toAstRosettaBooleanLiteral(node);
    case "RosettaStringLiteral": return toAstRosettaStringLiteral(node);
    case "RosettaNumberLiteral": return toAstRosettaNumberLiteral(node);
    case "RosettaIntLiteral": return toAstRosettaIntLiteral(node);
  }
  throw new Error(`Unknown RosettaLiteral member: ${node.$type}`);
}

export type RosettaMapTestDomain = RosettaMapPathDomain | RosettaMapRosettaPathDomain | RosettaMapTestFuncDomain;

export function toDomainRosettaMapTest(node: any): RosettaMapTestDomain {
  switch (node.$type) {
    case "RosettaMapPath": return toDomainRosettaMapPath(node);
    case "RosettaMapRosettaPath": return toDomainRosettaMapRosettaPath(node);
    case "RosettaMapTestFunc": return toDomainRosettaMapTestFunc(node);
  }
  throw new Error(`Unknown RosettaMapTest member: ${node.$type}`);
}

export function toAstRosettaMapTest(node: any): any {
  switch (node.$type) {
    case "RosettaMapPath": return toAstRosettaMapPath(node);
    case "RosettaMapRosettaPath": return toAstRosettaMapRosettaPath(node);
    case "RosettaMapTestFunc": return toAstRosettaMapTestFunc(node);
  }
  throw new Error(`Unknown RosettaMapTest member: ${node.$type}`);
}

export type RosettaMapTestExpressionDomain = RosettaEnumValueReferenceDomain | RosettaMapTestExistsExpressionDomain | RosettaMapTestAbsentExpressionDomain | RosettaMapTestEqualityOperationDomain | RosettaMapPathValueDomain;

export function toDomainRosettaMapTestExpression(node: any): RosettaMapTestExpressionDomain {
  switch (node.$type) {
    case "RosettaEnumValueReference": return toDomainRosettaEnumValueReference(node);
    case "RosettaMapTestExistsExpression": return toDomainRosettaMapTestExistsExpression(node);
    case "RosettaMapTestAbsentExpression": return toDomainRosettaMapTestAbsentExpression(node);
    case "RosettaMapTestEqualityOperation": return toDomainRosettaMapTestEqualityOperation(node);
    case "RosettaMapPathValue": return toDomainRosettaMapPathValue(node);
  }
  throw new Error(`Unknown RosettaMapTestExpression member: ${node.$type}`);
}

export function toAstRosettaMapTestExpression(node: any): any {
  switch (node.$type) {
    case "RosettaEnumValueReference": return toAstRosettaEnumValueReference(node);
    case "RosettaMapTestExistsExpression": return toAstRosettaMapTestExistsExpression(node);
    case "RosettaMapTestAbsentExpression": return toAstRosettaMapTestAbsentExpression(node);
    case "RosettaMapTestEqualityOperation": return toAstRosettaMapTestEqualityOperation(node);
    case "RosettaMapPathValue": return toAstRosettaMapPathValue(node);
  }
  throw new Error(`Unknown RosettaMapTestExpression member: ${node.$type}`);
}

export type RosettaRootElementDomain = AnnotationDomain | DataDomain | ChoiceDomain | RosettaEnumerationDomain | RosettaFunctionDomain | RosettaBasicTypeDomain | RosettaSynonymSourceDomain | RosettaRecordTypeDomain | RosettaExternalFunctionDomain | RosettaTypeAliasDomain | RosettaMetaTypeDomain | RosettaBodyDomain | RosettaCorpusDomain | RosettaSegmentDomain | RosettaExternalRuleSourceDomain | RosettaReportDomain | RosettaRuleDomain;

export function toDomainRosettaRootElement(node: any): RosettaRootElementDomain {
  switch (node.$type) {
    case "Annotation": return toDomainAnnotation(node);
    case "Data": return toDomainData(node);
    case "Choice": return toDomainChoice(node);
    case "RosettaEnumeration": return toDomainRosettaEnumeration(node);
    case "RosettaFunction": return toDomainRosettaFunction(node);
    case "RosettaBasicType": return toDomainRosettaBasicType(node);
    case "RosettaSynonymSource": return toDomainRosettaSynonymSource(node);
    case "RosettaRecordType": return toDomainRosettaRecordType(node);
    case "RosettaExternalFunction": return toDomainRosettaExternalFunction(node);
    case "RosettaTypeAlias": return toDomainRosettaTypeAlias(node);
    case "RosettaMetaType": return toDomainRosettaMetaType(node);
    case "RosettaBody": return toDomainRosettaBody(node);
    case "RosettaCorpus": return toDomainRosettaCorpus(node);
    case "RosettaSegment": return toDomainRosettaSegment(node);
    case "RosettaExternalRuleSource": return toDomainRosettaExternalRuleSource(node);
    case "RosettaReport": return toDomainRosettaReport(node);
    case "RosettaRule": return toDomainRosettaRule(node);
  }
  throw new Error(`Unknown RosettaRootElement member: ${node.$type}`);
}

export function toAstRosettaRootElement(node: any): any {
  switch (node.$type) {
    case "Annotation": return toAstAnnotation(node);
    case "Data": return toAstData(node);
    case "Choice": return toAstChoice(node);
    case "RosettaEnumeration": return toAstRosettaEnumeration(node);
    case "RosettaFunction": return toAstRosettaFunction(node);
    case "RosettaBasicType": return toAstRosettaBasicType(node);
    case "RosettaSynonymSource": return toAstRosettaSynonymSource(node);
    case "RosettaRecordType": return toAstRosettaRecordType(node);
    case "RosettaExternalFunction": return toAstRosettaExternalFunction(node);
    case "RosettaTypeAlias": return toAstRosettaTypeAlias(node);
    case "RosettaMetaType": return toAstRosettaMetaType(node);
    case "RosettaBody": return toAstRosettaBody(node);
    case "RosettaCorpus": return toAstRosettaCorpus(node);
    case "RosettaSegment": return toAstRosettaSegment(node);
    case "RosettaExternalRuleSource": return toAstRosettaExternalRuleSource(node);
    case "RosettaReport": return toAstRosettaReport(node);
    case "RosettaRule": return toAstRosettaRule(node);
  }
  throw new Error(`Unknown RosettaRootElement member: ${node.$type}`);
}

export type RosettaSymbolDomain = AttributeDomain | ShortcutDeclarationDomain | RosettaFunctionDomain | RosettaExternalFunctionDomain | RosettaRuleDomain | TypeParameterDomain | RosettaMetaTypeDomain | ClosureParameterDomain | RosettaEnumerationDomain | RosettaEnumValueDomain | RosettaParameterDomain | DataDomain | ChoiceDomain;

export function toDomainRosettaSymbol(node: any): RosettaSymbolDomain {
  switch (node.$type) {
    case "Attribute": return toDomainAttribute(node);
    case "ShortcutDeclaration": return toDomainShortcutDeclaration(node);
    case "RosettaFunction": return toDomainRosettaFunction(node);
    case "RosettaExternalFunction": return toDomainRosettaExternalFunction(node);
    case "RosettaRule": return toDomainRosettaRule(node);
    case "TypeParameter": return toDomainTypeParameter(node);
    case "RosettaMetaType": return toDomainRosettaMetaType(node);
    case "ClosureParameter": return toDomainClosureParameter(node);
    case "RosettaEnumeration": return toDomainRosettaEnumeration(node);
    case "RosettaEnumValue": return toDomainRosettaEnumValue(node);
    case "RosettaParameter": return toDomainRosettaParameter(node);
    case "Data": return toDomainData(node);
    case "Choice": return toDomainChoice(node);
  }
  throw new Error(`Unknown RosettaSymbol member: ${node.$type}`);
}

export function toAstRosettaSymbol(node: any): any {
  switch (node.$type) {
    case "Attribute": return toAstAttribute(node);
    case "ShortcutDeclaration": return toAstShortcutDeclaration(node);
    case "RosettaFunction": return toAstRosettaFunction(node);
    case "RosettaExternalFunction": return toAstRosettaExternalFunction(node);
    case "RosettaRule": return toAstRosettaRule(node);
    case "TypeParameter": return toAstTypeParameter(node);
    case "RosettaMetaType": return toAstRosettaMetaType(node);
    case "ClosureParameter": return toAstClosureParameter(node);
    case "RosettaEnumeration": return toAstRosettaEnumeration(node);
    case "RosettaEnumValue": return toAstRosettaEnumValue(node);
    case "RosettaParameter": return toAstRosettaParameter(node);
    case "Data": return toAstData(node);
    case "Choice": return toAstChoice(node);
  }
  throw new Error(`Unknown RosettaSymbol member: ${node.$type}`);
}

export type RosettaTypeDomain = DataDomain | ChoiceDomain | RosettaBasicTypeDomain | RosettaRecordTypeDomain | RosettaEnumerationDomain | RosettaTypeAliasDomain;

export function toDomainRosettaType(node: any): RosettaTypeDomain {
  switch (node.$type) {
    case "Data": return toDomainData(node);
    case "Choice": return toDomainChoice(node);
    case "RosettaBasicType": return toDomainRosettaBasicType(node);
    case "RosettaRecordType": return toDomainRosettaRecordType(node);
    case "RosettaEnumeration": return toDomainRosettaEnumeration(node);
    case "RosettaTypeAlias": return toDomainRosettaTypeAlias(node);
  }
  throw new Error(`Unknown RosettaType member: ${node.$type}`);
}

export function toAstRosettaType(node: any): any {
  switch (node.$type) {
    case "Data": return toAstData(node);
    case "Choice": return toAstChoice(node);
    case "RosettaBasicType": return toAstRosettaBasicType(node);
    case "RosettaRecordType": return toAstRosettaRecordType(node);
    case "RosettaEnumeration": return toAstRosettaEnumeration(node);
    case "RosettaTypeAlias": return toAstRosettaTypeAlias(node);
  }
  throw new Error(`Unknown RosettaType member: ${node.$type}`);
}

export type RosettaTypedFeatureDomain = AttributeDomain | RosettaRecordFeatureDomain | RosettaMetaTypeDomain;

export function toDomainRosettaTypedFeature(node: any): RosettaTypedFeatureDomain {
  switch (node.$type) {
    case "Attribute": return toDomainAttribute(node);
    case "RosettaRecordFeature": return toDomainRosettaRecordFeature(node);
    case "RosettaMetaType": return toDomainRosettaMetaType(node);
  }
  throw new Error(`Unknown RosettaTypedFeature member: ${node.$type}`);
}

export function toAstRosettaTypedFeature(node: any): any {
  switch (node.$type) {
    case "Attribute": return toAstAttribute(node);
    case "RosettaRecordFeature": return toAstRosettaRecordFeature(node);
    case "RosettaMetaType": return toAstRosettaMetaType(node);
  }
  throw new Error(`Unknown RosettaTypedFeature member: ${node.$type}`);
}

export type SwitchCaseTargetDomain = DataDomain | ChoiceDomain | RosettaEnumValueDomain | RosettaEnumerationDomain;

export function toDomainSwitchCaseTarget(node: any): SwitchCaseTargetDomain {
  switch (node.$type) {
    case "Data": return toDomainData(node);
    case "Choice": return toDomainChoice(node);
    case "RosettaEnumValue": return toDomainRosettaEnumValue(node);
    case "RosettaEnumeration": return toDomainRosettaEnumeration(node);
  }
  throw new Error(`Unknown SwitchCaseTarget member: ${node.$type}`);
}

export function toAstSwitchCaseTarget(node: any): any {
  switch (node.$type) {
    case "Data": return toAstData(node);
    case "Choice": return toAstChoice(node);
    case "RosettaEnumValue": return toAstRosettaEnumValue(node);
    case "RosettaEnumeration": return toAstRosettaEnumeration(node);
  }
  throw new Error(`Unknown SwitchCaseTarget member: ${node.$type}`);
}

export type AnyDomain = AnnotationDomain | AnnotationDeepPathDomain | AnnotationPathDomain | AnnotationPathAttributeReferenceDomain | AnnotationQualifierDomain | AnnotationRefDomain | ArithmeticOperationDomain | AsKeyOperationDomain | AttributeDomain | ChoiceDomain | ChoiceOperationDomain | ChoiceOptionDomain | ClosureParameterDomain | ComparisonOperationDomain | ConditionDomain | ConstructorKeyValuePairDomain | DataDomain | DefaultOperationDomain | DistinctOperationDomain | DocumentRationaleDomain | EqualityOperationDomain | FilterOperationDomain | FirstOperationDomain | FlattenOperationDomain | ImportDomain | InlineFunctionDomain | JoinOperationDomain | LabelAnnotationDomain | LastOperationDomain | ListLiteralDomain | LogicalOperationDomain | MapOperationDomain | MaxOperationDomain | MinOperationDomain | OneOfOperationDomain | OperationDomain | ReduceOperationDomain | RegulatoryDocumentReferenceDomain | ReverseOperationDomain | RosettaAbsentExpressionDomain | RosettaAttributeReferenceDomain | RosettaBasicTypeDomain | RosettaBodyDomain | RosettaBooleanLiteralDomain | RosettaCardinalityDomain | RosettaClassSynonymDomain | RosettaConditionalExpressionDomain | RosettaConstructorExpressionDomain | RosettaContainsExpressionDomain | RosettaCorpusDomain | RosettaCountOperationDomain | RosettaDataReferenceDomain | RosettaDeepFeatureCallDomain | RosettaDisjointExpressionDomain | RosettaDocReferenceDomain | RosettaEnumerationDomain | RosettaEnumSynonymDomain | RosettaEnumValueDomain | RosettaEnumValueReferenceDomain | RosettaExistsExpressionDomain | RosettaExternalClassDomain | RosettaExternalClassSynonymDomain | RosettaExternalEnumDomain | RosettaExternalEnumValueDomain | RosettaExternalFunctionDomain | RosettaExternalRegularAttributeDomain | RosettaExternalRuleSourceDomain | RosettaExternalSynonymDomain | RosettaFeatureCallDomain | RosettaFunctionDomain | RosettaImplicitVariableDomain | RosettaIntLiteralDomain | RosettaMapPathDomain | RosettaMapPathValueDomain | RosettaMappingDomain | RosettaMappingInstanceDomain | RosettaMappingPathTestsDomain | RosettaMapRosettaPathDomain | RosettaMapTestAbsentExpressionDomain | RosettaMapTestEqualityOperationDomain | RosettaMapTestExistsExpressionDomain | RosettaMapTestFuncDomain | RosettaMergeSynonymValueDomain | RosettaMetaTypeDomain | RosettaModelDomain | RosettaNumberLiteralDomain | RosettaOnlyElementDomain | RosettaOnlyExistsExpressionDomain | RosettaParameterDomain | RosettaQualifiableConfigurationDomain | RosettaRecordFeatureDomain | RosettaRecordTypeDomain | RosettaReportDomain | RosettaRuleDomain | RosettaScopeDomain | RosettaSegmentDomain | RosettaSegmentRefDomain | RosettaStringLiteralDomain | RosettaSuperCallDomain | RosettaSymbolReferenceDomain | RosettaSynonymDomain | RosettaSynonymBodyDomain | RosettaSynonymSourceDomain | RosettaSynonymValueBaseDomain | RosettaTypeAliasDomain | RuleReferenceAnnotationDomain | SegmentDomain | ShortcutDeclarationDomain | SortOperationDomain | SumOperationDomain | SwitchCaseGuardDomain | SwitchCaseOrDefaultDomain | SwitchOperationDomain | ThenOperationDomain | ToDateOperationDomain | ToDateTimeOperationDomain | ToEnumOperationDomain | ToIntOperationDomain | ToNumberOperationDomain | ToStringOperationDomain | ToTimeOperationDomain | ToZonedDateTimeOperationDomain | TypeCallDomain | TypeCallArgumentDomain | TypeParameterDomain | WithMetaEntryDomain | WithMetaOperationDomain;

export function toDomain(node: any): AnyDomain {
  switch (node.$type) {
    case "Annotation": return toDomainAnnotation(node);
    case "AnnotationDeepPath": return toDomainAnnotationDeepPath(node);
    case "AnnotationPath": return toDomainAnnotationPath(node);
    case "AnnotationPathAttributeReference": return toDomainAnnotationPathAttributeReference(node);
    case "AnnotationQualifier": return toDomainAnnotationQualifier(node);
    case "AnnotationRef": return toDomainAnnotationRef(node);
    case "ArithmeticOperation": return toDomainArithmeticOperation(node);
    case "AsKeyOperation": return toDomainAsKeyOperation(node);
    case "Attribute": return toDomainAttribute(node);
    case "Choice": return toDomainChoice(node);
    case "ChoiceOperation": return toDomainChoiceOperation(node);
    case "ChoiceOption": return toDomainChoiceOption(node);
    case "ClosureParameter": return toDomainClosureParameter(node);
    case "ComparisonOperation": return toDomainComparisonOperation(node);
    case "Condition": return toDomainCondition(node);
    case "ConstructorKeyValuePair": return toDomainConstructorKeyValuePair(node);
    case "Data": return toDomainData(node);
    case "DefaultOperation": return toDomainDefaultOperation(node);
    case "DistinctOperation": return toDomainDistinctOperation(node);
    case "DocumentRationale": return toDomainDocumentRationale(node);
    case "EqualityOperation": return toDomainEqualityOperation(node);
    case "FilterOperation": return toDomainFilterOperation(node);
    case "FirstOperation": return toDomainFirstOperation(node);
    case "FlattenOperation": return toDomainFlattenOperation(node);
    case "Import": return toDomainImport(node);
    case "InlineFunction": return toDomainInlineFunction(node);
    case "JoinOperation": return toDomainJoinOperation(node);
    case "LabelAnnotation": return toDomainLabelAnnotation(node);
    case "LastOperation": return toDomainLastOperation(node);
    case "ListLiteral": return toDomainListLiteral(node);
    case "LogicalOperation": return toDomainLogicalOperation(node);
    case "MapOperation": return toDomainMapOperation(node);
    case "MaxOperation": return toDomainMaxOperation(node);
    case "MinOperation": return toDomainMinOperation(node);
    case "OneOfOperation": return toDomainOneOfOperation(node);
    case "Operation": return toDomainOperation(node);
    case "ReduceOperation": return toDomainReduceOperation(node);
    case "RegulatoryDocumentReference": return toDomainRegulatoryDocumentReference(node);
    case "ReverseOperation": return toDomainReverseOperation(node);
    case "RosettaAbsentExpression": return toDomainRosettaAbsentExpression(node);
    case "RosettaAttributeReference": return toDomainRosettaAttributeReference(node);
    case "RosettaBasicType": return toDomainRosettaBasicType(node);
    case "RosettaBody": return toDomainRosettaBody(node);
    case "RosettaBooleanLiteral": return toDomainRosettaBooleanLiteral(node);
    case "RosettaCardinality": return toDomainRosettaCardinality(node);
    case "RosettaClassSynonym": return toDomainRosettaClassSynonym(node);
    case "RosettaConditionalExpression": return toDomainRosettaConditionalExpression(node);
    case "RosettaConstructorExpression": return toDomainRosettaConstructorExpression(node);
    case "RosettaContainsExpression": return toDomainRosettaContainsExpression(node);
    case "RosettaCorpus": return toDomainRosettaCorpus(node);
    case "RosettaCountOperation": return toDomainRosettaCountOperation(node);
    case "RosettaDataReference": return toDomainRosettaDataReference(node);
    case "RosettaDeepFeatureCall": return toDomainRosettaDeepFeatureCall(node);
    case "RosettaDisjointExpression": return toDomainRosettaDisjointExpression(node);
    case "RosettaDocReference": return toDomainRosettaDocReference(node);
    case "RosettaEnumeration": return toDomainRosettaEnumeration(node);
    case "RosettaEnumSynonym": return toDomainRosettaEnumSynonym(node);
    case "RosettaEnumValue": return toDomainRosettaEnumValue(node);
    case "RosettaEnumValueReference": return toDomainRosettaEnumValueReference(node);
    case "RosettaExistsExpression": return toDomainRosettaExistsExpression(node);
    case "RosettaExternalClass": return toDomainRosettaExternalClass(node);
    case "RosettaExternalClassSynonym": return toDomainRosettaExternalClassSynonym(node);
    case "RosettaExternalEnum": return toDomainRosettaExternalEnum(node);
    case "RosettaExternalEnumValue": return toDomainRosettaExternalEnumValue(node);
    case "RosettaExternalFunction": return toDomainRosettaExternalFunction(node);
    case "RosettaExternalRegularAttribute": return toDomainRosettaExternalRegularAttribute(node);
    case "RosettaExternalRuleSource": return toDomainRosettaExternalRuleSource(node);
    case "RosettaExternalSynonym": return toDomainRosettaExternalSynonym(node);
    case "RosettaFeatureCall": return toDomainRosettaFeatureCall(node);
    case "RosettaFunction": return toDomainRosettaFunction(node);
    case "RosettaImplicitVariable": return toDomainRosettaImplicitVariable(node);
    case "RosettaIntLiteral": return toDomainRosettaIntLiteral(node);
    case "RosettaMapPath": return toDomainRosettaMapPath(node);
    case "RosettaMapPathValue": return toDomainRosettaMapPathValue(node);
    case "RosettaMapping": return toDomainRosettaMapping(node);
    case "RosettaMappingInstance": return toDomainRosettaMappingInstance(node);
    case "RosettaMappingPathTests": return toDomainRosettaMappingPathTests(node);
    case "RosettaMapRosettaPath": return toDomainRosettaMapRosettaPath(node);
    case "RosettaMapTestAbsentExpression": return toDomainRosettaMapTestAbsentExpression(node);
    case "RosettaMapTestEqualityOperation": return toDomainRosettaMapTestEqualityOperation(node);
    case "RosettaMapTestExistsExpression": return toDomainRosettaMapTestExistsExpression(node);
    case "RosettaMapTestFunc": return toDomainRosettaMapTestFunc(node);
    case "RosettaMergeSynonymValue": return toDomainRosettaMergeSynonymValue(node);
    case "RosettaMetaType": return toDomainRosettaMetaType(node);
    case "RosettaModel": return toDomainRosettaModel(node);
    case "RosettaNumberLiteral": return toDomainRosettaNumberLiteral(node);
    case "RosettaOnlyElement": return toDomainRosettaOnlyElement(node);
    case "RosettaOnlyExistsExpression": return toDomainRosettaOnlyExistsExpression(node);
    case "RosettaParameter": return toDomainRosettaParameter(node);
    case "RosettaQualifiableConfiguration": return toDomainRosettaQualifiableConfiguration(node);
    case "RosettaRecordFeature": return toDomainRosettaRecordFeature(node);
    case "RosettaRecordType": return toDomainRosettaRecordType(node);
    case "RosettaReport": return toDomainRosettaReport(node);
    case "RosettaRule": return toDomainRosettaRule(node);
    case "RosettaScope": return toDomainRosettaScope(node);
    case "RosettaSegment": return toDomainRosettaSegment(node);
    case "RosettaSegmentRef": return toDomainRosettaSegmentRef(node);
    case "RosettaStringLiteral": return toDomainRosettaStringLiteral(node);
    case "RosettaSuperCall": return toDomainRosettaSuperCall(node);
    case "RosettaSymbolReference": return toDomainRosettaSymbolReference(node);
    case "RosettaSynonym": return toDomainRosettaSynonym(node);
    case "RosettaSynonymBody": return toDomainRosettaSynonymBody(node);
    case "RosettaSynonymSource": return toDomainRosettaSynonymSource(node);
    case "RosettaSynonymValueBase": return toDomainRosettaSynonymValueBase(node);
    case "RosettaTypeAlias": return toDomainRosettaTypeAlias(node);
    case "RuleReferenceAnnotation": return toDomainRuleReferenceAnnotation(node);
    case "Segment": return toDomainSegment(node);
    case "ShortcutDeclaration": return toDomainShortcutDeclaration(node);
    case "SortOperation": return toDomainSortOperation(node);
    case "SumOperation": return toDomainSumOperation(node);
    case "SwitchCaseGuard": return toDomainSwitchCaseGuard(node);
    case "SwitchCaseOrDefault": return toDomainSwitchCaseOrDefault(node);
    case "SwitchOperation": return toDomainSwitchOperation(node);
    case "ThenOperation": return toDomainThenOperation(node);
    case "ToDateOperation": return toDomainToDateOperation(node);
    case "ToDateTimeOperation": return toDomainToDateTimeOperation(node);
    case "ToEnumOperation": return toDomainToEnumOperation(node);
    case "ToIntOperation": return toDomainToIntOperation(node);
    case "ToNumberOperation": return toDomainToNumberOperation(node);
    case "ToStringOperation": return toDomainToStringOperation(node);
    case "ToTimeOperation": return toDomainToTimeOperation(node);
    case "ToZonedDateTimeOperation": return toDomainToZonedDateTimeOperation(node);
    case "TypeCall": return toDomainTypeCall(node);
    case "TypeCallArgument": return toDomainTypeCallArgument(node);
    case "TypeParameter": return toDomainTypeParameter(node);
    case "WithMetaEntry": return toDomainWithMetaEntry(node);
    case "WithMetaOperation": return toDomainWithMetaOperation(node);
  }
  throw new Error(`Unknown node type: ${node.$type}`);
}

export function toAst(node: any): any {
  switch (node.$type) {
    case "Annotation": return toAstAnnotation(node);
    case "AnnotationDeepPath": return toAstAnnotationDeepPath(node);
    case "AnnotationPath": return toAstAnnotationPath(node);
    case "AnnotationPathAttributeReference": return toAstAnnotationPathAttributeReference(node);
    case "AnnotationQualifier": return toAstAnnotationQualifier(node);
    case "AnnotationRef": return toAstAnnotationRef(node);
    case "ArithmeticOperation": return toAstArithmeticOperation(node);
    case "AsKeyOperation": return toAstAsKeyOperation(node);
    case "Attribute": return toAstAttribute(node);
    case "Choice": return toAstChoice(node);
    case "ChoiceOperation": return toAstChoiceOperation(node);
    case "ChoiceOption": return toAstChoiceOption(node);
    case "ClosureParameter": return toAstClosureParameter(node);
    case "ComparisonOperation": return toAstComparisonOperation(node);
    case "Condition": return toAstCondition(node);
    case "ConstructorKeyValuePair": return toAstConstructorKeyValuePair(node);
    case "Data": return toAstData(node);
    case "DefaultOperation": return toAstDefaultOperation(node);
    case "DistinctOperation": return toAstDistinctOperation(node);
    case "DocumentRationale": return toAstDocumentRationale(node);
    case "EqualityOperation": return toAstEqualityOperation(node);
    case "FilterOperation": return toAstFilterOperation(node);
    case "FirstOperation": return toAstFirstOperation(node);
    case "FlattenOperation": return toAstFlattenOperation(node);
    case "Import": return toAstImport(node);
    case "InlineFunction": return toAstInlineFunction(node);
    case "JoinOperation": return toAstJoinOperation(node);
    case "LabelAnnotation": return toAstLabelAnnotation(node);
    case "LastOperation": return toAstLastOperation(node);
    case "ListLiteral": return toAstListLiteral(node);
    case "LogicalOperation": return toAstLogicalOperation(node);
    case "MapOperation": return toAstMapOperation(node);
    case "MaxOperation": return toAstMaxOperation(node);
    case "MinOperation": return toAstMinOperation(node);
    case "OneOfOperation": return toAstOneOfOperation(node);
    case "Operation": return toAstOperation(node);
    case "ReduceOperation": return toAstReduceOperation(node);
    case "RegulatoryDocumentReference": return toAstRegulatoryDocumentReference(node);
    case "ReverseOperation": return toAstReverseOperation(node);
    case "RosettaAbsentExpression": return toAstRosettaAbsentExpression(node);
    case "RosettaAttributeReference": return toAstRosettaAttributeReference(node);
    case "RosettaBasicType": return toAstRosettaBasicType(node);
    case "RosettaBody": return toAstRosettaBody(node);
    case "RosettaBooleanLiteral": return toAstRosettaBooleanLiteral(node);
    case "RosettaCardinality": return toAstRosettaCardinality(node);
    case "RosettaClassSynonym": return toAstRosettaClassSynonym(node);
    case "RosettaConditionalExpression": return toAstRosettaConditionalExpression(node);
    case "RosettaConstructorExpression": return toAstRosettaConstructorExpression(node);
    case "RosettaContainsExpression": return toAstRosettaContainsExpression(node);
    case "RosettaCorpus": return toAstRosettaCorpus(node);
    case "RosettaCountOperation": return toAstRosettaCountOperation(node);
    case "RosettaDataReference": return toAstRosettaDataReference(node);
    case "RosettaDeepFeatureCall": return toAstRosettaDeepFeatureCall(node);
    case "RosettaDisjointExpression": return toAstRosettaDisjointExpression(node);
    case "RosettaDocReference": return toAstRosettaDocReference(node);
    case "RosettaEnumeration": return toAstRosettaEnumeration(node);
    case "RosettaEnumSynonym": return toAstRosettaEnumSynonym(node);
    case "RosettaEnumValue": return toAstRosettaEnumValue(node);
    case "RosettaEnumValueReference": return toAstRosettaEnumValueReference(node);
    case "RosettaExistsExpression": return toAstRosettaExistsExpression(node);
    case "RosettaExternalClass": return toAstRosettaExternalClass(node);
    case "RosettaExternalClassSynonym": return toAstRosettaExternalClassSynonym(node);
    case "RosettaExternalEnum": return toAstRosettaExternalEnum(node);
    case "RosettaExternalEnumValue": return toAstRosettaExternalEnumValue(node);
    case "RosettaExternalFunction": return toAstRosettaExternalFunction(node);
    case "RosettaExternalRegularAttribute": return toAstRosettaExternalRegularAttribute(node);
    case "RosettaExternalRuleSource": return toAstRosettaExternalRuleSource(node);
    case "RosettaExternalSynonym": return toAstRosettaExternalSynonym(node);
    case "RosettaFeatureCall": return toAstRosettaFeatureCall(node);
    case "RosettaFunction": return toAstRosettaFunction(node);
    case "RosettaImplicitVariable": return toAstRosettaImplicitVariable(node);
    case "RosettaIntLiteral": return toAstRosettaIntLiteral(node);
    case "RosettaMapPath": return toAstRosettaMapPath(node);
    case "RosettaMapPathValue": return toAstRosettaMapPathValue(node);
    case "RosettaMapping": return toAstRosettaMapping(node);
    case "RosettaMappingInstance": return toAstRosettaMappingInstance(node);
    case "RosettaMappingPathTests": return toAstRosettaMappingPathTests(node);
    case "RosettaMapRosettaPath": return toAstRosettaMapRosettaPath(node);
    case "RosettaMapTestAbsentExpression": return toAstRosettaMapTestAbsentExpression(node);
    case "RosettaMapTestEqualityOperation": return toAstRosettaMapTestEqualityOperation(node);
    case "RosettaMapTestExistsExpression": return toAstRosettaMapTestExistsExpression(node);
    case "RosettaMapTestFunc": return toAstRosettaMapTestFunc(node);
    case "RosettaMergeSynonymValue": return toAstRosettaMergeSynonymValue(node);
    case "RosettaMetaType": return toAstRosettaMetaType(node);
    case "RosettaModel": return toAstRosettaModel(node);
    case "RosettaNumberLiteral": return toAstRosettaNumberLiteral(node);
    case "RosettaOnlyElement": return toAstRosettaOnlyElement(node);
    case "RosettaOnlyExistsExpression": return toAstRosettaOnlyExistsExpression(node);
    case "RosettaParameter": return toAstRosettaParameter(node);
    case "RosettaQualifiableConfiguration": return toAstRosettaQualifiableConfiguration(node);
    case "RosettaRecordFeature": return toAstRosettaRecordFeature(node);
    case "RosettaRecordType": return toAstRosettaRecordType(node);
    case "RosettaReport": return toAstRosettaReport(node);
    case "RosettaRule": return toAstRosettaRule(node);
    case "RosettaScope": return toAstRosettaScope(node);
    case "RosettaSegment": return toAstRosettaSegment(node);
    case "RosettaSegmentRef": return toAstRosettaSegmentRef(node);
    case "RosettaStringLiteral": return toAstRosettaStringLiteral(node);
    case "RosettaSuperCall": return toAstRosettaSuperCall(node);
    case "RosettaSymbolReference": return toAstRosettaSymbolReference(node);
    case "RosettaSynonym": return toAstRosettaSynonym(node);
    case "RosettaSynonymBody": return toAstRosettaSynonymBody(node);
    case "RosettaSynonymSource": return toAstRosettaSynonymSource(node);
    case "RosettaSynonymValueBase": return toAstRosettaSynonymValueBase(node);
    case "RosettaTypeAlias": return toAstRosettaTypeAlias(node);
    case "RuleReferenceAnnotation": return toAstRuleReferenceAnnotation(node);
    case "Segment": return toAstSegment(node);
    case "ShortcutDeclaration": return toAstShortcutDeclaration(node);
    case "SortOperation": return toAstSortOperation(node);
    case "SumOperation": return toAstSumOperation(node);
    case "SwitchCaseGuard": return toAstSwitchCaseGuard(node);
    case "SwitchCaseOrDefault": return toAstSwitchCaseOrDefault(node);
    case "SwitchOperation": return toAstSwitchOperation(node);
    case "ThenOperation": return toAstThenOperation(node);
    case "ToDateOperation": return toAstToDateOperation(node);
    case "ToDateTimeOperation": return toAstToDateTimeOperation(node);
    case "ToEnumOperation": return toAstToEnumOperation(node);
    case "ToIntOperation": return toAstToIntOperation(node);
    case "ToNumberOperation": return toAstToNumberOperation(node);
    case "ToStringOperation": return toAstToStringOperation(node);
    case "ToTimeOperation": return toAstToTimeOperation(node);
    case "ToZonedDateTimeOperation": return toAstToZonedDateTimeOperation(node);
    case "TypeCall": return toAstTypeCall(node);
    case "TypeCallArgument": return toAstTypeCallArgument(node);
    case "TypeParameter": return toAstTypeParameter(node);
    case "WithMetaEntry": return toAstWithMetaEntry(node);
    case "WithMetaOperation": return toAstWithMetaOperation(node);
  }
  throw new Error(`Unknown node type: ${node.$type}`);
}
