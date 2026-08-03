'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { BroadcastIcon, PlugsConnectedIcon, PlugsIcon } from '@phosphor-icons/react';
import {
  REALTIME_NAMESPACE,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@/realtime/events';

type HarnessSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type Status = 'connecting' | 'connected' | 'disconnected';

// Distinguishes the two browser windows in the transcript without a join form.
function randomName(): string {
  return `window-${Math.random().toString(36).slice(2, 6)}`;
}

export default function HarnessPage() {
  const [status, setStatus] = useState<Status>('connecting');
  const [connectionId, setConnectionId] = useState<string>('—');
  const [name, setName] = useState<string>('—');
  const [lastPayload, setLastPayload] = useState<string>('nothing received yet');
  const socketRef = useRef<HarnessSocket | null>(null);

  useEffect(() => {
    const socket: HarnessSocket = io(REALTIME_NAMESPACE, {
      auth: { name: randomName() },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
    });
    socket.on('disconnect', () => {
      setStatus('disconnected');
    });
    socket.on('welcome', (payload) => {
      setConnectionId(payload.connectionId);
      setName(payload.name);
      setLastPayload(JSON.stringify(payload, null, 2));
    });
    socket.on('pong', (payload) => {
      setLastPayload(JSON.stringify(payload, null, 2));
    });
    socket.on('peerPing', (payload) => {
      setLastPayload(JSON.stringify(payload, null, 2));
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const statusTag =
    status === 'connected' ? 'tag tag-accent' : status === 'connecting' ? 'tag tag-neutral' : 'tag tag-outline';

  return (
    <main className="p-8">
      <div className="card">
        <p className="card-kicker">Step 2 — realtime pipe</p>
        <h4 className="card-title">Socket harness</h4>

        <div className="flex items-center gap-2 mb-4">
          <span className={statusTag}>
            {status === 'connected' ? (
              <PlugsConnectedIcon size={14} weight="regular" />
            ) : (
              <PlugsIcon size={14} weight="regular" />
            )}
            {status}
          </span>
          <span className="text-muted">
            {name} · {connectionId}
          </span>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            socketRef.current?.emit('ping');
          }}
        >
          <BroadcastIcon size={16} weight="regular" />
          Ping
        </button>

        <pre className="card-body mt-6 whitespace-pre-wrap">{lastPayload}</pre>
      </div>
    </main>
  );
}
