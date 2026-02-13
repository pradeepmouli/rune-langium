/**
 * Unit tests for CLI argument parsing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseArgs } from '../src/cli.js';

describe('parseArgs', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default port and host when no args provided', () => {
    const result = parseArgs([]);
    expect(result.port).toBe(3001);
    expect(result.host).toBe('0.0.0.0');
  });

  it('accepts valid port values', () => {
    const result = parseArgs(['--port', '8080']);
    expect(result.port).toBe(8080);
  });

  it('accepts port at lower boundary (1)', () => {
    const result = parseArgs(['--port', '1']);
    expect(result.port).toBe(1);
  });

  it('accepts port at upper boundary (65535)', () => {
    const result = parseArgs(['--port', '65535']);
    expect(result.port).toBe(65535);
  });

  it('accepts custom host', () => {
    const result = parseArgs(['--host', 'localhost']);
    expect(result.host).toBe('localhost');
  });

  it('rejects non-numeric port values', () => {
    expect(() => parseArgs(['--port', 'abc'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "abc"')
    );
  });

  it('rejects NaN-producing port values', () => {
    expect(() => parseArgs(['--port', 'foo'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Port must be a number between 1 and 65535')
    );
  });

  it('rejects negative port values', () => {
    expect(() => parseArgs(['--port', '-1'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "-1"')
    );
  });

  it('rejects zero port value', () => {
    expect(() => parseArgs(['--port', '0'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "0"')
    );
  });

  it('rejects port values above 65535', () => {
    expect(() => parseArgs(['--port', '99999'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "99999"')
    );
  });

  it('rejects port value at upper boundary + 1', () => {
    expect(() => parseArgs(['--port', '65536'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "65536"')
    );
  });

  it('shows helpful error message for invalid ports', () => {
    expect(() => parseArgs(['--port', 'invalid'])).toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Port must be a number between 1 and 65535')
    );
  });
});

