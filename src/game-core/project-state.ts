import type { Cause, GameState, NightOutcome, Phase, Player, Role, Team } from './types.js';

export interface PlayerView {
  id: string;
  name: string;
  alive: boolean;
  role: Role | null;
  eliminatedAtPhase: number | null;
  eliminatedBy: Cause | null;
}

export interface ViewState {
  version: number;
  phase: Phase;
  phaseNumber: number;
  phaseEndsAt: number | null;
  viewerId: string;
  isGm: boolean;
  players: PlayerView[];
  dayVotes: Record<string, string>;
  night: { mafiaVotes: Record<string, string> | null };
  detectiveResult: NightOutcome['detective'];
  lastNight: NightOutcome | null;
  winner: Team | null;
}

function toView(p: Player, roleVisible: boolean): PlayerView {
  return {
    id: p.id,
    name: p.name,
    alive: p.alive,
    role: roleVisible ? p.role : null,
    eliminatedAtPhase: p.eliminatedAtPhase,
    eliminatedBy: p.eliminatedBy,
  };
}

function canSeeRoleOf(
  state: GameState,
  isGm: boolean,
  viewer: Player | undefined,
  subject: Player,
): boolean {
  if (isGm) return true;
  // The debrief shows every card; there is nothing left to protect.
  if (state.phase === 'GAME_OVER') return true;
  if (viewer === undefined) return false;
  if (subject.id === viewer.id) return true;

  // The room turns over the card it voted out, and cannot un-see it. This is
  // the one place a living player learns another's role before the debrief:
  // without it the day vote returns no information at all and town spends
  // every round guessing blind. A night kill stays face down, because a free
  // true read every night is a different game.
  if (!subject.alive && subject.eliminatedBy === 'VOTE') return true;

  // Death trades the Mafia roster for the graveyard: a dead player learns who
  // the dead were, and loses any standing claim on a living player's role.
  if (!viewer.alive) return !subject.alive;

  return viewer.role === 'MAFIA' && subject.role === 'MAFIA';
}

export function projectState(state: GameState, viewerId: string): ViewState {
  const viewer = state.players.find((p) => p.id === viewerId);
  const isGm = viewerId === state.gmPlayerId;
  const inMafiaRoom = isGm || (viewer !== undefined && viewer.alive && viewer.role === 'MAFIA');
  const isDetective = isGm || viewer?.role === 'DETECTIVE';

  return {
    version: state.version,
    phase: state.phase,
    phaseNumber: state.phaseNumber,
    phaseEndsAt: state.phaseEndsAt,
    viewerId,
    isGm,
    players: state.players.map((p) => toView(p, canSeeRoleOf(state, isGm, viewer, p))),
    dayVotes: { ...state.dayVotes },
    night: {
      mafiaVotes: inMafiaRoom ? { ...state.night.mafiaVotes } : null,
    },
    detectiveResult: isDetective ? (state.lastNight?.detective ?? null) : null,
    lastNight: isGm ? state.lastNight : null,
    winner: state.winner,
  };
}
