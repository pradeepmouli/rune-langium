# T095 — `@zod-to-form/*` consumption audit

Audit of current `packages/visual-editor` usage against the canonical
patterns in the upstream repo at
`/Users/pmouli/GitHub.nosync/active/ts/zod-to-form` (versions 0.7.1 of
core/react/cli, 0.2.1 of vite).

Scope: every divergence is classified as either
**workaround-to-remove** (legacy compatibility shim that the upgrade
should clean up) or **deliberate-keep-with-rationale** (Studio-specific
need that the maintainer should not "fix" back).

---

## Divergence 1 — `MapFormRegistry` declares a local `ZodFormRegistryLike`

**File**: `packages/visual-editor/src/components/forms/MapFormRegistry.ts:31-39`

```ts
interface ZodFormRegistryLike {
  get(schema: ZodType): FormMeta | undefined;
  has(schema: ZodType): boolean;
}
```

The local interface was introduced because `@zod-to-form/core@0.4.0`
didn't cleanly expose its `ZodFormRegistry` type. **Workaround-to-remove**:
`@zod-to-form/core@0.7.x` exports it directly. After the upgrade the
class can `implements ZodFormRegistry` against the upstream type and the
local shim disappears, eliminating the structural-typing risk.

Action: import `ZodFormRegistry` from `@zod-to-form/core`, drop the
local interface.

---

## Divergence 2 — `fieldType` instead of `component`

**Files**: every `FormMeta` literal in
`packages/visual-editor/src/components/forms/*.ts` and
`packages/visual-editor/z2f.config.ts`.

`@zod-to-form` 0.6.0 unified the two prop names that previously coexisted
on `FormMeta` — `fieldType` (passed at registry-time) and `component`
(passed via the field config). The single canonical name is `component`.
**Workaround-to-remove**: every `fieldType:` in our codebase needs to
become `component:`.

The CHANGELOG calls this out as a breaking change. Search-and-replace is
safe because no JSX prop in our codebase uses the literal string
`fieldType:` for any other purpose.

Action: bulk rename `fieldType:` → `component:` across
`packages/visual-editor/src/`.

---

## Divergence 3 — Five separate `scaffold:*Form` scripts in package.json

**File**: `packages/visual-editor/package.json:34-39`

The current build pipeline runs the CLI five times (one per export name)
to produce the committed `forms/generated/*` files. **Workaround-to-remove**:
the Vite plugin's query-string mode (`?z2f`) does this in-process per
import, with no enumeration of exports. Studio doesn't need to know in
advance which schemas need forms — every `?z2f` import generates one
on demand.

Action: delete the five `scaffold:*Form` scripts, the umbrella
`scaffold:forms` script, the `forms/generated/` directory, and the
`@zod-to-form/cli` devDep.

---

## Divergence 4 — Missing `@zod-to-form/core` in dependencies

**File**: `packages/visual-editor/package.json:51`

Only `@zod-to-form/react` is listed as a runtime dep; `core` is in
devDeps because the previous codepath (CLI scaffolds emitting committed
files) only needed `core`'s types, not its runtime. **Workaround-to-remove**:
the post-upgrade runtime path uses `core`'s exported `ZodFormRegistry`
type via an `import type`, but new code touching the registry directly
(per Divergence 1) needs the runtime export. Promote to a real dep.

Action: move `@zod-to-form/core` from devDependencies to dependencies in
the same commit that lands Divergence 1.

---

## Divergence 5 — `@zod-to-form/cli` is in devDeps but the migration removes it

**File**: `packages/visual-editor/package.json:67`

After Divergence 3 the CLI is no longer invoked by any script.
**Workaround-to-remove** as a side-effect of Divergence 3.

Action: drop `@zod-to-form/cli` entirely.

---

## Divergence 6 — `forms/generated/` is checked into source control

**Directory**: `packages/visual-editor/src/components/forms/generated/`

5 generated `.tsx` files committed to VCS. **Workaround-to-remove**:
the Vite plugin produces these as virtual modules at build time. Per
spec FR-Z02 they MUST be deleted from source control + a `.gitignore`
rule must prevent them from creeping back.

Action: `git rm -r packages/visual-editor/src/components/forms/generated/`
+ add `**/forms/generated/` to the package's `.gitignore`.

---

## No deliberate-keep-with-rationale divergences identified.

Every difference between the rune codebase and the upstream canonical
shape is downstream-of-versions, not a Studio-specific need. The
migration is a straight cleanup.

---

## Audit conclusion

The migration is mechanical: drop five scripts, rename a property, swap
one import, delete a directory. No Studio-specific behaviour depends on
any of the divergences listed. Proceed with T096–T108.
