function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set — the server cannot start without it`);
  }
  return value;
}

function intOr(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${raw}`);
  }
  return parsed;
}

export interface ServerConfig {
  /** True when state lives in process memory instead of Upstash. Dev only. */
  memoryRedis: boolean;
  upstashUrl: string;
  upstashToken: string;
  jwtSecret: string;
  maxConcurrentRooms: number;
  killSwitch: boolean;
}

const DEV_JWT_SECRET = 'nightfall-development-secret-not-for-production-use';

export function loadServerConfig(): ServerConfig {
  // Lets the app run end to end without an Upstash account. Opt-in, and refused
  // outright in production so a missing env var can never silently degrade to a
  // store that forgets every room on restart.
  const wantsMemory = process.env['NIGHTFALL_DEV_MEMORY_REDIS'] === 'true';
  if (wantsMemory) {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('NIGHTFALL_DEV_MEMORY_REDIS cannot be used in production');
    }
    return {
      memoryRedis: true,
      upstashUrl: '',
      upstashToken: '',
      jwtSecret: process.env['JWT_SECRET'] ?? DEV_JWT_SECRET,
      maxConcurrentRooms: intOr('MAX_CONCURRENT_ROOMS', 25),
      killSwitch: process.env['ROOMS_KILL_SWITCH'] === 'true',
    };
  }

  return {
    memoryRedis: false,
    upstashUrl: required('UPSTASH_REDIS_REST_URL'),
    upstashToken: required('UPSTASH_REDIS_REST_TOKEN'),
    jwtSecret: required('JWT_SECRET'),
    maxConcurrentRooms: intOr('MAX_CONCURRENT_ROOMS', 25),
    // Flip this to stop new rooms without a redeploy. Absent means open.
    killSwitch: process.env['ROOMS_KILL_SWITCH'] === 'true',
  };
}
