import { describe, expect, it } from 'vitest';
import { MemoryRedis } from '../room-store/memory-redis.js';
import { domainErrorCode } from '../room-store/errors.js';
import { CODE_LENGTH, generateCode, hashCode, normaliseEmail } from './codes.js';
import {
  MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  consumeCode,
  otpKey,
  storeCode,
} from './store.js';
import { PER_EMAIL_PER_HOUR, PER_IP_PER_HOUR, spendOtpAllowance } from './rate-limit.js';

const PEPPER = 'a-server-side-pepper-of-sufficient-length';
const EMAIL = 'ada@example.com';
const NOW = 1_700_000_000_000;

describe('OTP codes', () => {
  it('is six digits', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
    expect(CODE_LENGTH).toBe(6);
  });

  it('uses the full range, leading zeros included', () => {
    // A code built from Number#toString would drop leading zeros and quietly
    // become five digits one time in ten.
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i += 1) seen.add(generateCode());

    expect(seen.size).toBeGreaterThan(4000);
    expect([...seen].some((c) => c.startsWith('0'))).toBe(true);
  });

  it('binds the hash to the address, so a code cannot be replayed elsewhere', () => {
    const forAda = hashCode(EMAIL, '123456', PEPPER);
    const forMusa = hashCode('musa@example.com', '123456', PEPPER);

    expect(forAda).not.toBe(forMusa);
  });

  it('is useless without the pepper', () => {
    // Six digits is a million guesses — trivially brute-forced offline from a
    // bare digest. The pepper is what makes a leaked hash worthless.
    expect(hashCode(EMAIL, '123456', PEPPER)).not.toBe(
      hashCode(EMAIL, '123456', 'a-different-pepper-entirely'),
    );
    expect(hashCode(EMAIL, '123456', PEPPER)).not.toContain('123456');
  });

  it('lowercases and trims the address', () => {
    expect(normaliseEmail('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('refuses something that is not an address', () => {
    for (const bad of ['', 'ada', 'ada@', '@example.com', 'ada example.com', 'a@b']) {
      expect(normaliseEmail(bad), bad).toBeNull();
    }
  });
});

describe('the OTP store', () => {
  it('never writes the code itself', async () => {
    const redis = new MemoryRedis(() => NOW);

    await storeCode(redis, EMAIL, '123456', PEPPER);

    const stored = await redis.get(otpKey(EMAIL));
    expect(stored).not.toBeNull();
    expect(stored).not.toContain('123456');
  });

  it('accepts the right code once, and never again', async () => {
    const redis = new MemoryRedis(() => NOW);
    await storeCode(redis, EMAIL, '123456', PEPPER);

    expect(await consumeCode(redis, EMAIL, '123456', PEPPER)).toBe(true);
    expect(await consumeCode(redis, EMAIL, '123456', PEPPER)).toBe(false);
  });

  it('expires after ten minutes', async () => {
    let clock = NOW;
    const redis = new MemoryRedis(() => clock);
    await storeCode(redis, EMAIL, '123456', PEPPER);

    clock += (OTP_TTL_SECONDS - 1) * 1000;
    const stillAlive = await redis.get(otpKey(EMAIL));
    clock = NOW + (OTP_TTL_SECONDS + 1) * 1000;

    expect(stillAlive).not.toBeNull();
    expect(OTP_TTL_SECONDS).toBe(600);
    expect(await consumeCode(redis, EMAIL, '123456', PEPPER)).toBe(false);
  });

  it('refuses a wrong code', async () => {
    const redis = new MemoryRedis(() => NOW);
    await storeCode(redis, EMAIL, '123456', PEPPER);

    expect(await consumeCode(redis, EMAIL, '000000', PEPPER)).toBe(false);
    // A typo must not burn the code the player is still reading off their screen.
    expect(await consumeCode(redis, EMAIL, '123456', PEPPER)).toBe(true);
  });

  it('burns the code after too many wrong guesses', async () => {
    const redis = new MemoryRedis(() => NOW);
    await storeCode(redis, EMAIL, '123456', PEPPER);

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect(await consumeCode(redis, EMAIL, '000000', PEPPER), `attempt ${String(i)}`).toBe(false);
    }

    // Ten minutes and a million codes is only safe if guessing is bounded.
    expect(await consumeCode(redis, EMAIL, '123456', PEPPER)).toBe(false);
  });

  it('issuing a new code replaces the old one', async () => {
    const redis = new MemoryRedis(() => NOW);
    await storeCode(redis, EMAIL, '111111', PEPPER);
    await storeCode(redis, EMAIL, '222222', PEPPER);

    expect(await consumeCode(redis, EMAIL, '111111', PEPPER)).toBe(false);
    expect(await consumeCode(redis, EMAIL, '222222', PEPPER)).toBe(true);
  });
});

describe('OTP rate limits', () => {
  it('allows three an hour to one address, then refuses', async () => {
    const redis = new MemoryRedis(() => NOW);

    for (let i = 0; i < PER_EMAIL_PER_HOUR; i += 1) {
      await spendOtpAllowance(redis, { email: EMAIL, ip: `10.0.0.${String(i)}` }, NOW);
    }

    await expect(
      spendOtpAllowance(redis, { email: EMAIL, ip: '10.0.0.9' }, NOW),
    ).rejects.toThrow(/too many/i);
    expect(PER_EMAIL_PER_HOUR).toBe(3);
  });

  it('allows five an hour from one address, across different emails', async () => {
    const redis = new MemoryRedis(() => NOW);
    const ip = '10.0.0.1';

    for (let i = 0; i < PER_IP_PER_HOUR; i += 1) {
      await spendOtpAllowance(redis, { email: `player${String(i)}@example.com`, ip }, NOW);
    }

    // Without an IP limit, one machine could walk a list of addresses.
    await expect(
      spendOtpAllowance(redis, { email: 'someone-else@example.com', ip }, NOW),
    ).rejects.toThrow(/too many/i);
    expect(PER_IP_PER_HOUR).toBe(5);
  });

  it('reports a refusal as a rate limit, not a generic failure', async () => {
    const redis = new MemoryRedis(() => NOW);
    for (let i = 0; i < PER_EMAIL_PER_HOUR; i += 1) {
      await spendOtpAllowance(redis, { email: EMAIL, ip: '10.0.0.1' }, NOW);
    }

    const error = await spendOtpAllowance(redis, { email: EMAIL, ip: '10.0.0.2' }, NOW).catch(
      (e: unknown) => e,
    );

    expect(domainErrorCode(error)).toBe('OTP_RATE_LIMITED');
  });

  it('frees the allowance an hour later', async () => {
    const redis = new MemoryRedis(() => NOW);
    for (let i = 0; i < PER_EMAIL_PER_HOUR; i += 1) {
      await spendOtpAllowance(redis, { email: EMAIL, ip: '10.0.0.1' }, NOW);
    }

    const later = NOW + 60 * 60 * 1000;
    await expect(
      spendOtpAllowance(redis, { email: EMAIL, ip: '10.0.0.1' }, later),
    ).resolves.toBeUndefined();
  });

  it('counts the normalised address, so casing cannot buy more attempts', async () => {
    const redis = new MemoryRedis(() => NOW);
    for (let i = 0; i < PER_EMAIL_PER_HOUR; i += 1) {
      await spendOtpAllowance(redis, { email: EMAIL, ip: `10.0.0.${String(i)}` }, NOW);
    }

    await expect(
      spendOtpAllowance(redis, { email: 'ADA@EXAMPLE.COM', ip: '10.0.0.9' }, NOW),
    ).rejects.toThrow(/too many/i);
  });
});
