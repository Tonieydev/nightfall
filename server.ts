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

const port = Number(process.env.PORT ?? 3000);
// Railway routes to the container's external interface, not to loopback.
const hostname = process.env.HOSTNAME ?? '0.0.0.0';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => {
  void handle(req, res);
});

// Read at boot so a missing secret fails the process rather than the first join.
const config = loadServerConfig();
attachRealtime(httpServer, { store: getRoomStore(), jwtSecret: config.jwtSecret });

httpServer.listen(port, hostname, () => {
  const backing = config.memoryRedis ? 'memory (dev)' : 'upstash';
  console.log(
    `nightfall on http://${hostname}:${String(port)} — dev=${String(dev)} state=${backing}`,
  );
});
