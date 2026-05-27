# Classes

## cf-durable-object-transport

### `DurableObjectWebSocketTransport`
*implements `Transport`*
```ts
constructor(socket: CfWebSocketLike): DurableObjectWebSocketTransport
```
**Methods:**
- `receive(raw: string): void` — Push a raw payload received via the DO's `webSocketMessage` hook
through the transport. The payload is JSON-parsed and dispatched to
registered `onMessage` handlers; parse failures are routed to
`onError` handlers.

Idempotent and safe to call after signalClose; messages
arriving after close are dropped silently to match
@lspeasy/core!WebSocketTransport behaviour.
- `signalClose(): void` — Signal a connection close received via the DO's `webSocketClose` hook.
Notifies registered `onClose` handlers exactly once; subsequent calls
are no-ops.
- `send(message: Message): Promise<void>` — Send a message to the remote peer.
- `onMessage(handler: (message: Message) => void): Disposable` — Subscribe to incoming messages.
- `onError(handler: (error: Error) => void): Disposable` — Subscribe to transport errors.
- `onClose(handler: () => void): Disposable` — Subscribe to connection close.
- `close(): Promise<void>` — Close the transport connection and release resources.
- `isConnected(): boolean` — Returns `true` if the transport is currently connected and able to
send messages.
