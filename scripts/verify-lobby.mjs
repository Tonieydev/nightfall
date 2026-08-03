import { io } from 'socket.io-client';
import { REALTIME_NAMESPACE } from '../src/realtime/events.ts';

/**
 * Exercises the start gate against a running server: below the floor Start is
 * refused, at the floor it is granted, and two simultaneous taps produce one GM.
 */
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3100';

async function api(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(parsed)}`);
  return parsed;
}

function connect(token) {
  const socket = io(`${baseUrl}${REALTIME_NAMESPACE}`, { auth: { token } });
  socket.views = [];
  socket.errors = [];
  socket.on('roomState', (view) => socket.views.push(view));
  socket.on('roomError', (error) => socket.errors.push(error));
  return new Promise((resolve, reject) => {
    socket.once('roomState', () => resolve(socket));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('no roomState within 8s')), 8000);
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 800));
const latest = (socket) => socket.views.at(-1);

// Upstash round-trips dwarf the in-memory store, so wait for the condition
// rather than a fixed sleep. Bounded, so a genuine failure still fails.
async function waitFor(predicate, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function lobbyOf(size) {
  const crew = await api('/api/crew', { name: `Gate ${String(size)}` });
  const sockets = [];
  for (let i = 1; i <= size; i += 1) {
    const join = await api(`/api/crew/${crew.code}/join`, {
      displayName: `P${String(i)}`,
      playerId: null,
    });
    sockets.push(await connect(join.token));
  }
  await settle();
  return { crew, sockets };
}

const checks = [];
const record = (label, ok) => checks.push([label, ok]);

// Five present is one short: the GM does not play, and assignRoles needs five.
const five = await lobbyOf(5);
record('five present cannot start', latest(five.sockets[0]).canStart === false);
five.sockets[0].emit('startSession');
const refused = await waitFor(() =>
  five.sockets[0].errors.some((e) => e.code === 'NOT_ENOUGH_PLAYERS'),
);
record('a start tap at five is refused', latest(five.sockets[0]).gmPlayerId === null);
record('the refusal says why', refused);
for (const socket of five.sockets) socket.close();

const six = await lobbyOf(6);
record('six present can start', latest(six.sockets[0]).canStart === true);

// Two taps land together; SETNX must settle it to exactly one GM.
six.sockets[2].emit('startSession');
six.sockets[4].emit('startSession');
await waitFor(() => six.sockets.every((s) => latest(s).gmPlayerId !== null));
await settle();

const gms = six.sockets.map((s) => latest(s).gmPlayerId);
record('every socket agrees on one GM', new Set(gms).size === 1 && gms[0] !== null);
record('the GM is a member of the lobby', latest(six.sockets[0]).members.some((m) => m.playerId === gms[0]));
record('exactly one socket reports being GM', six.sockets.filter((s) => latest(s).you.isGm).length === 1);
record('nobody lost their seat to the start', latest(six.sockets[0]).members.length === 6);
record('start is no longer offered', latest(six.sockets[0]).canStart === false);

console.log(`GM          ${gms[0]}`);
console.log(`members     ${latest(six.sockets[0]).members.length}`);
console.log('');

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

for (const socket of six.sockets) socket.close();
console.log(`\n${failed === 0 ? 'all checks passed' : `${failed} check(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
