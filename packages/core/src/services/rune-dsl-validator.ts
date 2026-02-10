import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { LangiumCoreServices } from 'langium';
import type {
  Data,
  Attribute,
  RosettaFunction,
  RosettaEnumeration,
  Choice,
  RosettaModel,
  Condition
} from '../generated/ast.js';

type RuneDslAstType = {
  Data: Data;
  Attribute: Attribute;
  RosettaFunction: RosettaFunction;
  RosettaEnumeration: RosettaEnumeration;
  Choice: Choice;
  RosettaModel: RosettaModel;
  Condition: Condition;
};

/**
 * Custom validator for the Rune DSL.
 *
 * Implements structural and naming validations
 * ported from the original Xtext implementation.
 */
export class RuneDslValidator {
  /**
   * Register validation checks with the Langium validation registry.
   */
  registerChecks(services: LangiumCoreServices): void {
    const registry = services.validation.ValidationRegistry;
    const checks: ValidationChecks<RuneDslAstType> = {
      Data: [this.checkDataNoDuplicateAttributes, this.checkDataExtendsCycle, this.checkDataNaming],
      Attribute: [this.checkAttributeCardinality, this.checkAttributeNaming],
      RosettaFunction: [
        this.checkFunctionNoDuplicateInputs,
        this.checkFunctionOutputRequired,
        this.checkFunctionNaming
      ],
      RosettaEnumeration: [this.checkEnumNoDuplicateValues, this.checkEnumNaming],
      Choice: [this.checkChoiceNoDuplicateOptions, this.checkChoiceNaming],
      RosettaModel: [this.checkModelNoDuplicateElements],
      Condition: [this.checkConditionNaming]
    };
    registry.register(checks, this);
  }

  // ── Structural Validations ─────────────────────────────────────────

  /**
   * S-01: No duplicate attribute names within a Data type.
   */
  checkDataNoDuplicateAttributes(node: Data, accept: ValidationAcceptor): void {
    const seen = new Set<string>();
    for (const attr of node.attributes) {
      if (seen.has(attr.name)) {
        accept('error', `Duplicate attribute '${attr.name}'.`, {
          node: attr,
          property: 'name'
        });
      }
      seen.add(attr.name);
    }
  }

  /**
   * S-02: Detect circular inheritance in Data extends chain.
   */
  checkDataExtendsCycle(node: Data, accept: ValidationAcceptor): void {
    const visited = new Set<Data>();
    let current: Data | undefined = node;
    while (current) {
      if (visited.has(current)) {
        accept('error', `Circular inheritance detected for '${node.name}'.`, {
          node,
          property: 'superType'
        });
        return;
      }
      visited.add(current);
      current = current.superType?.ref as Data | undefined;
    }
  }

  /**
   * S-03: Data type names should start with uppercase.
   */
  checkDataNaming(node: Data, accept: ValidationAcceptor): void {
    if (node.name && /^[a-z]/.test(node.name)) {
      accept('warning', `Data type '${node.name}' should start with an uppercase letter.`, {
        node,
        property: 'name'
      });
    }
  }

  /**
   * S-04: Attribute cardinality must have lower <= upper.
   */
  checkAttributeCardinality(node: Attribute, accept: ValidationAcceptor): void {
    const card = node.card;
    if (!card) return;
    const inf = card.inf;
    const sup = card.sup;
    if (sup !== undefined && inf !== undefined && !card.unbounded) {
      if (inf > sup) {
        accept('error', `Lower bound (${inf}) must not exceed upper bound (${sup}).`, {
          node: card,
          property: 'inf'
        });
      }
    }
  }

  /**
   * S-05: Attribute names should start with lowercase.
   */
  checkAttributeNaming(node: Attribute, accept: ValidationAcceptor): void {
    if (node.name && /^[A-Z]/.test(node.name)) {
      accept('warning', `Attribute '${node.name}' should start with a lowercase letter.`, {
        node,
        property: 'name'
      });
    }
  }

  /**
   * S-06: No duplicate function input names.
   */
  checkFunctionNoDuplicateInputs(node: RosettaFunction, accept: ValidationAcceptor): void {
    const seen = new Set<string>();
    for (const input of node.inputs) {
      if (seen.has(input.name)) {
        accept('error', `Duplicate input '${input.name}'.`, {
          node: input,
          property: 'name'
        });
      }
      seen.add(input.name);
    }
  }

  /**
   * S-07: Functions should have an output.
   */
  checkFunctionOutputRequired(node: RosettaFunction, accept: ValidationAcceptor): void {
    if (!node.output) {
      accept('warning', `Function '${node.name}' has no output.`, {
        node,
        property: 'name'
      });
    }
  }

  /**
   * S-08: Function names should start with uppercase.
   */
  checkFunctionNaming(node: RosettaFunction, accept: ValidationAcceptor): void {
    if (node.name && /^[a-z]/.test(node.name)) {
      accept('warning', `Function '${node.name}' should start with an uppercase letter.`, {
        node,
        property: 'name'
      });
    }
  }

  /**
   * S-09: No duplicate enum value names.
   */
  checkEnumNoDuplicateValues(node: RosettaEnumeration, accept: ValidationAcceptor): void {
    const seen = new Set<string>();
    for (const value of node.enumValues) {
      if (seen.has(value.name)) {
        accept('error', `Duplicate enum value '${value.name}'.`, {
          node: value,
          property: 'name'
        });
      }
      seen.add(value.name);
    }
  }

  /**
   * S-10: Enum names should start with uppercase.
   */
  checkEnumNaming(node: RosettaEnumeration, accept: ValidationAcceptor): void {
    if (node.name && /^[a-z]/.test(node.name)) {
      accept('warning', `Enum '${node.name}' should start with an uppercase letter.`, {
        node,
        property: 'name'
      });
    }
  }

  /**
   * S-11: No duplicate choice option type references.
   */
  checkChoiceNoDuplicateOptions(node: Choice, accept: ValidationAcceptor): void {
    const seen = new Set<string>();
    for (const opt of node.attributes) {
      const typeName = opt.typeCall?.type?.$refText;
      if (typeName && seen.has(typeName)) {
        accept('error', `Duplicate choice option '${typeName}'.`, {
          node: opt,
          property: 'typeCall'
        });
      }
      if (typeName) seen.add(typeName);
    }
  }

  /**
   * S-12: Choice names should start with uppercase.
   */
  checkChoiceNaming(node: Choice, accept: ValidationAcceptor): void {
    if (node.name && /^[a-z]/.test(node.name)) {
      accept('warning', `Choice '${node.name}' should start with an uppercase letter.`, {
        node,
        property: 'name'
      });
    }
  }

  /**
   * S-13: No duplicate top-level element names in the same model.
   */
  checkModelNoDuplicateElements(node: RosettaModel, accept: ValidationAcceptor): void {
    const seen = new Set<string>();
    for (const element of node.elements) {
      const name = (element as { name?: string }).name;
      if (!name) continue;
      if (seen.has(name)) {
        accept('error', `Duplicate element '${name}'.`, {
          node: element,
          property: 'name' as any
        });
      }
      seen.add(name);
    }
  }

  /**
   * S-14: Condition names should start with uppercase.
   */
  checkConditionNaming(node: Condition, accept: ValidationAcceptor): void {
    if (node.name && /^[a-z]/.test(node.name)) {
      accept('warning', `Condition '${node.name}' should start with an uppercase letter.`, {
        node,
        property: 'name'
      });
    }
  }
}
