import { dawnRevealed, dawnScript, withheldAtDawn } from './dawn.js';
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
  night: {
    mafiaVotes: Record<string, string> | null;
    /**
     * This viewer's own choice this night, and nothing else. A thing they just
     * did and already know, handed back so the screen can say it registered.
     * Null for anyone who has not chosen, and for the GM: the doctor's save
     * stays hidden from them until dawn, which is deliberate.
     */
    yourPick: string | null;
  };
  detectiveResult: NightOutcome['detective'];
  /**
   * The night told back, only as far as the GM has read it. Everyone gets the
   * same lines: this is the room's narration, not the GM's teleprompter, and
   * the beat that names the dead is the beat they learn it.
   */
  dawn: { lines: string[]; revealed: boolean } | null;
  lastNight: NightOutcome | null;
  winner: Team | null;
}

function toView(p: Player, roleVisible: boolean, withheld: boolean): PlayerView {
  return {
    id: p.id,
    name: p.name,
    // Still standing, as far as this room knows, until the GM says otherwise.
    alive: withheld ? true : p.alive,
    role: roleVisible ? p.role : null,
    eliminatedAtPhase: withheld ? null : p.eliminatedAtPhase,
    eliminatedBy: withheld ? null : p.eliminatedBy,
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

/**
 * What this viewer chose tonight, whichever role they hold. Their own action
 * only: never another player's, and never the GM's view of anybody's.
 */
function ownPick(state: GameState, viewer: Player | undefined): string | null {
  if (viewer === undefined || !viewer.alive) return null;

  if (viewer.role === 'MAFIA') return state.night.mafiaVotes[viewer.id] ?? null;
  if (viewer.role === 'DOCTOR') return state.night.doctorSave;
  if (viewer.role === 'DETECTIVE') return state.night.detectiveCheck;
  return null;
}

export function projectState(state: GameState, viewerId: string): ViewState {
  const viewer = state.players.find((p) => p.id === viewerId);
  // Held back until the line that names them is read, for everyone including
  // the person it is about. That withholding is the whole mechanic.
  const withheld = withheldAtDawn(state);
  const told = dawnRevealed(state);
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
    players: state.players.map((p) =>
      toView(p, canSeeRoleOf(state, isGm, viewer, p), withheld.has(p.id)),
    ),
    dayVotes: { ...state.dayVotes },
    night: {
      mafiaVotes: inMafiaRoom ? { ...state.night.mafiaVotes } : null,
      yourPick: ownPick(state, viewer),
    },
    detectiveResult: isDetective ? (state.lastNight?.detective ?? null) : null,
    dawn:
      state.phase === 'DAWN'
        ? {
            lines: dawnScript(state).lines.slice(0, (state.dawnBeat ?? 0) + 1),
            revealed: told,
          }
        : null,
    lastNight: isGm ? state.lastNight : null,
    winner: state.winner,
  };
}
