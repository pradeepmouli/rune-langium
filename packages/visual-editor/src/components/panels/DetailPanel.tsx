/**
 * DetailPanel — Type detail sidebar panel.
 *
 * Shows detailed information about the currently selected type node.
 */

import type { TypeNodeData } from '../../types.js';

export interface DetailPanelProps {
  nodeData: TypeNodeData | null;
}

export function DetailPanel({ nodeData }: DetailPanelProps) {
  if (!nodeData) return null;

  return (
    <div className="rune-panel rune-detail-panel">
      <div className="rune-panel-header">{nodeData.name}</div>

      <div className="rune-detail-section">
        <div className="rune-detail-label">Kind</div>
        <div className="rune-detail-value">{nodeData.kind}</div>
      </div>

      <div className="rune-detail-section">
        <div className="rune-detail-label">Namespace</div>
        <div className="rune-detail-value">{nodeData.namespace}</div>
      </div>

      {nodeData.definition && (
        <div className="rune-detail-section">
          <div className="rune-detail-label">Definition</div>
          <div className="rune-detail-value">{nodeData.definition}</div>
        </div>
      )}

      {nodeData.parentName && (
        <div className="rune-detail-section">
          <div className="rune-detail-label">Extends</div>
          <div className="rune-detail-value">{nodeData.parentName}</div>
        </div>
      )}

      {nodeData.members.length > 0 && (
        <div className="rune-detail-section">
          <div className="rune-detail-label">Members</div>
          <div className="rune-detail-members">
            {nodeData.members.map((member) => (
              <div key={member.name} className="rune-detail-member">
                <span>{member.name}</span>
                {member.typeName && (
                  <span className="rune-detail-member-type">: {member.typeName}</span>
                )}
                {member.cardinality && (
                  <span className="rune-detail-member-card"> {member.cardinality}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {nodeData.errors.length > 0 && (
        <div className="rune-detail-section">
          <div className="rune-detail-label">Errors</div>
          {nodeData.errors.map((err, i) => (
            <div key={i} className="rune-node-errors">
              {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
