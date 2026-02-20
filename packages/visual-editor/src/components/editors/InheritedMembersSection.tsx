/**
 * InheritedMembersSection — Collapsible display of inherited members.
 *
 * Shows members from each ancestor in a collapsible group, ordered from
 * immediate parent to root. Used in DataTypeForm, EnumForm, and
 * FunctionForm to surface the full inherited interface.
 *
 * @module
 */

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@rune-langium/design-system/ui/collapsible';
import { Badge } from '@rune-langium/design-system/ui/badge';
import type { InheritedGroup } from '../../hooks/useInheritedMembers.js';

export interface InheritedMembersSectionProps {
  /** Groups of inherited members, one per ancestor. */
  groups: InheritedGroup[];
}

export function InheritedMembersSection({ groups }: InheritedMembersSectionProps) {
  if (groups.length === 0) return null;

  const totalCount = groups.reduce((sum, g) => sum + g.members.length, 0);

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground px-1">Inherited ({totalCount})</p>
      {groups.map((group) => (
        <InheritedGroupCollapsible key={group.ancestorName} group={group} />
      ))}
    </div>
  );
}

function InheritedGroupCollapsible({ group }: { group: InheritedGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-2 py-1 text-xs rounded hover:bg-muted/50 transition-colors">
        <ChevronRight
          className={`size-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-medium text-muted-foreground">from {group.ancestorName}</span>
        <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1">
          {group.members.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-4 border-l border-border pl-2 space-y-0.5 py-1">
          {group.members.map((member) => (
            <div
              key={member.name}
              className="flex items-center gap-2 text-xs text-muted-foreground py-0.5 px-1"
            >
              <span className="font-mono">{member.name}</span>
              {member.typeName && (
                <span className="text-muted-foreground/60">{member.typeName}</span>
              )}
              {member.cardinality && (
                <span className="text-muted-foreground/40">{member.cardinality}</span>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
