// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Button, Kbd, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@rune-langium/design-system';
import { Download, Settings } from 'lucide-react';

// J13 export perspective: tooltip on the icon-only Generate button.
export const GenerateButton = () => (
  <TooltipProvider>
    <div className="p-10">
      <Tooltip open>
        <TooltipTrigger render={<Button variant="secondary" size="icon" aria-label="Generate code" />}>
          <Download className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="bottom">Generate TypeScript output</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);

// J15 settings: tooltip with a keyboard shortcut hint.
export const SettingsShortcut = () => (
  <TooltipProvider>
    <div className="p-10">
      <Tooltip open>
        <TooltipTrigger render={<Button variant="secondary" size="icon" aria-label="Settings" />}>
          <Settings className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="right">
          <span className="flex items-center gap-2">
            Open settings <Kbd>Cmd+,</Kbd>
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);
