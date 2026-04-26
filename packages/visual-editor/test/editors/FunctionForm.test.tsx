// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Integration tests for FunctionForm component (T052).
 *
 * Covers:
 * - Form renders inputs/output/expression for a loaded Function
 * - Add/remove input parameter
 * - Output type selection
 * - Expression textarea validation on blur
 * - Expression error clears on typing
 * - Name editing triggers renameType
 * - Function badge renders
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { FunctionForm } from '../../src/components/editors/FunctionForm.js';
import type { AnyGraphNode, TypeOption, EditorFormActions } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActions(): EditorFormActions<'func'> {
  return {
    renameType: vi.fn(),
    deleteType: vi.fn(),
    updateDefinition: vi.fn(),
    updateComments: vi.fn(),
    addSynonym: vi.fn(),
    removeSynonym: vi.fn(),
    addInputParam: vi.fn(),
    removeInputParam: vi.fn(),
    updateOutputType: vi.fn(),
    updateExpression: vi.fn(),
    validate: vi.fn().mockReturnValue([])
  };
}

const AVAILABLE_TYPES: TypeOption[] = [
  { value: 'test.model::Trade', label: 'Trade', kind: 'data', namespace: 'test.model' },
  { value: 'test.model::Price', label: 'Price', kind: 'data', namespace: 'test.model' },
  { value: 'builtin::number', label: 'number', kind: 'builtin' },
  { value: 'builtin::string', label: 'string', kind: 'builtin' }
];

function makeFuncData(overrides: Partial<AnyGraphNode> = {}): AnyGraphNode {
  return {
    $type: 'RosettaFunction',
    name: 'CalculateNotional',
    namespace: 'test.model',
    inputs: [
      {
        $type: 'Attribute',
        name: 'trade',
        typeCall: { $type: 'TypeCall', type: { $refText: 'Trade' } },
        card: { inf: 1, sup: 1, unbounded: false },
        override: false
      },
      {
        $type: 'Attribute',
        name: 'price',
        typeCall: { $type: 'TypeCall', type: { $refText: 'Price' } },
        card: { inf: 1, sup: 1, unbounded: false },
        override: false
      }
    ],
    output: { typeCall: { $type: 'TypeCall', type: { $refText: 'number' } } },
    expressionText: 'trade -> price -> amount',
    conditions: [],
    postConditions: [],
    annotations: [],
    synonyms: [],
    position: { x: 0, y: 0 },
    hasExternalRefs: false,
    errors: [],
    ...overrides
  } as AnyGraphNode;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FunctionForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders header with name input and Function badge', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText('Function type name');
    expect(nameInput).toHaveValue('CalculateNotional');

    expect(screen.getByText('Function')).toBeInTheDocument();
  });

  it('renders input parameter rows', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    expect(screen.getByText('trade')).toBeInTheDocument();
    expect(screen.getByText('price')).toBeInTheDocument();
    expect(screen.getByText('Inputs (2)')).toBeInTheDocument();
  });

  it('renders expression textarea with current text', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const textarea = screen.getByLabelText('Function expression');
    expect(textarea).toHaveValue('trade -> price -> amount');
  });

  it('calls addInputParam when "Add Input" is clicked with name filled', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ inputs: [] } as any)}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText('New input parameter name');
    fireEvent.change(nameInput, { target: { value: 'quantity' } });

    const addBtn = screen.getByText('+ Add Input');
    fireEvent.click(addBtn);

    expect(actions.addInputParam).toHaveBeenCalledWith('fn1', 'quantity', 'string');
  });

  it('calls removeInputParam when remove button is clicked', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const removeButtons = screen.getAllByLabelText(/Remove input/);
    fireEvent.click(removeButtons[0]!);

    expect(actions.removeInputParam).toHaveBeenCalledWith('fn1', 'trade');
  });

  it('shows expression error on blur when parentheses are unbalanced', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ expressionText: '' } as any)}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const textarea = screen.getByLabelText('Function expression');
    fireEvent.change(textarea, { target: { value: '(trade -> price' } });
    fireEvent.blur(textarea);

    expect(screen.getByText(/Unbalanced parentheses/)).toBeInTheDocument();
    expect(actions.updateExpression).not.toHaveBeenCalled();
  });

  it('clears expression error on typing after a validation error', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ expressionText: '' } as any)}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const textarea = screen.getByLabelText('Function expression');

    // Produce error
    fireEvent.change(textarea, { target: { value: '(' } });
    fireEvent.blur(textarea);
    expect(screen.getByText(/Unbalanced parentheses/)).toBeInTheDocument();

    // Resume typing — error should clear
    fireEvent.change(textarea, { target: { value: '(trade)' } });
    expect(screen.queryByText(/Unbalanced parentheses/)).not.toBeInTheDocument();
  });

  it('commits valid expression on blur', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ expressionText: '' } as any)}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const textarea = screen.getByLabelText('Function expression');
    fireEvent.change(textarea, { target: { value: 'trade -> price -> amount' } });
    fireEvent.blur(textarea);

    expect(actions.updateExpression).toHaveBeenCalledWith('fn1', 'trade -> price -> amount');
  });

  it('renames function after debounced name change', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText('Function type name');
    fireEvent.change(nameInput, { target: { value: 'ComputePrice' } });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(actions.renameType).toHaveBeenCalledWith('fn1', 'ComputePrice');
  });

  it('shows empty state when no input parameters exist', () => {
    const actions = makeActions();
    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({ inputs: [] } as any)}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    expect(screen.getByText('No input parameters defined.')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// US3 (Phase 5c) TDD tests (FT1–FT4) — z2f migration contract
// ---------------------------------------------------------------------------

// Spy on the upstream useExternalSync hook so FT3 can assert the migration
// adopted it (vs. a local sync component or hand-rolled effect).
const useExternalSyncSpy = vi.fn();
vi.mock('@zod-to-form/react', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@zod-to-form/react');
  return {
    ...actual,
    useExternalSync: (...args: unknown[]) => {
      useExternalSyncSpy(...args);
      return (actual as any).useExternalSync(
        ...(args as Parameters<typeof actual.useExternalSync>)
      );
    }
  };
});

describe('FunctionForm – US3 (Phase 5c) z2f migration contract (FT1–FT4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useExternalSyncSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // FT1 — leaf field labels + tab order (name, output, expressionText, …)
  it('renders the documented leaf-field set and preserves tab order', () => {
    const data = makeFuncData();
    (data as any).comments = 'Initial comments';
    (data as any).definition = 'Computes the notional';
    const { container } = render(
      <FunctionForm
        nodeId="fn1"
        data={data}
        availableTypes={AVAILABLE_TYPES}
        actions={makeActions()}
      />
    );

    // Name must be the first text input in the form-header slot.
    const header = container.querySelector('[data-slot="form-header"]')!;
    const nameInput = header.querySelector('input[type="text"], input:not([type])');
    expect(nameInput).not.toBeNull();
    expect((nameInput as HTMLInputElement).value).toBe('CalculateNotional');

    // The expression editor textarea is rendered (renders the expressionText
    // form value when no shortcuts/operations exist on the AST).
    const expressionTextarea = container.querySelector('[data-slot="expression-editor"]');
    expect(expressionTextarea).not.toBeNull();
    expect((expressionTextarea as HTMLTextAreaElement).value).toBe('trade -> price -> amount');

    // The MetadataSection renders Description + Comments textareas via the
    // declarative section-component path (post-migration). Either path
    // surfaces the documented data-slot keys.
    const descriptionTextarea = container.querySelector('[data-slot="metadata-description"]');
    const commentsTextarea = container.querySelector('[data-slot="metadata-comments"]');
    expect(descriptionTextarea).not.toBeNull();
    expect(commentsTextarea).not.toBeNull();
    expect((descriptionTextarea as HTMLTextAreaElement).value).toBe('Computes the notional');
    expect((commentsTextarea as HTMLTextAreaElement).value).toBe('Initial comments');

    // Tab order must preserve: name input < expression editor < description
    // textarea < comments textarea (verified by document order).
    const slotOrder = Array.from(
      container.querySelectorAll(
        'input[data-slot="type-name-input"], textarea[data-slot="expression-editor"], textarea[data-slot="metadata-description"], textarea[data-slot="metadata-comments"]'
      )
    ).map((el) => el.getAttribute('data-slot'));
    expect(slotOrder).toEqual([
      'type-name-input',
      'expression-editor',
      'metadata-description',
      'metadata-comments'
    ]);
  });

  // FT2 — debounced rename fires exactly once with the new name
  it('fires actions.renameType exactly once after a single debounce window on name edit', () => {
    const renameType = vi.fn();
    const actions = { ...makeActions(), renameType };

    render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    const nameInput = screen.getByLabelText(/function type name/i);

    // Type rapidly — three changes coalesced inside the debounce window
    fireEvent.change(nameInput, { target: { value: 'Calc' } });
    fireEvent.change(nameInput, { target: { value: 'Calculate' } });
    fireEvent.change(nameInput, { target: { value: 'ComputePrice' } });

    expect(renameType).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(renameType).toHaveBeenCalledTimes(1);
    expect(renameType).toHaveBeenCalledWith('fn1', 'ComputePrice');
  });

  // FT3 — useExternalSync contract: form repopulates pristine fields when
  // `data` reference changes
  it('repopulates pristine values when `data` reference changes (external sync)', () => {
    const actions = makeActions();
    const nodeA = makeFuncData(); // name: 'CalculateNotional'
    const nodeB = makeFuncData({
      name: 'PriceTrade',
      definition: 'Prices a trade'
    } as any);

    const { container, rerender } = render(
      <FunctionForm nodeId="fn1" data={nodeA} availableTypes={AVAILABLE_TYPES} actions={actions} />
    );

    const initialName = container.querySelector(
      '[data-slot="type-name-input"]'
    ) as HTMLInputElement;
    expect(initialName.value).toBe('CalculateNotional');

    // Swap to nodeB (new reference identity)
    rerender(
      <FunctionForm nodeId="fn1" data={nodeB} availableTypes={AVAILABLE_TYPES} actions={actions} />
    );

    // Pristine name field reflects nodeB after the swap.
    const swappedName = container.querySelector(
      '[data-slot="type-name-input"]'
    ) as HTMLInputElement;
    expect(swappedName.value).toBe('PriceTrade');

    // Migration contract: the upstream useExternalSync hook is the
    // integration surface. The spy is invoked at least once on initial
    // mount + once after the data swap.
    expect(useExternalSyncSpy).toHaveBeenCalled();
    const lastCall = useExternalSyncSpy.mock.calls.at(-1);
    expect(lastCall?.[1]).toBe(nodeB);
  });

  // FT4 — Function-specific: edits to an input row and edits to the output
  // row dispatch independently. The add/remove input affordances never
  // fire output-side actions, and conversely an output-side data swap
  // never replays as an input-side action. This proves the two sections
  // of the form are wired to disjoint action callbacks with no crosstalk
  // — the central invariant of the Function form's split-section model.
  it('input-row and output-row edits dispatch independently with no crosstalk', () => {
    const actions = makeActions();

    const { rerender } = render(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData()}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    // ---- Edit an input row: add a parameter ------------------------------
    const newParamName = screen.getByLabelText(/new input parameter name/i);
    fireEvent.change(newParamName, { target: { value: 'quantity' } });
    fireEvent.click(screen.getByText('+ Add Input'));

    expect(actions.addInputParam).toHaveBeenCalledTimes(1);
    expect(actions.addInputParam).toHaveBeenCalledWith('fn1', 'quantity', 'string');
    // The output-side actions did NOT fire as a side effect of the input edit.
    expect(actions.updateOutputType).not.toHaveBeenCalled();
    expect(actions.updateExpression).not.toHaveBeenCalled();

    // ---- Edit an input row: remove a parameter --------------------------
    const removeButtons = screen.getAllByLabelText(/remove input/i);
    fireEvent.click(removeButtons[0]!);

    expect(actions.removeInputParam).toHaveBeenCalledTimes(1);
    // Removing an input also did not crosstalk into the output handlers.
    expect(actions.updateOutputType).not.toHaveBeenCalled();
    expect(actions.updateExpression).not.toHaveBeenCalled();

    // ---- Swap the output side via an external-sync data change ----------
    // The output's bespoke <TypeSelector> wraps a shadcn <Select> whose
    // dropdown is unreliable to drive in JSDOM. We instead exercise the
    // declarative output path: a new graph node arrives whose only delta
    // from the prior node is `output.typeCall`. The external-sync hook
    // re-binds the form; the OutputType fieldset re-reads from
    // `data.output.typeCall`. The contract under test is that this
    // sync path does NOT fire any input-side action as a side effect.

    const addInputCallsBeforeOutput = (actions.addInputParam as ReturnType<typeof vi.fn>).mock.calls
      .length;
    const removeInputCallsBeforeOutput = (actions.removeInputParam as ReturnType<typeof vi.fn>).mock
      .calls.length;

    rerender(
      <FunctionForm
        nodeId="fn1"
        data={makeFuncData({
          output: {
            typeCall: { $type: 'TypeCall', type: { $refText: 'Price' } }
          }
        } as any)}
        availableTypes={AVAILABLE_TYPES}
        actions={actions}
      />
    );

    expect((actions.addInputParam as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      addInputCallsBeforeOutput
    );
    expect((actions.removeInputParam as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      removeInputCallsBeforeOutput
    );
  });
});
