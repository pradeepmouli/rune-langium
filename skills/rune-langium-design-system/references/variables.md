# Variables & Constants

## `colors`
Rune DSL Design System — TypeScript token exports.

These match the CSS custom properties in theme.css (Refactory Dark palette).
Use for JS-side color references (e.g., ReactFlow config, chart colors).
```ts
const colors: { data: { DEFAULT: "#00D4AA"; bg: "rgba(0, 212, 170, 0.12)"; text: "#00D4AA"; badge: "rgba(0, 212, 170, 0.20)" }; choice: { DEFAULT: "#E8913A"; bg: "rgba(232, 145, 58, 0.12)"; text: "#E8913A"; badge: "rgba(232, 145, 58, 0.20)" }; enum: { DEFAULT: "#8B7BF4"; bg: "rgba(139, 123, 244, 0.12)"; text: "#8B7BF4"; badge: "rgba(139, 123, 244, 0.20)" }; func: { DEFAULT: "#82AAFF"; bg: "rgba(130, 170, 255, 0.12)"; text: "#82AAFF"; badge: "rgba(130, 170, 255, 0.20)" }; edge: { ref: "#5C5C6A" }; status: { success: "#00D4AA"; warning: "#E8913A"; error: "#FF6058"; info: "#82AAFF" }; expr: { arithmetic: { DEFAULT: "#82AAFF"; bg: "rgba(130, 170, 255, 0.12)" }; comparison: { DEFAULT: "#00D4AA"; bg: "rgba(0, 212, 170, 0.12)" }; logic: { DEFAULT: "#C792EA"; bg: "rgba(199, 146, 234, 0.12)" }; navigation: { DEFAULT: "#00D4AA"; bg: "rgba(0, 212, 170, 0.12)" }; collection: { DEFAULT: "#E8913A"; bg: "rgba(232, 145, 58, 0.12)" }; control: { DEFAULT: "#C792EA"; bg: "rgba(199, 146, 234, 0.12)" }; literal: { DEFAULT: "#8A8A96"; bg: "rgba(138, 138, 150, 0.12)" }; reference: { DEFAULT: "#8B7BF4"; bg: "rgba(139, 123, 244, 0.12)" }; placeholder: { DEFAULT: "#5C5C6A"; bg: "rgba(92, 92, 106, 0.10)" } } }
```

## `fonts`
```ts
const fonts: { display: "\"Outfit\", ui-sans-serif, system-ui, sans-serif"; sans: "\"Inter\", ui-sans-serif, system-ui, -apple-system, sans-serif"; mono: "\"JetBrains Mono\", ui-monospace, SFMono-Regular, monospace" }
```

## `radii`
```ts
const radii: { sm: "4px"; md: "6px"; lg: "8px" }
```

## `badgeVariants`
```ts
const badgeVariants: (props?: ConfigVariants<{ variant: { default: string; secondary: string; destructive: string; outline: string; success: string; warning: string; error: string; data: string; enum: string; choice: string; func: string; record: string; typeAlias: string; basicType: string; annotation: string; }; }> & ClassProp) => string
```

## `buttonVariants`
```ts
const buttonVariants: (props?: ConfigVariants<{ variant: { default: string; destructive: string; outline: string; secondary: string; ghost: string; link: string; }; size: { default: string; xs: string; sm: string; lg: string; icon: string; 'icon-xs': string; 'icon-sm': string; 'icon-lg': string; }; }> & ClassProp) => string
```

## `Form`
```ts
const Form: (props: FormProviderProps<TFieldValues, TContext, TTransformedValues>) => Element
```
