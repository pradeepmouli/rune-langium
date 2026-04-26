// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Multi-tab single-writer coordination over BroadcastChannel.
 *
 * Protocol (versioned so future schema changes can coexist or be rejected):
 *   { proto: 1, type: 'claim',       wsId, tabId }
 *   { proto: 1, type: 'claim-deny',  wsId, ownerTabId }
 *   { proto: 1, type: 'takeover',    wsId, tabId }
 *   { proto: 1, type: 'release',     wsId, tabId }
 *
 * On `claim`: an existing owner replies with `claim-deny`. If two tabs
 * claim simultaneously (no current owner), they each see the other's
 * claim and apply a deterministic tiebreak — lexicographically smaller
 * `tabId` wins. Both tabs reach the same conclusion without a round trip,
 * so at most one returns `true` from `claim()`.
 *
 * `takeover` is fire-and-forget by design: the previous owner is notified
 * via `onOwnershipLost` and is responsible for flushing dirty buffers in
 * its own callback. Adding an ack would require two-phase coordination
 * that the v1 product doesn't need.
 */

const CHANNEL_NAME = 'rune-studio:workspace-ownership';
const PROTO_VERSION = 1;
const DEFAULT_CLAIM_TIMEOUT_MS = 250;

interface BaseMsg {
  proto: number;
  wsId: string;
}
interface ClaimMsg extends BaseMsg {
  type: 'claim';
  tabId: string;
}
interface ClaimDenyMsg extends BaseMsg {
  type: 'claim-deny';
  ownerTabId: string;
}
interface TakeoverMsg extends BaseMsg {
  type: 'takeover';
  tabId: string;
}
interface ReleaseMsg extends BaseMsg {
  type: 'release';
  tabId: string;
}
type AnyMsg = ClaimMsg | ClaimDenyMsg | TakeoverMsg | ReleaseMsg;

export interface ClaimOptions {
  /** How long to wait for a `claim-deny` before declaring success. */
  timeoutMs?: number;
}

export class WorkspaceOwnership {
  private readonly channel: BroadcastChannel;
  /** Workspaces this tab currently owns. */
  private owned = new Set<string>();
  /** Last observed owner per workspace (for read-only fallbacks). */
  private peers = new Map<string, string>();
  /** ws-id → callback fired when this tab loses ownership. */
  private lossListeners = new Map<string, () => void>();
  /** ws-id → resolver for an in-flight claim() awaiting deny / tiebreak. */
  private pendingClaims = new Map<string, (deniedBy: string | null) => void>();
  /** Workspaces this tab is itself currently trying to claim. */
  private claiming = new Set<string>();

  constructor(private readonly tabId: string) {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.addEventListener('message', this.onMessage);
  }

  /**
   * Try to become the owner of `wsId`. Resolves true on success, false if
   * a peer claimed first (peerOwner(wsId) will return their tabId).
   */
  async claim(wsId: string, options: ClaimOptions = {}): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_CLAIM_TIMEOUT_MS;
    this.claiming.add(wsId);
    this.send({ proto: PROTO_VERSION, type: 'claim', wsId, tabId: this.tabId });

    const deniedBy = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingClaims.delete(wsId);
        resolve(null);
      }, timeoutMs);
      this.pendingClaims.set(wsId, (peer) => {
        clearTimeout(timer);
        this.pendingClaims.delete(wsId);
        resolve(peer);
      });
    });

    this.claiming.delete(wsId);
    if (deniedBy) {
      this.peers.set(wsId, deniedBy);
      return false;
    }
    this.owned.add(wsId);
    this.peers.delete(wsId);
    return true;
  }

  /**
   * Forcibly become owner — the previous owner sees an ownership-lost
   * notification.
   */
  async takeover(wsId: string): Promise<void> {
    this.send({ proto: PROTO_VERSION, type: 'takeover', wsId, tabId: this.tabId });
    this.owned.add(wsId);
    this.peers.delete(wsId);
  }

  /** Yield ownership; a future tab may claim. */
  release(wsId: string): void {
    if (!this.owned.has(wsId)) return;
    this.owned.delete(wsId);
    this.send({ proto: PROTO_VERSION, type: 'release', wsId, tabId: this.tabId });
  }

  /** True iff this tab currently owns wsId. */
  isOwner(wsId: string): boolean {
    return this.owned.has(wsId);
  }

  /** The most recently observed peer owner of wsId, if any. */
  peerOwner(wsId: string): string | undefined {
    return this.peers.get(wsId);
  }

  /** Subscribe to "you just lost ownership" for a specific workspace. */
  onOwnershipLost(wsId: string, cb: () => void): () => void {
    this.lossListeners.set(wsId, cb);
    return () => this.lossListeners.delete(wsId);
  }

  /** Tear down the broadcast subscription. Call on tab unload. */
  close(): void {
    this.channel.removeEventListener('message', this.onMessage);
    this.channel.close();
  }

  private send(msg: AnyMsg): void {
    // postMessage can throw DataCloneError on shape changes the channel
    // can't structured-clone, and synchronously throws if `close()` has
    // already been called. Either is recoverable for telemetry — silent
    // drop is the wrong default; log so the cause is filable.
    try {
      this.channel.postMessage(msg);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[multi-tab-broadcast] postMessage failed:', err);
    }
  }

  private onMessage = (ev: MessageEvent): void => {
    const msg = ev.data as AnyMsg | undefined;
    if (!msg || typeof msg !== 'object') return;
    // Drop messages from a future protocol version we don't understand.
    if (msg.proto !== PROTO_VERSION) return;

    switch (msg.type) {
      case 'claim': {
        if (msg.tabId === this.tabId) return;
        if (this.owned.has(msg.wsId)) {
          // We're already the owner — deny.
          this.send({
            proto: PROTO_VERSION,
            type: 'claim-deny',
            wsId: msg.wsId,
            ownerTabId: this.tabId
          });
          return;
        }
        if (this.claiming.has(msg.wsId)) {
          // Both tabs are claiming with no current owner — deterministic
          // tiebreak: lexicographically smaller `tabId` wins. Both peers
          // reach the same conclusion without a round trip.
          if (this.tabId < msg.tabId) {
            this.send({
              proto: PROTO_VERSION,
              type: 'claim-deny',
              wsId: msg.wsId,
              ownerTabId: this.tabId
            });
          } else {
            // We lose the tiebreak — abandon our own pending claim.
            this.pendingClaims.get(msg.wsId)?.(msg.tabId);
          }
        }
        return;
      }
      case 'claim-deny': {
        this.pendingClaims.get(msg.wsId)?.(msg.ownerTabId);
        return;
      }
      case 'takeover': {
        if (this.owned.has(msg.wsId) && msg.tabId !== this.tabId) {
          this.owned.delete(msg.wsId);
          this.peers.set(msg.wsId, msg.tabId);
          // Callback exceptions MUST NOT escape — EventTarget would
          // silently drop them and leave callers thinking ownership-loss
          // has been handled.
          const cb = this.lossListeners.get(msg.wsId);
          if (cb) {
            try {
              cb();
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('[multi-tab-broadcast] ownership-lost callback threw:', err);
            }
          }
        }
        // If we were trying to claim this ws, that claim now loses.
        this.pendingClaims.get(msg.wsId)?.(msg.tabId);
        return;
      }
      case 'release': {
        if (this.peers.get(msg.wsId) === msg.tabId) {
          this.peers.delete(msg.wsId);
        }
        return;
      }
    }
  };
}
