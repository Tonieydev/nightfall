'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CircleIcon, CrownSimpleIcon, PlayIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { GmConsole } from './GmConsole';
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

export function Lobby({ token, crewCode }: { token: string; crewCode: string }) {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState<RoomErrorPayload | null>(null);
  const [live, setLive] = useState(false);
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
    return view.you?.isGm === true ? (
      <div className="nf-stage" data-lit={lit}>
      <GmConsole
        view={view}
        actions={{
          onAdvance: () => emit?.emit('advance'),
          onForceKill: (id) => emit?.emit('forceKill', id),
          onForceRevive: (id) => emit?.emit('forceRevive', id),
          onRevertPhase: () => emit?.emit('revertPhase'),
          onEndGame: () => emit?.emit('endGame'),
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
          onEnableVoice: () => void voice.connect(),
        }}
        voiceStatus={voice.status}
      />
      </div>
    );
  }

  const seated = view.members.length;

  return (
    <div className="nf-card">
      <p className="nf-kicker">Crew code — paste this into the group</p>
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

      {view.gmPlayerId === null ? (
        <button
          type="button"
          className="nf-advance btn btn-primary"
          disabled={!view.canStart}
          onClick={() => socketRef.current?.emit('startSession')}
        >
          <PlayIcon size={16} />
          {view.canStart ? 'Start — you moderate' : `Waiting for ${6 - seated} more`}
        </button>
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
