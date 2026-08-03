import type { Role, Team } from './types.js';

export function teamOf(role: Role): Team {
  return role === 'MAFIA' ? 'MAFIA' : 'TOWN';
}
