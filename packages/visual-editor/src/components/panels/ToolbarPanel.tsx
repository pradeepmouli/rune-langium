/**
 * ToolbarPanel — Toolbar with fit-view, relayout, and direction controls.
 */

import { useCallback } from 'react';
import type { LayoutDirection } from '../../types.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@rune-langium/design-system/ui/select';

export interface ToolbarPanelProps {
  onFitView: () => void;
  onRelayout: (direction?: LayoutDirection) => void;
  currentDirection: LayoutDirection;
}

export function ToolbarPanel({ onFitView, onRelayout, currentDirection }: ToolbarPanelProps) {
  const handleDirectionChange = useCallback(
    (dir: LayoutDirection) => {
      onRelayout(dir);
    },
    [onRelayout]
  );

  return (
    <div className="rune-panel rune-toolbar">
      <button className="rune-toolbar-button" onClick={onFitView} title="Fit view">
        Fit
      </button>
      <button
        className="rune-toolbar-button"
        onClick={() => onRelayout()}
        title="Re-run auto-layout"
      >
        Layout
      </button>
      <Select
        value={currentDirection}
        onValueChange={(val) => handleDirectionChange(val as LayoutDirection)}
      >
        <SelectTrigger className="rune-toolbar-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="TB">Top → Bottom</SelectItem>
          <SelectItem value="LR">Left → Right</SelectItem>
          <SelectItem value="BT">Bottom → Top</SelectItem>
          <SelectItem value="RL">Right → Left</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
