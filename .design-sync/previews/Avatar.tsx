// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import './_studio-dark';
import { Avatar, AvatarFallback } from '@rune-langium/design-system';

// J14 git-sync: signed-in GitHub account chip in the header.
export const AccountChip = () => (
  <div className="flex items-center gap-2">
    <Avatar>
      <AvatarFallback>PM</AvatarFallback>
    </Avatar>
    <span className="text-sm text-foreground">pradeepmouli</span>
  </div>
);

// Collaborator presence stack.
export const PresenceStack = () => (
  <div className="flex -space-x-1">
    {['PM', 'AL', 'JK', 'RS'].map((i) => (
      <Avatar key={i} className="ring-2 ring-background">
        <AvatarFallback>{i}</AvatarFallback>
      </Avatar>
    ))}
  </div>
);

// Sizes via className override.
export const Sizes = () => (
  <div className="flex items-center gap-3">
    <Avatar className="size-6">
      <AvatarFallback className="text-2xs">PM</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>PM</AvatarFallback>
    </Avatar>
    <Avatar className="size-12">
      <AvatarFallback className="text-base">PM</AvatarFallback>
    </Avatar>
  </div>
);
