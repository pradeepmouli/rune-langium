/**
 * ToolbarPanel — Toolbar with fit-view, relayout, and direction controls.
 *
 * Uses shadcn/ui Button, Select, Tooltip and lucide-react icons.
 */

import { useCallback } from 'react';
import { Maximize, LayoutGrid } from 'lucide-react';
import { Button } from '@rune-langium/design-system/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@rune-langium/design-system/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@rune-langium/design-system/ui/tooltip';
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
    <TooltipProvider>
      <div className="flex items-center gap-1.5 p-1.5 rounded-lg border bg-card shadow-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onFitView}>
              <Maximize className="size-4" />
              <span className="sr-only">Fit view</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit view</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={() => onRelayout()}>
              <LayoutGrid className="size-4" />
              <span className="sr-only">Re-run auto-layout</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-run auto-layout</TooltipContent>
        </Tooltip>

        <Select
          value={currentDirection}
          onValueChange={(val) => handleDirectionChange(val as LayoutDirection)}
        >
          <SelectTrigger className="h-8 w-35 text-xs">
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
    </TooltipProvider>
  );
}
