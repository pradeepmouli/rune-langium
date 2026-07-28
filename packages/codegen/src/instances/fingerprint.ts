// SPDX-License-Identifier: MIT

/**
 * SHA-256 hex digest via Web Crypto (`crypto.subtle`) — available
 * identically in browsers and Cloudflare Workers, no Node dependency.
 * Mirrors apps/curated-mirror-worker/src/manifest.ts's sha256Hex.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const dataBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const buf = await crypto.subtle.digest('SHA-256', dataBuffer as ArrayBuffer);
  const arr = new Uint8Array(buf);
  let hex = '';
  for (const b of arr) hex += b.toString(16).padStart(2, '0');
  return hex;
}
