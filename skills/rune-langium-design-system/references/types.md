# Types & Enums

## tokens

### `Colors`
```ts
typeof colors
```

### `Fonts`
```ts
typeof fonts
```

## react-resizable-panels.d

### `PanelImperativeHandle`
Imperative Panel API

ℹ️ The `usePanelRef` and `usePanelCallbackRef` hooks are exported for convenience use in TypeScript projects.
**Properties:**
- `collapse: () => void` — Collapse the Panel to it's `collapsedSize`.

⚠️ This method will do nothing if the Panel is not `collapsible` or if it is already collapsed.
- `expand: () => void` — Expand a collapsed Panel to its most recent size.

⚠️ This method will do nothing if the Panel is not currently collapsed.
- `getSize: () => { asPercentage: number; inPixels: number }` — Get the current size of the Panel in pixels as well as a percentage of the parent group (0..100).
- `isCollapsed: () => boolean` — The Panel is currently collapsed.
- `resize: (size: string | number) => void` — Update the Panel's size.

Size can be in the following formats:
- Percentage of the parent Group (0..100)
- Pixels
- Relative font units (em, rem)
- Viewport relative units (vh, vw)

ℹ️ Numeric values are assumed to be pixels.
Strings without explicit units are assumed to be percentages (0%..100%).
Percentages may also be specified as strings ending with "%" (e.g. "33%")
Pixels may also be specified as strings ending with the unit "px".
Other units should be specified as strings ending with their CSS property units (e.g. 1rem, 50vh)
