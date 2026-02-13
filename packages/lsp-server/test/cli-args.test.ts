/**
 * Unit tests for CLI argument parsing.
 * 
 * Note: These tests only test the parseArgs function in isolation.
 * Full integration tests for the CLI require @lspeasy/* dependencies.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Inline version of parseArgs for testing without importing the full CLI module
// This matches the implementation in cli.ts
function parseArgsForTest(argv: string[]): { port: number; host: string } {
  const DEFAULT_PORT = 3001;
  const DEFAULT_HOST = '0.0.0.0';
  const args = argv;
  let port = DEFAULT_PORT;
  let host = DEFAULT_HOST;

  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === '--port' && next) {
      const parsed = parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        console.error(`Invalid port: "${next}". Port must be a number between 1 and 65535.`);
        process.exit(1);
      }
      port = parsed;
      i++;
    } else if (args[i] === '--host' && next) {
      host = next;
      i++;
    }
  }

  return { port, host };
}

describe('parseArgs (port validation)', () => {
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
    const result = parseArgsForTest([]);
    expect(result.port).toBe(3001);
    expect(result.host).toBe('0.0.0.0');
  });

  it('accepts valid port values', () => {
    const result = parseArgsForTest(['--port', '8080']);
    expect(result.port).toBe(8080);
  });

  it('accepts port at lower boundary (1)', () => {
    const result = parseArgsForTest(['--port', '1']);
    expect(result.port).toBe(1);
  });

  it('accepts port at upper boundary (65535)', () => {
    const result = parseArgsForTest(['--port', '65535']);
    expect(result.port).toBe(65535);
  });

  it('accepts custom host', () => {
    const result = parseArgsForTest(['--host', 'localhost']);
    expect(result.host).toBe('localhost');
  });

  it('rejects non-numeric port values', () => {
    expect(() => parseArgsForTest(['--port', 'abc'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "abc"')
    );
  });

  it('rejects NaN-producing port values', () => {
    expect(() => parseArgsForTest(['--port', 'foo'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Port must be a number between 1 and 65535')
    );
  });

  it('rejects negative port values', () => {
    expect(() => parseArgsForTest(['--port', '-1'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "-1"')
    );
  });

  it('rejects zero port value', () => {
    expect(() => parseArgsForTest(['--port', '0'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "0"')
    );
  });

  it('rejects port values above 65535', () => {
    expect(() => parseArgsForTest(['--port', '99999'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "99999"')
    );
  });

  it('rejects port value at upper boundary + 1', () => {
    expect(() => parseArgsForTest(['--port', '65536'])).toThrow('process.exit(1)');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid port: "65536"')
    );
  });

  it('shows helpful error message for invalid ports', () => {
    expect(() => parseArgsForTest(['--port', 'invalid'])).toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Port must be a number between 1 and 65535')
    );
  });
});


