import { describe, expect, it } from 'vitest';
import { parseRuntimeEnvironment } from '../src/environment.js';

describe('parseRuntimeEnvironment', () => {
  it('defaults the runtime host to the IPv4 loopback interface', () => {
    expect(parseRuntimeEnvironment({}).HOST).toBe('127.0.0.1');
  });

  it('preserves an explicit deployment host override', () => {
    expect(parseRuntimeEnvironment({ HOST: '0.0.0.0' }).HOST).toBe('0.0.0.0');
  });
});
