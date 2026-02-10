# Scoping & Validation: Xtext to Langium

## Scoping Architecture

### Xtext Scoping Model

Xtext scoping uses:
- `ScopeProvider` with `getScope(context, reference)` dispatching on `EReference`
- `IScope` chains (parent scopes, import scopes, global scope)
- `IScopeProvider` for cross-reference resolution
- `ImportedNamespaceAwareLocalScopeProvider` for namespace imports

### Langium Scoping Model

Langium provides:
- `ScopeComputation` - computes which names are exported from a document
- `ScopeProvider` - resolves cross-references by building scope chains
- `DefaultScopeProvider` - handles simple containment-based scoping
- Custom scope providers override `getScope(context, referenceId)` similar to Xtext

### Mapping Xtext to Langium

```typescript
// Xtext (Java)
public class MyScopeProvider extends AbstractDeclarativeScopeProvider {
    IScope scope_Data_superType(Data ctx, EReference ref) {
        // Return scope of all visible Data types
    }
}

// Langium (TypeScript)
export class MyScopeProvider extends DefaultScopeProvider {
    override getScope(context: ReferenceInfo): Scope {
        const container = context.container;
        const property = context.property;

        if (isData(container) && property === 'superType') {
            return this.getSuperTypeScope(container);
        }
        return super.getScope(context);
    }
}
```

### Case-by-Case Dispatch Pattern

For grammars with many scoping cases (20+), organize the scope provider as a dispatch table:

```typescript
export class RuneScopeProvider extends DefaultScopeProvider {
    override getScope(context: ReferenceInfo): Scope {
        const { container, property } = context;

        // Case 1-3: Feature calls
        if (isRosettaFeatureCall(container) && property === 'feature') {
            return this.getFeatureCallScope(container);
        }
        if (isRosettaDeepFeatureCall(container) && property === 'feature') {
            return this.getDeepFeatureCallScope(container);
        }

        // Case 4-8: Operation paths
        if (isOperation(container) && property === 'assignRoot') {
            return this.getAssignRootScope(container);
        }
        if (isSegment(container) && property === 'feature') {
            return this.getSegmentScope(container);
        }

        // Case 9-11: Constructor and switch
        if (isConstructorKeyValuePair(container) && property === 'key') {
            return this.getConstructorKeyScope(container);
        }
        if (isSwitchCaseGuard(container)) {
            return this.getSwitchCaseGuardScope(container);
        }

        // Case 12: Symbol references (most complex)
        if (isRosettaSymbolReference(container) && property === 'symbol') {
            return this.getSymbolScope(container);
        }

        // Cases 13-21: remaining cases...
        return super.getScope(context);
    }
}
```

### Feature Call Scope Resolution

The most common scoping pattern: resolve a feature name on a receiver type.

```typescript
private getFeatureCallScope(call: RosettaFeatureCall): Scope {
    // 1. Compute the type of the receiver expression
    const receiverType = this.typeProvider.getType(call.receiver);
    if (!receiverType) return EMPTY_SCOPE;

    // 2. Collect all features (attributes) of that type
    const features: AstNodeDescription[] = [];
    if (isData(receiverType)) {
        for (const attr of this.getAllAttributes(receiverType)) {
            features.push(this.descriptions.createDescription(attr, attr.name));
        }
    }

    // 3. Return as scope
    return this.createScope(features);
}

private getAllAttributes(data: Data): Attribute[] {
    // Walk inheritance chain
    const result: Attribute[] = [...data.attributes];
    if (data.superType?.ref) {
        result.push(...this.getAllAttributes(data.superType.ref));
    }
    return result;
}
```

### Symbol Reference Scope (Complex Case)

Symbol references are the most complex scoping case. They resolve names based on containment context:

```typescript
private getSymbolScope(ref: RosettaSymbolReference): Scope {
    // Walk up the containment tree to find available symbols
    let scope = EMPTY_SCOPE;

    // 1. Local variables (function inputs, shortcuts, closure parameters)
    const func = AstUtils.getContainerOfType(ref, isFunction);
    if (func) {
        const locals: AstNodeDescription[] = [];
        for (const input of func.inputs) {
            locals.push(this.descriptions.createDescription(input, input.name));
        }
        if (func.output) {
            locals.push(this.descriptions.createDescription(func.output, func.output.name));
        }
        for (const shortcut of func.shortcuts) {
            locals.push(this.descriptions.createDescription(shortcut, shortcut.name));
        }
        scope = this.createScope(locals, scope);
    }

    // 2. Closure parameters
    const closure = AstUtils.getContainerOfType(ref, isInlineFunction);
    if (closure?.parameter) {
        scope = this.createScope(
            [this.descriptions.createDescription(closure.parameter, closure.parameter.name)],
            scope
        );
    }

    // 3. Implicit variable (if in a functional operation without explicit parameter)
    if (this.needsImplicitVariable(ref)) {
        scope = this.createScope(
            [this.createImplicitVariableDescription()],
            scope
        );
    }

    // 4. Global scope (all types, enums, functions visible via imports)
    return this.createScope(this.getGlobalDescriptions(ref), scope);
}
```

### Import Handling

```typescript
// Normalize imports with namespace aliasing
private getImportedScope(model: RosettaModel): Scope {
    const descriptions: AstNodeDescription[] = [];

    for (const imp of model.imports) {
        const namespace = imp.importedNamespace;
        if (namespace.endsWith('.*')) {
            // Wildcard import: add all elements from namespace
            const prefix = namespace.slice(0, -2);
            descriptions.push(...this.getNamespaceElements(prefix));
        } else {
            // Specific import
            const element = this.getElement(namespace);
            if (element) {
                const alias = imp.alias ?? element.name;
                descriptions.push(this.descriptions.createDescription(element, alias));
            }
        }
    }

    // Add implicit imports (e.g., built-in types always visible)
    descriptions.push(...this.getBuiltinTypeDescriptions());

    return this.createScope(descriptions);
}
```

## Validation Rule Porting

### Xtext Validation Model

Xtext uses `@Check` annotated methods dispatched by AST type:

```java
@Check
public void checkCyclicInheritance(Data data) {
    Set<Data> visited = new HashSet<>();
    Data current = data;
    while (current.getSuperType() != null) {
        if (!visited.add(current)) {
            error("Cyclic inheritance", ROSETTA_NAMED__NAME);
            return;
        }
        current = current.getSuperType();
    }
}
```

### Langium Validation Model

Langium uses `ValidationRegistry` and `ValidationCheck` map:

```typescript
export class RuneValidator {
    // Register checks by AST type
    checkCyclicInheritance(data: Data, accept: ValidationAcceptor): void {
        const visited = new Set<Data>();
        let current: Data | undefined = data;
        while (current?.superType?.ref) {
            if (visited.has(current)) {
                accept('error', 'Cyclic inheritance detected', {
                    node: data,
                    property: 'name'
                });
                return;
            }
            visited.add(current);
            current = current.superType.ref;
        }
    }
}
```

### Registration Pattern

```typescript
// In the module setup
export function registerValidationChecks(services: RuneServices): void {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.RuneValidator;
    const checks: ValidationChecks<RuneAstType> = {
        Data: [
            validator.checkCyclicInheritance,
            validator.checkUniqueAttributeNames,
            validator.checkNamingConventions,
        ],
        Function: [
            validator.checkOutputTypeRequired,
            validator.checkOperationPaths,
        ],
        Expression: [
            validator.checkTypeCompatibility,
            validator.checkCardinalityConstraints,
        ],
    };
    registry.register(checks, validator);
}
```

### Validation Categories and Priority

Port validation rules in this priority order:

#### Priority 1: Expression Type Checking (~22 rules)
These prevent runtime errors and are most valuable for tooling:
- Type compatibility in binary operations
- Cardinality violations (singular vs plural)
- Function argument type matching
- Missing required fields in constructors

#### Priority 2: Structural Constraints (~15 rules)
These catch design errors:
- Cyclic inheritance detection
- Duplicate attribute names
- Duplicate enum values
- Invalid cardinality ranges (inf > sup)
- Choice with fewer than 2 options

#### Priority 3: Naming Conventions (~12 rules)
These enforce style consistency:
- Type names must be PascalCase
- Attribute names must be camelCase
- Enum values must be PascalCase
- Namespace must be lowercase dot-separated

#### Priority 4: Domain-Specific (~5+ rules)
These enforce domain semantics:
- Report rule input type validation
- Regulatory reference completeness
- Annotation qualifier constraints

### Validation Parity Report

Track parity with a machine-readable report:

```typescript
// validation-parity.ts
interface ParityEntry {
    xtextRule: string;
    xtextClass: string;
    langiumEquivalent?: string;
    status: 'ported' | 'deferred' | 'not-applicable';
    notes?: string;
}

// Example entries -- adapt rule names and classes to your DSL
const parityReport: ParityEntry[] = [
    {
        xtextRule: 'checkCyclicInheritance',
        xtextClass: 'MyDslStructuralValidator',
        langiumEquivalent: 'DslValidator.checkCyclicInheritance',
        status: 'ported',
    },
    {
        xtextRule: 'checkJavaReservedWords',
        xtextClass: 'MyDslNamingValidator',
        langiumEquivalent: undefined,
        status: 'not-applicable',
        notes: 'Java-specific rule, not relevant for TypeScript target',
    },
    // ... remaining rules
];
```

### Zero False Positive Testing

Validate against the test corpus to ensure no false positives:

```typescript
describe('CDM corpus validation', () => {
    test('no false positive diagnostics on valid CDM files', async () => {
        const workspace = await parseWorkspace(cdmFiles);
        for (const [file, result] of workspace.documents) {
            const errors = result.diagnostics.filter(d => d.severity === 'error');
            expect(errors).toEqual([]);
        }
    });
});
```

## Type Provider Implementation

Many scoping decisions require knowing the type of an expression. Implement a type provider:

```typescript
export class RuneTypeProvider {
    getType(expr: Expression): RosettaType | undefined {
        if (isRosettaFeatureCall(expr)) {
            const feature = expr.feature?.ref;
            if (isAttribute(feature)) {
                return feature.typeCall?.type?.ref;
            }
        }
        if (isRosettaSymbolReference(expr)) {
            const symbol = expr.symbol?.ref;
            if (isAttribute(symbol)) {
                return symbol.typeCall?.type?.ref;
            }
        }
        if (isArithmeticOperation(expr)) {
            return this.getNumericType(); // arithmetic always returns number
        }
        if (isLogicalOperation(expr)) {
            return this.getBooleanType();
        }
        // ... other expression types
        return undefined;
    }
}
```
