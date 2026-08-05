import { createServer } from 'node:http';

// Mode comes from the invoked script, not the environment: `pnpm start` must
// serve the production build on Railway whether or not NODE_ENV is set there.
const dev = process.argv.includes('--dev');
// Next's types mark NODE_ENV readonly; widen the reference rather than cast.
const env: Record<string, string | undefined> = process.env;
env['NODE_ENV'] ??= dev ? 'development' : 'production';

// Imported after NODE_ENV is fixed — Next reads it at module load.
const { default: next } = await import('next');
const { attachRealtime } = await import('./src/realtime/server.js');
const { loadServerConfig } = await import('./src/config.js');
const { getRoomStore } = await import('./src/room-store/index.js');
const { applyGraphToRoom, destroyRoom } = await import('./src/voice/index.js');
const { recordFinishedGame } = await import('./src/durable/index.js');

const port = Number(process.env.PORT ?? 3000);
// Deliberately NOT process.env.HOSTNAME: container runtimes set that to the
// container id, so reading it binds the server to one internal interface —
// leaving loopback unbound and the platform's healthcheck unable to reach us.
// Bind every interface unless something explicitly narrows it.
const hostname = process.env.NIGHTFALL_HOST ?? '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => {
  void handle(req, res);
});

// Read at boot so a missing secret fails the process rather than the first join.
const config = loadServerConfig();
attachRealtime(httpServer, {
  store: getRoomStore(),
  jwtSecret: config.jwtSecret,
  // voice/ translates the graph game-core computed; it decides nothing.
  voice: {
    applyGraph: (roomCode, graph, voiceEnabled) => applyGraphToRoom(roomCode, graph, voiceEnabled),
    destroyRoom: (roomCode, voiceEnabled) => destroyRoom(roomCode, voiceEnabled),
  },
  // Written once at game end, and swallowing its own failures: Postgres is the
  // durable copy, never the render source.
  durable: { recordFinishedGame: (doc, endedAt) => recordFinishedGame(doc, endedAt) },
});

/**
 * The last resort, not the strategy.
 *
 * One instance serves every live room, so anything that reaches Node's default
 * handler takes the whole product down: a LiveKit 404 in a room that had merely
 * finished dropped every socket in every room still playing. Faults are handled
 * where they happen, and this is here so the next one nobody predicted costs a
 * log line instead of a restart.
 */
process.on('unhandledRejection', (reason) => {
  console.error('unhandled rejection, kept the process alive:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('uncaught exception, kept the process alive:', error);
});

httpServer.listen(port, hostname, () => {
  const backing = config.memoryRedis ? 'memory (dev)' : 'upstash';
  console.log(
    `nightfall on http://${hostname}:${String(port)} — dev=${String(dev)} state=${backing}`,
  );
});
