/**
 * ConnectionStatus — Transport status indicator (T012).
 *
 * Shows current LSP connection mode and status with an optional
 * reconnect button for error/disconnected states.
 */

import type { TransportState } from '../services/transport-provider.js';

export interface ConnectionStatusProps {
  /** Transport state to display. */
  state: TransportState;
  /** Called when user clicks reconnect. Shows button only when provided + not connected. */
  onReconnect?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error'
};

const MODE_LABELS: Record<string, string> = {
  disconnected: '',
  websocket: 'WebSocket',
  embedded: 'Embedded'
};

const STATUS_COLORS: Record<string, string> = {
  disconnected: '#888',
  connecting: '#f5a623',
  connected: '#4caf50',
  error: '#e53935'
};

export function ConnectionStatus({ state, onReconnect }: ConnectionStatusProps) {
  const statusLabel = STATUS_LABELS[state.status] ?? state.status;
  const modeLabel = MODE_LABELS[state.mode] ?? state.mode;
  const color = STATUS_COLORS[state.status] ?? '#888';

  const showReconnect =
    onReconnect !== undefined && state.status !== 'connected' && state.status !== 'connecting';

  return (
    <div
      className="connection-status"
      style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}
      role="status"
    >
      <span
        className="connection-status__dot"
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: color,
          display: 'inline-block'
        }}
      />
      <span className="connection-status__label">
        {statusLabel}
        {modeLabel && state.status === 'connected' ? ` (${modeLabel})` : ''}
      </span>
      {state.status === 'error' && state.error && (
        <span className="connection-status__error" style={{ color: '#e53935' }}>
          {state.error.message}
        </span>
      )}
      {showReconnect && (
        <button
          className="connection-status__reconnect"
          onClick={onReconnect}
          aria-label="Reconnect"
          style={{
            fontSize: '11px',
            padding: '2px 8px',
            cursor: 'pointer',
            border: '1px solid #666',
            borderRadius: '3px',
            background: 'transparent',
            color: 'inherit'
          }}
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
