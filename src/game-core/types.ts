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
   * How many names the mafia's ballot may settle on in one night. Optional and
   * absent means one, which is what every game before the setting existed was
   * played under.
   *
   * A ceiling, never a quota: the mafia still have to agree on each name, and
   * slots the ballot cannot fill go unspent. The GM sets it and never spends it.
   */
  nightKills?: number;
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
  /** Every name the ballot settled on. Empty when it settled on none. */
  targetIds: string[];
  /** The one the doctor pulled back, if they were on that list. */
  savedId: string | null;
  /** Who actually did not survive: the targets, less the save. */
  eliminatedIds: string[];
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
