import { io } from 'socket.io-client';
import { REALTIME_NAMESPACE } from '../src/realtime/events.ts';

/**
 * Drives a real crew through create -> join -> lobby and asserts that every
 * socket receives a payload scoped to itself. Same shape as step 2's verifier:
 * point it at localhost or at the deployed URL.
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
  socket.on('roomState', (view) => socket.views.push(view));

  return new Promise((resolve, reject) => {
    socket.once('roomState', () => resolve(socket));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error('no roomState within 8s')), 8000);
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 700));
const latest = (socket) => socket.views.at(-1);

// Upstash round-trips are far slower than the in-memory store, so wait for the
// state to arrive rather than guessing a duration. Still bounded: a condition
// that never becomes true fails the check instead of hanging.
async function waitFor(predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

const crew = await api('/api/crew', { name: 'Verification crew' });
console.log(`crew        ${crew.code}`);

const names = ['Ada', 'Musa', 'Toniey'];
const joins = [];
for (const displayName of names) {
  joins.push(await api(`/api/crew/${crew.code}/join`, { displayName, playerId: null }));
}

const sockets = [];
for (const join of joins) sockets.push(await connect(join.token));
await settle();

const checks = [];
const record = (label, ok) => checks.push([label, ok]);

for (const [index, socket] of sockets.entries()) {
  const view = latest(socket);
  const join = joins[index];

  record(`${names[index]} is told who they are`, view?.you?.playerId === join.playerId);
  record(`${names[index]}'s payload names them`, view?.you?.displayName === names[index]);
  record(`${names[index]} sees all three members`, view?.members?.length === 3);
  record(`${names[index]} is not marked GM`, view?.you?.isGm === false);
  record(`${names[index]} cannot start with 3 present`, view?.canStart === false);
}

const selves = sockets.map((s) => latest(s)?.you?.playerId);
record('every socket got a different `you`', new Set(selves).size === 3);

// The rosters agree while the per-viewer fields differ — that is the projection.
const rosters = sockets.map((s) => JSON.stringify(latest(s)?.members));
record('all three see the same roster', new Set(rosters).size === 1);
record(
  'no two payloads are identical',
  new Set(sockets.map((s) => JSON.stringify(latest(s)))).size === 3,
);

// An unauthenticated socket must get nothing at all.
const anonymous = await new Promise((resolve) => {
  const socket = io(`${baseUrl}${REALTIME_NAMESPACE}`, { auth: {} });
  let received = false;
  socket.on('roomState', () => {
    received = true;
  });
  socket.on('connect_error', () => {
    socket.close();
    resolve({ received });
  });
  setTimeout(() => {
    socket.close();
    resolve({ received });
  }, 2500);
});
record('an unauthenticated socket receives no state', anonymous.received === false);

// Disconnecting one player must show up live for the others.
sockets[2].close();
const dropSeen = await waitFor(
  () =>
    latest(sockets[0])?.members?.find((m) => m.playerId === joins[2].playerId)?.connected ===
    false,
);
const afterDrop = latest(sockets[0]);
record('a disconnect is visible to the others', dropSeen);
record('a disconnected player keeps their seat', afterDrop?.members?.length === 3);

console.log(`sample      ${JSON.stringify(latest(sockets[0]))}`);
console.log('');

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

for (const socket of sockets) socket.close();
console.log(`\n${failed === 0 ? 'all checks passed' : `${failed} check(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
