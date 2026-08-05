export type Role = 'VILLAGER' | 'MAFIA' | 'DOCTOR' | 'DETECTIVE';
export type Team = 'TOWN' | 'MAFIA';

export type Phase =
  | 'LOBBY'
  | 'ROLE_REVEAL'
  | 'NIGHT_MAFIA'
  | 'NIGHT_DOCTOR'
  | 'NIGHT_DETECTIVE'
  | 'DAWN'
  | 'DAY'
  | 'VOTE'
  | 'GAME_OVER';

// 'GM' is a moderator override, not a game outcome — the durable record has to
// tell a lynch apart from a correction, or the stats it feeds are wrong.
export type Cause = 'VOTE' | 'MAFIA' | 'GM';

export interface Player {
  id: string;
  name: string;
  role: Role;
  alive: boolean;
  eliminatedAtPhase: number | null;
  eliminatedBy: Cause | null;
}

export interface GameConfig {
  // null means derive from seat count rather than an explicit host override.
  mafiaCount: number | null;
  doctor: boolean;
  detective: boolean;
  mafiaNightMs: number;
  /**
   * Whether the eliminated get a room of their own. Optional and absent means
   * closed, which is both the spec's default and what every existing game was
   * played under — a required field here would have rewritten history.
   *
   * It never opens the night to them and never makes them audible to the
   * living: the first player eliminated knows the whole Mafia roster, and that
   * leaks through timing and tone long before it leaks through words.
   */
  deadChannel?: boolean;
}

export interface NightState {
  mafiaVotes: Record<string, string>;
  doctorSave: string | null;
  detectiveCheck: string | null;
}

export interface NightOutcome {
  phaseNumber: number;
  targetId: string | null;
  saved: boolean;
  eliminatedId: string | null;
  // The Detective learns a team, never a role — the distinction is the mechanic.
  detective: { targetId: string; team: Team } | null;
}

export interface GameState {
  version: number;
  phase: Phase;
  phaseNumber: number;
  phaseEndsAt: number | null;
  gmPlayerId: string;
  config: GameConfig;
  players: Player[];
  night: NightState;
  dayVotes: Record<string, string>;
  lastNight: NightOutcome | null;
  winner: Team | null;
}

export type AudioGraph = Map<string, Set<string>>;
