/**
 * ConnectionStatus — Transport status indicator (T012).
 *
 * Shows current LSP connection mode and status with an optional
 * reconnect button for error/disconnected states.
 */

import type { TransportState } from '../services/transport-provider.js';
import { cn } from '@/lib/utils.js';
import { Button } from './ui/button.js';

export interface ConnectionStatusProps {
  /** Transport state to display. */
  state: TransportState;
  /** Called when user clicks reconnect. Shows button only when provided + not connected. */
  onReconnect?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting\u2026',
  connected: 'Connected',
  error: 'Error'
};

const MODE_LABELS: Record<string, string> = {
  disconnected: '',
  websocket: 'WebSocket',
  embedded: 'Embedded'
};

const DOT_COLORS: Record<string, string> = {
  connected: 'bg-[var(--color-success)]',
  connecting: 'bg-[var(--color-warning)] animate-[pulse-dot_1.5s_ease-in-out_infinite]',
  disconnected: 'bg-[var(--color-text-muted)]',
  error: 'bg-[var(--color-error)]'
};

export function ConnectionStatus({ state, onReconnect }: ConnectionStatusProps) {
  const statusLabel = STATUS_LABELS[state.status] ?? state.status;
  const modeLabel = MODE_LABELS[state.mode] ?? state.mode;

  const showReconnect =
    onReconnect !== undefined && state.status !== 'connected' && state.status !== 'connecting';

  return (
    <div className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]" role="status">
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          DOT_COLORS[state.status] ?? DOT_COLORS['disconnected']
        )}
      />
      <span>
        {statusLabel}
        {modeLabel && state.status === 'connected' ? ` (${modeLabel})` : ''}
      </span>
      {state.status === 'error' && state.error && (
        <span className="text-[var(--color-error)] text-xs">
          {state.error.message}
        </span>
      )}
      {showReconnect && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReconnect}
          aria-label="Reconnect"
          className="h-5 px-2 text-xs"
        >
          Reconnect
        </Button>
      )}
    </div>
  );
}
