// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type React from 'react';

export interface ProblemRow {
  path: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ProblemsPanelProps {
  problems?: ReadonlyArray<ProblemRow>;
  onJump?: (row: ProblemRow) => void;
}

export function ProblemsPanel({ problems = [], onJump }: ProblemsPanelProps): React.ReactElement {
  return (
    <section
      role="region"
      aria-label="Problems"
      data-testid="panel-problems"
      data-component="workspace.problems"
    >
      <h2>Problems</h2>
      {problems.length === 0 ? (
        <p>No problems detected in the workspace.</p>
      ) : (
        <ul>
          {problems.map((p, i) => (
            <li key={`${p.path}:${p.line}:${i}`}>
              <button type="button" onClick={() => onJump?.(p)}>
                <span data-severity={p.severity}>{p.severity}</span> {p.path}:{p.line}:{p.column} —{' '}
                {p.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
