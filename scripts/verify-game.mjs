import { io } from 'socket.io-client';
import { REALTIME_NAMESPACE } from '../src/realtime/events.ts';

/**
 * Plays a whole game through real sockets: six join, one narrates, five draw
 * roles, and the loop runs until checkWinCondition fires. The standing
 * assertion, checked after every single phase, is that no player's payload ever
 * carries another player's role.
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

function connect(token, name) {
  const socket = io(`${baseUrl}${REALTIME_NAMESPACE}`, { auth: { token } });
  socket.name = name;
  socket.views = [];
  socket.on('roomState', (view) => socket.views.push(view));
  socket.on('roomError', (error) => {
    socket.lastError = error;
  });
  return new Promise((resolve, reject) => {
    socket.once('roomState', () => resolve(socket));
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error(`${name}: no roomState in 10s`)), 10000);
  });
}

const latest = (socket) => socket.views.at(-1);
async function waitFor(predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return false;
}

const checks = [];
const record = (label, ok) => {
  checks.push([label, ok]);
  return ok;
};

const NAMES = ['Ada', 'Musa', 'Toniey', 'Chidi', 'Bola', 'Emeka'];
const crew = await api('/api/crew', { name: 'Full game' });
console.log(`crew        ${crew.code}`);

const joins = [];
for (const displayName of NAMES) {
  joins.push(await api(`/api/crew/${crew.code}/join`, { displayName, playerId: null }));
}
const sockets = [];
for (const [i, join] of joins.entries()) sockets.push(await connect(join.token, NAMES[i]));
await waitFor(() => sockets.every((s) => latest(s)?.members?.length === 6));

// The first socket taps Start and becomes the narrator.
const gm = sockets[0];
gm.emit('startSession');
await waitFor(() => latest(gm)?.game !== null);

const gmId = latest(gm).gmPlayerId;
const players = sockets.filter((s) => latest(s).you.playerId !== gmId);
record('the GM narrates and holds no role', latest(gm).game.players.every((p) => p.id !== gmId));
record('five players drew roles', latest(gm).game.players.length === 5);
record('all six are still in the room', latest(gm).members.length === 6);

/** The standing secrecy assertion, run after every phase. */
function assertNoRoleLeak(phase) {
  for (const socket of players) {
    const view = latest(socket);
    if (!view?.game) continue;
    const me = view.you.playerId;
    const leaked = view.game.players.filter((p) => p.role !== null && p.id !== me);
    if (leaked.length > 0 && view.game.phase !== 'GAME_OVER') {
      record(`${socket.name} saw another role in ${phase}: ${JSON.stringify(leaked)}`, false);
      return;
    }
  }
}

const roleOf = (id) => latest(gm).game.players.find((p) => p.id === id)?.role;
const livingIds = () => latest(gm).game.players.filter((p) => p.alive).map((p) => p.id);
const socketFor = (id) => players.find((s) => latest(s).you.playerId === id);
const advance = async (from) => {
  gm.emit('advance');
  await waitFor(() => latest(gm)?.game?.phase !== from);
  assertNoRoleLeak(from);
};

let guard = 0;
let mafiaSeen = false;
let voteSeen = false;

while (latest(gm).game.phase !== 'GAME_OVER' && guard < 40) {
  guard += 1;
  const phase = latest(gm).game.phase;

  if (phase === 'NIGHT_MAFIA') {
    const mafia = livingIds().find((id) => roleOf(id) === 'MAFIA');
    const target = livingIds().find((id) => id !== mafia);
    const actor = socketFor(mafia);
    actor.emit('mafiaVote', target);
    await waitFor(() => latest(actor)?.game?.night?.mafiaVotes?.[mafia] === target);
    mafiaSeen = true;

    // A non-Mafia must not be able to see the Mafia channel.
    const townie = players.find((s) => roleOf(latest(s).you.playerId) !== 'MAFIA');
    record('a townie cannot see the Mafia ballot', latest(townie).game.night.mafiaVotes === null);
  } else if (phase === 'NIGHT_DETECTIVE') {
    const detective = livingIds().find((id) => roleOf(id) === 'DETECTIVE');
    const target = livingIds().find((id) => id !== detective);
    socketFor(detective).emit('detectiveCheck', target);
    await waitFor(() => latest(socketFor(detective))?.game?.night?.detectiveCheck === target);
  } else if (phase === 'DAWN') {
    // The Detective's result must reach exactly one player.
    const holders = players.filter((s) => latest(s).game.detectiveResult !== null);
    if (holders.length > 0) {
      record('the Detective result reaches exactly one player', holders.length === 1);
      record(
        'the result names a team, never a role',
        ['TOWN', 'MAFIA'].includes(latest(holders[0]).game.detectiveResult.team),
      );
    }
  } else if (phase === 'VOTE') {
    const living = livingIds();
    const target = living.find((id) => roleOf(id) === 'MAFIA') ?? living[0];
    for (const id of living.filter((v) => v !== target)) socketFor(id)?.emit('castVote', target);
    await waitFor(() => Object.keys(latest(gm).game.dayVotes).length >= living.length - 1);

    // Public ballot: every living player sees the same votes.
    const ballots = living.map((id) => JSON.stringify(latest(socketFor(id))?.game?.dayVotes ?? {}));
    record('the ballot is public and identical for all', new Set(ballots).size === 1);
    voteSeen = true;
  }

  await advance(phase);
}

const final = latest(gm).game;
record('the game reached GAME_OVER', final.phase === 'GAME_OVER');
record('game-core declared a winner', final.winner === 'TOWN' || final.winner === 'MAFIA');
record('a night actually happened', mafiaSeen);
record('a day vote actually happened', voteSeen);
record('at least one player was eliminated', final.players.some((p) => !p.alive));

// Debrief: every card revealed, and the dead have their voice back.
for (const socket of players) {
  const view = latest(socket);
  record(`${socket.name} sees every card at the debrief`, view.game.players.every((p) => p.role !== null));
}
const deadId = final.players.find((p) => !p.alive)?.id;
const deadSocket = socketFor(deadId);
record('the dead speak again at GAME_OVER', (latest(deadSocket)?.audio?.speaksTo?.length ?? 0) > 0);

console.log(`winner      ${final.winner}`);
console.log(`phases      ${guard}`);
console.log(`survivors   ${final.players.filter((p) => p.alive).length} of 5`);
console.log('');

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

for (const socket of sockets) socket.close();
console.log(`\n${failed === 0 ? 'all checks passed' : `${failed} check(s) failed`}`);
process.exit(failed === 0 ? 0 : 1);
