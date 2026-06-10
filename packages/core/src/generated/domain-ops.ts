import type {
  Annotation as Annotation$,
  AnnotationDeepPath as AnnotationDeepPath$,
  AnnotationPath as AnnotationPath$,
  AnnotationPathAttributeReference as AnnotationPathAttributeReference$,
  AnnotationQualifier as AnnotationQualifier$,
  AnnotationRef as AnnotationRef$,
  ArithmeticOperation as ArithmeticOperation$,
  AsKeyOperation as AsKeyOperation$,
  Attribute as Attribute$,
  Choice as Choice$,
  ChoiceOperation as ChoiceOperation$,
  ChoiceOption as ChoiceOption$,
  ClosureParameter as ClosureParameter$,
  ComparisonOperation as ComparisonOperation$,
  Condition as Condition$,
  ConstructorKeyValuePair as ConstructorKeyValuePair$,
  Data as Data$,
  DefaultOperation as DefaultOperation$,
  DistinctOperation as DistinctOperation$,
  DocumentRationale as DocumentRationale$,
  EqualityOperation as EqualityOperation$,
  FilterOperation as FilterOperation$,
  FirstOperation as FirstOperation$,
  FlattenOperation as FlattenOperation$,
  Import as Import$,
  InlineFunction as InlineFunction$,
  JoinOperation as JoinOperation$,
  LabelAnnotation as LabelAnnotation$,
  LastOperation as LastOperation$,
  ListLiteral as ListLiteral$,
  LogicalOperation as LogicalOperation$,
  MapOperation as MapOperation$,
  MaxOperation as MaxOperation$,
  MinOperation as MinOperation$,
  OneOfOperation as OneOfOperation$,
  Operation as Operation$,
  ReduceOperation as ReduceOperation$,
  RegulatoryDocumentReference as RegulatoryDocumentReference$,
  ReverseOperation as ReverseOperation$,
  RosettaAbsentExpression as RosettaAbsentExpression$,
  RosettaAttributeReference as RosettaAttributeReference$,
  RosettaBasicType as RosettaBasicType$,
  RosettaBody as RosettaBody$,
  RosettaBooleanLiteral as RosettaBooleanLiteral$,
  RosettaCardinality as RosettaCardinality$,
  RosettaClassSynonym as RosettaClassSynonym$,
  RosettaConditionalExpression as RosettaConditionalExpression$,
  RosettaConstructorExpression as RosettaConstructorExpression$,
  RosettaContainsExpression as RosettaContainsExpression$,
  RosettaCorpus as RosettaCorpus$,
  RosettaCountOperation as RosettaCountOperation$,
  RosettaDataReference as RosettaDataReference$,
  RosettaDeepFeatureCall as RosettaDeepFeatureCall$,
  RosettaDisjointExpression as RosettaDisjointExpression$,
  RosettaDocReference as RosettaDocReference$,
  RosettaEnumeration as RosettaEnumeration$,
  RosettaEnumSynonym as RosettaEnumSynonym$,
  RosettaEnumValue as RosettaEnumValue$,
  RosettaEnumValueReference as RosettaEnumValueReference$,
  RosettaExistsExpression as RosettaExistsExpression$,
  RosettaExternalClass as RosettaExternalClass$,
  RosettaExternalClassSynonym as RosettaExternalClassSynonym$,
  RosettaExternalEnum as RosettaExternalEnum$,
  RosettaExternalEnumValue as RosettaExternalEnumValue$,
  RosettaExternalFunction as RosettaExternalFunction$,
  RosettaExternalRegularAttribute as RosettaExternalRegularAttribute$,
  RosettaExternalRuleSource as RosettaExternalRuleSource$,
  RosettaExternalSynonym as RosettaExternalSynonym$,
  RosettaFeatureCall as RosettaFeatureCall$,
  RosettaFunction as RosettaFunction$,
  RosettaImplicitVariable as RosettaImplicitVariable$,
  RosettaIntLiteral as RosettaIntLiteral$,
  RosettaMapPath as RosettaMapPath$,
  RosettaMapPathValue as RosettaMapPathValue$,
  RosettaMapping as RosettaMapping$,
  RosettaMappingInstance as RosettaMappingInstance$,
  RosettaMappingPathTests as RosettaMappingPathTests$,
  RosettaMapRosettaPath as RosettaMapRosettaPath$,
  RosettaMapTestAbsentExpression as RosettaMapTestAbsentExpression$,
  RosettaMapTestEqualityOperation as RosettaMapTestEqualityOperation$,
  RosettaMapTestExistsExpression as RosettaMapTestExistsExpression$,
  RosettaMapTestFunc as RosettaMapTestFunc$,
  RosettaMergeSynonymValue as RosettaMergeSynonymValue$,
  RosettaMetaType as RosettaMetaType$,
  RosettaModel as RosettaModel$,
  RosettaNumberLiteral as RosettaNumberLiteral$,
  RosettaOnlyElement as RosettaOnlyElement$,
  RosettaOnlyExistsExpression as RosettaOnlyExistsExpression$,
  RosettaParameter as RosettaParameter$,
  RosettaQualifiableConfiguration as RosettaQualifiableConfiguration$,
  RosettaRecordFeature as RosettaRecordFeature$,
  RosettaRecordType as RosettaRecordType$,
  RosettaReport as RosettaReport$,
  RosettaRule as RosettaRule$,
  RosettaScope as RosettaScope$,
  RosettaSegment as RosettaSegment$,
  RosettaSegmentRef as RosettaSegmentRef$,
  RosettaStringLiteral as RosettaStringLiteral$,
  RosettaSuperCall as RosettaSuperCall$,
  RosettaSymbolReference as RosettaSymbolReference$,
  RosettaSynonym as RosettaSynonym$,
  RosettaSynonymBody as RosettaSynonymBody$,
  RosettaSynonymSource as RosettaSynonymSource$,
  RosettaSynonymValueBase as RosettaSynonymValueBase$,
  RosettaTypeAlias as RosettaTypeAlias$,
  RuleReferenceAnnotation as RuleReferenceAnnotation$,
  Segment as Segment$,
  ShortcutDeclaration as ShortcutDeclaration$,
  SortOperation as SortOperation$,
  SumOperation as SumOperation$,
  SwitchCaseGuard as SwitchCaseGuard$,
  SwitchCaseOrDefault as SwitchCaseOrDefault$,
  SwitchOperation as SwitchOperation$,
  ThenOperation as ThenOperation$,
  ToDateOperation as ToDateOperation$,
  ToDateTimeOperation as ToDateTimeOperation$,
  ToEnumOperation as ToEnumOperation$,
  ToIntOperation as ToIntOperation$,
  ToNumberOperation as ToNumberOperation$,
  ToStringOperation as ToStringOperation$,
  ToTimeOperation as ToTimeOperation$,
  ToZonedDateTimeOperation as ToZonedDateTimeOperation$,
  TypeCall as TypeCall$,
  TypeCallArgument as TypeCallArgument$,
  TypeParameter as TypeParameter$,
  WithMetaEntry as WithMetaEntry$,
  WithMetaOperation as WithMetaOperation$
} from './ast.js';

import type { Dehydrated } from '../serializer/dehydrated.js';

export namespace Annotation {
  export function getAttributes(node: Dehydrated<Annotation$>): Dehydrated<Attribute$>[] {
    return node.attributes;
  }
  export function addAttribute(node: Dehydrated<Annotation$>, attribute: Dehydrated<Attribute$>): void {
    node.attributes.push(attribute);
  }
  export function insertAttributeAt(
    node: Dehydrated<Annotation$>,
    index: number,
    attribute: Dehydrated<Attribute$>
  ): void {
    node.attributes.splice(index, 0, attribute);
  }
  export function removeAttributeAt(node: Dehydrated<Annotation$>, index: number): void {
    node.attributes.splice(index, 1);
  }
  export function setAttributeAt(
    node: Dehydrated<Annotation$>,
    index: number,
    attribute: Dehydrated<Attribute$>
  ): void {
    node.attributes[index] = attribute;
  }
  export function moveAttributeAt(node: Dehydrated<Annotation$>, from: number, to: number): void {
    const [item] = node.attributes.splice(from, 1);
    if (item === undefined) return;
    node.attributes.splice(to, 0, item);
  }
}

export namespace AnnotationDeepPath {
  export function setAttribute(node: Dehydrated<AnnotationDeepPath$>, refText: string): void {
    node.attribute = { $refText: refText };
  }
}

export namespace AnnotationPath {
  export function setAttribute(node: Dehydrated<AnnotationPath$>, refText: string): void {
    node.attribute = { $refText: refText };
  }
}

export namespace AnnotationPathAttributeReference {
  export function setAttribute(node: Dehydrated<AnnotationPathAttributeReference$>, refText: string): void {
    node.attribute = { $refText: refText };
  }
}

export namespace AnnotationQualifier {
  export function setQualPath(
    node: Dehydrated<AnnotationQualifier$>,
    qualPath: Dehydrated<RosettaAttributeReference$>
  ): void {
    node.qualPath = qualPath;
  }
  export function clearQualPath(node: Dehydrated<AnnotationQualifier$>): void {
    node.qualPath = undefined;
  }
}

export namespace AnnotationRef {
  export function setAnnotation(node: Dehydrated<AnnotationRef$>, refText: string): void {
    node.annotation = { $refText: refText };
  }
  export function setAttribute(node: Dehydrated<AnnotationRef$>, refText: string): void {
    node.attribute = { $refText: refText };
  }
  export function clearAttribute(node: Dehydrated<AnnotationRef$>): void {
    node.attribute = undefined;
  }
  export function getQualifiers(node: Dehydrated<AnnotationRef$>): Dehydrated<AnnotationQualifier$>[] {
    return node.qualifiers;
  }
  export function addQualifier(node: Dehydrated<AnnotationRef$>, qualifier: Dehydrated<AnnotationQualifier$>): void {
    node.qualifiers.push(qualifier);
  }
  export function insertQualifierAt(
    node: Dehydrated<AnnotationRef$>,
    index: number,
    qualifier: Dehydrated<AnnotationQualifier$>
  ): void {
    node.qualifiers.splice(index, 0, qualifier);
  }
  export function removeQualifierAt(node: Dehydrated<AnnotationRef$>, index: number): void {
    node.qualifiers.splice(index, 1);
  }
  export function setQualifierAt(
    node: Dehydrated<AnnotationRef$>,
    index: number,
    qualifier: Dehydrated<AnnotationQualifier$>
  ): void {
    node.qualifiers[index] = qualifier;
  }
  export function moveQualifierAt(node: Dehydrated<AnnotationRef$>, from: number, to: number): void {
    const [item] = node.qualifiers.splice(from, 1);
    if (item === undefined) return;
    node.qualifiers.splice(to, 0, item);
  }
}

export namespace Attribute {
  export function setTypeCall(node: Dehydrated<Attribute$>, typeCall: Dehydrated<TypeCall$>): void {
    node.typeCall = typeCall;
  }
  export function getTypeCallArgs(node: Dehydrated<Attribute$>): Dehydrated<TypeCallArgument$>[] {
    return node.typeCallArgs;
  }
  export function addTypeCallArg(node: Dehydrated<Attribute$>, typeCallArg: Dehydrated<TypeCallArgument$>): void {
    node.typeCallArgs.push(typeCallArg);
  }
  export function insertTypeCallArgAt(
    node: Dehydrated<Attribute$>,
    index: number,
    typeCallArg: Dehydrated<TypeCallArgument$>
  ): void {
    node.typeCallArgs.splice(index, 0, typeCallArg);
  }
  export function removeTypeCallArgAt(node: Dehydrated<Attribute$>, index: number): void {
    node.typeCallArgs.splice(index, 1);
  }
  export function setTypeCallArgAt(
    node: Dehydrated<Attribute$>,
    index: number,
    typeCallArg: Dehydrated<TypeCallArgument$>
  ): void {
    node.typeCallArgs[index] = typeCallArg;
  }
  export function moveTypeCallArgAt(node: Dehydrated<Attribute$>, from: number, to: number): void {
    const [item] = node.typeCallArgs.splice(from, 1);
    if (item === undefined) return;
    node.typeCallArgs.splice(to, 0, item);
  }
  export function setCard(node: Dehydrated<Attribute$>, card: Dehydrated<RosettaCardinality$>): void {
    node.card = card;
  }
  export function getReferences(node: Dehydrated<Attribute$>): Dehydrated<RosettaDocReference$>[] {
    return node.references;
  }
  export function addReference(node: Dehydrated<Attribute$>, reference: Dehydrated<RosettaDocReference$>): void {
    node.references.push(reference);
  }
  export function insertReferenceAt(
    node: Dehydrated<Attribute$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.splice(index, 0, reference);
  }
  export function removeReferenceAt(node: Dehydrated<Attribute$>, index: number): void {
    node.references.splice(index, 1);
  }
  export function setReferenceAt(
    node: Dehydrated<Attribute$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references[index] = reference;
  }
  export function moveReferenceAt(node: Dehydrated<Attribute$>, from: number, to: number): void {
    const [item] = node.references.splice(from, 1);
    if (item === undefined) return;
    node.references.splice(to, 0, item);
  }
  export function getAnnotations(node: Dehydrated<Attribute$>): Dehydrated<AnnotationRef$>[] {
    return node.annotations;
  }
  export function addAnnotation(node: Dehydrated<Attribute$>, annotation: Dehydrated<AnnotationRef$>): void {
    node.annotations.push(annotation);
  }
  export function insertAnnotationAt(
    node: Dehydrated<Attribute$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations.splice(index, 0, annotation);
  }
  export function removeAnnotationAt(node: Dehydrated<Attribute$>, index: number): void {
    node.annotations.splice(index, 1);
  }
  export function setAnnotationAt(
    node: Dehydrated<Attribute$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations[index] = annotation;
  }
  export function moveAnnotationAt(node: Dehydrated<Attribute$>, from: number, to: number): void {
    const [item] = node.annotations.splice(from, 1);
    if (item === undefined) return;
    node.annotations.splice(to, 0, item);
  }
  export function getSynonyms(node: Dehydrated<Attribute$>): Dehydrated<RosettaSynonym$>[] {
    return node.synonyms;
  }
  export function addSynonym(node: Dehydrated<Attribute$>, synonym: Dehydrated<RosettaSynonym$>): void {
    node.synonyms.push(synonym);
  }
  export function insertSynonymAt(
    node: Dehydrated<Attribute$>,
    index: number,
    synonym: Dehydrated<RosettaSynonym$>
  ): void {
    node.synonyms.splice(index, 0, synonym);
  }
  export function removeSynonymAt(node: Dehydrated<Attribute$>, index: number): void {
    node.synonyms.splice(index, 1);
  }
  export function setSynonymAt(
    node: Dehydrated<Attribute$>,
    index: number,
    synonym: Dehydrated<RosettaSynonym$>
  ): void {
    node.synonyms[index] = synonym;
  }
  export function moveSynonymAt(node: Dehydrated<Attribute$>, from: number, to: number): void {
    const [item] = node.synonyms.splice(from, 1);
    if (item === undefined) return;
    node.synonyms.splice(to, 0, item);
  }
  export function getLabels(node: Dehydrated<Attribute$>): Dehydrated<LabelAnnotation$>[] {
    return node.labels;
  }
  export function addLabel(node: Dehydrated<Attribute$>, label: Dehydrated<LabelAnnotation$>): void {
    node.labels.push(label);
  }
  export function insertLabelAt(
    node: Dehydrated<Attribute$>,
    index: number,
    label: Dehydrated<LabelAnnotation$>
  ): void {
    node.labels.splice(index, 0, label);
  }
  export function removeLabelAt(node: Dehydrated<Attribute$>, index: number): void {
    node.labels.splice(index, 1);
  }
  export function setLabelAt(node: Dehydrated<Attribute$>, index: number, label: Dehydrated<LabelAnnotation$>): void {
    node.labels[index] = label;
  }
  export function moveLabelAt(node: Dehydrated<Attribute$>, from: number, to: number): void {
    const [item] = node.labels.splice(from, 1);
    if (item === undefined) return;
    node.labels.splice(to, 0, item);
  }
  export function getRuleReferences(node: Dehydrated<Attribute$>): Dehydrated<RuleReferenceAnnotation$>[] {
    return node.ruleReferences;
  }
  export function addRuleReference(
    node: Dehydrated<Attribute$>,
    ruleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.ruleReferences.push(ruleReference);
  }
  export function insertRuleReferenceAt(
    node: Dehydrated<Attribute$>,
    index: number,
    ruleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.ruleReferences.splice(index, 0, ruleReference);
  }
  export function removeRuleReferenceAt(node: Dehydrated<Attribute$>, index: number): void {
    node.ruleReferences.splice(index, 1);
  }
  export function setRuleReferenceAt(
    node: Dehydrated<Attribute$>,
    index: number,
    ruleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.ruleReferences[index] = ruleReference;
  }
  export function moveRuleReferenceAt(node: Dehydrated<Attribute$>, from: number, to: number): void {
    const [item] = node.ruleReferences.splice(from, 1);
    if (item === undefined) return;
    node.ruleReferences.splice(to, 0, item);
  }
}

export namespace Choice {
  export function getAttributes(node: Dehydrated<Choice$>): Dehydrated<ChoiceOption$>[] {
    return node.attributes;
  }
  export function addAttribute(node: Dehydrated<Choice$>, attribute: Dehydrated<ChoiceOption$>): void {
    node.attributes.push(attribute);
  }
  export function insertAttributeAt(
    node: Dehydrated<Choice$>,
    index: number,
    attribute: Dehydrated<ChoiceOption$>
  ): void {
    node.attributes.splice(index, 0, attribute);
  }
  export function removeAttributeAt(node: Dehydrated<Choice$>, index: number): void {
    node.attributes.splice(index, 1);
  }
  export function setAttributeAt(node: Dehydrated<Choice$>, index: number, attribute: Dehydrated<ChoiceOption$>): void {
    node.attributes[index] = attribute;
  }
  export function moveAttributeAt(node: Dehydrated<Choice$>, from: number, to: number): void {
    const [item] = node.attributes.splice(from, 1);
    if (item === undefined) return;
    node.attributes.splice(to, 0, item);
  }
  export function getAnnotations(node: Dehydrated<Choice$>): Dehydrated<AnnotationRef$>[] {
    return node.annotations;
  }
  export function addAnnotation(node: Dehydrated<Choice$>, annotation: Dehydrated<AnnotationRef$>): void {
    node.annotations.push(annotation);
  }
  export function insertAnnotationAt(
    node: Dehydrated<Choice$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations.splice(index, 0, annotation);
  }
  export function removeAnnotationAt(node: Dehydrated<Choice$>, index: number): void {
    node.annotations.splice(index, 1);
  }
  export function setAnnotationAt(
    node: Dehydrated<Choice$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations[index] = annotation;
  }
  export function moveAnnotationAt(node: Dehydrated<Choice$>, from: number, to: number): void {
    const [item] = node.annotations.splice(from, 1);
    if (item === undefined) return;
    node.annotations.splice(to, 0, item);
  }
  export function getSynonyms(node: Dehydrated<Choice$>): Dehydrated<RosettaClassSynonym$>[] {
    return node.synonyms;
  }
  export function addSynonym(node: Dehydrated<Choice$>, synonym: Dehydrated<RosettaClassSynonym$>): void {
    node.synonyms.push(synonym);
  }
  export function insertSynonymAt(
    node: Dehydrated<Choice$>,
    index: number,
    synonym: Dehydrated<RosettaClassSynonym$>
  ): void {
    node.synonyms.splice(index, 0, synonym);
  }
  export function removeSynonymAt(node: Dehydrated<Choice$>, index: number): void {
    node.synonyms.splice(index, 1);
  }
  export function setSynonymAt(
    node: Dehydrated<Choice$>,
    index: number,
    synonym: Dehydrated<RosettaClassSynonym$>
  ): void {
    node.synonyms[index] = synonym;
  }
  export function moveSynonymAt(node: Dehydrated<Choice$>, from: number, to: number): void {
    const [item] = node.synonyms.splice(from, 1);
    if (item === undefined) return;
    node.synonyms.splice(to, 0, item);
  }
}

export namespace ChoiceOption {
  export function setTypeCall(node: Dehydrated<ChoiceOption$>, typeCall: Dehydrated<TypeCall$>): void {
    node.typeCall = typeCall;
  }
  export function getReferences(node: Dehydrated<ChoiceOption$>): Dehydrated<RosettaDocReference$>[] {
    return node.references;
  }
  export function addReference(node: Dehydrated<ChoiceOption$>, reference: Dehydrated<RosettaDocReference$>): void {
    node.references.push(reference);
  }
  export function insertReferenceAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.splice(index, 0, reference);
  }
  export function removeReferenceAt(node: Dehydrated<ChoiceOption$>, index: number): void {
    node.references.splice(index, 1);
  }
  export function setReferenceAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references[index] = reference;
  }
  export function moveReferenceAt(node: Dehydrated<ChoiceOption$>, from: number, to: number): void {
    const [item] = node.references.splice(from, 1);
    if (item === undefined) return;
    node.references.splice(to, 0, item);
  }
  export function getAnnotations(node: Dehydrated<ChoiceOption$>): Dehydrated<AnnotationRef$>[] {
    return node.annotations;
  }
  export function addAnnotation(node: Dehydrated<ChoiceOption$>, annotation: Dehydrated<AnnotationRef$>): void {
    node.annotations.push(annotation);
  }
  export function insertAnnotationAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations.splice(index, 0, annotation);
  }
  export function removeAnnotationAt(node: Dehydrated<ChoiceOption$>, index: number): void {
    node.annotations.splice(index, 1);
  }
  export function setAnnotationAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations[index] = annotation;
  }
  export function moveAnnotationAt(node: Dehydrated<ChoiceOption$>, from: number, to: number): void {
    const [item] = node.annotations.splice(from, 1);
    if (item === undefined) return;
    node.annotations.splice(to, 0, item);
  }
  export function getSynonyms(node: Dehydrated<ChoiceOption$>): Dehydrated<RosettaSynonym$>[] {
    return node.synonyms;
  }
  export function addSynonym(node: Dehydrated<ChoiceOption$>, synonym: Dehydrated<RosettaSynonym$>): void {
    node.synonyms.push(synonym);
  }
  export function insertSynonymAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    synonym: Dehydrated<RosettaSynonym$>
  ): void {
    node.synonyms.splice(index, 0, synonym);
  }
  export function removeSynonymAt(node: Dehydrated<ChoiceOption$>, index: number): void {
    node.synonyms.splice(index, 1);
  }
  export function setSynonymAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    synonym: Dehydrated<RosettaSynonym$>
  ): void {
    node.synonyms[index] = synonym;
  }
  export function moveSynonymAt(node: Dehydrated<ChoiceOption$>, from: number, to: number): void {
    const [item] = node.synonyms.splice(from, 1);
    if (item === undefined) return;
    node.synonyms.splice(to, 0, item);
  }
  export function getLabels(node: Dehydrated<ChoiceOption$>): Dehydrated<LabelAnnotation$>[] {
    return node.labels;
  }
  export function addLabel(node: Dehydrated<ChoiceOption$>, label: Dehydrated<LabelAnnotation$>): void {
    node.labels.push(label);
  }
  export function insertLabelAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    label: Dehydrated<LabelAnnotation$>
  ): void {
    node.labels.splice(index, 0, label);
  }
  export function removeLabelAt(node: Dehydrated<ChoiceOption$>, index: number): void {
    node.labels.splice(index, 1);
  }
  export function setLabelAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    label: Dehydrated<LabelAnnotation$>
  ): void {
    node.labels[index] = label;
  }
  export function moveLabelAt(node: Dehydrated<ChoiceOption$>, from: number, to: number): void {
    const [item] = node.labels.splice(from, 1);
    if (item === undefined) return;
    node.labels.splice(to, 0, item);
  }
  export function getRuleReferences(node: Dehydrated<ChoiceOption$>): Dehydrated<RuleReferenceAnnotation$>[] {
    return node.ruleReferences;
  }
  export function addRuleReference(
    node: Dehydrated<ChoiceOption$>,
    ruleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.ruleReferences.push(ruleReference);
  }
  export function insertRuleReferenceAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    ruleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.ruleReferences.splice(index, 0, ruleReference);
  }
  export function removeRuleReferenceAt(node: Dehydrated<ChoiceOption$>, index: number): void {
    node.ruleReferences.splice(index, 1);
  }
  export function setRuleReferenceAt(
    node: Dehydrated<ChoiceOption$>,
    index: number,
    ruleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.ruleReferences[index] = ruleReference;
  }
  export function moveRuleReferenceAt(node: Dehydrated<ChoiceOption$>, from: number, to: number): void {
    const [item] = node.ruleReferences.splice(from, 1);
    if (item === undefined) return;
    node.ruleReferences.splice(to, 0, item);
  }
}

export namespace Condition {
  export function getReferences(node: Dehydrated<Condition$>): Dehydrated<RosettaDocReference$>[] {
    return node.references;
  }
  export function addReference(node: Dehydrated<Condition$>, reference: Dehydrated<RosettaDocReference$>): void {
    node.references.push(reference);
  }
  export function insertReferenceAt(
    node: Dehydrated<Condition$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.splice(index, 0, reference);
  }
  export function removeReferenceAt(node: Dehydrated<Condition$>, index: number): void {
    node.references.splice(index, 1);
  }
  export function setReferenceAt(
    node: Dehydrated<Condition$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references[index] = reference;
  }
  export function moveReferenceAt(node: Dehydrated<Condition$>, from: number, to: number): void {
    const [item] = node.references.splice(from, 1);
    if (item === undefined) return;
    node.references.splice(to, 0, item);
  }
  export function getAnnotations(node: Dehydrated<Condition$>): Dehydrated<AnnotationRef$>[] {
    return node.annotations;
  }
  export function addAnnotation(node: Dehydrated<Condition$>, annotation: Dehydrated<AnnotationRef$>): void {
    node.annotations.push(annotation);
  }
  export function insertAnnotationAt(
    node: Dehydrated<Condition$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations.splice(index, 0, annotation);
  }
  export function removeAnnotationAt(node: Dehydrated<Condition$>, index: number): void {
    node.annotations.splice(index, 1);
  }
  export function setAnnotationAt(
    node: Dehydrated<Condition$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations[index] = annotation;
  }
  export function moveAnnotationAt(node: Dehydrated<Condition$>, from: number, to: number): void {
    const [item] = node.annotations.splice(from, 1);
    if (item === undefined) return;
    node.annotations.splice(to, 0, item);
  }
}

export namespace ConstructorKeyValuePair {
  export function setKey(node: Dehydrated<ConstructorKeyValuePair$>, refText: string): void {
    node.key = { $refText: refText };
  }
}

export namespace Data {
  export function setSuperType(node: Dehydrated<Data$>, refText: string): void {
    node.superType = { $refText: refText };
  }
  export function clearSuperType(node: Dehydrated<Data$>): void {
    node.superType = undefined;
  }
  export function getAttributes(node: Dehydrated<Data$>): Dehydrated<Attribute$>[] {
    return node.attributes;
  }
  export function addAttribute(node: Dehydrated<Data$>, attribute: Dehydrated<Attribute$>): void {
    node.attributes.push(attribute);
  }
  export function insertAttributeAt(node: Dehydrated<Data$>, index: number, attribute: Dehydrated<Attribute$>): void {
    node.attributes.splice(index, 0, attribute);
  }
  export function removeAttributeAt(node: Dehydrated<Data$>, index: number): void {
    node.attributes.splice(index, 1);
  }
  export function setAttributeAt(node: Dehydrated<Data$>, index: number, attribute: Dehydrated<Attribute$>): void {
    node.attributes[index] = attribute;
  }
  export function moveAttributeAt(node: Dehydrated<Data$>, from: number, to: number): void {
    const [item] = node.attributes.splice(from, 1);
    if (item === undefined) return;
    node.attributes.splice(to, 0, item);
  }
  export function getConditions(node: Dehydrated<Data$>): Dehydrated<Condition$>[] {
    return node.conditions;
  }
  export function addCondition(node: Dehydrated<Data$>, condition: Dehydrated<Condition$>): void {
    node.conditions.push(condition);
  }
  export function insertConditionAt(node: Dehydrated<Data$>, index: number, condition: Dehydrated<Condition$>): void {
    node.conditions.splice(index, 0, condition);
  }
  export function removeConditionAt(node: Dehydrated<Data$>, index: number): void {
    node.conditions.splice(index, 1);
  }
  export function setConditionAt(node: Dehydrated<Data$>, index: number, condition: Dehydrated<Condition$>): void {
    node.conditions[index] = condition;
  }
  export function moveConditionAt(node: Dehydrated<Data$>, from: number, to: number): void {
    const [item] = node.conditions.splice(from, 1);
    if (item === undefined) return;
    node.conditions.splice(to, 0, item);
  }
  export function getReferences(node: Dehydrated<Data$>): Dehydrated<RosettaDocReference$>[] {
    return node.references;
  }
  export function addReference(node: Dehydrated<Data$>, reference: Dehydrated<RosettaDocReference$>): void {
    node.references.push(reference);
  }
  export function insertReferenceAt(
    node: Dehydrated<Data$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.splice(index, 0, reference);
  }
  export function removeReferenceAt(node: Dehydrated<Data$>, index: number): void {
    node.references.splice(index, 1);
  }
  export function setReferenceAt(
    node: Dehydrated<Data$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references[index] = reference;
  }
  export function moveReferenceAt(node: Dehydrated<Data$>, from: number, to: number): void {
    const [item] = node.references.splice(from, 1);
    if (item === undefined) return;
    node.references.splice(to, 0, item);
  }
  export function getAnnotations(node: Dehydrated<Data$>): Dehydrated<AnnotationRef$>[] {
    return node.annotations;
  }
  export function addAnnotation(node: Dehydrated<Data$>, annotation: Dehydrated<AnnotationRef$>): void {
    node.annotations.push(annotation);
  }
  export function insertAnnotationAt(
    node: Dehydrated<Data$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations.splice(index, 0, annotation);
  }
  export function removeAnnotationAt(node: Dehydrated<Data$>, index: number): void {
    node.annotations.splice(index, 1);
  }
  export function setAnnotationAt(
    node: Dehydrated<Data$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations[index] = annotation;
  }
  export function moveAnnotationAt(node: Dehydrated<Data$>, from: number, to: number): void {
    const [item] = node.annotations.splice(from, 1);
    if (item === undefined) return;
    node.annotations.splice(to, 0, item);
  }
  export function getSynonyms(node: Dehydrated<Data$>): Dehydrated<RosettaClassSynonym$>[] {
    return node.synonyms;
  }
  export function addSynonym(node: Dehydrated<Data$>, synonym: Dehydrated<RosettaClassSynonym$>): void {
    node.synonyms.push(synonym);
  }
  export function insertSynonymAt(
    node: Dehydrated<Data$>,
    index: number,
    synonym: Dehydrated<RosettaClassSynonym$>
  ): void {
    node.synonyms.splice(index, 0, synonym);
  }
  export function removeSynonymAt(node: Dehydrated<Data$>, index: number): void {
    node.synonyms.splice(index, 1);
  }
  export function setSynonymAt(
    node: Dehydrated<Data$>,
    index: number,
    synonym: Dehydrated<RosettaClassSynonym$>
  ): void {
    node.synonyms[index] = synonym;
  }
  export function moveSynonymAt(node: Dehydrated<Data$>, from: number, to: number): void {
    const [item] = node.synonyms.splice(from, 1);
    if (item === undefined) return;
    node.synonyms.splice(to, 0, item);
  }
}

export namespace FilterOperation {
  export function setFunction(node: Dehydrated<FilterOperation$>, function_: Dehydrated<InlineFunction$>): void {
    node.function = function_;
  }
  export function clearFunction(node: Dehydrated<FilterOperation$>): void {
    node.function = undefined;
  }
}

export namespace InlineFunction {
  export function getParameters(node: Dehydrated<InlineFunction$>): Dehydrated<ClosureParameter$>[] {
    return node.parameters;
  }
  export function addParameter(node: Dehydrated<InlineFunction$>, parameter: Dehydrated<ClosureParameter$>): void {
    node.parameters.push(parameter);
  }
  export function insertParameterAt(
    node: Dehydrated<InlineFunction$>,
    index: number,
    parameter: Dehydrated<ClosureParameter$>
  ): void {
    node.parameters.splice(index, 0, parameter);
  }
  export function removeParameterAt(node: Dehydrated<InlineFunction$>, index: number): void {
    node.parameters.splice(index, 1);
  }
  export function setParameterAt(
    node: Dehydrated<InlineFunction$>,
    index: number,
    parameter: Dehydrated<ClosureParameter$>
  ): void {
    node.parameters[index] = parameter;
  }
  export function moveParameterAt(node: Dehydrated<InlineFunction$>, from: number, to: number): void {
    const [item] = node.parameters.splice(from, 1);
    if (item === undefined) return;
    node.parameters.splice(to, 0, item);
  }
}

export namespace MapOperation {
  export function setFunction(node: Dehydrated<MapOperation$>, function_: Dehydrated<InlineFunction$>): void {
    node.function = function_;
  }
  export function clearFunction(node: Dehydrated<MapOperation$>): void {
    node.function = undefined;
  }
}

export namespace MaxOperation {
  export function setFunction(node: Dehydrated<MaxOperation$>, function_: Dehydrated<InlineFunction$>): void {
    node.function = function_;
  }
  export function clearFunction(node: Dehydrated<MaxOperation$>): void {
    node.function = undefined;
  }
}

export namespace MinOperation {
  export function setFunction(node: Dehydrated<MinOperation$>, function_: Dehydrated<InlineFunction$>): void {
    node.function = function_;
  }
  export function clearFunction(node: Dehydrated<MinOperation$>): void {
    node.function = undefined;
  }
}

export namespace Operation {
  export function setAssignRoot(node: Dehydrated<Operation$>, refText: string): void {
    node.assignRoot = { $refText: refText };
  }
  export function setPath(node: Dehydrated<Operation$>, path: Dehydrated<Segment$>): void {
    node.path = path;
  }
  export function clearPath(node: Dehydrated<Operation$>): void {
    node.path = undefined;
  }
}

export namespace ReduceOperation {
  export function setFunction(node: Dehydrated<ReduceOperation$>, function_: Dehydrated<InlineFunction$>): void {
    node.function = function_;
  }
  export function clearFunction(node: Dehydrated<ReduceOperation$>): void {
    node.function = undefined;
  }
}

export namespace RegulatoryDocumentReference {
  export function setBody(node: Dehydrated<RegulatoryDocumentReference$>, refText: string): void {
    node.body = { $refText: refText };
  }
  export function getSegments(node: Dehydrated<RegulatoryDocumentReference$>): Dehydrated<RosettaSegmentRef$>[] {
    return node.segments;
  }
  export function addSegment(
    node: Dehydrated<RegulatoryDocumentReference$>,
    segment: Dehydrated<RosettaSegmentRef$>
  ): void {
    node.segments.push(segment);
  }
  export function insertSegmentAt(
    node: Dehydrated<RegulatoryDocumentReference$>,
    index: number,
    segment: Dehydrated<RosettaSegmentRef$>
  ): void {
    node.segments.splice(index, 0, segment);
  }
  export function removeSegmentAt(node: Dehydrated<RegulatoryDocumentReference$>, index: number): void {
    node.segments.splice(index, 1);
  }
  export function setSegmentAt(
    node: Dehydrated<RegulatoryDocumentReference$>,
    index: number,
    segment: Dehydrated<RosettaSegmentRef$>
  ): void {
    node.segments[index] = segment;
  }
  export function moveSegmentAt(node: Dehydrated<RegulatoryDocumentReference$>, from: number, to: number): void {
    const [item] = node.segments.splice(from, 1);
    if (item === undefined) return;
    node.segments.splice(to, 0, item);
  }
}

export namespace RosettaAttributeReference {
  export function setReceiver(
    node: Dehydrated<RosettaAttributeReference$>,
    receiver: Dehydrated<RosettaDataReference$>
  ): void {
    node.receiver = receiver;
  }
  export function setAttribute(node: Dehydrated<RosettaAttributeReference$>, refText: string): void {
    node.attribute = { $refText: refText };
  }
}

export namespace RosettaBasicType {
  export function getParameters(node: Dehydrated<RosettaBasicType$>): Dehydrated<TypeParameter$>[] {
    return node.parameters;
  }
  export function addParameter(node: Dehydrated<RosettaBasicType$>, parameter: Dehydrated<TypeParameter$>): void {
    node.parameters.push(parameter);
  }
  export function insertParameterAt(
    node: Dehydrated<RosettaBasicType$>,
    index: number,
    parameter: Dehydrated<TypeParameter$>
  ): void {
    node.parameters.splice(index, 0, parameter);
  }
  export function removeParameterAt(node: Dehydrated<RosettaBasicType$>, index: number): void {
    node.parameters.splice(index, 1);
  }
  export function setParameterAt(
    node: Dehydrated<RosettaBasicType$>,
    index: number,
    parameter: Dehydrated<TypeParameter$>
  ): void {
    node.parameters[index] = parameter;
  }
  export function moveParameterAt(node: Dehydrated<RosettaBasicType$>, from: number, to: number): void {
    const [item] = node.parameters.splice(from, 1);
    if (item === undefined) return;
    node.parameters.splice(to, 0, item);
  }
}

export namespace RosettaClassSynonym {
  export function setValue(node: Dehydrated<RosettaClassSynonym$>, value: Dehydrated<RosettaSynonymValueBase$>): void {
    node.value = value;
  }
  export function clearValue(node: Dehydrated<RosettaClassSynonym$>): void {
    node.value = undefined;
  }
  export function setMetaValue(
    node: Dehydrated<RosettaClassSynonym$>,
    metaValue: Dehydrated<RosettaSynonymValueBase$>
  ): void {
    node.metaValue = metaValue;
  }
  export function clearMetaValue(node: Dehydrated<RosettaClassSynonym$>): void {
    node.metaValue = undefined;
  }
}

export namespace RosettaConstructorExpression {
  export function getConstructorTypeArgs(
    node: Dehydrated<RosettaConstructorExpression$>
  ): Dehydrated<TypeCallArgument$>[] {
    return node.constructorTypeArgs;
  }
  export function addConstructorTypeArg(
    node: Dehydrated<RosettaConstructorExpression$>,
    constructorTypeArg: Dehydrated<TypeCallArgument$>
  ): void {
    node.constructorTypeArgs.push(constructorTypeArg);
  }
  export function insertConstructorTypeArgAt(
    node: Dehydrated<RosettaConstructorExpression$>,
    index: number,
    constructorTypeArg: Dehydrated<TypeCallArgument$>
  ): void {
    node.constructorTypeArgs.splice(index, 0, constructorTypeArg);
  }
  export function removeConstructorTypeArgAt(node: Dehydrated<RosettaConstructorExpression$>, index: number): void {
    node.constructorTypeArgs.splice(index, 1);
  }
  export function setConstructorTypeArgAt(
    node: Dehydrated<RosettaConstructorExpression$>,
    index: number,
    constructorTypeArg: Dehydrated<TypeCallArgument$>
  ): void {
    node.constructorTypeArgs[index] = constructorTypeArg;
  }
  export function moveConstructorTypeArgAt(
    node: Dehydrated<RosettaConstructorExpression$>,
    from: number,
    to: number
  ): void {
    const [item] = node.constructorTypeArgs.splice(from, 1);
    if (item === undefined) return;
    node.constructorTypeArgs.splice(to, 0, item);
  }
  export function getValues(node: Dehydrated<RosettaConstructorExpression$>): Dehydrated<ConstructorKeyValuePair$>[] {
    return node.values;
  }
  export function addValue(
    node: Dehydrated<RosettaConstructorExpression$>,
    value: Dehydrated<ConstructorKeyValuePair$>
  ): void {
    node.values.push(value);
  }
  export function insertValueAt(
    node: Dehydrated<RosettaConstructorExpression$>,
    index: number,
    value: Dehydrated<ConstructorKeyValuePair$>
  ): void {
    node.values.splice(index, 0, value);
  }
  export function removeValueAt(node: Dehydrated<RosettaConstructorExpression$>, index: number): void {
    node.values.splice(index, 1);
  }
  export function setValueAt(
    node: Dehydrated<RosettaConstructorExpression$>,
    index: number,
    value: Dehydrated<ConstructorKeyValuePair$>
  ): void {
    node.values[index] = value;
  }
  export function moveValueAt(node: Dehydrated<RosettaConstructorExpression$>, from: number, to: number): void {
    const [item] = node.values.splice(from, 1);
    if (item === undefined) return;
    node.values.splice(to, 0, item);
  }
}

export namespace RosettaCorpus {
  export function setBody(node: Dehydrated<RosettaCorpus$>, refText: string): void {
    node.body = { $refText: refText };
  }
  export function clearBody(node: Dehydrated<RosettaCorpus$>): void {
    node.body = undefined;
  }
}

export namespace RosettaDataReference {
  export function setData(node: Dehydrated<RosettaDataReference$>, refText: string): void {
    node.data = { $refText: refText };
  }
}

export namespace RosettaDeepFeatureCall {
  export function setFeature(node: Dehydrated<RosettaDeepFeatureCall$>, refText: string): void {
    node.feature = { $refText: refText };
  }
  export function clearFeature(node: Dehydrated<RosettaDeepFeatureCall$>): void {
    node.feature = undefined;
  }
}

export namespace RosettaDocReference {
  export function setDocReference(
    node: Dehydrated<RosettaDocReference$>,
    docReference: Dehydrated<RegulatoryDocumentReference$>
  ): void {
    node.docReference = docReference;
  }
  export function getRationales(node: Dehydrated<RosettaDocReference$>): Dehydrated<DocumentRationale$>[] {
    return node.rationales;
  }
  export function addRationale(
    node: Dehydrated<RosettaDocReference$>,
    rationale: Dehydrated<DocumentRationale$>
  ): void {
    node.rationales.push(rationale);
  }
  export function insertRationaleAt(
    node: Dehydrated<RosettaDocReference$>,
    index: number,
    rationale: Dehydrated<DocumentRationale$>
  ): void {
    node.rationales.splice(index, 0, rationale);
  }
  export function removeRationaleAt(node: Dehydrated<RosettaDocReference$>, index: number): void {
    node.rationales.splice(index, 1);
  }
  export function setRationaleAt(
    node: Dehydrated<RosettaDocReference$>,
    index: number,
    rationale: Dehydrated<DocumentRationale$>
  ): void {
    node.rationales[index] = rationale;
  }
  export function moveRationaleAt(node: Dehydrated<RosettaDocReference$>, from: number, to: number): void {
    const [item] = node.rationales.splice(from, 1);
    if (item === undefined) return;
    node.rationales.splice(to, 0, item);
  }
}

export namespace RosettaEnumeration {
  export function setParent(node: Dehydrated<RosettaEnumeration$>, refText: string): void {
    node.parent = { $refText: refText };
  }
  export function clearParent(node: Dehydrated<RosettaEnumeration$>): void {
    node.parent = undefined;
  }
  export function getEnumValues(node: Dehydrated<RosettaEnumeration$>): Dehydrated<RosettaEnumValue$>[] {
    return node.enumValues;
  }
  export function addEnumValue(node: Dehydrated<RosettaEnumeration$>, enumValue: Dehydrated<RosettaEnumValue$>): void {
    node.enumValues.push(enumValue);
  }
  export function insertEnumValueAt(
    node: Dehydrated<RosettaEnumeration$>,
    index: number,
    enumValue: Dehydrated<RosettaEnumValue$>
  ): void {
    node.enumValues.splice(index, 0, enumValue);
  }
  export function removeEnumValueAt(node: Dehydrated<RosettaEnumeration$>, index: number): void {
    node.enumValues.splice(index, 1);
  }
  export function setEnumValueAt(
    node: Dehydrated<RosettaEnumeration$>,
    index: number,
    enumValue: Dehydrated<RosettaEnumValue$>
  ): void {
    node.enumValues[index] = enumValue;
  }
  export function moveEnumValueAt(node: Dehydrated<RosettaEnumeration$>, from: number, to: number): void {
    const [item] = node.enumValues.splice(from, 1);
    if (item === undefined) return;
    node.enumValues.splice(to, 0, item);
  }
  export function getReferences(node: Dehydrated<RosettaEnumeration$>): Dehydrated<RosettaDocReference$>[] {
    return node.references;
  }
  export function addReference(
    node: Dehydrated<RosettaEnumeration$>,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.push(reference);
  }
  export function insertReferenceAt(
    node: Dehydrated<RosettaEnumeration$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.splice(index, 0, reference);
  }
  export function removeReferenceAt(node: Dehydrated<RosettaEnumeration$>, index: number): void {
    node.references.splice(index, 1);
  }
  export function setReferenceAt(
    node: Dehydrated<RosettaEnumeration$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references[index] = reference;
  }
  export function moveReferenceAt(node: Dehydrated<RosettaEnumeration$>, from: number, to: number): void {
    const [item] = node.references.splice(from, 1);
    if (item === undefined) return;
    node.references.splice(to, 0, item);
  }
  export function getAnnotations(node: Dehydrated<RosettaEnumeration$>): Dehydrated<AnnotationRef$>[] {
    return node.annotations;
  }
  export function addAnnotation(node: Dehydrated<RosettaEnumeration$>, annotation: Dehydrated<AnnotationRef$>): void {
    node.annotations.push(annotation);
  }
  export function insertAnnotationAt(
    node: Dehydrated<RosettaEnumeration$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations.splice(index, 0, annotation);
  }
  export function removeAnnotationAt(node: Dehydrated<RosettaEnumeration$>, index: number): void {
    node.annotations.splice(index, 1);
  }
  export function setAnnotationAt(
    node: Dehydrated<RosettaEnumeration$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations[index] = annotation;
  }
  export function moveAnnotationAt(node: Dehydrated<RosettaEnumeration$>, from: number, to: number): void {
    const [item] = node.annotations.splice(from, 1);
    if (item === undefined) return;
    node.annotations.splice(to, 0, item);
  }
  export function getSynonyms(node: Dehydrated<RosettaEnumeration$>): Dehydrated<RosettaSynonym$>[] {
    return node.synonyms;
  }
  export function addSynonym(node: Dehydrated<RosettaEnumeration$>, synonym: Dehydrated<RosettaSynonym$>): void {
    node.synonyms.push(synonym);
  }
  export function insertSynonymAt(
    node: Dehydrated<RosettaEnumeration$>,
    index: number,
    synonym: Dehydrated<RosettaSynonym$>
  ): void {
    node.synonyms.splice(index, 0, synonym);
  }
  export function removeSynonymAt(node: Dehydrated<RosettaEnumeration$>, index: number): void {
    node.synonyms.splice(index, 1);
  }
  export function setSynonymAt(
    node: Dehydrated<RosettaEnumeration$>,
    index: number,
    synonym: Dehydrated<RosettaSynonym$>
  ): void {
    node.synonyms[index] = synonym;
  }
  export function moveSynonymAt(node: Dehydrated<RosettaEnumeration$>, from: number, to: number): void {
    const [item] = node.synonyms.splice(from, 1);
    if (item === undefined) return;
    node.synonyms.splice(to, 0, item);
  }
}

export namespace RosettaEnumValue {
  export function getReferences(node: Dehydrated<RosettaEnumValue$>): Dehydrated<RosettaDocReference$>[] {
    return node.references;
  }
  export function addReference(node: Dehydrated<RosettaEnumValue$>, reference: Dehydrated<RosettaDocReference$>): void {
    node.references.push(reference);
  }
  export function insertReferenceAt(
    node: Dehydrated<RosettaEnumValue$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.splice(index, 0, reference);
  }
  export function removeReferenceAt(node: Dehydrated<RosettaEnumValue$>, index: number): void {
    node.references.splice(index, 1);
  }
  export function setReferenceAt(
    node: Dehydrated<RosettaEnumValue$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references[index] = reference;
  }
  export function moveReferenceAt(node: Dehydrated<RosettaEnumValue$>, from: number, to: number): void {
    const [item] = node.references.splice(from, 1);
    if (item === undefined) return;
    node.references.splice(to, 0, item);
  }
  export function getAnnotations(node: Dehydrated<RosettaEnumValue$>): Dehydrated<AnnotationRef$>[] {
    return node.annotations;
  }
  export function addAnnotation(node: Dehydrated<RosettaEnumValue$>, annotation: Dehydrated<AnnotationRef$>): void {
    node.annotations.push(annotation);
  }
  export function insertAnnotationAt(
    node: Dehydrated<RosettaEnumValue$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations.splice(index, 0, annotation);
  }
  export function removeAnnotationAt(node: Dehydrated<RosettaEnumValue$>, index: number): void {
    node.annotations.splice(index, 1);
  }
  export function setAnnotationAt(
    node: Dehydrated<RosettaEnumValue$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations[index] = annotation;
  }
  export function moveAnnotationAt(node: Dehydrated<RosettaEnumValue$>, from: number, to: number): void {
    const [item] = node.annotations.splice(from, 1);
    if (item === undefined) return;
    node.annotations.splice(to, 0, item);
  }
  export function getEnumSynonyms(node: Dehydrated<RosettaEnumValue$>): Dehydrated<RosettaEnumSynonym$>[] {
    return node.enumSynonyms;
  }
  export function addEnumSynonym(
    node: Dehydrated<RosettaEnumValue$>,
    enumSynonym: Dehydrated<RosettaEnumSynonym$>
  ): void {
    node.enumSynonyms.push(enumSynonym);
  }
  export function insertEnumSynonymAt(
    node: Dehydrated<RosettaEnumValue$>,
    index: number,
    enumSynonym: Dehydrated<RosettaEnumSynonym$>
  ): void {
    node.enumSynonyms.splice(index, 0, enumSynonym);
  }
  export function removeEnumSynonymAt(node: Dehydrated<RosettaEnumValue$>, index: number): void {
    node.enumSynonyms.splice(index, 1);
  }
  export function setEnumSynonymAt(
    node: Dehydrated<RosettaEnumValue$>,
    index: number,
    enumSynonym: Dehydrated<RosettaEnumSynonym$>
  ): void {
    node.enumSynonyms[index] = enumSynonym;
  }
  export function moveEnumSynonymAt(node: Dehydrated<RosettaEnumValue$>, from: number, to: number): void {
    const [item] = node.enumSynonyms.splice(from, 1);
    if (item === undefined) return;
    node.enumSynonyms.splice(to, 0, item);
  }
}

export namespace RosettaEnumValueReference {
  export function setEnumeration(node: Dehydrated<RosettaEnumValueReference$>, refText: string): void {
    node.enumeration = { $refText: refText };
  }
  export function setValue(node: Dehydrated<RosettaEnumValueReference$>, refText: string): void {
    node.value = { $refText: refText };
  }
}

export namespace RosettaExternalClass {
  export function setData(node: Dehydrated<RosettaExternalClass$>, refText: string): void {
    node.data = { $refText: refText };
  }
  export function getExternalClassSynonyms(
    node: Dehydrated<RosettaExternalClass$>
  ): Dehydrated<RosettaExternalClassSynonym$>[] {
    return node.externalClassSynonyms;
  }
  export function addExternalClassSynonym(
    node: Dehydrated<RosettaExternalClass$>,
    externalClassSynonym: Dehydrated<RosettaExternalClassSynonym$>
  ): void {
    node.externalClassSynonyms.push(externalClassSynonym);
  }
  export function insertExternalClassSynonymAt(
    node: Dehydrated<RosettaExternalClass$>,
    index: number,
    externalClassSynonym: Dehydrated<RosettaExternalClassSynonym$>
  ): void {
    node.externalClassSynonyms.splice(index, 0, externalClassSynonym);
  }
  export function removeExternalClassSynonymAt(node: Dehydrated<RosettaExternalClass$>, index: number): void {
    node.externalClassSynonyms.splice(index, 1);
  }
  export function setExternalClassSynonymAt(
    node: Dehydrated<RosettaExternalClass$>,
    index: number,
    externalClassSynonym: Dehydrated<RosettaExternalClassSynonym$>
  ): void {
    node.externalClassSynonyms[index] = externalClassSynonym;
  }
  export function moveExternalClassSynonymAt(node: Dehydrated<RosettaExternalClass$>, from: number, to: number): void {
    const [item] = node.externalClassSynonyms.splice(from, 1);
    if (item === undefined) return;
    node.externalClassSynonyms.splice(to, 0, item);
  }
  export function getRegularAttributes(
    node: Dehydrated<RosettaExternalClass$>
  ): Dehydrated<RosettaExternalRegularAttribute$>[] {
    return node.regularAttributes;
  }
  export function addRegularAttribute(
    node: Dehydrated<RosettaExternalClass$>,
    regularAttribute: Dehydrated<RosettaExternalRegularAttribute$>
  ): void {
    node.regularAttributes.push(regularAttribute);
  }
  export function insertRegularAttributeAt(
    node: Dehydrated<RosettaExternalClass$>,
    index: number,
    regularAttribute: Dehydrated<RosettaExternalRegularAttribute$>
  ): void {
    node.regularAttributes.splice(index, 0, regularAttribute);
  }
  export function removeRegularAttributeAt(node: Dehydrated<RosettaExternalClass$>, index: number): void {
    node.regularAttributes.splice(index, 1);
  }
  export function setRegularAttributeAt(
    node: Dehydrated<RosettaExternalClass$>,
    index: number,
    regularAttribute: Dehydrated<RosettaExternalRegularAttribute$>
  ): void {
    node.regularAttributes[index] = regularAttribute;
  }
  export function moveRegularAttributeAt(node: Dehydrated<RosettaExternalClass$>, from: number, to: number): void {
    const [item] = node.regularAttributes.splice(from, 1);
    if (item === undefined) return;
    node.regularAttributes.splice(to, 0, item);
  }
}

export namespace RosettaExternalClassSynonym {
  export function setValue(
    node: Dehydrated<RosettaExternalClassSynonym$>,
    value: Dehydrated<RosettaSynonymValueBase$>
  ): void {
    node.value = value;
  }
  export function clearValue(node: Dehydrated<RosettaExternalClassSynonym$>): void {
    node.value = undefined;
  }
  export function setMetaValue(
    node: Dehydrated<RosettaExternalClassSynonym$>,
    metaValue: Dehydrated<RosettaSynonymValueBase$>
  ): void {
    node.metaValue = metaValue;
  }
}

export namespace RosettaExternalEnum {
  export function setEnumeration(node: Dehydrated<RosettaExternalEnum$>, refText: string): void {
    node.enumeration = { $refText: refText };
  }
  export function getRegularValues(node: Dehydrated<RosettaExternalEnum$>): Dehydrated<RosettaExternalEnumValue$>[] {
    return node.regularValues;
  }
  export function addRegularValue(
    node: Dehydrated<RosettaExternalEnum$>,
    regularValue: Dehydrated<RosettaExternalEnumValue$>
  ): void {
    node.regularValues.push(regularValue);
  }
  export function insertRegularValueAt(
    node: Dehydrated<RosettaExternalEnum$>,
    index: number,
    regularValue: Dehydrated<RosettaExternalEnumValue$>
  ): void {
    node.regularValues.splice(index, 0, regularValue);
  }
  export function removeRegularValueAt(node: Dehydrated<RosettaExternalEnum$>, index: number): void {
    node.regularValues.splice(index, 1);
  }
  export function setRegularValueAt(
    node: Dehydrated<RosettaExternalEnum$>,
    index: number,
    regularValue: Dehydrated<RosettaExternalEnumValue$>
  ): void {
    node.regularValues[index] = regularValue;
  }
  export function moveRegularValueAt(node: Dehydrated<RosettaExternalEnum$>, from: number, to: number): void {
    const [item] = node.regularValues.splice(from, 1);
    if (item === undefined) return;
    node.regularValues.splice(to, 0, item);
  }
}

export namespace RosettaExternalEnumValue {
  export function setEnumRef(node: Dehydrated<RosettaExternalEnumValue$>, refText: string): void {
    node.enumRef = { $refText: refText };
  }
  export function getExternalEnumSynonyms(
    node: Dehydrated<RosettaExternalEnumValue$>
  ): Dehydrated<RosettaEnumSynonym$>[] {
    return node.externalEnumSynonyms;
  }
  export function addExternalEnumSynonym(
    node: Dehydrated<RosettaExternalEnumValue$>,
    externalEnumSynonym: Dehydrated<RosettaEnumSynonym$>
  ): void {
    node.externalEnumSynonyms.push(externalEnumSynonym);
  }
  export function insertExternalEnumSynonymAt(
    node: Dehydrated<RosettaExternalEnumValue$>,
    index: number,
    externalEnumSynonym: Dehydrated<RosettaEnumSynonym$>
  ): void {
    node.externalEnumSynonyms.splice(index, 0, externalEnumSynonym);
  }
  export function removeExternalEnumSynonymAt(node: Dehydrated<RosettaExternalEnumValue$>, index: number): void {
    node.externalEnumSynonyms.splice(index, 1);
  }
  export function setExternalEnumSynonymAt(
    node: Dehydrated<RosettaExternalEnumValue$>,
    index: number,
    externalEnumSynonym: Dehydrated<RosettaEnumSynonym$>
  ): void {
    node.externalEnumSynonyms[index] = externalEnumSynonym;
  }
  export function moveExternalEnumSynonymAt(
    node: Dehydrated<RosettaExternalEnumValue$>,
    from: number,
    to: number
  ): void {
    const [item] = node.externalEnumSynonyms.splice(from, 1);
    if (item === undefined) return;
    node.externalEnumSynonyms.splice(to, 0, item);
  }
}

export namespace RosettaExternalFunction {
  export function setTypeCall(node: Dehydrated<RosettaExternalFunction$>, typeCall: Dehydrated<TypeCall$>): void {
    node.typeCall = typeCall;
  }
  export function getParameters(node: Dehydrated<RosettaExternalFunction$>): Dehydrated<RosettaParameter$>[] {
    return node.parameters;
  }
  export function addParameter(
    node: Dehydrated<RosettaExternalFunction$>,
    parameter: Dehydrated<RosettaParameter$>
  ): void {
    node.parameters.push(parameter);
  }
  export function insertParameterAt(
    node: Dehydrated<RosettaExternalFunction$>,
    index: number,
    parameter: Dehydrated<RosettaParameter$>
  ): void {
    node.parameters.splice(index, 0, parameter);
  }
  export function removeParameterAt(node: Dehydrated<RosettaExternalFunction$>, index: number): void {
    node.parameters.splice(index, 1);
  }
  export function setParameterAt(
    node: Dehydrated<RosettaExternalFunction$>,
    index: number,
    parameter: Dehydrated<RosettaParameter$>
  ): void {
    node.parameters[index] = parameter;
  }
  export function moveParameterAt(node: Dehydrated<RosettaExternalFunction$>, from: number, to: number): void {
    const [item] = node.parameters.splice(from, 1);
    if (item === undefined) return;
    node.parameters.splice(to, 0, item);
  }
}

export namespace RosettaExternalRegularAttribute {
  export function setAttributeRef(node: Dehydrated<RosettaExternalRegularAttribute$>, refText: string): void {
    node.attributeRef = { $refText: refText };
  }
  export function getExternalSynonyms(
    node: Dehydrated<RosettaExternalRegularAttribute$>
  ): Dehydrated<RosettaExternalSynonym$>[] {
    return node.externalSynonyms;
  }
  export function addExternalSynonym(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    externalSynonym: Dehydrated<RosettaExternalSynonym$>
  ): void {
    node.externalSynonyms.push(externalSynonym);
  }
  export function insertExternalSynonymAt(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    index: number,
    externalSynonym: Dehydrated<RosettaExternalSynonym$>
  ): void {
    node.externalSynonyms.splice(index, 0, externalSynonym);
  }
  export function removeExternalSynonymAt(node: Dehydrated<RosettaExternalRegularAttribute$>, index: number): void {
    node.externalSynonyms.splice(index, 1);
  }
  export function setExternalSynonymAt(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    index: number,
    externalSynonym: Dehydrated<RosettaExternalSynonym$>
  ): void {
    node.externalSynonyms[index] = externalSynonym;
  }
  export function moveExternalSynonymAt(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    from: number,
    to: number
  ): void {
    const [item] = node.externalSynonyms.splice(from, 1);
    if (item === undefined) return;
    node.externalSynonyms.splice(to, 0, item);
  }
  export function getExternalRuleReferences(
    node: Dehydrated<RosettaExternalRegularAttribute$>
  ): Dehydrated<RuleReferenceAnnotation$>[] {
    return node.externalRuleReferences;
  }
  export function addExternalRuleReference(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    externalRuleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.externalRuleReferences.push(externalRuleReference);
  }
  export function insertExternalRuleReferenceAt(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    index: number,
    externalRuleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.externalRuleReferences.splice(index, 0, externalRuleReference);
  }
  export function removeExternalRuleReferenceAt(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    index: number
  ): void {
    node.externalRuleReferences.splice(index, 1);
  }
  export function setExternalRuleReferenceAt(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    index: number,
    externalRuleReference: Dehydrated<RuleReferenceAnnotation$>
  ): void {
    node.externalRuleReferences[index] = externalRuleReference;
  }
  export function moveExternalRuleReferenceAt(
    node: Dehydrated<RosettaExternalRegularAttribute$>,
    from: number,
    to: number
  ): void {
    const [item] = node.externalRuleReferences.splice(from, 1);
    if (item === undefined) return;
    node.externalRuleReferences.splice(to, 0, item);
  }
}

export namespace RosettaExternalRuleSource {
  export function getExternalClasses(
    node: Dehydrated<RosettaExternalRuleSource$>
  ): Dehydrated<RosettaExternalClass$>[] {
    return node.externalClasses;
  }
  export function addExternalClasse(
    node: Dehydrated<RosettaExternalRuleSource$>,
    externalClasse: Dehydrated<RosettaExternalClass$>
  ): void {
    node.externalClasses.push(externalClasse);
  }
  export function insertExternalClasseAt(
    node: Dehydrated<RosettaExternalRuleSource$>,
    index: number,
    externalClasse: Dehydrated<RosettaExternalClass$>
  ): void {
    node.externalClasses.splice(index, 0, externalClasse);
  }
  export function removeExternalClasseAt(node: Dehydrated<RosettaExternalRuleSource$>, index: number): void {
    node.externalClasses.splice(index, 1);
  }
  export function setExternalClasseAt(
    node: Dehydrated<RosettaExternalRuleSource$>,
    index: number,
    externalClasse: Dehydrated<RosettaExternalClass$>
  ): void {
    node.externalClasses[index] = externalClasse;
  }
  export function moveExternalClasseAt(node: Dehydrated<RosettaExternalRuleSource$>, from: number, to: number): void {
    const [item] = node.externalClasses.splice(from, 1);
    if (item === undefined) return;
    node.externalClasses.splice(to, 0, item);
  }
  export function getExternalEnums(node: Dehydrated<RosettaExternalRuleSource$>): Dehydrated<RosettaExternalEnum$>[] {
    return node.externalEnums;
  }
  export function addExternalEnum(
    node: Dehydrated<RosettaExternalRuleSource$>,
    externalEnum: Dehydrated<RosettaExternalEnum$>
  ): void {
    node.externalEnums.push(externalEnum);
  }
  export function insertExternalEnumAt(
    node: Dehydrated<RosettaExternalRuleSource$>,
    index: number,
    externalEnum: Dehydrated<RosettaExternalEnum$>
  ): void {
    node.externalEnums.splice(index, 0, externalEnum);
  }
  export function removeExternalEnumAt(node: Dehydrated<RosettaExternalRuleSource$>, index: number): void {
    node.externalEnums.splice(index, 1);
  }
  export function setExternalEnumAt(
    node: Dehydrated<RosettaExternalRuleSource$>,
    index: number,
    externalEnum: Dehydrated<RosettaExternalEnum$>
  ): void {
    node.externalEnums[index] = externalEnum;
  }
  export function moveExternalEnumAt(node: Dehydrated<RosettaExternalRuleSource$>, from: number, to: number): void {
    const [item] = node.externalEnums.splice(from, 1);
    if (item === undefined) return;
    node.externalEnums.splice(to, 0, item);
  }
}

export namespace RosettaExternalSynonym {
  export function setBody(node: Dehydrated<RosettaExternalSynonym$>, body: Dehydrated<RosettaSynonymBody$>): void {
    node.body = body;
  }
}

export namespace RosettaFeatureCall {
  export function setFeature(node: Dehydrated<RosettaFeatureCall$>, refText: string): void {
    node.feature = { $refText: refText };
  }
  export function clearFeature(node: Dehydrated<RosettaFeatureCall$>): void {
    node.feature = undefined;
  }
}

export namespace RosettaFunction {
  export function setDispatchAttribute(node: Dehydrated<RosettaFunction$>, refText: string): void {
    node.dispatchAttribute = { $refText: refText };
  }
  export function clearDispatchAttribute(node: Dehydrated<RosettaFunction$>): void {
    node.dispatchAttribute = undefined;
  }
  export function setDispatchValue(
    node: Dehydrated<RosettaFunction$>,
    dispatchValue: Dehydrated<RosettaEnumValueReference$>
  ): void {
    node.dispatchValue = dispatchValue;
  }
  export function clearDispatchValue(node: Dehydrated<RosettaFunction$>): void {
    node.dispatchValue = undefined;
  }
  export function setSuperFunction(node: Dehydrated<RosettaFunction$>, refText: string): void {
    node.superFunction = { $refText: refText };
  }
  export function clearSuperFunction(node: Dehydrated<RosettaFunction$>): void {
    node.superFunction = undefined;
  }
  export function getReferences(node: Dehydrated<RosettaFunction$>): Dehydrated<RosettaDocReference$>[] {
    return node.references;
  }
  export function addReference(node: Dehydrated<RosettaFunction$>, reference: Dehydrated<RosettaDocReference$>): void {
    node.references.push(reference);
  }
  export function insertReferenceAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.splice(index, 0, reference);
  }
  export function removeReferenceAt(node: Dehydrated<RosettaFunction$>, index: number): void {
    node.references.splice(index, 1);
  }
  export function setReferenceAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references[index] = reference;
  }
  export function moveReferenceAt(node: Dehydrated<RosettaFunction$>, from: number, to: number): void {
    const [item] = node.references.splice(from, 1);
    if (item === undefined) return;
    node.references.splice(to, 0, item);
  }
  export function getAnnotations(node: Dehydrated<RosettaFunction$>): Dehydrated<AnnotationRef$>[] {
    return node.annotations;
  }
  export function addAnnotation(node: Dehydrated<RosettaFunction$>, annotation: Dehydrated<AnnotationRef$>): void {
    node.annotations.push(annotation);
  }
  export function insertAnnotationAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations.splice(index, 0, annotation);
  }
  export function removeAnnotationAt(node: Dehydrated<RosettaFunction$>, index: number): void {
    node.annotations.splice(index, 1);
  }
  export function setAnnotationAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    annotation: Dehydrated<AnnotationRef$>
  ): void {
    node.annotations[index] = annotation;
  }
  export function moveAnnotationAt(node: Dehydrated<RosettaFunction$>, from: number, to: number): void {
    const [item] = node.annotations.splice(from, 1);
    if (item === undefined) return;
    node.annotations.splice(to, 0, item);
  }
  export function getInputs(node: Dehydrated<RosettaFunction$>): Dehydrated<Attribute$>[] {
    return node.inputs;
  }
  export function addInput(node: Dehydrated<RosettaFunction$>, input: Dehydrated<Attribute$>): void {
    node.inputs.push(input);
  }
  export function insertInputAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    input: Dehydrated<Attribute$>
  ): void {
    node.inputs.splice(index, 0, input);
  }
  export function removeInputAt(node: Dehydrated<RosettaFunction$>, index: number): void {
    node.inputs.splice(index, 1);
  }
  export function setInputAt(node: Dehydrated<RosettaFunction$>, index: number, input: Dehydrated<Attribute$>): void {
    node.inputs[index] = input;
  }
  export function moveInputAt(node: Dehydrated<RosettaFunction$>, from: number, to: number): void {
    const [item] = node.inputs.splice(from, 1);
    if (item === undefined) return;
    node.inputs.splice(to, 0, item);
  }
  export function setOutput(node: Dehydrated<RosettaFunction$>, output: Dehydrated<Attribute$>): void {
    node.output = output;
  }
  export function clearOutput(node: Dehydrated<RosettaFunction$>): void {
    node.output = undefined;
  }
  export function getShortcuts(node: Dehydrated<RosettaFunction$>): Dehydrated<ShortcutDeclaration$>[] {
    return node.shortcuts;
  }
  export function addShortcut(node: Dehydrated<RosettaFunction$>, shortcut: Dehydrated<ShortcutDeclaration$>): void {
    node.shortcuts.push(shortcut);
  }
  export function insertShortcutAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    shortcut: Dehydrated<ShortcutDeclaration$>
  ): void {
    node.shortcuts.splice(index, 0, shortcut);
  }
  export function removeShortcutAt(node: Dehydrated<RosettaFunction$>, index: number): void {
    node.shortcuts.splice(index, 1);
  }
  export function setShortcutAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    shortcut: Dehydrated<ShortcutDeclaration$>
  ): void {
    node.shortcuts[index] = shortcut;
  }
  export function moveShortcutAt(node: Dehydrated<RosettaFunction$>, from: number, to: number): void {
    const [item] = node.shortcuts.splice(from, 1);
    if (item === undefined) return;
    node.shortcuts.splice(to, 0, item);
  }
  export function getConditions(node: Dehydrated<RosettaFunction$>): Dehydrated<Condition$>[] {
    return node.conditions;
  }
  export function addCondition(node: Dehydrated<RosettaFunction$>, condition: Dehydrated<Condition$>): void {
    node.conditions.push(condition);
  }
  export function insertConditionAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    condition: Dehydrated<Condition$>
  ): void {
    node.conditions.splice(index, 0, condition);
  }
  export function removeConditionAt(node: Dehydrated<RosettaFunction$>, index: number): void {
    node.conditions.splice(index, 1);
  }
  export function setConditionAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    condition: Dehydrated<Condition$>
  ): void {
    node.conditions[index] = condition;
  }
  export function moveConditionAt(node: Dehydrated<RosettaFunction$>, from: number, to: number): void {
    const [item] = node.conditions.splice(from, 1);
    if (item === undefined) return;
    node.conditions.splice(to, 0, item);
  }
  export function getOperations(node: Dehydrated<RosettaFunction$>): Dehydrated<Operation$>[] {
    return node.operations;
  }
  export function addOperation(node: Dehydrated<RosettaFunction$>, operation: Dehydrated<Operation$>): void {
    node.operations.push(operation);
  }
  export function insertOperationAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    operation: Dehydrated<Operation$>
  ): void {
    node.operations.splice(index, 0, operation);
  }
  export function removeOperationAt(node: Dehydrated<RosettaFunction$>, index: number): void {
    node.operations.splice(index, 1);
  }
  export function setOperationAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    operation: Dehydrated<Operation$>
  ): void {
    node.operations[index] = operation;
  }
  export function moveOperationAt(node: Dehydrated<RosettaFunction$>, from: number, to: number): void {
    const [item] = node.operations.splice(from, 1);
    if (item === undefined) return;
    node.operations.splice(to, 0, item);
  }
  export function getPostConditions(node: Dehydrated<RosettaFunction$>): Dehydrated<Condition$>[] {
    return node.postConditions;
  }
  export function addPostCondition(node: Dehydrated<RosettaFunction$>, postCondition: Dehydrated<Condition$>): void {
    node.postConditions.push(postCondition);
  }
  export function insertPostConditionAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    postCondition: Dehydrated<Condition$>
  ): void {
    node.postConditions.splice(index, 0, postCondition);
  }
  export function removePostConditionAt(node: Dehydrated<RosettaFunction$>, index: number): void {
    node.postConditions.splice(index, 1);
  }
  export function setPostConditionAt(
    node: Dehydrated<RosettaFunction$>,
    index: number,
    postCondition: Dehydrated<Condition$>
  ): void {
    node.postConditions[index] = postCondition;
  }
  export function movePostConditionAt(node: Dehydrated<RosettaFunction$>, from: number, to: number): void {
    const [item] = node.postConditions.splice(from, 1);
    if (item === undefined) return;
    node.postConditions.splice(to, 0, item);
  }
}

export namespace RosettaMapPath {
  export function setPath(node: Dehydrated<RosettaMapPath$>, path: Dehydrated<RosettaMapPathValue$>): void {
    node.path = path;
  }
}

export namespace RosettaMapping {
  export function getInstances(node: Dehydrated<RosettaMapping$>): Dehydrated<RosettaMappingInstance$>[] {
    return node.instances;
  }
  export function addInstance(node: Dehydrated<RosettaMapping$>, instance: Dehydrated<RosettaMappingInstance$>): void {
    node.instances.push(instance);
  }
  export function insertInstanceAt(
    node: Dehydrated<RosettaMapping$>,
    index: number,
    instance: Dehydrated<RosettaMappingInstance$>
  ): void {
    node.instances.splice(index, 0, instance);
  }
  export function removeInstanceAt(node: Dehydrated<RosettaMapping$>, index: number): void {
    node.instances.splice(index, 1);
  }
  export function setInstanceAt(
    node: Dehydrated<RosettaMapping$>,
    index: number,
    instance: Dehydrated<RosettaMappingInstance$>
  ): void {
    node.instances[index] = instance;
  }
  export function moveInstanceAt(node: Dehydrated<RosettaMapping$>, from: number, to: number): void {
    const [item] = node.instances.splice(from, 1);
    if (item === undefined) return;
    node.instances.splice(to, 0, item);
  }
}

export namespace RosettaMappingInstance {
  export function setWhen(node: Dehydrated<RosettaMappingInstance$>, when: Dehydrated<RosettaMappingPathTests$>): void {
    node.when = when;
  }
  export function clearWhen(node: Dehydrated<RosettaMappingInstance$>): void {
    node.when = undefined;
  }
}

export namespace RosettaMapRosettaPath {
  export function setPath(
    node: Dehydrated<RosettaMapRosettaPath$>,
    path: Dehydrated<RosettaAttributeReference$>
  ): void {
    node.path = path;
  }
}

export namespace RosettaMapTestAbsentExpression {
  export function setArgument(
    node: Dehydrated<RosettaMapTestAbsentExpression$>,
    argument: Dehydrated<RosettaMapPathValue$>
  ): void {
    node.argument = argument;
  }
}

export namespace RosettaMapTestEqualityOperation {
  export function setLeft(
    node: Dehydrated<RosettaMapTestEqualityOperation$>,
    left: Dehydrated<RosettaMapPathValue$>
  ): void {
    node.left = left;
  }
}

export namespace RosettaMapTestExistsExpression {
  export function setArgument(
    node: Dehydrated<RosettaMapTestExistsExpression$>,
    argument: Dehydrated<RosettaMapPathValue$>
  ): void {
    node.argument = argument;
  }
}

export namespace RosettaMapTestFunc {
  export function setFunc(node: Dehydrated<RosettaMapTestFunc$>, refText: string): void {
    node.func = { $refText: refText };
  }
  export function setPredicatePath(
    node: Dehydrated<RosettaMapTestFunc$>,
    predicatePath: Dehydrated<RosettaMapPathValue$>
  ): void {
    node.predicatePath = predicatePath;
  }
  export function clearPredicatePath(node: Dehydrated<RosettaMapTestFunc$>): void {
    node.predicatePath = undefined;
  }
}

export namespace RosettaMetaType {
  export function setTypeCall(node: Dehydrated<RosettaMetaType$>, typeCall: Dehydrated<TypeCall$>): void {
    node.typeCall = typeCall;
  }
}

export namespace RosettaModel {
  export function setScope(node: Dehydrated<RosettaModel$>, scope: Dehydrated<RosettaScope$>): void {
    node.scope = scope;
  }
  export function clearScope(node: Dehydrated<RosettaModel$>): void {
    node.scope = undefined;
  }
  export function getImports(node: Dehydrated<RosettaModel$>): Dehydrated<Import$>[] {
    return node.imports;
  }
  export function addImport(node: Dehydrated<RosettaModel$>, import_: Dehydrated<Import$>): void {
    node.imports.push(import_);
  }
  export function insertImportAt(node: Dehydrated<RosettaModel$>, index: number, import_: Dehydrated<Import$>): void {
    node.imports.splice(index, 0, import_);
  }
  export function removeImportAt(node: Dehydrated<RosettaModel$>, index: number): void {
    node.imports.splice(index, 1);
  }
  export function setImportAt(node: Dehydrated<RosettaModel$>, index: number, import_: Dehydrated<Import$>): void {
    node.imports[index] = import_;
  }
  export function moveImportAt(node: Dehydrated<RosettaModel$>, from: number, to: number): void {
    const [item] = node.imports.splice(from, 1);
    if (item === undefined) return;
    node.imports.splice(to, 0, item);
  }
  export function getConfigurations(node: Dehydrated<RosettaModel$>): Dehydrated<RosettaQualifiableConfiguration$>[] {
    return node.configurations;
  }
  export function addConfiguration(
    node: Dehydrated<RosettaModel$>,
    configuration: Dehydrated<RosettaQualifiableConfiguration$>
  ): void {
    node.configurations.push(configuration);
  }
  export function insertConfigurationAt(
    node: Dehydrated<RosettaModel$>,
    index: number,
    configuration: Dehydrated<RosettaQualifiableConfiguration$>
  ): void {
    node.configurations.splice(index, 0, configuration);
  }
  export function removeConfigurationAt(node: Dehydrated<RosettaModel$>, index: number): void {
    node.configurations.splice(index, 1);
  }
  export function setConfigurationAt(
    node: Dehydrated<RosettaModel$>,
    index: number,
    configuration: Dehydrated<RosettaQualifiableConfiguration$>
  ): void {
    node.configurations[index] = configuration;
  }
  export function moveConfigurationAt(node: Dehydrated<RosettaModel$>, from: number, to: number): void {
    const [item] = node.configurations.splice(from, 1);
    if (item === undefined) return;
    node.configurations.splice(to, 0, item);
  }
}

export namespace RosettaParameter {
  export function setTypeCall(node: Dehydrated<RosettaParameter$>, typeCall: Dehydrated<TypeCall$>): void {
    node.typeCall = typeCall;
  }
}

export namespace RosettaQualifiableConfiguration {
  export function setRosettaClass(node: Dehydrated<RosettaQualifiableConfiguration$>, refText: string): void {
    node.rosettaClass = { $refText: refText };
  }
}

export namespace RosettaRecordFeature {
  export function setTypeCall(node: Dehydrated<RosettaRecordFeature$>, typeCall: Dehydrated<TypeCall$>): void {
    node.typeCall = typeCall;
  }
}

export namespace RosettaRecordType {
  export function getFeatures(node: Dehydrated<RosettaRecordType$>): Dehydrated<RosettaRecordFeature$>[] {
    return node.features;
  }
  export function addFeature(node: Dehydrated<RosettaRecordType$>, feature: Dehydrated<RosettaRecordFeature$>): void {
    node.features.push(feature);
  }
  export function insertFeatureAt(
    node: Dehydrated<RosettaRecordType$>,
    index: number,
    feature: Dehydrated<RosettaRecordFeature$>
  ): void {
    node.features.splice(index, 0, feature);
  }
  export function removeFeatureAt(node: Dehydrated<RosettaRecordType$>, index: number): void {
    node.features.splice(index, 1);
  }
  export function setFeatureAt(
    node: Dehydrated<RosettaRecordType$>,
    index: number,
    feature: Dehydrated<RosettaRecordFeature$>
  ): void {
    node.features[index] = feature;
  }
  export function moveFeatureAt(node: Dehydrated<RosettaRecordType$>, from: number, to: number): void {
    const [item] = node.features.splice(from, 1);
    if (item === undefined) return;
    node.features.splice(to, 0, item);
  }
}

export namespace RosettaReport {
  export function setRegulatoryBody(
    node: Dehydrated<RosettaReport$>,
    regulatoryBody: Dehydrated<RegulatoryDocumentReference$>
  ): void {
    node.regulatoryBody = regulatoryBody;
  }
  export function setInputType(node: Dehydrated<RosettaReport$>, inputType: Dehydrated<TypeCall$>): void {
    node.inputType = inputType;
  }
  export function setReportingStandard(node: Dehydrated<RosettaReport$>, refText: string): void {
    node.reportingStandard = { $refText: refText };
  }
  export function clearReportingStandard(node: Dehydrated<RosettaReport$>): void {
    node.reportingStandard = undefined;
  }
  export function setReportType(node: Dehydrated<RosettaReport$>, refText: string): void {
    node.reportType = { $refText: refText };
  }
  export function setRuleSource(node: Dehydrated<RosettaReport$>, refText: string): void {
    node.ruleSource = { $refText: refText };
  }
  export function clearRuleSource(node: Dehydrated<RosettaReport$>): void {
    node.ruleSource = undefined;
  }
}

export namespace RosettaRule {
  export function setInput(node: Dehydrated<RosettaRule$>, input: Dehydrated<TypeCall$>): void {
    node.input = input;
  }
  export function clearInput(node: Dehydrated<RosettaRule$>): void {
    node.input = undefined;
  }
  export function getReferences(node: Dehydrated<RosettaRule$>): Dehydrated<RosettaDocReference$>[] {
    return node.references;
  }
  export function addReference(node: Dehydrated<RosettaRule$>, reference: Dehydrated<RosettaDocReference$>): void {
    node.references.push(reference);
  }
  export function insertReferenceAt(
    node: Dehydrated<RosettaRule$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references.splice(index, 0, reference);
  }
  export function removeReferenceAt(node: Dehydrated<RosettaRule$>, index: number): void {
    node.references.splice(index, 1);
  }
  export function setReferenceAt(
    node: Dehydrated<RosettaRule$>,
    index: number,
    reference: Dehydrated<RosettaDocReference$>
  ): void {
    node.references[index] = reference;
  }
  export function moveReferenceAt(node: Dehydrated<RosettaRule$>, from: number, to: number): void {
    const [item] = node.references.splice(from, 1);
    if (item === undefined) return;
    node.references.splice(to, 0, item);
  }
}

export namespace RosettaSegmentRef {
  export function setSegment(node: Dehydrated<RosettaSegmentRef$>, refText: string): void {
    node.segment = { $refText: refText };
  }
}

export namespace RosettaSymbolReference {
  export function setSymbol(node: Dehydrated<RosettaSymbolReference$>, refText: string): void {
    node.symbol = { $refText: refText };
  }
}

export namespace RosettaSynonym {
  export function setBody(node: Dehydrated<RosettaSynonym$>, body: Dehydrated<RosettaSynonymBody$>): void {
    node.body = body;
  }
}

export namespace RosettaSynonymBody {
  export function setMerge(node: Dehydrated<RosettaSynonymBody$>, merge: Dehydrated<RosettaMergeSynonymValue$>): void {
    node.merge = merge;
  }
  export function clearMerge(node: Dehydrated<RosettaSynonymBody$>): void {
    node.merge = undefined;
  }
  export function setMappingLogic(
    node: Dehydrated<RosettaSynonymBody$>,
    mappingLogic: Dehydrated<RosettaMapping$>
  ): void {
    node.mappingLogic = mappingLogic;
  }
  export function clearMappingLogic(node: Dehydrated<RosettaSynonymBody$>): void {
    node.mappingLogic = undefined;
  }
  export function getValues(node: Dehydrated<RosettaSynonymBody$>): Dehydrated<RosettaSynonymValueBase$>[] {
    return node.values;
  }
  export function addValue(node: Dehydrated<RosettaSynonymBody$>, value: Dehydrated<RosettaSynonymValueBase$>): void {
    node.values.push(value);
  }
  export function insertValueAt(
    node: Dehydrated<RosettaSynonymBody$>,
    index: number,
    value: Dehydrated<RosettaSynonymValueBase$>
  ): void {
    node.values.splice(index, 0, value);
  }
  export function removeValueAt(node: Dehydrated<RosettaSynonymBody$>, index: number): void {
    node.values.splice(index, 1);
  }
  export function setValueAt(
    node: Dehydrated<RosettaSynonymBody$>,
    index: number,
    value: Dehydrated<RosettaSynonymValueBase$>
  ): void {
    node.values[index] = value;
  }
  export function moveValueAt(node: Dehydrated<RosettaSynonymBody$>, from: number, to: number): void {
    const [item] = node.values.splice(from, 1);
    if (item === undefined) return;
    node.values.splice(to, 0, item);
  }
}

export namespace RosettaSynonymSource {
  export function getExternalClasses(node: Dehydrated<RosettaSynonymSource$>): Dehydrated<RosettaExternalClass$>[] {
    return node.externalClasses;
  }
  export function addExternalClasse(
    node: Dehydrated<RosettaSynonymSource$>,
    externalClasse: Dehydrated<RosettaExternalClass$>
  ): void {
    node.externalClasses.push(externalClasse);
  }
  export function insertExternalClasseAt(
    node: Dehydrated<RosettaSynonymSource$>,
    index: number,
    externalClasse: Dehydrated<RosettaExternalClass$>
  ): void {
    node.externalClasses.splice(index, 0, externalClasse);
  }
  export function removeExternalClasseAt(node: Dehydrated<RosettaSynonymSource$>, index: number): void {
    node.externalClasses.splice(index, 1);
  }
  export function setExternalClasseAt(
    node: Dehydrated<RosettaSynonymSource$>,
    index: number,
    externalClasse: Dehydrated<RosettaExternalClass$>
  ): void {
    node.externalClasses[index] = externalClasse;
  }
  export function moveExternalClasseAt(node: Dehydrated<RosettaSynonymSource$>, from: number, to: number): void {
    const [item] = node.externalClasses.splice(from, 1);
    if (item === undefined) return;
    node.externalClasses.splice(to, 0, item);
  }
  export function getExternalEnums(node: Dehydrated<RosettaSynonymSource$>): Dehydrated<RosettaExternalEnum$>[] {
    return node.externalEnums;
  }
  export function addExternalEnum(
    node: Dehydrated<RosettaSynonymSource$>,
    externalEnum: Dehydrated<RosettaExternalEnum$>
  ): void {
    node.externalEnums.push(externalEnum);
  }
  export function insertExternalEnumAt(
    node: Dehydrated<RosettaSynonymSource$>,
    index: number,
    externalEnum: Dehydrated<RosettaExternalEnum$>
  ): void {
    node.externalEnums.splice(index, 0, externalEnum);
  }
  export function removeExternalEnumAt(node: Dehydrated<RosettaSynonymSource$>, index: number): void {
    node.externalEnums.splice(index, 1);
  }
  export function setExternalEnumAt(
    node: Dehydrated<RosettaSynonymSource$>,
    index: number,
    externalEnum: Dehydrated<RosettaExternalEnum$>
  ): void {
    node.externalEnums[index] = externalEnum;
  }
  export function moveExternalEnumAt(node: Dehydrated<RosettaSynonymSource$>, from: number, to: number): void {
    const [item] = node.externalEnums.splice(from, 1);
    if (item === undefined) return;
    node.externalEnums.splice(to, 0, item);
  }
}

export namespace RosettaTypeAlias {
  export function getParameters(node: Dehydrated<RosettaTypeAlias$>): Dehydrated<TypeParameter$>[] {
    return node.parameters;
  }
  export function addParameter(node: Dehydrated<RosettaTypeAlias$>, parameter: Dehydrated<TypeParameter$>): void {
    node.parameters.push(parameter);
  }
  export function insertParameterAt(
    node: Dehydrated<RosettaTypeAlias$>,
    index: number,
    parameter: Dehydrated<TypeParameter$>
  ): void {
    node.parameters.splice(index, 0, parameter);
  }
  export function removeParameterAt(node: Dehydrated<RosettaTypeAlias$>, index: number): void {
    node.parameters.splice(index, 1);
  }
  export function setParameterAt(
    node: Dehydrated<RosettaTypeAlias$>,
    index: number,
    parameter: Dehydrated<TypeParameter$>
  ): void {
    node.parameters[index] = parameter;
  }
  export function moveParameterAt(node: Dehydrated<RosettaTypeAlias$>, from: number, to: number): void {
    const [item] = node.parameters.splice(from, 1);
    if (item === undefined) return;
    node.parameters.splice(to, 0, item);
  }
  export function setTypeCall(node: Dehydrated<RosettaTypeAlias$>, typeCall: Dehydrated<TypeCall$>): void {
    node.typeCall = typeCall;
  }
  export function getConditions(node: Dehydrated<RosettaTypeAlias$>): Dehydrated<Condition$>[] {
    return node.conditions;
  }
  export function addCondition(node: Dehydrated<RosettaTypeAlias$>, condition: Dehydrated<Condition$>): void {
    node.conditions.push(condition);
  }
  export function insertConditionAt(
    node: Dehydrated<RosettaTypeAlias$>,
    index: number,
    condition: Dehydrated<Condition$>
  ): void {
    node.conditions.splice(index, 0, condition);
  }
  export function removeConditionAt(node: Dehydrated<RosettaTypeAlias$>, index: number): void {
    node.conditions.splice(index, 1);
  }
  export function setConditionAt(
    node: Dehydrated<RosettaTypeAlias$>,
    index: number,
    condition: Dehydrated<Condition$>
  ): void {
    node.conditions[index] = condition;
  }
  export function moveConditionAt(node: Dehydrated<RosettaTypeAlias$>, from: number, to: number): void {
    const [item] = node.conditions.splice(from, 1);
    if (item === undefined) return;
    node.conditions.splice(to, 0, item);
  }
}

export namespace RuleReferenceAnnotation {
  export function setReportingRule(node: Dehydrated<RuleReferenceAnnotation$>, refText: string): void {
    node.reportingRule = { $refText: refText };
  }
  export function clearReportingRule(node: Dehydrated<RuleReferenceAnnotation$>): void {
    node.reportingRule = undefined;
  }
}

export namespace Segment {
  export function setFeature(node: Dehydrated<Segment$>, refText: string): void {
    node.feature = { $refText: refText };
  }
  export function setNext(node: Dehydrated<Segment$>, next: Dehydrated<Segment$>): void {
    node.next = next;
  }
  export function clearNext(node: Dehydrated<Segment$>): void {
    node.next = undefined;
  }
}

export namespace SortOperation {
  export function setFunction(node: Dehydrated<SortOperation$>, function_: Dehydrated<InlineFunction$>): void {
    node.function = function_;
  }
  export function clearFunction(node: Dehydrated<SortOperation$>): void {
    node.function = undefined;
  }
}

export namespace SwitchCaseGuard {
  export function setReferenceGuard(node: Dehydrated<SwitchCaseGuard$>, refText: string): void {
    node.referenceGuard = { $refText: refText };
  }
  export function clearReferenceGuard(node: Dehydrated<SwitchCaseGuard$>): void {
    node.referenceGuard = undefined;
  }
}

export namespace SwitchCaseOrDefault {
  export function setGuard(node: Dehydrated<SwitchCaseOrDefault$>, guard: Dehydrated<SwitchCaseGuard$>): void {
    node.guard = guard;
  }
  export function clearGuard(node: Dehydrated<SwitchCaseOrDefault$>): void {
    node.guard = undefined;
  }
}

export namespace SwitchOperation {
  export function getCases(node: Dehydrated<SwitchOperation$>): Dehydrated<SwitchCaseOrDefault$>[] {
    return node.cases;
  }
  export function addCase(node: Dehydrated<SwitchOperation$>, case_: Dehydrated<SwitchCaseOrDefault$>): void {
    node.cases.push(case_);
  }
  export function insertCaseAt(
    node: Dehydrated<SwitchOperation$>,
    index: number,
    case_: Dehydrated<SwitchCaseOrDefault$>
  ): void {
    node.cases.splice(index, 0, case_);
  }
  export function removeCaseAt(node: Dehydrated<SwitchOperation$>, index: number): void {
    node.cases.splice(index, 1);
  }
  export function setCaseAt(
    node: Dehydrated<SwitchOperation$>,
    index: number,
    case_: Dehydrated<SwitchCaseOrDefault$>
  ): void {
    node.cases[index] = case_;
  }
  export function moveCaseAt(node: Dehydrated<SwitchOperation$>, from: number, to: number): void {
    const [item] = node.cases.splice(from, 1);
    if (item === undefined) return;
    node.cases.splice(to, 0, item);
  }
}

export namespace ThenOperation {
  export function setFunction(node: Dehydrated<ThenOperation$>, function_: Dehydrated<InlineFunction$>): void {
    node.function = function_;
  }
  export function clearFunction(node: Dehydrated<ThenOperation$>): void {
    node.function = undefined;
  }
}

export namespace ToEnumOperation {
  export function setEnumeration(node: Dehydrated<ToEnumOperation$>, refText: string): void {
    node.enumeration = { $refText: refText };
  }
}

export namespace TypeCall {
  export function setType(node: Dehydrated<TypeCall$>, refText: string): void {
    node.type = { $refText: refText };
  }
  export function getArguments(node: Dehydrated<TypeCall$>): Dehydrated<TypeCallArgument$>[] {
    return node.arguments;
  }
  export function addArgument(node: Dehydrated<TypeCall$>, argument: Dehydrated<TypeCallArgument$>): void {
    node.arguments.push(argument);
  }
  export function insertArgumentAt(
    node: Dehydrated<TypeCall$>,
    index: number,
    argument: Dehydrated<TypeCallArgument$>
  ): void {
    node.arguments.splice(index, 0, argument);
  }
  export function removeArgumentAt(node: Dehydrated<TypeCall$>, index: number): void {
    node.arguments.splice(index, 1);
  }
  export function setArgumentAt(
    node: Dehydrated<TypeCall$>,
    index: number,
    argument: Dehydrated<TypeCallArgument$>
  ): void {
    node.arguments[index] = argument;
  }
  export function moveArgumentAt(node: Dehydrated<TypeCall$>, from: number, to: number): void {
    const [item] = node.arguments.splice(from, 1);
    if (item === undefined) return;
    node.arguments.splice(to, 0, item);
  }
}

export namespace TypeCallArgument {
  export function setParameter(node: Dehydrated<TypeCallArgument$>, refText: string): void {
    node.parameter = { $refText: refText };
  }
}

export namespace TypeParameter {
  export function setTypeCall(node: Dehydrated<TypeParameter$>, typeCall: Dehydrated<TypeCall$>): void {
    node.typeCall = typeCall;
  }
}

export namespace WithMetaEntry {
  export function setKey(node: Dehydrated<WithMetaEntry$>, refText: string): void {
    node.key = { $refText: refText };
  }
}

export namespace WithMetaOperation {
  export function getEntries(node: Dehydrated<WithMetaOperation$>): Dehydrated<WithMetaEntry$>[] {
    return node.entries;
  }
  export function addEntrie(node: Dehydrated<WithMetaOperation$>, entrie: Dehydrated<WithMetaEntry$>): void {
    node.entries.push(entrie);
  }
  export function insertEntrieAt(
    node: Dehydrated<WithMetaOperation$>,
    index: number,
    entrie: Dehydrated<WithMetaEntry$>
  ): void {
    node.entries.splice(index, 0, entrie);
  }
  export function removeEntrieAt(node: Dehydrated<WithMetaOperation$>, index: number): void {
    node.entries.splice(index, 1);
  }
  export function setEntrieAt(
    node: Dehydrated<WithMetaOperation$>,
    index: number,
    entrie: Dehydrated<WithMetaEntry$>
  ): void {
    node.entries[index] = entrie;
  }
  export function moveEntrieAt(node: Dehydrated<WithMetaOperation$>, from: number, to: number): void {
    const [item] = node.entries.splice(from, 1);
    if (item === undefined) return;
    node.entries.splice(to, 0, item);
  }
}
