# Domain Surface — Config-Declared Identity Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a config-declared, identity-keyed `removeX(node, item)` op to the langium-zod namespace-ops emitter, then cut visual-editor `editor-store` member-container removes/adds/reorders over to the generated `DomainOps`.

**Architecture:** Two repos. **langium-zod** gains a `domain-surface.config.json`-driven `identity` map (element type → field path) that the namespace-ops emitter consumes to emit `removeX` (matches by the configured path, returns `boolean`). Published as `0.8.2`. **rune** adds the config file, regenerates `domain.ts` (barrel unchanged — additive ops only), and delegates the editor-store mutations behind behavior-preserving characterization tests.

**Tech Stack:** TypeScript 5.9+ strict ESM, langium-zod (emitter), Zod v4, vitest, pnpm workspaces, changesets. `SKIP_SIMPLE_GIT_HOOKS=1` on every commit. Commit trailer exactly `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`. `env -u GH_TOKEN -u GITHUB_TOKEN gh ...` for gh CLI.

**Spec:** `docs/superpowers/specs/2026-06-10-domain-surface-identity-ops-design.md`

**Repo paths:**
- langium-zod: `/Users/pmouli/GitHub.nosync/active/ts/langium-zod`
- rune: `/Users/pmouli/GitHub.nosync/active/ts/rune-langium`

---

## File Structure

### langium-zod (Stream A — release 0.8.2)
| File | Action |
|------|--------|
| `packages/langium-zod/src/emitters/namespace-ops.ts` | **Modify** — `NamespaceOpsOptions.identity` + `emitRemoveByIdentity` + path resolver |
| `packages/langium-zod/test/unit/namespace-ops.test.ts` | **Modify** — `removeX` emission tests (single + nested path; absent → none) |
| `packages/langium-zod/src/types.ts` | **Modify** — add `namespaceOpsIdentity?: Record<string,string>` to `ZodGeneratorConfig` |
| `packages/langium-zod/src/api.ts` | **Modify** — thread `identity` into `generateNamespaceOps` call |
| `packages/langium-zod/src/generate.ts` | **Modify** — pass `namespaceOpsIdentity` into `generateNamespaceOpsSchemas` |
| `packages/langium-zod/src/cli.ts` | **Modify** — `--domain-surface-config <path>` flag: read+parse, set `namespaceOpsIdentity` |
| `.changeset/identity-ops.md` | **Create** — patch bump |

### rune (Streams B/C/D)
| File | Action |
|------|--------|
| `packages/core/domain-surface.config.json` | **Create** — `{ identity: {...} }` |
| `packages/core/package.json` | **Modify** — `generate:domain` gains `--domain-surface-config` |
| `pnpm-workspace.yaml` | **Modify** — override + `minimumReleaseAgeExclude` → `0.8.2` |
| `packages/core/src/generated/domain.ts` | **Regenerate** (additive) |
| `packages/visual-editor/src/store/editor-store.ts` | **Modify** — delegate mutations to `DomainOps` |
| `packages/visual-editor/test/store/editor-store-identity-ops.test.ts` | **Create** — characterization tests |

---

## ⚠️ Cross-repo barrier

Tasks 9+ (rune regen + cutover) are **blocked** until `langium-zod@0.8.2` is published and pinned. Tasks 1–8 (langium-zod + rune config/script) are unblocked. Do not commit a regenerated `domain.ts` to rune until 0.8.2 is the installed version — rune's `check-generated` CI regenerates from the installed langium-zod and would drift.

---

## Task 1: Emitter — `identity` option + single-segment `removeX`

**Files:**
- Modify: `packages/langium-zod/src/emitters/namespace-ops.ts`
- Test: `packages/langium-zod/test/unit/namespace-ops.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/langium-zod/test/unit/namespace-ops.test.ts` (the `dataType`/`attributeType` fixtures already exist there):

```ts
it('emits removeX matching by single-segment identity path when configured', () => {
  const result = generateNamespaceOps([dataType, attributeType], { identity: { Attribute: 'name' } });
  expect(result).toContain('export function removeAttribute(node: Dehydrated<ast.Data>, attribute: Dehydrated<ast.Attribute>): boolean {');
  expect(result).toContain('const __k = attribute.name;');
  expect(result).toContain('const __i = node.attributes.findIndex((e) => e.name === __k);');
  expect(result).toContain('if (__i < 0) return false;');
  expect(result).toContain('node.attributes.splice(__i, 1);');
  expect(result).toContain('return true;');
});

it('emits no removeX when the element type is absent from identity config', () => {
  const result = generateNamespaceOps([dataType, attributeType]); // no options
  expect(result).not.toContain('export function removeAttribute(');
  const withEmpty = generateNamespaceOps([dataType, attributeType], { identity: {} });
  expect(withEmpty).not.toContain('export function removeAttribute(');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && npx vitest run packages/langium-zod/test/unit/namespace-ops.test.ts`
Expected: FAIL — `generateNamespaceOps` takes 1 arg / `removeAttribute` not emitted.

- [ ] **Step 3: Implement minimal code**

In `namespace-ops.ts`, add the options type, a single-segment emitter, and thread it through. Above `generateNamespaceOps`:

```ts
export interface NamespaceOpsOptions {
  /** element type name → identity field path (e.g. "name", "typeCall.type.$refText"). */
  identity?: Record<string, string>;
}

/** Emits `removeX(node, item): boolean` matching node.<field>[].<idPath> === item.<idPath>. */
function emitRemoveByIdentity(
  typeName: string,
  fieldName: string,
  elementType: string,
  idPath: string,
): string {
  const Singular = capitalize(singularize(fieldName));
  const T = astRef(typeName);
  const E = astRef(elementType);
  const param = safeParam(singularize(fieldName));
  // Single-segment access for now (nested handled in Task 2).
  const access = (recv: string) => `${recv}.${idPath}`;
  return [
    `  export function remove${Singular}(node: Dehydrated<${T}>, ${param}: Dehydrated<${E}>): boolean {`,
    `    const __k = ${access(param)};`,
    `    const __i = node.${fieldName}.findIndex((e) => ${access('e')} === __k);`,
    `    if (__i < 0) return false;`,
    `    node.${fieldName}.splice(__i, 1);`,
    `    return true;`,
    `  }`,
  ].join('\n');
}
```

Change `emitNamespace` to accept and use the identity map. Replace its signature and the array branch:

```ts
function emitNamespace(
  descriptor: ZodObjectTypeDescriptor,
  objectTypeNames: Set<string>,
  identity: Record<string, string>,
): string | null {
  const ops: string[] = [];
  for (const prop of descriptor.properties) {
    const kind = classifyField(prop.name, prop.zodType, prop.optional, objectTypeNames);
    if (kind.tag === 'skip') continue;
    if (kind.tag === 'array') {
      ops.push(emitArrayOps(descriptor.name, kind));
      const idPath = identity[kind.elementType];
      if (idPath) {
        ops.push(emitRemoveByIdentity(descriptor.name, kind.fieldName, kind.elementType, idPath));
      }
    } else if (kind.tag === 'singleNode') {
      ops.push(emitSingleNodeOps(descriptor.name, kind));
    } else if (kind.tag === 'crossRef') {
      ops.push(emitCrossRefOps(descriptor.name, kind));
    }
  }
  if (ops.length === 0) return null;
  return [`export namespace ${descriptor.name} {`, ops.join('\n'), '}'].join('\n');
}
```

Update `generateNamespaceOps` signature + the `emitNamespace` call:

```ts
export function generateNamespaceOps(types: ZodTypeDescriptor[], options?: NamespaceOpsOptions): string {
  const objectTypes = types.filter((t): t is ZodObjectTypeDescriptor => t.kind === 'object');
  const objectTypeNames = new Set(objectTypes.map((t) => t.name));
  const identity = options?.identity ?? {};

  const parts: string[] = [];
  parts.push(`import * as ast from './ast.js';`);
  parts.push(`import type { Dehydrated } from '../serializer/dehydrated.js';`);
  parts.push('');
  parts.push(`export * from './ast.js';`);

  for (const descriptor of objectTypes) {
    const ns = emitNamespace(descriptor, objectTypeNames, identity);
    if (ns === null) continue;
    parts.push('');
    parts.push(`export type ${descriptor.name} = ast.${descriptor.name};`);
    parts.push(ns);
  }

  return parts.join('\n') + '\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && npx vitest run packages/langium-zod/test/unit/namespace-ops.test.ts`
Expected: PASS (all, including the two new cases).

- [ ] **Step 5: Type-check**

Run: `cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && pnpm --filter langium-zod run type-check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/emitters/namespace-ops.ts packages/langium-zod/test/unit/namespace-ops.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(namespace-ops): config-driven removeX op (single-segment identity)

generateNamespaceOps gains NamespaceOpsOptions.identity (element type → field
path). Array fields whose element type has an identity path get a
removeX(node, item): boolean matching by that field; returns whether removed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Emitter — nested identity path (optional chaining)

**Files:**
- Modify: `packages/langium-zod/src/emitters/namespace-ops.ts`
- Test: `packages/langium-zod/test/unit/namespace-ops.test.ts`

- [ ] **Step 1: Write the failing test**

Add a `ChoiceOption`-like fixture and assert optional-chained access. Insert into the test file:

```ts
const choiceOptionType: ZodTypeDescriptor = {
  name: 'ChoiceOption',
  kind: 'object',
  properties: [
    { name: '$type', zodType: { kind: 'literal', value: 'ChoiceOption' }, optional: false },
    { name: 'typeCall', zodType: { kind: 'reference', typeName: 'TypeCall' }, optional: false },
  ],
};
const choiceType: ZodTypeDescriptor = {
  name: 'Choice',
  kind: 'object',
  properties: [
    { name: '$type', zodType: { kind: 'literal', value: 'Choice' }, optional: false },
    { name: 'attributes', zodType: { kind: 'array', element: { kind: 'reference', typeName: 'ChoiceOption' } }, optional: false },
  ],
};

it('emits removeX with optional-chained access for nested identity paths', () => {
  const result = generateNamespaceOps([choiceType, choiceOptionType], {
    identity: { ChoiceOption: 'typeCall.type.$refText' },
  });
  expect(result).toContain('export function removeAttribute(node: Dehydrated<ast.Choice>, attribute: Dehydrated<ast.ChoiceOption>): boolean {');
  expect(result).toContain('const __k = attribute.typeCall?.type?.$refText;');
  expect(result).toContain('const __i = node.attributes.findIndex((e) => e.typeCall?.type?.$refText === __k);');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && npx vitest run packages/langium-zod/test/unit/namespace-ops.test.ts`
Expected: FAIL — current `access` emits `attribute.typeCall.type.$refText` (no `?.`).

- [ ] **Step 3: Implement optional-chained path access**

In `emitRemoveByIdentity`, replace the single-segment `access` helper from Task 1 with a path-splitting version. The first segment is a direct access (the receiver is always defined); every subsequent segment is optional-chained so a missing intermediate yields `undefined` (no throw) and simply fails to match:

```ts
  const segs = idPath.split('.');
  const access = (recv: string) =>
    segs.length === 1
      ? `${recv}.${segs[0]}`
      : `${recv}.${segs[0]}` + segs.slice(1).map((seg) => `?.${seg}`).join('');
```

This keeps Task 1's single-segment output exactly (`attribute.name`, `e.name`) and produces `attribute.typeCall?.type?.$refText` / `e.typeCall?.type?.$refText` for the nested path.

- [ ] **Step 4: Run test to verify both pass**

Run: `cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && npx vitest run packages/langium-zod/test/unit/namespace-ops.test.ts`
Expected: PASS — Task 1 single-segment assertions still hold; the nested test sees `attribute.typeCall?.type?.$refText` and `e.typeCall?.type?.$refText`.

- [ ] **Step 5: Full emitter suite + type-check**

Run:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
npx vitest run && pnpm --filter langium-zod run type-check
```
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/emitters/namespace-ops.ts packages/langium-zod/test/unit/namespace-ops.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(namespace-ops): optional-chained access for nested identity paths

removeX matches nested identity paths (e.g. typeCall.type.$refText) with
optional chaining on intermediate segments so a missing link fails to match
rather than throwing.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Thread `identity` through the API + config types

**Files:**
- Modify: `packages/langium-zod/src/types.ts`
- Modify: `packages/langium-zod/src/api.ts`

- [ ] **Step 1: Add config field**

In `packages/langium-zod/src/types.ts`, inside `interface ZodGeneratorConfig`, add:

```ts
  /**
   * Element-type → identity field path map for namespace-ops `removeX` emission.
   * e.g. `{ Attribute: 'name', ChoiceOption: 'typeCall.type.$refText' }`.
   */
  namespaceOpsIdentity?: Record<string, string>;
```

- [ ] **Step 2: Thread into the emitter call**

In `packages/langium-zod/src/api.ts`, in `generateNamespaceOpsSchemas`, change the emitter call:

```ts
  const source = generateNamespaceOps(descriptors, { identity: config.namespaceOpsIdentity });
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod && pnpm --filter langium-zod run type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/types.ts packages/langium-zod/src/api.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(api): thread namespaceOpsIdentity into generateNamespaceOps

ZodGeneratorConfig.namespaceOpsIdentity flows to the emitter's identity option.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: CLI `--domain-surface-config` flag

**Files:**
- Modify: `packages/langium-zod/src/cli.ts`
- Modify: `packages/langium-zod/src/generate.ts`

- [ ] **Step 1: Parse + load the config file in cli.ts**

In `packages/langium-zod/src/cli.ts`, alongside the other `getArgValue` calls (near `namespaceOpsOutFlagValue`):

```ts
  const domainSurfaceConfigFlagValue = getArgValue(args, '--domain-surface-config');
```

After the `userConfig` is assembled (near the other conditional `userConfig = { ...userConfig, ... }` blocks), add:

```ts
  if (domainSurfaceConfigFlagValue) {
    const dsPath = resolve(process.cwd(), domainSurfaceConfigFlagValue);
    if (!existsSync(dsPath)) {
      throw new Error(`--domain-surface-config file not found: ${dsPath}`);
    }
    const parsed = JSON.parse(readFileSync(dsPath, 'utf8')) as { identity?: Record<string, string> };
    userConfig = { ...userConfig, namespaceOpsIdentity: parsed.identity ?? {} };
  }
```

Add `readFileSync` to the `node:fs` import at the top of `cli.ts` (currently `import { existsSync } from 'node:fs';` → `import { existsSync, readFileSync } from 'node:fs';`).

Add the flag to the `--help` text block (near line 123, after `--namespace-ops-out`):

```
	--domain-surface-config <path> Identity-field map for namespace-ops removeX emission
```

- [ ] **Step 2: Pass it through generate.ts**

In `packages/langium-zod/src/generate.ts`, in the `namespaceOps` block, add `namespaceOpsIdentity` to the `generateNamespaceOpsSchemas` call:

```ts
  if (userConfig.namespaceOps) {
    const namespaceOpsOutputPath = userConfig.namespaceOpsOutputPath ?? join(outDir, 'domain-ops.ts');
    generateNamespaceOpsSchemas({
      grammar,
      namespaceOpsOutputPath,
      include: restConfig.include,
      exclude: restConfig.exclude,
      namespaceOpsIdentity: userConfig.namespaceOpsIdentity,
    });
    console.log(`✓ Generated namespace-ops surface → ${namespaceOpsOutputPath}`);
  }
```

Also add `namespaceOpsIdentity` to the destructured `restConfig` exclusion list at the top of "4. Generate schemas" so it isn't spread into `generateZodSchemas`:

```ts
    namespaceOps: _namespaceOps,
    namespaceOpsOutputPath: _namespaceOpsOutputPath,
    namespaceOpsIdentity: _namespaceOpsIdentity,
    ...restConfig
```

- [ ] **Step 3: Build + smoke-test the CLI against a temp config**

Run:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
pnpm --filter langium-zod build && pnpm --filter langium-zod run type-check
```
Expected: build + type-check clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git add packages/langium-zod/src/cli.ts packages/langium-zod/src/generate.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(cli): --domain-surface-config flag for namespace-ops identity map

Reads { identity: {...} } JSON and feeds it to the namespace-ops emitter so
removeX ops are generated for the declared element types.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Release langium-zod 0.8.2

**Files:**
- Create: `.changeset/identity-ops.md`

- [ ] **Step 1: Verify against the real rune grammar (local end-to-end)**

Generate rune's `domain.ts` with the local build + a temp config and confirm `removeAttribute` appears and the file type-checks. Run:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium/packages/core
cat > /tmp/ds.json <<'JSON'
{ "identity": { "Attribute": "name", "RosettaEnumValue": "name", "ChoiceOption": "typeCall.type.$refText" } }
JSON
node /Users/pmouli/GitHub.nosync/active/ts/langium-zod/packages/langium-zod/dist/cli.js generate --namespace-ops --namespace-ops-out src/generated/domain.ts --domain-surface-config /tmp/ds.json
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git checkout -- packages/core/src/generated/zod-schemas.ts
pnpm oxfmt packages/core/src/generated/domain.ts
rg -n "export function removeAttribute|export function removeEnumValue|export function removeInput" packages/core/src/generated/domain.ts | head
pnpm --filter @rune-langium/core run type-check
```
Expected: `removeAttribute`/`removeEnumValue`/`removeInput` present; core type-check clean. **Then revert** the local regen (it will be re-done from the published 0.8.2 in Task 9):
```bash
git checkout -- packages/core/src/generated/domain.ts
```

- [ ] **Step 2: Create the changeset**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
cat > .changeset/identity-ops.md <<'EOF'
---
"langium-zod": patch
---

namespace-ops: config-declared identity `removeX` op. `generateNamespaceOps`
accepts `{ identity: Record<elementType, fieldPath> }`; array fields whose
element type has an identity path get `removeX(node, item): boolean` matching
by that path (optional-chained for nested paths). New CLI flag
`--domain-surface-config <path>` loads the `{ identity: {...} }` map.
EOF
git add .changeset/identity-ops.md
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
chore: changeset for namespace-ops identity removeX (0.8.2)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Branch, push, PR, merge → version PR → publish**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/langium-zod
git checkout -b feat/namespace-ops-identity
git push -u origin feat/namespace-ops-identity
env -u GH_TOKEN -u GITHUB_TOKEN gh pr create --base develop --head feat/namespace-ops-identity \
  --title "feat(namespace-ops): config-declared identity removeX" \
  --body "Adds NamespaceOpsOptions.identity + --domain-surface-config; emits removeX(node, item): boolean keyed by a declared field path. Unit tests cover single + nested paths."
```
Wait for CI green, then merge; merge the auto-opened "Version Packages" PR; confirm `npm view langium-zod version` is `0.8.2`. (This is the same flow used for 0.8.1.)

Expected: `langium-zod@0.8.2` on npm.

---

## Task 6: rune — `domain-surface.config.json`

**Files:**
- Create: `packages/core/domain-surface.config.json`

- [ ] **Step 1: Confirm identity fields against ast.ts**

Run:
```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
for T in Attribute RosettaEnumValue ChoiceOption; do
  echo "--- $T ---"; awk "/export interface $T /{f=1} f{print} f&&/^}/{exit}" packages/core/src/generated/ast.ts | rg "name|typeCall"
done
```
Expected: `Attribute.name`, `RosettaEnumValue.name` present; `ChoiceOption` has `typeCall` (no `name`). Confirms the three entries.

- [ ] **Step 2: Create the config**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
cat > packages/core/domain-surface.config.json <<'EOF'
{
  "identity": {
    "Attribute": "name",
    "RosettaEnumValue": "name",
    "ChoiceOption": "typeCall.type.$refText"
  }
}
EOF
```

- [ ] **Step 3: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/core/domain-surface.config.json
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(core): add domain-surface.config.json declaring element identity fields

Declares per-element-type identity field paths consumed by langium-zod's
namespace-ops emitter to generate removeX ops. Keyed to exactly the cutover's
name/$refText removes (Attribute, RosettaEnumValue, ChoiceOption).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: rune — wire `generate:domain` script

**Files:**
- Modify: `packages/core/package.json`

- [ ] **Step 1: Update the script**

In `packages/core/package.json`, change `generate:domain`:

```json
"generate:domain": "langium-zod generate --namespace-ops --namespace-ops-out src/generated/domain.ts --domain-surface-config domain-surface.config.json && oxfmt src/generated/domain.ts",
```

- [ ] **Step 2: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/core/package.json
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
build(core): pass --domain-surface-config to generate:domain

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: rune — pin 0.8.2 + regenerate `domain.ts`  ⛔ requires Task 5 published

**Files:**
- Modify: `pnpm-workspace.yaml`
- Regenerate: `packages/core/src/generated/domain.ts`

- [ ] **Step 1: Bump override + release-age exclude (transient both-version exclude)**

In `pnpm-workspace.yaml`: set `overrides.langium-zod: 0.8.2`; set `minimumReleaseAgeExclude` to list **both** `langium-zod@0.8.1` and `langium-zod@0.8.2`.

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm install
```
Expected: resolves `langium-zod` to `0.8.2` (`+1 -1`). Then drop `langium-zod@0.8.1` from `minimumReleaseAgeExclude`, leaving only `0.8.2`, and re-run `pnpm install` — expected clean, no churn.

- [ ] **Step 2: Regenerate + revert incidental zod drift**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/core generate:domain
git checkout -- packages/core/src/generated/zod-schemas.ts
rg -n "export function removeAttribute|removeEnumValue|removeInput" packages/core/src/generated/domain.ts | head
```
Expected: `removeAttribute`/`removeEnumValue`/`removeInput` present in `domain.ts`.

- [ ] **Step 3: Determinism + consumer type-checks**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
h1=$(shasum packages/core/src/generated/domain.ts); pnpm --filter @rune-langium/core generate:domain >/dev/null 2>&1; git checkout -- packages/core/src/generated/zod-schemas.ts; h2=$(shasum packages/core/src/generated/domain.ts)
[ "${h1%% *}" = "${h2%% *}" ] && echo "DETERMINISTIC" || echo "DRIFT"
pnpm --filter @rune-langium/core test
for p in core visual-editor lsp-server cli; do pnpm --filter @rune-langium/$p run type-check; done
```
Expected: `DETERMINISTIC`; core 241+ tests pass; all four type-check clean.

- [ ] **Step 4: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add pnpm-workspace.yaml pnpm-lock.yaml packages/core/src/generated/domain.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
feat(core): regenerate domain.ts with identity removeX ops (langium-zod 0.8.2)

Bumps langium-zod 0.8.1→0.8.2 and regenerates domain.ts. Additive: each
member-container namespace gains removeX(node, item): boolean keyed by the
config-declared identity path. Barrel unchanged.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Characterization tests for editor-store removes (RED-first)  ⛔ requires Task 8

**Files:**
- Create: `packages/visual-editor/test/store/editor-store-identity-ops.test.ts`

This captures the **current** behavior before any cutover so the delegation is provably behavior-preserving. Write tests that drive the store actions and assert the resulting `node.data` array state, including the duplicate-name drain.

- [ ] **Step 1: Write the characterization tests**

Harness pattern (from `packages/visual-editor/test/store/editor-store.test.ts` and `rename-cascade.test.ts`): `createEditorStore()` → `store.getState().loadModels((await parse(src)).value)` → drive via `store.getState().<action>(...)` → read via `store.getState().nodes.find((n) => n.data.name === ...)`, attributes at `(node.data as any).attributes`. Duplicate-named attributes are produced by calling `addAttribute` twice with the same name (it appends unconditionally). Create `packages/visual-editor/test/store/editor-store-identity-ops.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE, ENUM_MODEL_SOURCE, CHOICE_MODEL_SOURCE } from '../helpers/fixture-loader.js';

const attrs = (store: ReturnType<typeof createEditorStore>, id: string) =>
  ((store.getState().nodes.find((n) => n.id === id)!.data as any).attributes ?? []) as Array<{ name?: string; typeCall?: any }>;

describe('editor-store identity mutations (characterization)', () => {
  let store: ReturnType<typeof createEditorStore>;
  beforeEach(() => { store = createEditorStore(); });

  async function loadData(): Promise<string> {
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    return store.getState().nodes.find((n) => n.data.$type === 'Data')!.id;
  }

  it('removeAttribute drains ALL duplicate-named attributes', async () => {
    const id = await loadData();
    store.getState().addAttribute(id, 'dup', 'string', '(1..1)');
    store.getState().addAttribute(id, 'dup', 'string', '(1..1)');
    expect(attrs(store, id).filter((a) => a.name === 'dup')).toHaveLength(2);
    store.getState().removeAttribute(id, 'dup');
    expect(attrs(store, id).filter((a) => a.name === 'dup')).toHaveLength(0);
  });

  it('removeAttribute is a no-op for an absent name', async () => {
    const id = await loadData();
    const before = attrs(store, id).length;
    store.getState().removeAttribute(id, 'does-not-exist');
    expect(attrs(store, id).length).toBe(before);
  });

  it('addAttribute appends (initializing an absent array)', async () => {
    const id = await loadData();
    const before = attrs(store, id).length;
    store.getState().addAttribute(id, 'fresh', 'string', '(1..1)');
    expect(attrs(store, id).map((a) => a.name)).toContain('fresh');
    expect(attrs(store, id).length).toBe(before + 1);
  });

  it('reorderAttribute moves by index', async () => {
    const id = await loadData();
    store.getState().addAttribute(id, 'a', 'string', '(1..1)');
    store.getState().addAttribute(id, 'b', 'string', '(1..1)');
    const names = attrs(store, id).map((a) => a.name);
    const ai = names.indexOf('a'); const bi = names.indexOf('b');
    store.getState().reorderAttribute(id, bi, ai); // move 'b' to a's slot
    const after = attrs(store, id).map((a) => a.name);
    expect(after.indexOf('b')).toBeLessThan(after.indexOf('a'));
  });

  it('removeEnumValue removes by name', async () => {
    store.getState().loadModels((await parse(ENUM_MODEL_SOURCE)).value);
    const id = store.getState().nodes.find((n) => n.data.$type === 'RosettaEnumeration')!.id;
    store.getState().addEnumValue(id, 'TEMP');
    const vals = () => ((store.getState().nodes.find((n) => n.id === id)!.data as any).enumValues ?? []) as Array<{ name: string }>;
    expect(vals().some((v) => v.name === 'TEMP')).toBe(true);
    store.getState().removeEnumValue(id, 'TEMP');
    expect(vals().some((v) => v.name === 'TEMP')).toBe(false);
  });

  it('removeChoiceOption removes the arm matching typeCall.type.$refText', async () => {
    store.getState().loadModels((await parse(CHOICE_MODEL_SOURCE)).value);
    const id = store.getState().nodes.find((n) => n.data.$type === 'Choice')!.id;
    const arm = attrs(store, id)[0];
    const ref = arm?.typeCall?.type?.$refText;
    expect(ref).toBeTruthy();
    const before = attrs(store, id).length;
    store.getState().removeChoiceOption(id, ref as string);
    expect(attrs(store, id).length).toBe(before - 1);
    expect(attrs(store, id).some((o) => o.typeCall?.type?.$refText === ref)).toBe(false);
  });
});
```

If a fixture (`ENUM_MODEL_SOURCE`, `CHOICE_MODEL_SOURCE`) does not yield the expected node `$type`, adjust the fixture import to one that does (check `packages/visual-editor/test/helpers/fixture-loader.ts`). For `removeInputParam`, add an analogous test against `FUNCTION_MODEL_SOURCE` finding a `RosettaFunction` node and asserting on `(data as any).inputs` — only if a function fixture exposes inputs; otherwise note it as covered by the emitter unit test + type-check and skip (do not fabricate a fixture).

- [ ] **Step 2: Run — expect GREEN against current code**

Run: `cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium && pnpm --filter @rune-langium/visual-editor test -- editor-store-identity-ops`
Expected: PASS (these characterize the existing behavior). If any fail, the test is wrong about current behavior — fix the test, not the store.

- [ ] **Step 3: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/visual-editor/test/store/editor-store-identity-ops.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
test(visual-editor): characterize editor-store member-container mutations

Pins current add/remove/reorder behavior (incl. duplicate-name drain) before
cutover to DomainOps so delegation is provably behavior-preserving.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Cut over `removeAttribute` → looped `DomainOps.removeX`  ⛔ requires Task 9

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`removeAttribute`, ~1358)

- [ ] **Step 1: Add the DomainOps import (if absent)**

At the top of `editor-store.ts`, ensure:
```ts
import { DomainOps } from '@rune-langium/core';
```
Check first: `rg -n "DomainOps" packages/visual-editor/src/store/editor-store.ts`. Add only if missing.

- [ ] **Step 2: Replace the in-draft array mutation**

In `removeAttribute`, replace the reverse-loop splice with looped `removeX` dispatched on `$type` (the edge-drop logic and `mutateGraph` wrapper stay unchanged):

```ts
            mutateGraph(set, get, (draft) => {
              const node = draft.nodes.get(nodeId);
              if (node) {
                const d = node.data as AnyGraphNode;
                const key = { name: attrName } as unknown as import('@rune-langium/core').Dehydrated<import('@rune-langium/core').Attribute>;
                if (d.$type === 'Data') {
                  while (DomainOps.Data.removeAttribute(d as any, key)) { /* drain duplicates */ }
                } else if (d.$type === 'Annotation') {
                  while (DomainOps.Annotation.removeAttribute(d as any, key)) { /* drain duplicates */ }
                }
              }
              for (const id of edgeIdsToDrop) draft.edges.delete(id);
            });
```

(The `as any` on `d` bridges the loose `AnyGraphNode` to the op's `Dehydrated<ast.Data>` param; the op only reads `.attributes` + `key.name`. If the project lints against `any`, use a `Dehydrated<Data>`/`Dehydrated<Annotation>` cast instead.)

- [ ] **Step 3: Run the characterization test**

Run: `cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium && pnpm --filter @rune-langium/visual-editor test -- editor-store-identity-ops`
Expected: PASS — identical end-state, duplicates still drained.

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @rune-langium/visual-editor run type-check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
git add packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
refactor(visual-editor): delegate removeAttribute to DomainOps.removeAttribute

Looped removeX drains duplicate-named attributes exactly as the prior reverse
splice. Edge-drop bookkeeping unchanged. Characterization test green.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Cut over `removeEnumValue` → `DomainOps.RosettaEnumeration.removeEnumValue`  ⛔ requires Task 10

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`removeEnumValue`, ~1662)

- [ ] **Step 1: Read the current body**

Run: `sed -n '1662,1694p' packages/visual-editor/src/store/editor-store.ts` and identify the array (`enumValues`) and current removal.

- [ ] **Step 2: Replace with looped removeX**

In the `mutateGraph` draft, for the `RosettaEnumeration` node, replace the current name-based removal with:
```ts
                const key = { name: valueName } as unknown as import('@rune-langium/core').Dehydrated<import('@rune-langium/core').RosettaEnumValue>;
                while (DomainOps.RosettaEnumeration.removeEnumValue(d as any, key)) { /* drain */ }
```
Keep the surrounding `$type === 'RosettaEnumeration'` guard and any edge bookkeeping.

- [ ] **Step 3: Test + type-check + commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/visual-editor test -- editor-store-identity-ops
pnpm --filter @rune-langium/visual-editor run type-check
git add packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
refactor(visual-editor): delegate removeEnumValue to DomainOps

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
Expected: characterization test PASS; type-check clean.

---

## Task 12: Cut over `removeInputParam` → `DomainOps.RosettaFunction.removeInput`  ⛔ requires Task 11

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`removeInputParam`, ~1822)

- [ ] **Step 1: Read the current body**

Run: `sed -n '1810,1840p' packages/visual-editor/src/store/editor-store.ts`. The element type is `Attribute`; the array is `inputs`; the generated op is `DomainOps.RosettaFunction.removeInput` (singular of `inputs`).

- [ ] **Step 2: Replace with looped removeX**

```ts
                const key = { name: paramName } as unknown as import('@rune-langium/core').Dehydrated<import('@rune-langium/core').Attribute>;
                while (DomainOps.RosettaFunction.removeInput(d as any, key)) { /* drain */ }
```
Preserve the `$type === 'RosettaFunction'` guard and any member-array helper currently used (`getMemberArray`). If the current code removed a single index, the loop still matches current behavior for a unique name; confirm against the characterization test.

- [ ] **Step 3: Test + type-check + commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/visual-editor test -- editor-store-identity-ops
pnpm --filter @rune-langium/visual-editor run type-check
git add packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
refactor(visual-editor): delegate removeInputParam to DomainOps.removeInput

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
Expected: PASS; clean.

---

## Task 13: Cut over `removeChoiceOption` → `DomainOps.Choice.removeAttribute`  ⛔ requires Task 12

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`removeChoiceOption`, ~1771)

- [ ] **Step 1: Read the current body**

Run: `sed -n '1771,1792p' packages/visual-editor/src/store/editor-store.ts`. Choice arms live in `attributes` (element `ChoiceOption`), keyed by `typeCall.type.$refText`. The generated op is `DomainOps.Choice.removeAttribute` (identity path `typeCall.type.$refText`).

- [ ] **Step 2: Replace with looped removeX**

```ts
                const key = { typeCall: { type: { $refText: typeName } } } as unknown as import('@rune-langium/core').Dehydrated<import('@rune-langium/core').ChoiceOption>;
                while (DomainOps.Choice.removeAttribute(d as any, key)) { /* drain */ }
```
Keep the `$type === 'Choice'` guard and any edge bookkeeping (choice arms may have ref edges — preserve the drop logic exactly as `removeAttribute` does).

- [ ] **Step 3: Test + type-check + commit**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/visual-editor test -- editor-store-identity-ops
pnpm --filter @rune-langium/visual-editor run type-check
git add packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
refactor(visual-editor): delegate removeChoiceOption to DomainOps.Choice.removeAttribute

Identity keyed by typeCall.type.$refText (config-declared), matching the prior
$refText comparison.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
Expected: PASS; clean.

---

## Task 14: Cut over appends + reorders (grouped)  ⛔ requires Task 13

**Files:**
- Modify: `packages/visual-editor/src/store/editor-store.ts` (`addAttribute`, `addEnumValue`, `addInputParam`, `addCondition`, `addSynonym`, `addAnnotation`, `reorderAttribute`, `reorderEnumValue`, `reorderInputParam`, `reorderCondition`)

For each, replace the hand-rolled `push`/`reorderInPlace` with the generated op, **preserving** the absent-array init guard and `$type` dispatch. Do them one at a time, running the characterization test after each.

- [ ] **Step 1: Appends → `addX`**

For `addAttribute` (Data/Annotation): keep the `newAttr` construction, the edge construction, and the `if (!Array.isArray(dd.attributes)) dd.attributes = []` guard; replace `dd.attributes.push(newAttr)` with:
```ts
                  DomainOps.Data.addAttribute(d as any, newAttr as any);   // or .Annotation per $type
```
Dispatch on `$type` exactly as the current code does. Repeat for `addEnumValue` (`DomainOps.RosettaEnumeration.addEnumValue`), `addInputParam` (`DomainOps.RosettaFunction.addInput`), `addCondition`/`addSynonym`/`addAnnotation` (the namespace + op per the field — confirm op name via `rg "export function add" packages/core/src/generated/domain.ts`). Keep array-init guards.

- [ ] **Step 2: Reorders → `moveXAt`**

For `reorderAttribute`: replace `reorderInPlace(attrs, fromIndex, toIndex)` with:
```ts
              if (d.$type === 'Data') DomainOps.Data.moveAttributeAt(d as any, fromIndex, toIndex);
              else DomainOps.Annotation.moveAttributeAt(d as any, fromIndex, toIndex);
```
Confirm `moveAttributeAt` semantics match `reorderInPlace` for the same `(from, to)` via the characterization test (both are splice-based; verify they agree — if `reorderInPlace` differs from `moveXAt` on edge indices, KEEP `reorderInPlace` and note the divergence rather than changing behavior). Repeat for `reorderEnumValue`/`reorderInputParam`/`reorderCondition`.

- [ ] **Step 3: After each replacement — test**

Run after every single op change: `pnpm --filter @rune-langium/visual-editor test -- editor-store-identity-ops`
Expected: PASS. If a reorder diverges, revert that one op to `reorderInPlace` and document why in a code comment.

- [ ] **Step 4: Type-check + commit (one commit for the group, or per-op)**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/visual-editor run type-check
git add packages/visual-editor/src/store/editor-store.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "$(cat <<'EOF'
refactor(visual-editor): delegate member appends + reorders to DomainOps

addX for appends (array-init guards retained), moveXAt for reorders where it
is behavior-equivalent to reorderInPlace.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Full suites + holistic review  ⛔ requires Task 14

- [ ] **Step 1: Run the full visual-editor + core suites**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/core test
for p in core visual-editor lsp-server cli studio; do pnpm --filter @rune-langium/$p run type-check; done
```
Expected: all green. (Per memory: run the **whole** package suite, not a curated subset — sibling tests may assert old behavior.)

- [ ] **Step 2: Holistic seam review (Opus)**

Dispatch a single reviewer over the entire cutover diff (`git diff origin/master..HEAD -- packages/visual-editor/src/store/editor-store.ts`), checking each delegated op against the behavior it replaced — specifically the duplicate-name drain, array-init guards, edge bookkeeping, and reorder equivalence. (Per memory: per-task reviews miss inverse-pair/seam bugs; the holistic pass is mandatory.)

- [ ] **Step 3: Lint**

```bash
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm --filter @rune-langium/visual-editor lint
pnpm --filter @rune-langium/core lint
```
Expected: clean.

- [ ] **Step 4: Push the rune branch / open PR (confirm with user before any push)**

Do not push without explicit user confirmation. When approved, push the rune commits (Tasks 6–14) and the langium-zod side is already released. rune is merge-commit only.

---

## Build Sequence Summary

```
Stream A (langium-zod 0.8.2): Tasks 1–5 — emitter identity removeX + CLI flag + publish.
Stream B (rune config/script): Tasks 6–7 — config file + generate:domain flag (unblocked).
Stream C (rune regen): Task 8 — BLOCKED on Task 5 published.
Stream D (rune cutover): Tasks 9–15 — BLOCKED on Task 8; characterization-first, one op per task, holistic review last.
```

**Dispatch:** mechanical tasks (1–4, 6–14) → Fable implementer subagents; spec-compliance + code-quality reviews and the Task 15 holistic review → Opus. Task 5 (publish orchestration) and Task 8 Step 1 (release-age dance) → controller (Opus), not a subagent.
