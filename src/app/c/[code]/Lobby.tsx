'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { CircleIcon, CrownSimpleIcon, PlayIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { GmConsole } from './GmConsole';
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
      <div className="card">
        <p className="card-kicker">{crewCode}</p>
        <h4 className="card-title">Joining…</h4>
        {error !== null ? <p className="card-meta">{error.message}</p> : null}
      </div>
    );
  }

  const emit = socketRef.current;

  // Once the game exists the lobby is done: the GM narrates, everyone else plays.
  if (view.game !== null) {
    return view.you?.isGm === true ? (
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
    ) : (
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
        }}
      />
    );
  }

  const seated = view.members.length;

  return (
    <div className="card">
      <p className="card-kicker">Crew {view.crewCode}</p>
      <h4 className="card-title">Lobby</h4>

      <p className="card-meta">
        <UsersThreeIcon size={14} /> {seated} here
        {view.gmPlayerId === null ? ' · nobody is moderating yet' : null}
        {live ? null : ' · reconnecting'}
      </p>

      <ul className="my-4 flex list-none flex-col gap-2 p-0">
        {view.members.map((member) => (
          <li key={member.playerId} className="flex items-center gap-2">
            <CircleIcon
              size={10}
              weight={member.connected ? 'fill' : 'regular'}
              aria-label={member.connected ? 'connected' : 'away'}
            />
            <span className={member.connected ? undefined : 'text-muted'}>
              {member.displayName}
            </span>
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
          className="btn btn-primary btn-block"
          disabled={!view.canStart}
          onClick={() => socketRef.current?.emit('startSession')}
        >
          <PlayIcon size={16} />
          {view.canStart ? 'Start — you moderate' : `Waiting for ${6 - seated} more`}
        </button>
      ) : (
        <p className="card-meta">
          {view.you?.isGm === true
            ? 'You are moderating this session.'
            : 'The session has started.'}
        </p>
      )}

      {error !== null ? <p className="card-meta">{error.message}</p> : null}
    </div>
  );
}
