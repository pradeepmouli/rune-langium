/**
 * Semantic AST diff utility (T034).
 *
 * Compares two lists of type declarations to determine whether the
 * graph layout needs to be recalculated. Only structural changes
 * (added/removed/modified types, attributes, inheritance) trigger
 * a re-layout; cosmetic changes (comments, whitespace) do not.
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface TypeDeclaration {
  name: string;
  kind: 'data' | 'choice' | 'enum' | 'annotation' | 'other';
  attributes: string[];
  parent?: string;
}

export interface DiffResult {
  /** Whether there are structural changes that require graph re-layout. */
  hasStructuralChanges: boolean;
  /** Newly added type names. */
  added: string[];
  /** Removed type names. */
  removed: string[];
  /** Modified type names (attribute or inheritance change). */
  modified: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compare two snapshots of type declarations.
 */
export function semanticDiff(before: TypeDeclaration[], after: TypeDeclaration[]): DiffResult {
  const beforeMap = new Map(before.map((t) => [t.name, t]));
  const afterMap = new Map(after.map((t) => [t.name, t]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  // Check for added and modified
  for (const [name, afterType] of afterMap) {
    const beforeType = beforeMap.get(name);
    if (!beforeType) {
      added.push(name);
      continue;
    }

    if (isModified(beforeType, afterType)) {
      modified.push(name);
    }
  }

  // Check for removed
  for (const name of beforeMap.keys()) {
    if (!afterMap.has(name)) {
      removed.push(name);
    }
  }

  const hasStructuralChanges = added.length > 0 || removed.length > 0 || modified.length > 0;

  return { hasStructuralChanges, added, removed, modified };
}

function isModified(before: TypeDeclaration, after: TypeDeclaration): boolean {
  if (before.kind !== after.kind) return true;
  if (before.parent !== after.parent) return true;

  // Compare attributes (order-insensitive)
  if (before.attributes.length !== after.attributes.length) return true;

  const sortedBefore = [...before.attributes].sort();
  const sortedAfter = [...after.attributes].sort();

  for (let i = 0; i < sortedBefore.length; i++) {
    if (sortedBefore[i] !== sortedAfter[i]) return true;
  }

  return false;
}
