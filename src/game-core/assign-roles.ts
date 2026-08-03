import type { GameConfig, Role } from './types.js';

export const MIN_PLAYERS = 5;

function mafiaCountFor(playerCount: number, config: GameConfig): number {
  return config.mafiaCount ?? Math.max(1, Math.round(playerCount / 4));
}

function buildPool(playerCount: number, config: GameConfig): Role[] {
  const pool: Role[] = new Array<Role>(mafiaCountFor(playerCount, config)).fill('MAFIA');
  if (config.doctor) pool.push('DOCTOR');
  if (config.detective) pool.push('DETECTIVE');
  while (pool.length < playerCount) pool.push('VILLAGER');
  return pool;
}

function shuffle(roles: Role[], rng: () => number): Role[] {
  return roles
    .map((role) => ({ role, key: rng() }))
    .sort((a, b) => a.key - b.key)
    .map(({ role }) => role);
}

export function assignRoles(
  playerIds: string[],
  config: GameConfig,
  rng: () => number,
): Record<string, Role> {
  if (playerIds.length < MIN_PLAYERS) {
    throw new Error(`a session needs at least ${MIN_PLAYERS} players, got ${playerIds.length}`);
  }

  const mafia = mafiaCountFor(playerIds.length, config);
  if (mafia >= playerIds.length - mafia) {
    throw new Error(
      `${mafia} Mafia in ${playerIds.length} players starts at or above parity with Town`,
    );
  }

  const pool = shuffle(buildPool(playerIds.length, config), rng);

  const assignment: Record<string, Role> = {};
  for (const [index, id] of playerIds.entries()) {
    const role = pool[index];
    if (role === undefined) throw new Error('role pool is smaller than the player list');
    assignment[id] = role;
  }
  return assignment;
}
