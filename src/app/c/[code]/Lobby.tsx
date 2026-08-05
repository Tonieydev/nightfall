'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CircleIcon, CrownSimpleIcon, PlayIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { Debrief } from './Debrief';
import { GmConsole } from './GmConsole';
import { MicRow } from './MicRow';
import { SetupPanel } from './SetupPanel';
import { litFor } from './phase-labels';
import { useVoice } from './useVoice';
import { PlayerScreen } from './PlayerScreen';
import {
  REALTIME_NAMESPACE,
  type ClientToServerEvents,
  type RoomErrorPayload,
  type ServerToClientEvents,
} from '@/realtime/events';
import type { RoomView } from '@/room-store';

type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function Lobby({
  token,
  crewCode,
  claimAvailable,
}: {
  token: string;
  crewCode: string;
  claimAvailable: boolean;
}) {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<RoomErrorPayload | null>(null);
  const [live, setLive] = useState(false);
  /**
   * Whether this person has put their hand up to run the game. Local, and
   * deliberately not on the server: nothing is reserved and nobody is blocked,
   * it only stops the Start button being the biggest thing on a stranger's
   * screen the moment they arrive. The seat is still taken by whoever presses
   * Start, which is the spec's rule.
   */
  const [moderating, setModerating] = useState(false);

  /**
   * Opening voice, then telling the server the device has arrived. Subscriptions
   * are issued by walking the participants LiveKit reports, so joining between
   * phase changes used to leave a player connected, unsubscribed and silent
   * until the GM happened to advance. This closes that window.
   */
  const openVoice = (): void => {
    void voice.connect().then(() => socketRef.current?.emit('voiceReady'));
  };
  const socketRef = useRef<LobbySocket | null>(null);
  const voice = useVoice(crewCode, token);

  useEffect(() => {
    const socket: LobbySocket = io(REALTIME_NAMESPACE, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      setLive(true);
      setError(null);
    });
    socket.on('disconnect', () => {
      setLive(false);
    });
    // The server owns the state; a refresh rehydrates from this, never from
    // anything the client kept.
    socket.on('roomState', setView);
    socket.on('roomError', setError);
    socket.on('connect_error', () => {
      setLive(false);
      setError({ code: 'UNAUTHENTICATED', message: 'could not authenticate this device' });
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [token]);

  if (view === null) {
    return (
      <div className="nf-card">
        <p className="nf-kicker">{crewCode}</p>
        <h4>Joining…</h4>
        {error !== null ? <p className="nf-muted">{error.message}</p> : null}
      </div>
    );
  }

  const emit = socketRef.current;

  // Once the game exists the lobby is done: the GM narrates, everyone else plays.
  if (view.game !== null) {
    const lit = litFor(view.game.phase);

    // The debrief is the same screen for everyone, GM included: every card is
    // already revealed, so there is nothing left to project differently.
    if (view.game.phase === 'GAME_OVER') {
      return (
        <div className="nf-stage" data-lit={lit}>
          <Debrief
            view={view}
            claimAvailable={claimAvailable}
            onNewSession={() => {
              setModerating(false);
              emit?.emit('newSession');
            }}
          />
        </div>
      );
    }

    return view.you?.isGm === true ? (
      <div className="nf-stage" data-lit={lit}>
      <GmConsole
        view={view}
        voiceStatus={voice.status}
        voiceReason={voice.reason}
        audioBlocked={voice.audioBlocked}
        onEnableVoice={openVoice}
        onEnableAudio={() => void voice.enableAudio()}
        actions={{
          onAdvance: () => emit?.emit('advance'),
          onForceKill: (id) => emit?.emit('forceKill', id),
          onForceRevive: (id) => emit?.emit('forceRevive', id),
          onRevertPhase: () => emit?.emit('revertPhase'),
          onEndGame: () => emit?.emit('endGame'),
          onHandOff: (id) => emit?.emit('handOffGm', id),
        }}
      />
      </div>
    ) : (
      <div className="nf-stage" data-lit={lit}>
      <PlayerScreen
        view={view}
        actions={{
          onNightTarget: (id) => {
            if (view.game?.phase === 'NIGHT_MAFIA') emit?.emit('mafiaVote', id);
            else if (view.game?.phase === 'NIGHT_DOCTOR') emit?.emit('doctorSave', id);
            else if (view.game?.phase === 'NIGHT_DETECTIVE') emit?.emit('detectiveCheck', id);
          },
          onVote: (id) => emit?.emit('castVote', id),
          onClearVote: () => emit?.emit('clearVote'),
          onEnableVoice: openVoice,
          onEnableAudio: () => void voice.enableAudio(),
        }}
        voiceStatus={voice.status}
        voiceReason={voice.reason}
        audioBlocked={voice.audioBlocked}
      />
      </div>
    );
  }

  const seated = view.members.length;

  return (
    <div className="nf-card">
      <p className="nf-kicker">Crew code, paste this into the group</p>
      <p className="nf-code">{view.crewCode}</p>

      <p className="nf-muted">
        <UsersThreeIcon size={14} /> {seated} here
        {view.gmPlayerId === null ? ' · nobody is moderating yet' : null}
        {live ? null : ' · reconnecting'}
      </p>

      <ul className="nf-roster">
        {view.members.map((member) => (
          <li key={member.playerId} className="nf-row" data-dead={String(!member.connected)}>
            <CircleIcon
              size={10}
              weight={member.connected ? 'fill' : 'regular'}
              aria-label={member.connected ? 'connected' : 'away'}
            />
            <span className="nf-name">{member.displayName}</span>
            {member.playerId === view.you?.playerId ? (
              <span className="tag tag-neutral">you</span>
            ) : null}
            {member.playerId === view.gmPlayerId ? (
              <span className="tag tag-outline">
                <CrownSimpleIcon size={12} /> GM
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Voice is opened here, before a game exists. It was only reachable from
          the player screen, which does not exist until the game is under way,
          so the permission prompt arrived mid narration if it arrived at all.
          iOS wants this gesture early, and so does everybody else. */}
      <MicRow
        view={view}
        status={voice.status}
        reason={voice.reason}
        audioBlocked={voice.audioBlocked}
        onEnable={openVoice}
        onEnableAudio={() => void voice.enableAudio()}
      />

      {view.gmPlayerId === null ? (
        !view.canStart ? (
          <button type="button" className="nf-advance btn btn-secondary" disabled>
            <PlayIcon size={16} />
            {`Waiting for ${String(6 - seated)} more`}
          </button>
        ) : moderating ? (
          // Whoever presses Start still becomes the GM. This is only the step
          // that makes the press deliberate.
          <SetupPanel
            playerCount={Math.max(0, view.members.length - 1)}
            canStart={view.canStart}
            onStart={(setup) => socketRef.current?.emit('startSession', setup)}
          />
        ) : (
          <>
            <button
              type="button"
              className="nf-advance btn btn-secondary"
              onClick={() => setModerating(true)}
            >
              <CrownSimpleIcon size={16} />
              I will moderate
            </button>
            <p className="nf-muted">
              One of you runs the night and does not play. Everyone else waits here.
            </p>
          </>
        )
      ) : (
        <p className="nf-muted">
          {view.you?.isGm === true
            ? 'You are moderating this session.'
            : 'The session has started.'}
        </p>
      )}

      {error !== null ? <p className="nf-muted">{error.message}</p> : null}
    </div>
  );
}
