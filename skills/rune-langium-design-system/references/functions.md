# Functions

## utils

### `cn`
```ts
cn(inputs: ClassValue[]): string
```
**Parameters:**
- `inputs: ClassValue[]`
**Returns:** `string`

## badge

### `Badge`
```ts
Badge(__namedParameters: ClassAttributes<HTMLSpanElement> & HTMLAttributes<HTMLSpanElement> & VariantProps<(props?: ConfigVariants<{ variant: { default: string; secondary: string; destructive: string; outline: string; success: string; warning: string; error: string; data: string; enum: string; choice: string; func: string; record: string; typeAlias: string; basicType: string; annotation: string; }; }> & ClassProp) => string>): Element
```
**Parameters:**
- `__namedParameters: ClassAttributes<HTMLSpanElement> & HTMLAttributes<HTMLSpanElement> & VariantProps<(props?: ConfigVariants<{ variant: { default: string; secondary: string; destructive: string; outline: string; success: string; warning: string; error: string; data: string; enum: string; choice: string; func: string; record: string; typeAlias: string; basicType: string; annotation: string; }; }> & ClassProp) => string>`
**Returns:** `Element`

## button

### `Button`
```ts
Button(__namedParameters: ClassAttributes<HTMLButtonElement> & ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<(props?: ConfigVariants<{ variant: { default: string; destructive: string; outline: string; secondary: string; ghost: string; link: string; }; size: { default: string; xs: string; sm: string; lg: string; icon: string; 'icon-xs': string; 'icon-sm': string; 'icon-lg': string; }; }> & ClassProp) => string> & { asChild?: boolean }): Element
```
**Parameters:**
- `__namedParameters: ClassAttributes<HTMLButtonElement> & ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<(props?: ConfigVariants<{ variant: { default: string; destructive: string; outline: string; secondary: string; ghost: string; link: string; }; size: { default: string; xs: string; sm: string; lg: string; icon: string; 'icon-xs': string; 'icon-sm': string; 'icon-lg': string; }; }> & ClassProp) => string> & { asChild?: boolean }`
**Returns:** `Element`

## collapsible

### `Collapsible`
```ts
Collapsible(__namedParameters: CollapsibleProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: CollapsibleProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `CollapsibleContent`
```ts
CollapsibleContent(__namedParameters: CollapsibleContentProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: CollapsibleContentProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `CollapsibleTrigger`
```ts
CollapsibleTrigger(__namedParameters: CollapsibleTriggerProps & RefAttributes<HTMLButtonElement>): Element
```
**Parameters:**
- `__namedParameters: CollapsibleTriggerProps & RefAttributes<HTMLButtonElement>`
**Returns:** `Element`

## command

### `Command`
```ts
Command(__namedParameters: Children & Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)> & { label?: string; shouldFilter?: boolean; filter?: CommandFilter; defaultValue?: string; value?: string; onValueChange?: (value: string) => void; loop?: boolean; disablePointerSelection?: boolean; vimBindings?: boolean } & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: Children & Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)> & { label?: string; shouldFilter?: boolean; filter?: CommandFilter; defaultValue?: string; value?: string; onValueChange?: (value: string) => void; loop?: boolean; disablePointerSelection?: boolean; vimBindings?: boolean } & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `CommandEmpty`
```ts
CommandEmpty(__namedParameters: Children & Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)> & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: Children & Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)> & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `CommandGroup`
```ts
CommandGroup(__namedParameters: Children & Omit<Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)>, "heading" | "value"> & { heading?: ReactNode; value?: string; forceMount?: boolean } & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: Children & Omit<Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)>, "heading" | "value"> & { heading?: ReactNode; value?: string; forceMount?: boolean } & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `CommandInput`
```ts
CommandInput(__namedParameters: Omit<Pick<Pick<DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>, "key" | (keyof InputHTMLAttributes<HTMLInputElement>)> & { ref?: Ref<HTMLInputElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof InputHTMLAttributes<HTMLInputElement>)>, "onChange" | "type" | "value"> & { value?: string; onValueChange?: (search: string) => void } & RefAttributes<HTMLInputElement>): Element
```
**Parameters:**
- `__namedParameters: Omit<Pick<Pick<DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>, "key" | (keyof InputHTMLAttributes<HTMLInputElement>)> & { ref?: Ref<HTMLInputElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof InputHTMLAttributes<HTMLInputElement>)>, "onChange" | "type" | "value"> & { value?: string; onValueChange?: (search: string) => void } & RefAttributes<HTMLInputElement>`
**Returns:** `Element`

### `CommandItem`
```ts
CommandItem(__namedParameters: Children & Omit<Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)>, "onSelect" | "disabled" | "value"> & { disabled?: boolean; onSelect?: (value: string) => void; value?: string; keywords?: string[]; forceMount?: boolean } & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: Children & Omit<Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)>, "onSelect" | "disabled" | "value"> & { disabled?: boolean; onSelect?: (value: string) => void; value?: string; keywords?: string[]; forceMount?: boolean } & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `CommandList`
```ts
CommandList(__namedParameters: Children & Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)> & { label?: string } & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: Children & Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)> & { label?: string } & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `CommandSeparator`
```ts
CommandSeparator(__namedParameters: Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)> & { alwaysRender?: boolean } & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: Pick<Pick<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "key" | (keyof HTMLAttributes<HTMLDivElement>)> & { ref?: Ref<HTMLDivElement> } & { asChild?: boolean }, "key" | "asChild" | (keyof HTMLAttributes<HTMLDivElement>)> & { alwaysRender?: boolean } & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

## field

### `Field`
```ts
Field(__namedParameters: ClassAttributes<HTMLDivElement> & HTMLAttributes<HTMLDivElement> & VariantProps<(props?: ConfigVariants<{ orientation: { vertical: string[]; horizontal: string[]; responsive: string[]; }; }> & ClassProp) => string>): Element
```
**Parameters:**
- `__namedParameters: ClassAttributes<HTMLDivElement> & HTMLAttributes<HTMLDivElement> & VariantProps<(props?: ConfigVariants<{ orientation: { vertical: string[]; horizontal: string[]; responsive: string[]; }; }> & ClassProp) => string>`
**Returns:** `Element`

### `FieldLabel`
```ts
FieldLabel(__namedParameters: LabelProps & RefAttributes<HTMLLabelElement>): Element
```
**Parameters:**
- `__namedParameters: LabelProps & RefAttributes<HTMLLabelElement>`
**Returns:** `Element`

### `FieldDescription`
```ts
FieldDescription(__namedParameters: DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>>): Element
```
**Parameters:**
- `__namedParameters: DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>>`
**Returns:** `Element`

### `FieldError`
```ts
FieldError(__namedParameters: ClassAttributes<HTMLDivElement> & HTMLAttributes<HTMLDivElement> & { errors?: ({ message?: string } | undefined)[] }): Element | null
```
**Parameters:**
- `__namedParameters: ClassAttributes<HTMLDivElement> & HTMLAttributes<HTMLDivElement> & { errors?: ({ message?: string } | undefined)[] }`
**Returns:** `Element | null`

### `FieldGroup`
```ts
FieldGroup(__namedParameters: DetailedHTMLProps<HTMLAttributes<HTMLDivElement>>): Element
```
**Parameters:**
- `__namedParameters: DetailedHTMLProps<HTMLAttributes<HTMLDivElement>>`
**Returns:** `Element`

### `FieldLegend`
```ts
FieldLegend(__namedParameters: ClassAttributes<HTMLLegendElement> & HTMLAttributes<HTMLLegendElement> & { variant?: "label" | "legend" }): Element
```
**Parameters:**
- `__namedParameters: ClassAttributes<HTMLLegendElement> & HTMLAttributes<HTMLLegendElement> & { variant?: "label" | "legend" }`
**Returns:** `Element`

### `FieldSeparator`
```ts
FieldSeparator(__namedParameters: ClassAttributes<HTMLDivElement> & HTMLAttributes<HTMLDivElement> & { children?: ReactNode }): Element
```
**Parameters:**
- `__namedParameters: ClassAttributes<HTMLDivElement> & HTMLAttributes<HTMLDivElement> & { children?: ReactNode }`
**Returns:** `Element`

### `FieldSet`
```ts
FieldSet(__namedParameters: DetailedHTMLProps<FieldsetHTMLAttributes<HTMLFieldSetElement>>): Element
```
**Parameters:**
- `__namedParameters: DetailedHTMLProps<FieldsetHTMLAttributes<HTMLFieldSetElement>>`
**Returns:** `Element`

### `FieldContent`
```ts
FieldContent(__namedParameters: DetailedHTMLProps<HTMLAttributes<HTMLDivElement>>): Element
```
**Parameters:**
- `__namedParameters: DetailedHTMLProps<HTMLAttributes<HTMLDivElement>>`
**Returns:** `Element`

### `FieldTitle`
```ts
FieldTitle(__namedParameters: DetailedHTMLProps<HTMLAttributes<HTMLDivElement>>): Element
```
**Parameters:**
- `__namedParameters: DetailedHTMLProps<HTMLAttributes<HTMLDivElement>>`
**Returns:** `Element`

## input

### `Input`
```ts
Input(__namedParameters: DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>>): Element
```
**Parameters:**
- `__namedParameters: DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>>`
**Returns:** `Element`

## label

### `Label`
```ts
Label(__namedParameters: LabelProps & RefAttributes<HTMLLabelElement>): Element
```
**Parameters:**
- `__namedParameters: LabelProps & RefAttributes<HTMLLabelElement>`
**Returns:** `Element`

## popover

### `Popover`
```ts
Popover(__namedParameters: PopoverProps): Element
```
**Parameters:**
- `__namedParameters: PopoverProps`
**Returns:** `Element`

### `PopoverAnchor`
```ts
PopoverAnchor(__namedParameters: PopoverAnchorProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: PopoverAnchorProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `PopoverContent`
```ts
PopoverContent(__namedParameters: PopoverContentProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: PopoverContentProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `PopoverTrigger`
```ts
PopoverTrigger(__namedParameters: PopoverTriggerProps & RefAttributes<HTMLButtonElement>): Element
```
**Parameters:**
- `__namedParameters: PopoverTriggerProps & RefAttributes<HTMLButtonElement>`
**Returns:** `Element`

## resizable

### `ResizableHandle`
```ts
ResizableHandle(__namedParameters: BaseSeparatorAttributes & { className?: string; disabled?: boolean; elementRef?: Ref<HTMLDivElement>; id?: string | number; style?: CSSProperties } & { withHandle?: boolean }): Element
```
**Parameters:**
- `__namedParameters: BaseSeparatorAttributes & { className?: string; disabled?: boolean; elementRef?: Ref<HTMLDivElement>; id?: string | number; style?: CSSProperties } & { withHandle?: boolean }`
**Returns:** `Element`

### `ResizablePanel`
```ts
ResizablePanel(__namedParameters: PanelProps): Element
```
**Parameters:**
- `__namedParameters: PanelProps`
**Returns:** `Element`

### `ResizablePanelGroup`
```ts
ResizablePanelGroup(__namedParameters: GroupProps): Element
```
**Parameters:**
- `__namedParameters: GroupProps`
**Returns:** `Element`

## scroll-area

### `ScrollArea`
```ts
ScrollArea(__namedParameters: ScrollAreaProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: ScrollAreaProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `ScrollBar`
```ts
ScrollBar(__namedParameters: ScrollAreaScrollbarProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: ScrollAreaScrollbarProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

## select

### `Select`
```ts
Select(__namedParameters: SelectSharedProps & { value?: string; defaultValue?: string; onValueChange?: any }): Element
```
**Parameters:**
- `__namedParameters: SelectSharedProps & { value?: string; defaultValue?: string; onValueChange?: any }`
**Returns:** `Element`

### `SelectContent`
```ts
SelectContent(__namedParameters: SelectContentProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: SelectContentProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `SelectGroup`
```ts
SelectGroup(__namedParameters: SelectGroupProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: SelectGroupProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `SelectItem`
```ts
SelectItem(__namedParameters: SelectItemProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: SelectItemProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `SelectLabel`
```ts
SelectLabel(__namedParameters: SelectLabelProps & RefAttributes<HTMLDivElement>): Element
```
**Parameters:**
- `__namedParameters: SelectLabelProps & RefAttributes<HTMLDivElement>`
**Returns:** `Element`

### `SelectScrollDownButton`
```ts

<!-- truncated -->
