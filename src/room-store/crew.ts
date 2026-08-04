import { generateCrewCode } from './crew-code.js';
import { crewKey } from './keys.js';
import type { RedisPort } from './redis-port.js';
import { DomainError } from './errors.js';

export interface CrewRecord {
  code: string;
  name: string;
  createdAt: number;
}

export class CrewCodeExhaustedError extends DomainError {
  readonly code = 'CREW_CODE_EXHAUSTED' as const;

  constructor(attempts: number) {
    super(`could not find an unused crew code in ${attempts} attempts`);
    this.name = 'CrewCodeExhaustedError';
  }
}

export async function readCrew(redis: RedisPort, code: string): Promise<CrewRecord | null> {
  const raw = await redis.get(crewKey(code));
  return raw === null ? null : (JSON.parse(raw) as CrewRecord);
}

/**
 * Crew codes are permanent and pinned in a WhatsApp group, so a collision would
 * hand two groups the same link. Generation retries until it finds a free code.
 */
export async function createCrew(
  redis: RedisPort,
  name: string,
  now: number,
  rng: () => number,
  attempts = 8,
): Promise<CrewRecord> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const code = generateCrewCode(rng);
    const record: CrewRecord = { code, name, createdAt: now };

    // No TTL: the crew link outlives every session played through it.
    const claimed = await redis.setIfAbsent(crewKey(code), JSON.stringify(record));
    if (claimed) return record;
  }

  throw new CrewCodeExhaustedError(attempts);
}
