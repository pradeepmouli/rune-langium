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

export function ConnectionStatus({ state, onReconnect }: ConnectionStatusProps) {
  const statusLabel = STATUS_LABELS[state.status] ?? state.status;
  const modeLabel = MODE_LABELS[state.mode] ?? state.mode;

  const showReconnect =
    onReconnect !== undefined && state.status !== 'connected' && state.status !== 'connecting';

  const dotClass = `studio-connection-status__dot studio-connection-status__dot--${state.status}`;

  return (
    <div className="studio-connection-status" role="status">
      <span className={dotClass} />
      <span>
        {statusLabel}
        {modeLabel && state.status === 'connected' ? ` (${modeLabel})` : ''}
      </span>
      {state.status === 'error' && state.error && (
        <span className="studio-connection-status__error">
          {state.error.message}
        </span>
      )}
      {showReconnect && (
        <button
          className="studio-connection-status__reconnect"
          onClick={onReconnect}
          aria-label="Reconnect"
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
