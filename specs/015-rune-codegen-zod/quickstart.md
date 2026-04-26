# Quickstart: Rune-Langium Native Code Generators

**Feature**: `015-rune-codegen-zod`
**Phase**: 1 (Design)

This document walks an integrator through each phase of 015. Each
section has copy-pasteable commands and the expected output. No
JVM required.

---

## §1 — Phase 1: Package rename + consumer re-wire

```sh
# 1. Confirm pre-rename baseline passes.
pnpm -r run type-check
# Expected: exit 0 (no errors on master)

# 2. Perform the rename (done in the implementation PR).
#    After checkout of the Phase 1 branch:
pnpm install
# Expected: @rune-langium/codegen-legacy added to workspace symlinks.

# 3. Verify no stale imports remain.
grep -r '"@rune-langium/codegen"' apps/ packages/ \
  --include="*.ts" --include="*.tsx" --include="*.json" \
  | grep -v "codegen-legacy" \
  | grep -v "codegen-worker" \
  | grep -v "codegen-container"
# Expected: no output (all imports migrated)

# 4. Gate: type-check must pass.
pnpm -r run type-check
# Expected: exit 0
```

---

## §2 — Phase 2: First Zod generation (basic types)

After Phase 1, the new `packages/codegen` package exists with the
Zod emitter built. Write a minimal Rune model to test:

```sh
# Write a minimal fixture
cat > /tmp/hello.rune <<'EOF'
namespace hello.world

type Party:
    partyId string (1..1)
    accounts Account (0..*)
    role PartyRole (0..1)

enum PartyRole:
    Client displayName "Client"
    Counterparty displayName "Counterparty"

type Account:
    accountId string (1..1)
    balance number (1..1)
EOF

# Generate Zod schemas (default target)
pnpm rune-codegen /tmp/hello.rune -o /tmp/generated/
# Expected:
#   rune-codegen: generating 'zod' for 1 documents...
#     ✓ hello/world.zod.ts
#   rune-codegen: done (0 errors, 0 warnings) in 0.8s

# Inspect the output
cat /tmp/generated/hello/world.zod.ts
# Expected snippet:
#   import { z } from 'zod';
#   ...
#   export const PartyRoleEnum = z.enum(['Client', 'Counterparty']);
#   export const PartyRoleDisplayNames: Record<PartyRole, string> = { ... };
#   export const AccountSchema = z.object({
#     accountId: z.string(),
#     balance: z.number(),
#   });
#   export const PartySchema = z.object({
#     partyId: z.string(),
#     accounts: z.array(AccountSchema),
#     role: PartyRoleEnum.optional(),
#   });
#   export type Party = z.infer<typeof PartySchema>;

# Type-check the emitted output
cd /tmp/generated && npx tsc --noEmit --strict --moduleResolution bundler
# Expected: exit 0
```

---

## §3 — Phase 3: Condition validation (expression transpiler)

Add a condition to the model and verify it validates at runtime:

```sh
cat > /tmp/hello-cond.rune <<'EOF'
namespace hello.world

type UnitType:
    a string (0..1)
    b string (0..1)
    c string (0..1)
    condition OneOf:
        one-of [a, b, c]
EOF

pnpm rune-codegen /tmp/hello-cond.rune -o /tmp/generated-cond/
# Expected: exit 0, hello/world.zod.ts written

# Behavioral test (Node.js script):
cat > /tmp/test-cond.mjs <<'EOF'
import { UnitTypeSchema } from '/tmp/generated-cond/hello/world.zod.js';

const valid = UnitTypeSchema.safeParse({ a: 'present' });
const zeroPresent = UnitTypeSchema.safeParse({});
const twoPresent = UnitTypeSchema.safeParse({ a: 'x', b: 'y' });

console.assert(valid.success === true, 'valid case failed');
console.assert(zeroPresent.success === false, 'zero-present case should fail');
console.assert(twoPresent.success === false, 'two-present case should fail');

const msg = zeroPresent.error.errors[0].message;
console.assert(msg.includes('OneOf'), `error message must name condition, got: ${msg}`);

console.log('All assertions passed.');
EOF

node /tmp/test-cond.mjs
# Expected: All assertions passed.
```

---

## §4 — Phase 4: JSON Schema and TypeScript class targets

```sh
# JSON Schema target
pnpm rune-codegen /tmp/hello.rune --target json-schema -o /tmp/generated-json/
# Expected:
#   ✓ hello/world.schema.json

cat /tmp/generated-json/hello/world.schema.json | head -20
# Expected:
#   {
#     "$schema": "https://json-schema.org/draft/2020-12/schema",
#     "$id": "hello/world.schema.json",
#     "title": "hello.world",
#     "$defs": {
#       "Party": {
#         "type": "object",
#         "properties": {
#           "partyId": { "type": "string" },
#           "accounts": { "type": "array", "items": { "$ref": "#/$defs/Account" } },
#           "role": { "$ref": "#/$defs/PartyRole" }
#         },
#         "required": ["partyId"],
#         ...

# Validate JSON Schema output against 2020-12 meta-schema
npx ajv validate \
  --spec=draft2020 \
  -s /tmp/generated-json/hello/world.schema.json \
  -d /tmp/generated-json/hello/world.schema.json
# Expected: valid

# TypeScript class target
pnpm rune-codegen /tmp/hello.rune --target typescript -o /tmp/generated-ts/
# Expected:
#   ✓ hello/world.ts

# Confirm no Zod imports
grep "from 'zod'" /tmp/generated-ts/hello/world.ts
# Expected: no output (zero Zod imports)

# Type-check
cd /tmp/generated-ts && npx tsc --noEmit --strict --moduleResolution bundler
# Expected: exit 0

# Verify from() and type guard work
cat > /tmp/test-ts.mjs <<'EOF'
import { Party, isParty } from '/tmp/generated-ts/hello/world.js';

const p = Party.from({ partyId: 'P001', accounts: [], role: undefined });
console.assert(p instanceof Party, 'from() must return a Party instance');

const guard = isParty({ partyId: 'P001', accounts: [] });
console.assert(guard === true, 'isParty must return true for valid shape');

console.log('TypeScript target assertions passed.');
EOF

node /tmp/test-ts.mjs
# Expected: TypeScript target assertions passed.
```

---

## §5 — Phase 5: Studio live-preview integration

```sh
# Start Studio in dev mode
pnpm dev:studio &
DEV_PID=$!
sleep 5

# Open in browser (manual step)
open http://localhost:5173/
```

**Browser test**:

1. Open `http://localhost:5173/` and load the small fixture above
   via **File → Open** (or drag the `/tmp/hello.rune` file onto the
   Studio).
2. The right-hand panel should show the **Code Preview** panel with
   "Zod" selected in the target switcher.
3. The panel MUST render `PartySchema`, `AccountSchema`, and
   `PartyRoleEnum` within 500ms of the Studio's first successful
   build phase. (SC-004.)
4. Add a new attribute: type `age number (0..1)` after `role`. Within
   500ms, the panel MUST re-render and show `age: z.number().optional()`.
5. Introduce a syntax error (delete `:` from `type Party:`). The
   panel MUST show the amber "Outdated — fix errors to refresh"
   status and retain the last good output. (FR-017.)
6. Fix the error. The panel MUST re-render within 500ms. (FR-017.)
7. Click on the `PartySchema` line in the preview panel. The source
   editor MUST navigate to and highlight the `type Party:` line
   in `hello.rune`. (FR-018.)
8. Switch the target switcher to **JSON Schema**. Within 500ms, the
   panel MUST show the `$schema` block and `"$defs": { "Party": … }`.
   Clicking on `"$defs"."Party"` MUST navigate to the `type Party:`
   source line. (FR-018.)
9. Switch to **TypeScript**. Within 500ms, the panel MUST show
   `class Party implements PartyShape { … }`. Clicking on the `class
   Party` line MUST navigate to the source. (FR-018, US4 scenario 4.)

```sh
# Teardown
kill $DEV_PID
```

---

## §6 — CDM smoke test (Tier 2)

```sh
# Run the full CDM smoke test (Tier 2 — no snapshot committed)
pnpm --filter @rune-langium/codegen test cdm-smoke
# Expected:
#   ✓ CDM tsc --noEmit (zod target) — 0 errors
#   ✓ CDM tsc --noEmit (json-schema target) — 0 errors
#   ✓ CDM tsc --noEmit (typescript target) — 0 errors
#   ✓ JSON battery: one-of (valid) accepted
#   ✓ JSON battery: one-of (invalid) rejected — message: "OneOf"
#   ... (one pass + one fail case per condition kind)
#   all tests passed in < 30s

# Performance check — must be under 30 seconds total
time pnpm rune-codegen packages/curated-schema/fixtures/cdm/ --target zod -o /tmp/cdm-out/
# Expected: real < 30s
```

---

## §8 — Rune `func` → TypeScript function (US6, Phase 8b)

The TypeScript target now emits `func` declarations as module-level `export function`
statements. This section walks through the **AddTwo** worked example from the spec.

### 8.1 Write a Rune func

```sh
cat > /tmp/add-two.rune <<'EOF'
namespace "demo.math"
version "1"

func AddTwo:
    inputs:
        a int (1..1)
        b int (1..1)
    output:
        r int (1..1)

    set r:
        a + b
EOF
```

### 8.2 Generate TypeScript

```sh
pnpm rune-codegen /tmp/add-two.rune --target typescript -o /tmp/func-out/
# Expected:
#   rune-codegen: generating 'typescript' for 1 documents...
#     ✓ demo/math.ts
#   rune-codegen: done (0 errors, 0 warnings)
```

### 8.3 Inspect the output

```sh
cat /tmp/func-out/demo/math.ts
# Expected output (simplified):
#
#   // SPDX-License-Identifier: MIT
#   // Generated by @rune-langium/codegen — do not edit
#   // Source namespace: demo.math
#
#   // --- rune-codegen runtime helpers (inlined) ---
#   const runeCheckOneOf = ...
#   const runeCount = ...
#   const runeAttrExists = ...
#   // --- end runtime helpers ---
#
#   // (functions emitted by Phase 8b appear below this line)
#
#   export function AddTwo(input: { a: number; b: number }): number {
#     let result: number;
#     result = input.a + input.b;
#     return result;
#   }
```

### 8.4 Type-check the output

```sh
cd /tmp/func-out && npx tsc --noEmit --strict --moduleResolution bundler
# Expected: exit 0 (zero errors)
```

### 8.5 Call the function at runtime

```js
// test-add-two.mjs
import { AddTwo } from '/tmp/func-out/demo/math.js';

const result = AddTwo({ a: 3, b: 4 });
console.assert(result === 7, `expected 7, got ${result}`);
console.log('AddTwo(3, 4) =', result);
// Expected: AddTwo(3, 4) = 7
```

### 8.6 Array output (accumulator pattern)

For funcs with `(0..*)` output cardinality, the emitter uses `const result: T[] = []`
and `result.push(...)`:

```rune
func CollectItems:
    inputs:
        value int (1..1)
    output:
        r int (0..*)

    add r:
        value
```

Emitted as:

```ts
export function CollectItems(input: { value: number }): number[] {
  const result: number[] = [];
  result.push(input.value);
  return result;
}
```

### 8.7 Alias (shortcut) bindings

```rune
func AliasFunc:
    inputs:
        value int (1..1)
    output:
        r int (1..1)

    alias x:
        value

    set r:
        x
```

Emitted as:

```ts
export function AliasFunc(input: { value: number }): number {
  let result: number;
  const x = input.value;
  result = x;
  return result;
}
```

### 8.8 Zod/JSON Schema: silent skip (FR-031)

The Zod and JSON Schema targets silently skip `func` declarations:

```sh
pnpm rune-codegen /tmp/add-two.rune --target zod -o /tmp/func-zod-out/
cat /tmp/func-zod-out/demo/math.zod.ts | grep "AddTwo"
# Expected: no output (funcs silently skipped)

pnpm rune-codegen /tmp/add-two.rune --target json-schema -o /tmp/func-json-out/
cat /tmp/func-json-out/demo/math.schema.json | grep "AddTwo"
# Expected: no output (funcs silently skipped)
```

---

## §7 — Final acceptance gate

```sh
# Full test suite
pnpm -r test
# Expected: all tests pass (no regression on baseline)

# Type-check
pnpm -r run type-check
# Expected: exit 0, clean

# Tier 1 fixture diffs — determinism check (SC-007)
pnpm --filter @rune-langium/codegen test fixture
# Expected: all fixture tests pass (byte-identical output)

# Re-run fixture test a second time to confirm determinism
pnpm --filter @rune-langium/codegen test fixture
# Expected: same pass, same output (same bytes as prior run)
```
