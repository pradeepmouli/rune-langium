// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ExtendsField — Read-only labelled "Extends" field.
 *
 * Renders a two-row stack: a muted "Extends" label and a GitFork icon
 * alongside a TypeLink for the parent type name. Intended for the read-only
 * panel surfaces (OtherForm and any future read-only form that surfaces
 * inheritance).
 *
 * @module
 */

import { GitFork } from 'lucide-react';
import { TypeLink } from './editors/TypeLink.js';
import type { NavigateToNodeCallback } from '../types.js';

export interface ExtendsFieldProps {
  /** The name of the parent (super) type to display. */
  parentName: string;
  /** Callback to navigate to the parent type's graph node. */
  onNavigateToNode?: NavigateToNodeCallback;
  /** All loaded graph node IDs for resolving the parent type name to a node ID. */
  allNodeIds?: string[];
  /** Additional CSS classes applied to the wrapper div. */
  className?: string;
}

export function ExtendsField({ parentName, onNavigateToNode, allNodeIds, className }: ExtendsFieldProps) {
  return (
    <div data-slot="extends-field" className={`flex flex-col gap-1${className ? ` ${className}` : ''}`}>
      <span className="text-xs font-medium text-muted-foreground">Extends</span>
      <span className="inline-flex items-center gap-1.5 text-sm">
        <GitFork className="size-3.5 text-muted-foreground" />
        <TypeLink
          typeName={parentName}
          onNavigateToNode={onNavigateToNode}
          allNodeIds={allNodeIds}
          className="text-sm"
        />
      </span>
    </div>
  );
}
