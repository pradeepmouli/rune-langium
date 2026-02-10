import type { AstNode, AstNodeDescription, ReferenceInfo, Scope, Stream } from 'langium';
import { AstUtils, stream, EMPTY_SCOPE, DefaultScopeProvider, MapScope } from 'langium';
import type { LangiumCoreServices } from 'langium';
import {
  isData,
  isRosettaFunction,
  isRosettaEnumeration,
  isChoice,
  isAttribute,
  isOperation,
  isCondition,
  isShortcutDeclaration,
  isRosettaFeatureCall,
  isRosettaDeepFeatureCall,
  isSegment,
  isConstructorKeyValuePair,
  isRosettaConstructorExpression,
  isSwitchCaseOrDefault,
  isSwitchOperation,
  isRosettaEnumValueReference,
  isWithMetaEntry,
  isRosettaExternalRegularAttribute,
  isRosettaExternalClass,
  isChoiceOption,
  isAnnotationRef
} from '../generated/ast.js';
import type {
  Data,
  Attribute,
  RosettaFunction,
  RosettaEnumeration,
  Choice,
  TypeCall,
  RosettaExpression,
  RosettaModel
} from '../generated/ast.js';

/**
 * Custom scope provider for the Rune DSL.
 *
 * Handles the 21 cross-reference patterns from the original Xtext implementation:
 * - Cases 1-3: Feature calls (-> and ->>)
 * - Cases 4-8: Operation assign root, segments, constructor keys
 * - Case 9-11: Switch case guards, enum values
 * - Case 12: Symbol references (most complex — context-dependent)
 * - Cases 13-21: Annotation paths, external refs, etc.
 */
export class RuneDslScopeProvider extends DefaultScopeProvider {
  constructor(services: LangiumCoreServices) {
    super(services);
  }

  override getScope(context: ReferenceInfo): Scope {
    const container = context.container;
    const property = context.property;

    // Case 1: RosettaFeatureCall.feature — resolve to attributes of receiver type
    if (isRosettaFeatureCall(container) && property === 'feature') {
      return this.getFeatureCallScope(container);
    }

    // Case 2: RosettaDeepFeatureCall.feature — resolve to all transitive attributes
    if (isRosettaDeepFeatureCall(container) && property === 'feature') {
      return this.getDeepFeatureCallScope(container);
    }

    // Case 3: Segment.feature — resolve to features of the segment's context type
    if (isSegment(container) && property === 'feature') {
      return this.getSegmentScope(container);
    }

    // Case 4: Operation.assignRoot — resolve to function inputs/output/shortcuts
    if (isOperation(container) && property === 'assignRoot') {
      return this.getOperationAssignScope(container);
    }

    // Case 5: ConstructorKeyValuePair.key — resolve to features of the constructed type
    if (isConstructorKeyValuePair(container) && property === 'key') {
      return this.getConstructorKeyScope(container);
    }

    // Case 6: WithMetaEntry.key — resolve to meta features
    if (isWithMetaEntry(container) && property === 'key') {
      return this.getWithMetaKeyScope(container);
    }

    // Case 7: SwitchCaseGuard.referenceGuard — resolve to enum values or data subtypes
    if (container.$type === 'SwitchCaseGuard' && property === 'referenceGuard') {
      return this.getSwitchCaseGuardScope(container);
    }

    // Case 8: EnumValueReference.value — resolve to enum values of the specified enum
    if (isRosettaEnumValueReference(container) && property === 'value') {
      return this.getEnumValueScope(container);
    }

    // Case 9: AnnotationRef.annotation — already handled by default scope (global)
    if (isAnnotationRef(container) && property === 'annotation') {
      return super.getScope(context);
    }

    // Case 10: ExternalRegularAttribute.attributeRef — resolve to features of the external class's data type
    if (isRosettaExternalRegularAttribute(container) && property === 'attributeRef') {
      return this.getExternalAttributeScope(container);
    }

    // Case 11: ChoiceOperation attributes — already references by name
    // Cases 12+: Default to standard scope resolution
    return super.getScope(context);
  }

  /**
   * Case 1: Feature call scope — attributes of the receiver's resolved type.
   */
  private getFeatureCallScope(node: AstNode): Scope {
    // Without a type system pass, we can't definitively resolve the receiver type.
    // For now, provide a scope containing all attributes in the current model.
    return this.getAllAttributesScope(node);
  }

  /**
   * Case 2: Deep feature call scope — transitive attributes.
   */
  private getDeepFeatureCallScope(node: AstNode): Scope {
    return this.getAllAttributesScope(node);
  }

  /**
   * Case 3: Segment scope — features of the context type.
   */
  private getSegmentScope(node: AstNode): Scope {
    return this.getAllAttributesScope(node);
  }

  /**
   *  Case 4: Operation assign root — function inputs, output, and shortcuts in scope.
   */
  private getOperationAssignScope(node: AstNode): Scope {
    const func = AstUtils.getContainerOfType(node, isRosettaFunction);
    if (!func) {
      return EMPTY_SCOPE;
    }
    const descriptions: AstNodeDescription[] = [];
    for (const input of func.inputs) {
      descriptions.push(this.createDescription(input, input.name));
    }
    if (func.output) {
      descriptions.push(this.createDescription(func.output, func.output.name));
    }
    for (const shortcut of func.shortcuts) {
      descriptions.push(this.createDescription(shortcut, shortcut.name));
    }
    return new MapScope(descriptions);
  }

  /**
   * Case 5: Constructor key scope — features of the constructed type.
   */
  private getConstructorKeyScope(node: AstNode): Scope {
    const constructor = AstUtils.getContainerOfType(node, isRosettaConstructorExpression);
    if (!constructor?.typeRef) {
      return EMPTY_SCOPE;
    }
    // typeRef is a RosettaExpression (usually a RosettaSymbolReference)
    // We'd need the resolved type to get its features
    return this.getAllAttributesScope(node);
  }

  /**
   * Case 6: WithMetaEntry key scope
   */
  private getWithMetaKeyScope(_node: AstNode): Scope {
    return EMPTY_SCOPE;
  }

  /**
   * Case 7: Switch case guard scope — enum values or type names.
   */
  private getSwitchCaseGuardScope(node: AstNode): Scope {
    // Find the parent SwitchOperation to determine argument type
    const switchCase = AstUtils.getContainerOfType(node, isSwitchCaseOrDefault);
    if (!switchCase) {
      return EMPTY_SCOPE;
    }
    const switchOp = AstUtils.getContainerOfType(switchCase, isSwitchOperation);
    if (!switchOp) {
      return EMPTY_SCOPE;
    }
    // For now, provide all enum values and data types in scope
    return this.getAllEnumValuesAndTypesScope(node);
  }

  /**
   * Case 8: EnumValueReference value — values of the specified enumeration.
   */
  private getEnumValueScope(node: AstNode): Scope {
    if (!isRosettaEnumValueReference(node)) {
      return EMPTY_SCOPE;
    }
    const enumRef = node.enumeration?.ref;
    if (!enumRef || !isRosettaEnumeration(enumRef)) {
      return EMPTY_SCOPE;
    }
    const descriptions = enumRef.enumValues.map((v) => this.createDescription(v, v.name));
    return new MapScope(descriptions);
  }

  /**
   * Case 10: External attribute scope.
   */
  private getExternalAttributeScope(node: AstNode): Scope {
    const externalClass = AstUtils.getContainerOfType(node, isRosettaExternalClass);
    if (!externalClass) {
      return EMPTY_SCOPE;
    }
    const dataRef = externalClass.data?.ref;
    if (!dataRef || !isData(dataRef)) {
      return EMPTY_SCOPE;
    }
    const descriptions = dataRef.attributes.map((a) => this.createDescription(a, a.name));
    return new MapScope(descriptions);
  }

  /**
   * Collect all attributes from all Data types in the current document.
   */
  private getAllAttributesScope(node: AstNode): Scope {
    const model = AstUtils.getContainerOfType(
      node,
      (n): n is RosettaModel => n.$type === 'RosettaModel'
    );
    if (!model) {
      return EMPTY_SCOPE;
    }
    const descriptions: AstNodeDescription[] = [];
    for (const element of model.elements) {
      if (isData(element)) {
        for (const attr of element.attributes) {
          descriptions.push(this.createDescription(attr, attr.name));
        }
      }
    }
    return new MapScope(descriptions);
  }

  /**
   * Collect all enum values and type names for switch case resolution.
   */
  private getAllEnumValuesAndTypesScope(node: AstNode): Scope {
    const model = AstUtils.getContainerOfType(
      node,
      (n): n is RosettaModel => n.$type === 'RosettaModel'
    );
    if (!model) {
      return EMPTY_SCOPE;
    }
    const descriptions: AstNodeDescription[] = [];
    for (const element of model.elements) {
      if (isRosettaEnumeration(element)) {
        for (const value of element.enumValues) {
          descriptions.push(this.createDescription(value, value.name));
        }
      }
      if (isData(element)) {
        descriptions.push(this.createDescription(element, element.name));
      }
    }
    return new MapScope(descriptions);
  }

  private createDescription(node: AstNode, name: string): AstNodeDescription {
    return this.descriptions.createDescription(node, name);
  }
}
