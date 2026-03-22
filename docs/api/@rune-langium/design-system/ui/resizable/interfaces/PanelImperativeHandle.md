[**Documentation v0.1.0**](../../../../../README.md)

***

[Documentation](../../../../../README.md) / [@rune-langium/design-system](../../../README.md) / [ui/resizable](../README.md) / PanelImperativeHandle

# Interface: PanelImperativeHandle

Defined in: node\_modules/.pnpm/react-resizable-panels@4.7.2\_react-dom@19.2.4\_react@19.2.4\_\_react@19.2.4/node\_modules/react-resizable-panels/dist/react-resizable-panels.d.ts:203

Imperative Panel API

ℹ️ The `usePanelRef` and `usePanelCallbackRef` hooks are exported for convenience use in TypeScript projects.

## Properties

### collapse

> **collapse**: () => `void`

Defined in: node\_modules/.pnpm/react-resizable-panels@4.7.2\_react-dom@19.2.4\_react@19.2.4\_\_react@19.2.4/node\_modules/react-resizable-panels/dist/react-resizable-panels.d.ts:209

Collapse the Panel to it's `collapsedSize`.

⚠️ This method will do nothing if the Panel is not `collapsible` or if it is already collapsed.

#### Returns

`void`

***

### expand

> **expand**: () => `void`

Defined in: node\_modules/.pnpm/react-resizable-panels@4.7.2\_react-dom@19.2.4\_react@19.2.4\_\_react@19.2.4/node\_modules/react-resizable-panels/dist/react-resizable-panels.d.ts:215

Expand a collapsed Panel to its most recent size.

⚠️ This method will do nothing if the Panel is not currently collapsed.

#### Returns

`void`

***

### getSize

> **getSize**: () => `object`

Defined in: node\_modules/.pnpm/react-resizable-panels@4.7.2\_react-dom@19.2.4\_react@19.2.4\_\_react@19.2.4/node\_modules/react-resizable-panels/dist/react-resizable-panels.d.ts:221

Get the current size of the Panel in pixels as well as a percentage of the parent group (0..100).

#### Returns

`object`

Panel size (in pixels and as a percentage of the parent group)

##### asPercentage

> **asPercentage**: `number`

##### inPixels

> **inPixels**: `number`

***

### isCollapsed

> **isCollapsed**: () => `boolean`

Defined in: node\_modules/.pnpm/react-resizable-panels@4.7.2\_react-dom@19.2.4\_react@19.2.4\_\_react@19.2.4/node\_modules/react-resizable-panels/dist/react-resizable-panels.d.ts:228

The Panel is currently collapsed.

#### Returns

`boolean`

***

### resize

> **resize**: (`size`) => `void`

Defined in: node\_modules/.pnpm/react-resizable-panels@4.7.2\_react-dom@19.2.4\_react@19.2.4\_\_react@19.2.4/node\_modules/react-resizable-panels/dist/react-resizable-panels.d.ts:247

Update the Panel's size.

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

#### Parameters

##### size

`string` \| `number`

New panel size

#### Returns

`void`

Applied size (after validation)
