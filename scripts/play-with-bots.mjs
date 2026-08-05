import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';
import { REALTIME_NAMESPACE } from '../src/realtime/events.ts';

/**
 * Fills a room with five bots and leaves the sixth seat — and the Start button
 * — for a human. Whoever presses Start becomes the GM, so the bots deliberately
 * never press it.
 *
 * The bots only ever act on what their OWN projection tells them, which is the
 * same constraint a real player has: none of them can see another player's role.
 *
 *   pnpm bots                     open a new room
 *   pnpm bots -- TXJWBW           put the same five back into an existing one
 *   pnpm bots -- TXJWBW http://…  against somewhere other than localhost:3000
 *
 * Run it through `pnpm bots`, never `node` directly: it imports a .ts module for
 * the socket namespace and needs tsx to load it.
 */
const args = process.argv.slice(2);
const isCount = (value) => /^\d{1,2}$/.test(value);
// A count is also six digits' worth of nothing, so it has to be ruled out
// before a bare number could ever be read as a crew code.
const isCode = (value) => /^[A-Z0-9]{6}$/i.test(value) && !isCount(value);

const existingCode = args.find(isCode)?.toUpperCase() ?? null;
const baseUrl = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:3000';

/** Eleven, because the twelfth of MAX_SEATS is the GM's and never a bot's. */
const POOL = [
  'Ada',
  'Musa',
  'Chidi',
  'Bola',
  'Emeka',
  'Ngozi',
  'Tunde',
  'Amara',
  'Kelechi',
  'Yemi',
  'Zainab',
];

const wanted = Number(args.find(isCount) ?? 5);
const NAMES = POOL.slice(0, Math.min(Math.max(wanted, 1), POOL.length));

/**
 * Where the bots' identities live between runs. The join route hands back an
 * identityToken and honours it on the way back in, which is the same mechanism
 * a player's phone uses after a refresh — so a bot that comes back this way
 * lands in the seat it already had rather than taking a second one. Without it,
 * restarting the script silently fills the room with ten strangers.
 */
const STATE_DIR = join(tmpdir(), 'nightfall-bots');
const stateFile = (code) => join(STATE_DIR, `${code}.json`);

function loadIdentities(code) {
  try {
    return JSON.parse(readFileSync(stateFile(code), 'utf8'));
  } catch {
    return {};
  }
}

function saveIdentities(code, identities) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(stateFile(code), JSON.stringify(identities, null, 2));
}

async function api(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${JSON.stringify(parsed)}`);
  return parsed;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Registered before the first socket exists, not after the last one. A throw
// during the join loop used to take the whole process down with it — which is
// precisely the window where the room is half-seated and least recoverable.
process.on('uncaughtException', (error) => console.log(`  ! ${error.stack ?? error}`));
process.on('unhandledRejection', (error) => console.log(`  ! ${error}`));

let lastPhase = null;
let reportedSeats = 0;

const code = existingCode ?? (await api('/api/crew', { name: 'Test night' })).code;
const identities = loadIdentities(code);

const bots = [];
for (const name of NAMES) {
  const joined = await api(`/api/crew/${code}/join`, {
    displayName: name,
    identityToken: identities[name] ?? null,
  });
  identities[name] = joined.identityToken;

  const socket = io(`${baseUrl}${REALTIME_NAMESPACE}`, {
    auth: { token: joined.token },
    // A bot that drops silently is worse than one that crashes: the room looks
    // full and nobody in it can act. Keep trying, forever.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  const bot = { name, playerId: joined.playerId, socket, acted: new Set() };

  socket.on('roomError', (e) => console.log(`  ! ${name}: ${e.code} — ${e.message}`));
  // One bot misreading one projection is not a reason to empty the room.
  socket.on('roomState', (view) => {
    try {
      react(bot, view);
    } catch (error) {
      console.log(`  ! ${name} could not act: ${error.stack ?? error}`);
    }
  });
  socket.on('connect_error', (e) => console.log(`  ! ${name}: cannot connect — ${e.message}`));
  socket.on('disconnect', (reason) => console.log(`  ~ ${name} dropped (${reason}), retrying`));
  socket.io.on('reconnect', () => console.log(`  ~ ${name} back`));

  bots.push(bot);
  await wait(150);
}

saveIdentities(code, identities);

/** One bot's turn, decided only from that bot's own projected state. */
function react(bot, view) {
  // Seats, not sockets. A restart that lost the identities shows up here as ten
  // members instead of five, which is the failure worth catching immediately.
  if (view.members.length !== reportedSeats) {
    reportedSeats = view.members.length;
    console.log(`   [${reportedSeats} seated] ${view.members.map((m) => m.displayName).join(', ')}`);
  }

  const game = view.game;
  if (!game) return;

  // This bot's own idea of where the room is, so a queued action can tell
  // whether its phase closed underneath it before emitting into the next one.
  bot.phase = game.phase;

  if (game.phase !== lastPhase) {
    lastPhase = game.phase;
    const alive = game.players.filter((p) => p.alive).length;
    console.log(`\n── ${game.phase} ──  ${alive} alive`);
    if (game.lastNight) console.log(`   last night: ${JSON.stringify(game.lastNight)}`);
    if (game.winner) console.log(`   *** ${game.winner} WINS ***`);
  }

  const me = game.players.find((p) => p.id === bot.playerId);
  if (!me || !me.alive) return;

  // One action per phase instance, so a re-render never double-fires.
  const turn = `${game.phase}:${game.phaseNumber}`;
  if (bot.acted.has(turn)) return;

  const others = game.players.filter((p) => p.alive && p.id !== bot.playerId);
  if (others.length === 0) return;

  const act = (event, targetId, label) => {
    bot.acted.add(turn);
    // A beat, so a human watching sees it happen rather than finding it done —
    // but a SHORT one. This used to wait up to three seconds, which a GM
    // tapping through the night beat every time: the emit landed a phase late,
    // the server refused it as WRONG_PHASE, and the mafia killed nobody all
    // game. The bots have to be quicker than the person testing them.
    setTimeout(() => {
      if (bot.phase !== game.phase) {
        console.log(`   ${bot.name} missed the window (${game.phase} closed)`);
        return;
      }
      bot.socket.emit(event, targetId);
      const target = game.players.find((p) => p.id === targetId);
      console.log(`   ${bot.name} ${label} ${target?.name ?? targetId}`);
    }, 200 + Math.random() * 400);
  };

  if (game.phase === 'NIGHT_MAFIA' && me.role === 'MAFIA') {
    // Every mafia bot reaches the SAME name, from state they can all already
    // see. Picking independently at random meant two mafia against three town
    // tied two nights in three, and a tie kills nobody — so the bots looked
    // broken when they were only failing to agree. Real mafia talk; these
    // cannot, so they agree by a rule instead. Rotating on the phase number
    // keeps them from hunting the same person every single night.
    const pool = (others.filter((p) => p.role !== 'MAFIA').length > 0
      ? others.filter((p) => p.role !== 'MAFIA')
      : others
    )
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : 1));

    act('mafiaVote', pool[game.phaseNumber % pool.length].id, 'targets');
  } else if (game.phase === 'NIGHT_DOCTOR' && me.role === 'DOCTOR') {
    act('doctorSave', pick(game.players.filter((p) => p.alive)).id, 'saves');
  } else if (game.phase === 'NIGHT_DETECTIVE' && me.role === 'DETECTIVE') {
    act('detectiveCheck', pick(others).id, 'investigates');
  } else if (game.phase === 'VOTE') {
    act('castVote', pick(others).id, 'votes for');
  }
}

console.log(`
╭──────────────────────────────────────────────────────────────╮
│${`  ${String(NAMES.length)} bots are seated. The next seat is yours.`.padEnd(62)}│
╰──────────────────────────────────────────────────────────────╯

   Open:  ${baseUrl}/c/${code}

   ${existingCode === null ? 'Type a name, allow the mic, then press Start — whoever' : 'Rejoin with the name you used before, and carry on — whoever'}
   press${existingCode === null ? 'es' : 'ed'} Start becomes the GM, so that ${existingCode === null ? 'will be' : 'is'} you.

   The bots act on their own turns. You narrate and Advance.
   Restart this with:  pnpm bots -- ${code}
   Ctrl-C here when you are done.
`);

/**
 * A heartbeat, and the reason this process cannot quietly evaporate. It also
 * holds the event loop open: if every socket were to fail to connect there would
 * be nothing left keeping node alive, and the script would exit 0 looking like
 * a clean finish while the room sat there empty.
 */
setInterval(() => {
  const live = bots.filter((b) => b.socket.connected).length;
  if (live < bots.length) {
    console.log(`   [${live}/${bots.length} connected] ${code} — waiting on the rest`);
  }
}, 15_000);

process.on('SIGINT', () => {
  for (const bot of bots) bot.socket.disconnect();
  console.log(`\nbots disconnected. seats kept — restart with: pnpm bots -- ${code}`);
  process.exit(0);
});
