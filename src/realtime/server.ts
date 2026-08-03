import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  HARNESS_ROOM,
  REALTIME_NAMESPACE,
  readName,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from './events.js';

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export function attachRealtime(httpServer: HttpServer): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, { serveClient: false });
  const namespace = io.of(REALTIME_NAMESPACE);

  namespace.on('connection', (socket) => {
    socket.data.connectionId = socket.id;
    socket.data.name = readName(socket.handshake.auth);

    void socket.join(HARNESS_ROOM);

    socket.emit('welcome', {
      connectionId: socket.data.connectionId,
      name: socket.data.name,
      peerCount: namespace.sockets.size,
    });

    socket.on('ping', () => {
      // To this socket only: its own id.
      socket.emit('pong', {
        kind: 'pong',
        connectionId: socket.data.connectionId,
        name: socket.data.name,
        serverTime: Date.now(),
      });

      // To everyone else: a payload without it. `socket.to` excludes the sender.
      socket.to(HARNESS_ROOM).emit('peerPing', {
        kind: 'peer-ping',
        peerName: socket.data.name,
        peerCount: namespace.sockets.size,
        serverTime: Date.now(),
      });
    });
  });

  return io;
}
