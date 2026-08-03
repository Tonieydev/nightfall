import { io } from 'socket.io-client';
import { REALTIME_NAMESPACE } from '../src/realtime/events.ts';

// Proves the per-recipient emit that role secrecy will depend on: the pinging
// socket gets its own connection id back, and every other socket gets a payload
// that does not carry it. Point it at localhost or at the deployed URL.
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3100';

function connect(name) {
  // Default transports: polling first, then upgrade — what a browser does.
  const socket = io(`${baseUrl}${REALTIME_NAMESPACE}`, { auth: { name } });
  socket.received = { pong: [], peerPing: [] };
  socket.on('pong', (p) => socket.received.pong.push(p));
  socket.on('peerPing', (p) => socket.received.peerPing.push(p));

  return new Promise((resolve, reject) => {
    socket.once('welcome', (welcome) => {
      socket.welcome = welcome;
      resolve(socket);
    });
    socket.once('connect_error', reject);
  });
}

const [a, b, c] = await Promise.all([connect('window-A'), connect('window-B'), connect('window-C')]);

a.emit('ping');
await new Promise((resolve) => setTimeout(resolve, 600));

const aId = a.welcome.connectionId;
const checks = [
  ['A receives exactly one pong', a.received.pong.length === 1],
  ['A receives no peerPing', a.received.peerPing.length === 0],
  ['B receives exactly one peerPing', b.received.peerPing.length === 1],
  ['C receives exactly one peerPing', c.received.peerPing.length === 1],
  ['B receives no pong', b.received.pong.length === 0],
  ['C receives no pong', c.received.pong.length === 0],
  ["A's pong carries A's own connection id", a.received.pong[0]?.connectionId === aId],
  ["B's peerPing does not carry A's connection id", !JSON.stringify(b.received.peerPing).includes(aId)],
  ["C's peerPing does not carry A's connection id", !JSON.stringify(c.received.peerPing).includes(aId)],
];

console.log(`target      ${baseUrl}${REALTIME_NAMESPACE}`);
console.log(`A id        ${aId}`);
console.log(`A received  ${JSON.stringify(a.received.pong[0] ?? null)}`);
console.log(`B received  ${JSON.stringify(b.received.peerPing[0] ?? null)}`);
console.log(`C received  ${JSON.stringify(c.received.peerPing[0] ?? null)}`);
console.log('');

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

for (const socket of [a, b, c]) socket.close();
console.log(`\n${failed === 0 ? 'all checks passed' : `${failed} check(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
