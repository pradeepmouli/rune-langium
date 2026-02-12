# Examples

Usage examples for packages in this monorepo.

## Core Parser

```typescript
import { parse } from '@rune-langium/core';

const result = await parse(`
  namespace demo

  type Foo:
    bar string (1..1)
`);
console.log(result.value);
```

## Visual Editor — Quick Start

```tsx
import { RuneTypeGraph } from '@rune-langium/visual-editor';
import '@rune-langium/visual-editor/styles.css';
import { parse } from '@rune-langium/core';

const result = await parse(`
  namespace demo
  type Foo:
    bar string (1..1)
`);

function App() {
  return (
    <RuneTypeGraph
      models={[result.value]}
      config={{ layout: { direction: 'TB' } }}
    />
  );
}
```

## Visual Editor — Filtering

```tsx
<RuneTypeGraph
  models={models}
  config={{
    filters: {
      kinds: ['data', 'enum'],
      namespaces: ['demo'],
      namePattern: 'Foo',
      hideOrphans: true
    }
  }}
/>
```

## Visual Editor — Callbacks

```tsx
<RuneTypeGraph
  models={models}
  callbacks={{
    onNodeSelect: (node) => console.log('Selected:', node?.id),
    onEdgeSelect: (edge) => console.log('Edge:', edge?.id),
    onViewportChange: (vp) => console.log('Viewport:', vp),
    onGraphReady: () => console.log('Graph loaded')
  }}
/>
```

## Visual Editor — Ref API (Imperative Control)

```tsx
import { useRef } from 'react';
import type { RuneTypeGraphRef } from '@rune-langium/visual-editor';

function App() {
  const ref = useRef<RuneTypeGraphRef>(null);

  return (
    <>
      <button onClick={() => ref.current?.fitView()}>Fit</button>
      <button onClick={() => ref.current?.search('Foo')}>Search</button>
      <button onClick={() => ref.current?.relayout('LR')}>Layout LR</button>
      <RuneTypeGraph ref={ref} models={models} />
    </>
  );
}
```

## Visual Editor — Detail Panel

```tsx
import { RuneTypeGraph, DetailPanel } from '@rune-langium/visual-editor';

function App() {
  return (
    <RuneTypeGraph models={models}>
      <DetailPanel />
    </RuneTypeGraph>
  );
}
```

## Visual Editor — Custom Styling

```tsx
<RuneTypeGraph
  models={models}
  config={{
    nodeStyles: {
      data: { headerColor: '#3b82f6', borderRadius: 8 },
      choice: { headerColor: '#f59e0b' },
      enum: { headerColor: '#10b981' }
    },
    edgeStyles: {
      inheritance: { stroke: '#3b82f6', strokeWidth: 2 },
      'attribute-ref': { stroke: '#6b7280', strokeDasharray: '5,5' }
    }
  }}
/>
```

## Visual Editor — Multiple Models

```tsx
const result1 = await parse(source1);
const result2 = await parse(source2);

<RuneTypeGraph
  models={[result1.value, result2.value]}
  config={{ layout: { direction: 'LR', separation: { node: 80, rank: 200 } } }}
/>
```
    return createSuccessResponse(data);
  } catch (error) {
    // Retry with exponential backoff
    await delay(1000);

    try {
      const response = await fetch(url);
      const data = await response.json();
      return createSuccessResponse(data);
    } catch {
      return createErrorResponse('Failed to fetch data');
    }
  }
}
```

## Running Examples

All examples are part of the test suite:

```bash
# Run integration tests with examples
pnpm run test integration.test.ts

# Run specific example
pnpm run test -- --grep "should process user data"

# Watch examples as you edit
pnpm run test:watch -- integration.test.ts
```

## More Information

- [Core Package](../packages/core/README.md)
- [Utils Package](../packages/utils/README.md)
- [Test Utils Package](../packages/test-utils/README.md)
- [Workspace Guide](./WORKSPACE.md)
- [Testing Guide](./TESTING.md)
- [Development Workflow](./DEVELOPMENT.md)
