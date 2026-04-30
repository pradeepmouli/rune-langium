// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

declare module 'pako' {
  export function gzip(data: string | ArrayLike<number> | ArrayBufferLike): Uint8Array;
  export function deflate(data: string | ArrayLike<number> | ArrayBufferLike): Uint8Array;
  export function inflate(data: ArrayLike<number> | ArrayBufferLike): Uint8Array;
}
