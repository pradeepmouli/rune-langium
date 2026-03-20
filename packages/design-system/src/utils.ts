// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
