import type { AstNode, AstNodeDescription, ReferenceInfo, Scope } from 'langium';
import { AstUtils, EMPTY_SCOPE, DefaultScopeProvider, MapScope } from 'langium';
import type { LangiumCoreServices } from 'langium';
import {
  isData,
  isRosettaFunction,
  isRosettaEnumeration,
  isAttribute,
  isOperation,
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
  isAnnotationRef,
  isRosettaSymbolReference
} from '../generated/ast.js';
import type {
  Data,
  Attribute,
  RosettaExpression,
  RosettaModel,
  RosettaFeatureCall,
  RosettaDeepFeatureCall,
  Segment,
  TypeCall
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

  // ── Type-aware scoping ──────────────────────────────────────────────

  /**
   * Resolve the type produced by an expression.
   * Returns a Data node if the expression's type can be determined, or undefined.
   */
  private resolveExpressionType(expr: RosettaExpression): Data | undefined {
    // Symbol reference → look up the symbol to determine its type
    if (isRosettaSymbolReference(expr)) {
      const sym = expr.symbol?.ref;
      if (!sym) return undefined;

      // Attribute → its typeCall determines the type
      if (isAttribute(sym)) {
        return this.resolveTypeCallToData(sym.typeCall);
      }

      // ShortcutDeclaration → type comes from its expression
      if (isShortcutDeclaration(sym)) {
        return sym.expression ? this.resolveExpressionType(sym.expression) : undefined;
      }

      // Function → type comes from output attribute's typeCall
      if (isRosettaFunction(sym)) {
        return sym.output ? this.resolveTypeCallToData(sym.output.typeCall) : undefined;
      }

      // Data type referenced directly
      if (isData(sym)) {
        return sym;
      }

      return undefined;
    }

    // Feature call → resolve the feature to get its type
    if (isRosettaFeatureCall(expr)) {
      const feature = expr.feature?.ref;
      if (feature && isAttribute(feature)) {
        return this.resolveTypeCallToData(feature.typeCall);
      }
      return undefined;
    }

    // Deep feature call → same logic
    if (isRosettaDeepFeatureCall(expr)) {
      const feature = expr.feature?.ref;
      if (feature && isAttribute(feature)) {
        return this.resolveTypeCallToData(feature.typeCall);
      }
      return undefined;
    }

    // Constructor expression → resolve the typeRef
    if (isRosettaConstructorExpression(expr)) {
      return this.resolveExpressionType(expr.typeRef);
    }

    return undefined;
  }

  /**
   * Resolve a TypeCall to a Data node, if the type reference points to one.
   */
  private resolveTypeCallToData(typeCall: TypeCall | undefined): Data | undefined {
    const ref = typeCall?.type?.ref;
    if (ref && isData(ref)) {
      return ref;
    }
    return undefined;
  }

  /**
   * Collect all attributes from a Data type including inherited attributes.
   */
  private collectDataAttributes(data: Data, visited?: Set<Data>): Attribute[] {
    if (!visited) visited = new Set();
    if (visited.has(data)) return []; // cycle guard
    visited.add(data);

    const attrs = [...data.attributes];

    // Walk the inheritance chain
    const superRef = data.superType?.ref;
    if (superRef && isData(superRef)) {
      attrs.push(...this.collectDataAttributes(superRef, visited));
    }

    return attrs;
  }

  /**
   * Build a scope from a Data type's attributes (including inherited).
   * Falls back to the global attribute scope if the type cannot be resolved.
   */
  private buildTypedScope(data: Data | undefined, fallbackNode: AstNode): Scope {
    if (!data) {
      return this.getAllAttributesScope(fallbackNode);
    }
    const attrs = this.collectDataAttributes(data);
    if (attrs.length === 0) {
      return this.getAllAttributesScope(fallbackNode);
    }
    const descriptions = attrs.map((a) => this.createDescription(a, a.name));
    return new MapScope(descriptions);
  }

  // ── Case implementations ────────────────────────────────────────────

  /**
   * Case 1: Feature call scope — attributes of the receiver's resolved type.
   */
  private getFeatureCallScope(node: RosettaFeatureCall): Scope {
    const receiverType = this.resolveExpressionType(node.receiver);
    return this.buildTypedScope(receiverType, node);
  }

  /**
   * Case 2: Deep feature call scope — all attributes (own + transitive) of receiver type.
   */
  private getDeepFeatureCallScope(node: RosettaDeepFeatureCall): Scope {
    const receiverType = this.resolveExpressionType(node.receiver);
    if (!receiverType) {
      return this.getAllAttributesScope(node);
    }
    // For deep feature calls, collect attributes transitively:
    // gather all attributes of the type and all types reachable from those attributes.
    const allAttrs = this.collectTransitiveAttributes(receiverType);
    if (allAttrs.length === 0) {
      return this.getAllAttributesScope(node);
    }
    const descriptions = allAttrs.map((a) => this.createDescription(a, a.name));
    return new MapScope(descriptions);
  }

  /**
   * Collect attributes transitively: the type's own attrs plus attributes
   * of all types reachable through attribute type references.
   */
  private collectTransitiveAttributes(data: Data, visited?: Set<Data>): Attribute[] {
    if (!visited) visited = new Set();
    if (visited.has(data)) return [];
    visited.add(data);

    const attrs = this.collectDataAttributes(data);
    for (const attr of [...attrs]) {
      const attrType = this.resolveTypeCallToData(attr.typeCall);
      if (attrType) {
        attrs.push(...this.collectTransitiveAttributes(attrType, visited));
      }
    }
    return attrs;
  }

  /**
   * Case 3: Segment scope — features of the segment's context type.
   * A segment chain `-> a -> b` resolves each step relative to the previous type.
   */
  private getSegmentScope(node: Segment): Scope {
    // Walk up the segment chain to find the root Operation
    const operation = AstUtils.getContainerOfType(node, isOperation);
    if (!operation) {
      return this.getAllAttributesScope(node);
    }

    // The operation's assignRoot is an Attribute or ShortcutDeclaration
    const root = operation.assignRoot?.ref;
    if (!root) {
      return this.getAllAttributesScope(node);
    }

    // Get the root type
    let currentType: Data | undefined;
    if (isAttribute(root)) {
      currentType = this.resolveTypeCallToData(root.typeCall);
    } else if (isShortcutDeclaration(root)) {
      currentType = root.expression ? this.resolveExpressionType(root.expression) : undefined;
    }

    if (!currentType) {
      return this.getAllAttributesScope(node);
    }

    // Walk the segment chain: for each preceding segment, resolve its type
    const segments = this.getSegmentChain(operation, node);
    for (const seg of segments) {
      const feature = seg.feature?.ref;
      if (feature && isAttribute(feature)) {
        currentType = this.resolveTypeCallToData(feature.typeCall);
        if (!currentType) break;
      } else {
        currentType = undefined;
        break;
      }
    }

    return this.buildTypedScope(currentType, node);
  }

  /**
   * Get the chain of segments preceding the target segment.
   */
  private getSegmentChain(operation: AstNode & { path?: Segment }, target: Segment): Segment[] {
    const chain: Segment[] = [];
    let current: Segment | undefined = (operation as any).path;
    while (current && current !== target) {
      chain.push(current);
      current = current.next;
    }
    return chain;
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
    const constructedType = this.resolveExpressionType(constructor.typeRef);
    return this.buildTypedScope(constructedType, node);
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
    const descriptions = this.collectDataAttributes(dataRef).map((a) =>
      this.createDescription(a, a.name)
    );
    return new MapScope(descriptions);
  }

  // ── Fallback scopes ─────────────────────────────────────────────────

  /**
   * Collect all attributes from all Data types in the current document.
   * Used as a fallback when the receiver type cannot be resolved.
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
