/**
 * Example: Custom ScopeProvider skeleton for a ported Xtext DSL.
 *
 * This demonstrates the dispatch pattern for mapping Xtext EReference scoping cases
 * to Langium's ScopeProvider interface. Adapt the case list to your grammar.
 */

import {
  AstUtils,
  DefaultScopeProvider,
  EMPTY_SCOPE,
  type AstNodeDescription,
  type ReferenceInfo,
  type Scope
} from 'langium';

// Import generated type guards and interfaces from langium-cli output
import {
  isData,
  isFunction,
  isAttribute,
  isInlineFunction,
  isFeatureCall,
  isDeepFeatureCall,
  isSymbolReference,
  isOperation,
  isSegment,
  isConstructorKeyValuePair,
  isSwitchCaseGuard,
  type Data,
  type FunctionDef,
  type Attribute,
  type FeatureCall,
  type SymbolReference,
  type DslModel,
  type DslType
} from '../generated/ast.js'; // Adapt import names to your generated AST

import type { DslServices } from './dsl-module.js';
import type { DslTypeProvider } from './dsl-type-provider.js';

export class DslScopeProvider extends DefaultScopeProvider {
  private readonly typeProvider: DslTypeProvider;

  constructor(services: DslServices) {
    super(services);
    this.typeProvider = services.types.DslTypeProvider;
  }

  override getScope(context: ReferenceInfo): Scope {
    const { container, property } = context;

    // ── Feature call scope (Cases 1-3) ──────────────────────────────
    if (isFeatureCall(container) && property === 'feature') {
      return this.getFeatureCallScope(container);
    }
    if (isDeepFeatureCall(container) && property === 'feature') {
      return this.getDeepFeatureCallScope(container);
    }

    // ── Operation path scope (Cases 4-8) ────────────────────────────
    if (isOperation(container) && property === 'assignRoot') {
      return this.getAssignRootScope(container);
    }
    if (isSegment(container) && property === 'feature') {
      return this.getSegmentFeatureScope(container);
    }

    // ── Constructor & switch scope (Cases 9-11) ─────────────────────
    if (isConstructorKeyValuePair(container) && property === 'key') {
      return this.getConstructorKeyScope(container);
    }
    if (isSwitchCaseGuard(container)) {
      return this.getSwitchGuardScope(container);
    }

    // ── Symbol reference scope (Case 12 -- most complex) ────────────
    if (isSymbolReference(container) && property === 'symbol') {
      return this.getSymbolScope(container);
    }

    // ── Remaining cases (13-21): enum values, annotations, etc. ─────
    // Add cases as needed for your grammar

    // ── Fallback to default Langium scoping ─────────────────────────
    return super.getScope(context);
  }

  // ── Case implementations ────────────────────────────────────────────

  /**
   * Resolve feature names on a receiver expression's type.
   * Walks the inheritance chain to collect all visible attributes.
   */
  private getFeatureCallScope(call: FeatureCall): Scope {
    const receiverType = this.typeProvider.getType(call.receiver);
    if (!receiverType || !isData(receiverType)) {
      return EMPTY_SCOPE;
    }
    return this.createScope(this.collectAttributes(receiverType));
  }

  /**
   * Deep feature calls (`->>`) resolve transitively through the type hierarchy.
   */
  private getDeepFeatureCallScope(call: any): Scope {
    // Similar to feature call but may flatten through collections
    const receiverType = this.typeProvider.getType(call.receiver);
    if (!receiverType || !isData(receiverType)) {
      return EMPTY_SCOPE;
    }
    return this.createScope(this.collectAttributes(receiverType));
  }

  /**
   * Operation assign roots: function outputs and inputs.
   */
  private getAssignRootScope(operation: any): Scope {
    const func = AstUtils.getContainerOfType(operation, isFunction);
    if (!func) return EMPTY_SCOPE;

    const descriptions: AstNodeDescription[] = [];
    if (func.output) {
      descriptions.push(this.descriptions.createDescription(func.output, func.output.name));
    }
    return this.createScope(descriptions);
  }

  /**
   * Segment features resolve to attributes on the segment's receiver type.
   */
  private getSegmentFeatureScope(segment: any): Scope {
    // Resolve based on the type of the preceding segment or assign root
    return EMPTY_SCOPE; // Implement based on grammar structure
  }

  /**
   * Constructor key-value pairs resolve to attributes on the constructed type.
   */
  private getConstructorKeyScope(kvp: any): Scope {
    const constructor = kvp.$container;
    const constructedType = constructor?.typeCall?.type?.ref;
    if (!constructedType || !isData(constructedType)) {
      return EMPTY_SCOPE;
    }
    return this.createScope(this.collectAttributes(constructedType));
  }

  /**
   * Switch case guards resolve based on the switched expression's type.
   * - For enums: enum values
   * - For choices: choice options
   * - For data: subtypes
   */
  private getSwitchGuardScope(guard: any): Scope {
    // Determine the type being switched on, then provide appropriate options
    return EMPTY_SCOPE; // Implement based on grammar structure
  }

  /**
   * Symbol references: the most complex case.
   * Walks containment hierarchy to build a layered scope of all visible symbols.
   */
  private getSymbolScope(ref: SymbolReference): Scope {
    let scope: Scope = EMPTY_SCOPE;

    // Layer 1: Global scope (all types, functions, enums from imports)
    const model = AstUtils.getContainerOfType(ref, (n): n is DslModel => n.$type === 'DslModel');
    if (model) {
      scope = this.getImportedScope(model, scope);
    }

    // Layer 2: Function-local symbols (inputs, output, shortcuts)
    const func = AstUtils.getContainerOfType(ref, isFunction);
    if (func) {
      const locals: AstNodeDescription[] = [];
      for (const input of func.inputs) {
        locals.push(this.descriptions.createDescription(input, input.name));
      }
      if (func.output) {
        locals.push(this.descriptions.createDescription(func.output, func.output.name));
      }
      for (const shortcut of (func as any).shortcuts ?? []) {
        locals.push(this.descriptions.createDescription(shortcut, shortcut.name));
      }
      scope = this.createScope(locals, scope);
    }

    // Layer 3: Closure parameters
    const closure = AstUtils.getContainerOfType(ref, isInlineFunction);
    if (closure?.parameter) {
      scope = this.createScope(
        [this.descriptions.createDescription(closure.parameter, closure.parameter.name)],
        scope
      );
    }

    return scope;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Collect all attributes from a Data type, walking the inheritance chain.
   */
  private collectAttributes(data: Data): AstNodeDescription[] {
    const result: AstNodeDescription[] = [];
    const visited = new Set<Data>();

    let current: Data | undefined = data;
    while (current && !visited.has(current)) {
      visited.add(current);
      for (const attr of current.attributes) {
        result.push(this.descriptions.createDescription(attr, attr.name));
      }
      current = current.superType?.ref;
    }

    return result;
  }

  /**
   * Build scope from imports in the model.
   */
  private getImportedScope(model: DslModel, parent: Scope): Scope {
    const descriptions: AstNodeDescription[] = [];

    for (const imp of model.imports) {
      const ns = imp.importedNamespace;
      if (ns.endsWith('.*')) {
        // Wildcard import: all elements from namespace
        const prefix = ns.slice(0, -2);
        descriptions.push(...this.getNamespaceElements(prefix));
      } else {
        // Single import
        const element = this.findGlobalElement(ns);
        if (element) {
          descriptions.push(element);
        }
      }
    }

    // Add built-in types (always visible)
    descriptions.push(...this.getBuiltinDescriptions());

    return this.createScope(descriptions, parent);
  }

  private getNamespaceElements(_prefix: string): AstNodeDescription[] {
    // Query the global index for all elements in the namespace
    return []; // Implement using services.shared.workspace.IndexManager
  }

  private findGlobalElement(_qualifiedName: string): AstNodeDescription | undefined {
    // Query the global index for a specific element
    return undefined; // Implement using services.shared.workspace.IndexManager
  }

  private getBuiltinDescriptions(): AstNodeDescription[] {
    // Return descriptions for built-in types (string, number, boolean, etc.)
    return []; // Implement based on DSL built-in types
  }
}
