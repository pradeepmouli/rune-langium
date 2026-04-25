// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * WorkspaceOwnership — first-writer-wins multi-tab coordination over
 * BroadcastChannel. Feature 012-studio-workspace-ux, T017.
 *
 * Protocol (small + symmetric so it doesn't need a server):
 *   { type: 'claim',       wsId, tabId }
 *   { type: 'claim-deny',  wsId, ownerTabId }
 *   { type: 'takeover',    wsId, tabId }
 *   { type: 'release',     wsId, tabId }
 *
 * `claim` is broadcast when a tab opens a workspace. Existing owners reply
 * with `claim-deny`. If no deny lands within `timeoutMs`, the claim wins.
 *
 * `takeover` is the explicit user action; a tab that receives a takeover
 * for a workspace it currently owns must flush dirty buffers and yield.
 */

const CHANNEL_NAME = 'rune-studio:workspace-ownership';
const DEFAULT_CLAIM_TIMEOUT_MS = 250;

interface ClaimMsg {
  type: 'claim';
  wsId: string;
  tabId: string;
}
interface ClaimDenyMsg {
  type: 'claim-deny';
  wsId: string;
  ownerTabId: string;
}
interface TakeoverMsg {
  type: 'takeover';
  wsId: string;
  tabId: string;
}
interface ReleaseMsg {
  type: 'release';
  wsId: string;
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
  /** ws-id → resolver for an in-flight claim() awaiting deny. */
  private pendingClaims = new Map<string, (deniedBy: string | null) => void>();

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
    this.send({ type: 'claim', wsId, tabId: this.tabId });

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
    this.send({ type: 'takeover', wsId, tabId: this.tabId });
    this.owned.add(wsId);
    this.peers.delete(wsId);
  }

  /** Yield ownership; a future tab may claim. */
  release(wsId: string): void {
    if (!this.owned.has(wsId)) return;
    this.owned.delete(wsId);
    this.send({ type: 'release', wsId, tabId: this.tabId });
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
    this.channel.postMessage(msg);
  }

  private onMessage = (ev: MessageEvent): void => {
    const msg = ev.data as AnyMsg;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'claim': {
        // If we own it, deny the claim.
        if (this.owned.has(msg.wsId)) {
          this.send({ type: 'claim-deny', wsId: msg.wsId, ownerTabId: this.tabId });
        }
        return;
      }
      case 'claim-deny': {
        const pending = this.pendingClaims.get(msg.wsId);
        if (pending) pending(msg.ownerTabId);
        return;
      }
      case 'takeover': {
        if (this.owned.has(msg.wsId) && msg.tabId !== this.tabId) {
          this.owned.delete(msg.wsId);
          this.peers.set(msg.wsId, msg.tabId);
          this.lossListeners.get(msg.wsId)?.();
        }
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
