/**
 * Every domain error carries a stable `code`. Callers discriminate on that and
 * never on `instanceof`.
 *
 * The reason is that Next bundles the route handlers through webpack while the
 * custom server loads the same files through tsx. One process, two module
 * registries, two copies of every class — so an error thrown by the server's
 * copy of RoomCeilingReachedError is not an instance of the route's copy.
 * `instanceof` returned false silently, the route fell through to a rethrow,
 * and a deliberate 503 reached the player as a 500.
 *
 * A string survives that crossing because it is compared by value.
 */
export const DOMAIN_ERROR_CODES = [
  'ROOM_CEILING',
  'KILL_SWITCH',
  'ROOM_FULL',
  'NOT_ENOUGH_PLAYERS',
  'SESSION_ALREADY_STARTED',
  'NOT_A_MEMBER',
  'NOT_GM',
  'GAME_NOT_STARTED',
  'NOT_A_PLAYER',
  'NOTHING_TO_REVERT',
  'NOT_YOUR_ACTION',
  'WRONG_PHASE',
  'INVALID_TARGET',
  'CREW_CODE_EXHAUSTED',
  'MINUTE_BUDGET_EXCEEDED',
  'ROOM_NOT_FOUND',
  'VERSION_CONFLICT',
  'OTP_RATE_LIMITED',
  'OTP_INVALID',
  'EMAIL_INVALID',
  'EMAIL_ALREADY_CLAIMED',
  'IDENTITY_NOT_FOUND',
  'MERGE_REFUSED',
  'CHAT_NOT_ALLOWED',
  'CHAT_RATE_LIMITED',
  'EMAIL_SEND_FAILED',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

const KNOWN_CODES: ReadonlySet<string> = new Set(DOMAIN_ERROR_CODES);

/**
 * The base every domain error extends. Its only job is to make the compiler
 * insist on a code — nothing ever tests `instanceof DomainError`, which would
 * reintroduce exactly the bug this exists to remove.
 */
export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
}

/**
 * The code of a domain error, or null for anything else.
 *
 * Checked against the known set rather than read blindly: Node stamps its own
 * `code` on system errors, and letting an ECONNREFUSED match a route's error
 * branch would dress a real outage up as a polite refusal.
 */
export function domainErrorCode(error: unknown): DomainErrorCode | null {
  if (typeof error !== 'object' || error === null) return null;

  const code: unknown = (error as { code?: unknown }).code;
  return typeof code === 'string' && KNOWN_CODES.has(code) ? (code as DomainErrorCode) : null;
}

/**
 * `instanceof Error` is safe where `instanceof RoomFullError` is not: Error is
 * a realm global, one per process, shared by both module registries.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}
