// SPDX-License-Identifier: MIT
// The `rune` oxlint JS plugin (alpha API) — the className-side counterpart to the
// `rune/*` stylelint rules, which only scan `.css` and so are blind to Tailwind
// utilities authored in `.tsx`. As styling moves into `className` (the
// component-override convention), that blind spot is where raw colors and sizes
// regress back in. One plugin exports every `rune/*` rule; each package's
// `.oxlintrc.json` enables the subset it wants (definitions here, activation there).

// ── rune/no-palette-utility ─────────────────────────────────────────
// Bans hardcoded Tailwind palette utilities (`text-slate-500`, `bg-blue-500`, …)
// in string + template literals. Author-time replacement for the former
// file-regex unit test `no-hardcoded-colours.test.ts`.
const PALETTE =
  /\b(text|bg|border|ring|fill|stroke|from|via|to|placeholder|caret|accent|outline|divide|shadow|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]+\b/;

function checkPalette(context, node, str) {
  if (typeof str !== 'string') return;
  const m = str.match(PALETTE);
  if (m) {
    context.report({
      message: `Hardcoded Tailwind palette utility "${m[0]}" bypasses the token layer — use a design-system primitive or a var(--color-*) token.`,
      node
    });
  }
}

const noPaletteUtility = {
  create(context) {
    return {
      Literal(node) {
        checkPalette(context, node, node.value);
      },
      TemplateElement(node) {
        checkPalette(context, node, node.value?.cooked ?? node.value?.raw);
      }
    };
  }
};

// ── rune/no-raw-arbitrary-value ─────────────────────────────────────
// Bans raw, untokenized values inside Tailwind *arbitrary* utilities
// (`text-[11px]`, `bg-[#fff]`). Scoped to the two FULLY tokenized dimensions, so
// a literal is always avoidable drift:
//   • font-size — the `--text-*` scale (text-3xs/2xs/xs/sm/md/base/lg/xl/…)
//   • color     — the `--color-*` palette (hex has no place in an arbitrary)
// Deliberately NOT flagged (legitimate bespoke layout, not token violations):
//   • non-text length arbitraries — `w-[480px]`, `max-w-[22rem]`, `min-w-[8rem]`,
//     `tracking-[0.12em]`, `ring-[3px]` (one-off sizing has no token to snap to)
//   • token references — `text-[length:var(--text-2xs)]`, `bg-[var(--chiclet-bg)]`,
//     and the v4 shorthand `text-(--text-2xs)` (these ARE the desired form)

// `<prefix>-[<inner>]` — capture the utility prefix and the bracketed payload.
const ARBITRARY = /\b([a-z][a-z-]*)-\[([^\]]+)\]/g;
// A bare length payload (font-size): `11px`, `10.5px`, `0.5rem`, `-1px`, `1em`.
const RAW_LENGTH = /^-?\d*\.?\d+(px|rem|em)$/;
// A hex color anywhere in the payload: `#fff`, `#0a0a0a`, `#00000080`.
const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;
// A leading Tailwind data-type hint: `length:`, `color:`, `family-name:`, …
// Stripped before the font-size test so `text-[length:11px]` is analyzed as the
// raw `11px` it really is (the hint must not be a hiding place for raw values).
const TYPE_HINT = /^[a-z-]+:/;

function checkArbitrary(context, node, str) {
  if (typeof str !== 'string' || !str.includes('[')) return;
  ARBITRARY.lastIndex = 0;
  let m;
  while ((m = ARBITRARY.exec(str))) {
    const [whole, prefix, inner] = m;
    // Hex is never the tokenized form — flag it ANYWHERE in the payload, even
    // when a var() also appears (e.g. `linear-gradient(#fff, var(--bg))`). NOT
    // gated on a var-free payload: a token reference alongside a raw hex must
    // not launder the hex through.
    if (HEX_COLOR.test(inner)) {
      context.report({
        message: `Raw hex color "${whole}" bypasses the token layer — use a var(--color-*) token (or a semantic utility) instead of a hardcoded color.`,
        node
      });
      continue;
    }
    // Raw font-size: a bare length under `text-`, AFTER stripping any data-type
    // hint. `text-[11px]` and `text-[length:11px]` both reduce to `11px` and are
    // flagged; `text-[length:var(--text-2xs)]` reduces to a var() ref, which is
    // not a bare length and so passes (the tokenized form we want).
    if (prefix === 'text' && RAW_LENGTH.test(inner.replace(TYPE_HINT, ''))) {
      context.report({
        message: `Raw font-size "${whole}" bypasses the type scale — use a --text-* utility (text-3xs/2xs/xs/sm/md/base/lg/xl) instead of an arbitrary length.`,
        node
      });
    }
  }
}

const noRawArbitraryValue = {
  create(context) {
    return {
      Literal(node) {
        checkArbitrary(context, node, node.value);
      },
      TemplateElement(node) {
        checkArbitrary(context, node, node.value?.cooked ?? node.value?.raw);
      }
    };
  }
};

// ── rune/no-raw-node-id ─────────────────────────────────────────────
// Guards the Phase 3A′ `::`→`.` node-id migration. Visual-editor node ids are
// now built EXCLUSIVELY via `qualifiedExportPath`/`makeNodeId` (dot form,
// `namespace.Name`). A residual `::` sitting BETWEEN two interpolations is the
// retired raw node-id construction (`${ns}::${name}`) and is always wrong now.
//
// Precision (false positives block CI), reasoning from the oxlint TemplateLiteral
// AST where `quasis.length === expressions.length + 1`:
//   • quasi `i` is preceded by expression `i-1` (iff `i > 0`) and followed by
//     expression `i` (iff `i < expressions.length`). The `${a}::${b}` shape is an
//     INTERIOR quasi: an expression on BOTH sides ⇒ `i > 0 && i < expressions.length`.
// Deliberately NOT flagged (legitimate `::`, not node-id construction):
//   • a LEADING/TRAILING quasi with `::` — `builtin::${t}` (quasi[0], nothing
//     before it) is the namespace-less builtin prefix, not `${a}::${b}`.
//   • dotted ids `${ns}.${name}` (interior quasi has no `::`).
//   • instance-path / expansion-key composition in the sanctioned sites —
//     `structure-graph-adapter.ts` (`${id}::__base::${parentId}`),
//     `structure-view.ts` (`${namespaceUri}::${typeId}::${attrName}`) — and the
//     node-id construction site `node-projection.ts`. These three are allow-listed
//     by filename (`context.filename`, an absolute path in the oxlint alpha API).
const NODE_ID_ALLOWLIST = ['node-projection.ts', 'structure-graph-adapter.ts', 'structure-view.ts'];

const noRawNodeId = {
  create(context) {
    const filename = String(context.filename ?? '');
    if (NODE_ID_ALLOWLIST.some((f) => filename.endsWith(f))) return {};
    return {
      TemplateLiteral(node) {
        const { quasis, expressions } = node;
        for (let i = 0; i < quasis.length; i++) {
          // Interior quasi only: an interpolation on BOTH sides.
          if (i === 0 || i >= expressions.length) continue;
          const cooked = quasis[i].value?.cooked ?? quasis[i].value?.raw;
          if (typeof cooked === 'string' && cooked.includes('::')) {
            context.report({
              message:
                'Raw node-id construction `${a}::${b}` is retired (Phase 3A′ `::`→`.`) — build node ids via `makeNodeId`/`qualifiedExportPath` (dot form `namespace.Name`).',
              node
            });
            return;
          }
        }
      }
    };
  }
};

// ── rune/no-raw-edge-id ─────────────────────────────────────────────
// Guards against inline edge-id template construction outside the
// sanctioned `node-projection.ts` chokepoint. All edge ids must be
// built via `makeEdgeId`; inline templates like `` `${a}--extends--${b}` ``
// or `` `${a}--attribute-ref--${label}--${b}` `` are retired.
//
// Detection: an interior quasi (an interpolation on BOTH sides) whose
// cooked text contains `--<edgekind>--` (the EDGE_SEPARATOR + kind +
// EDGE_SEPARATOR pattern, e.g. `--extends--`, `--attribute-ref--`, …).
// Only `node-projection.ts` is allow-listed (the factory itself).
//
// Precision note: we test interior quasis only (same logic as
// `no-raw-node-id`) to avoid flagging string constants that happen to
// contain an edge-kind word without being an id template.
const EDGE_KIND_QUASI = /--(?:extends|attribute-ref|choice-option|enum-extends|type-alias-ref)--/;
const EDGE_ID_ALLOWLIST = ['node-projection.ts'];

const noRawEdgeId = {
  create(context) {
    const filename = String(context.filename ?? '');
    if (EDGE_ID_ALLOWLIST.some((f) => filename.endsWith(f))) return {};
    return {
      TemplateLiteral(node) {
        const { quasis, expressions } = node;
        for (let i = 0; i < quasis.length; i++) {
          // Interior quasi only: an interpolation on BOTH sides.
          if (i === 0 || i >= expressions.length) continue;
          const cooked = quasis[i].value?.cooked ?? quasis[i].value?.raw;
          if (typeof cooked === 'string' && EDGE_KIND_QUASI.test(cooked)) {
            context.report({
              message:
                'Raw edge-id construction via template literal is retired — build edge ids via `makeEdgeId` (node-projection.ts chokepoint).',
              node
            });
            return;
          }
        }
      }
    };
  }
};

export default {
  meta: { name: 'rune' },
  rules: {
    'no-palette-utility': noPaletteUtility,
    'no-raw-arbitrary-value': noRawArbitraryValue,
    'no-raw-node-id': noRawNodeId,
    'no-raw-edge-id': noRawEdgeId
  }
};
