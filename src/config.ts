import { MAX_CONCURRENT_ROOMS_DEFAULT } from './room-store/keys.js';
import { MINUTE_BUDGET_DEFAULT } from './room-store/minutes.js';

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

/**
 * Resend is optional at boot, unlike LiveKit and Upstash, and deliberately so.
 * The claim is an optional record-keeping feature that must never gate joining
 * or playing — so a missing key turns the offer off, exactly as a spent voice
 * budget turns a room voiceless, rather than refusing to start the server.
 */
export interface ClaimConfig {
  enabled: boolean;
  resendApiKey: string;
  resendFrom: string;
}

export interface ServerConfig {
  claim: ClaimConfig;
  minuteBudget: number;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitUrl: string;
  /** True when state lives in process memory instead of Upstash. Dev only. */
  memoryRedis: boolean;
  upstashUrl: string;
  upstashToken: string;
  jwtSecret: string;
  maxConcurrentRooms: number;
  killSwitch: boolean;
}

const DEV_JWT_SECRET = 'nightfall-development-secret-not-for-production-use';

/**
 * A key alone is not enough: Resend refuses a send from an unverified domain,
 * so a half-configured claim would offer the player a code that never arrives.
 * Both or neither.
 */
function loadClaim(): ClaimConfig {
  const resendApiKey = process.env['RESEND_API_KEY'] ?? '';
  const resendFrom = process.env['RESEND_FROM'] ?? '';
  return { enabled: resendApiKey !== '' && resendFrom !== '', resendApiKey, resendFrom };
}

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
      claim: loadClaim(),
      memoryRedis: true,
      upstashUrl: '',
      upstashToken: '',
      jwtSecret: process.env['JWT_SECRET'] ?? DEV_JWT_SECRET,
      livekitApiKey: process.env['LIVEKIT_API_KEY'] ?? '',
      livekitApiSecret: process.env['LIVEKIT_API_SECRET'] ?? '',
      livekitUrl: process.env['LIVEKIT_URL'] ?? '',
      maxConcurrentRooms: intOr('MAX_CONCURRENT_ROOMS', MAX_CONCURRENT_ROOMS_DEFAULT),
      minuteBudget: intOr('LIVEKIT_MINUTE_BUDGET', MINUTE_BUDGET_DEFAULT),
      killSwitch: process.env['ROOMS_KILL_SWITCH'] === 'true',
    };
  }

  return {
    claim: loadClaim(),
    memoryRedis: false,
    upstashUrl: required('UPSTASH_REDIS_REST_URL'),
    upstashToken: required('UPSTASH_REDIS_REST_TOKEN'),
    jwtSecret: required('JWT_SECRET'),
    livekitApiKey: required('LIVEKIT_API_KEY'),
    livekitApiSecret: required('LIVEKIT_API_SECRET'),
    livekitUrl: required('LIVEKIT_URL'),
    maxConcurrentRooms: intOr('MAX_CONCURRENT_ROOMS', MAX_CONCURRENT_ROOMS_DEFAULT),
    minuteBudget: intOr('LIVEKIT_MINUTE_BUDGET', MINUTE_BUDGET_DEFAULT),
    // Flip this to stop new rooms without a redeploy. Absent means open.
    killSwitch: process.env['ROOMS_KILL_SWITCH'] === 'true',
  };
}
