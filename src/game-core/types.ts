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

export type Cause = 'VOTE' | 'MAFIA';

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
