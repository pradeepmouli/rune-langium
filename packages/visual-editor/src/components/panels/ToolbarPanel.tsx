/**
 * ToolbarPanel — Toolbar with fit-view, relayout, and direction controls.
 */

import { useCallback } from 'react';
import type { LayoutDirection } from '../../types.js';

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
      <select
        className="rune-toolbar-select"
        value={currentDirection}
        onChange={(e) => handleDirectionChange(e.target.value as LayoutDirection)}
      >
        <option value="TB">Top → Bottom</option>
        <option value="LR">Left → Right</option>
        <option value="BT">Bottom → Top</option>
        <option value="RL">Right → Left</option>
      </select>
    </div>
  );
}
