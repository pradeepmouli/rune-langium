/**
 * Unit tests for pathToUri — validates file:// URI generation.
 *
 * Regression tests for:
 *   - Relative paths producing malformed URIs (file://name.rosetta → host parse)
 *   - Missing .rosetta extension in Langium service registry lookup
 *   - Absolute paths with correct 3-slash file:/// prefix
 */

import { describe, it, expect } from 'vitest';
import { pathToUri } from '../../src/utils/uri.js';

describe('pathToUri', () => {
  // ── Basic contract ────────────────────────────────────────────────────

  it('returns a string starting with file://', () => {
    const result = pathToUri('model.rosetta');
    expect(result.startsWith('file://')).toBe(true);
  });

  // ── Relative paths (the regression case) ──────────────────────────────

  it('converts a bare filename to a valid file URI with 3 slashes', () => {
    const result = pathToUri('model.rosetta');
    expect(result).toBe('file:///workspace/model.rosetta');
  });

  it('converts a relative path with subdirectory to a valid file URI', () => {
    const result = pathToUri('cdm/base-datetime-type.rosetta');
    expect(result).toBe('file:///workspace/cdm/base-datetime-type.rosetta');
  });

  it('preserves the .rosetta extension for Langium service registry', () => {
    const result = pathToUri('base-datetime-type.rosetta');
    expect(result).toMatch(/\.rosetta$/);
  });

  it('never produces a URI where filename becomes the hostname', () => {
    // Regression: file://filename.rosetta parses as protocol=file, host=filename.rosetta
    const result = pathToUri('model.rosetta');
    const url = new URL(result);
    expect(url.hostname).toBe('');
    expect(url.pathname).toContain('model.rosetta');
  });

  // ── Absolute paths ────────────────────────────────────────────────────

  it('converts an absolute path to a valid file URI', () => {
    const result = pathToUri('/Users/dev/project/model.rosetta');
    expect(result).toBe('file:///Users/dev/project/model.rosetta');
  });

  it('produces a parseable URL for absolute paths', () => {
    const result = pathToUri('/home/user/workspace/types.rosetta');
    const url = new URL(result);
    expect(url.protocol).toBe('file:');
    expect(url.hostname).toBe('');
    expect(url.pathname).toBe('/home/user/workspace/types.rosetta');
  });

  // ── Already-valid URIs ────────────────────────────────────────────────

  it('passes through an existing file:// URI unchanged', () => {
    const uri = 'file:///workspace/model.rosetta';
    expect(pathToUri(uri)).toBe(uri);
  });

  it('passes through a file URI with encoded spaces', () => {
    const uri = 'file:///my%20workspace/model.rosetta';
    expect(pathToUri(uri)).toBe(uri);
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it('handles webkitRelativePath style paths', () => {
    // webkitRelativePath = "cdm-folder/subdir/model.rosetta"
    const result = pathToUri('cdm-folder/subdir/model.rosetta');
    expect(result).toBe('file:///workspace/cdm-folder/subdir/model.rosetta');
    const url = new URL(result);
    expect(url.hostname).toBe('');
  });

  it('handles filenames with special characters', () => {
    const result = pathToUri('my-model_v2.rosetta');
    expect(result).toBe('file:///workspace/my-model_v2.rosetta');
  });

  it('handles paths starting with ./', () => {
    const result = pathToUri('./model.rosetta');
    expect(result).toBe('file:///workspace/./model.rosetta');
    // The URI is valid even with ./ — Langium handles path normalization
    expect(result).toMatch(/\.rosetta$/);
  });
});
