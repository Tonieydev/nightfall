import { io } from 'socket.io-client';
import { REALTIME_NAMESPACE } from '../src/realtime/events.ts';

/**
 * Fills a room with five bots and leaves the sixth seat — and the Start button
 * — for a human. Whoever presses Start becomes the GM, so the bots deliberately
 * never press it.
 *
 * The bots only ever act on what their OWN projection tells them, which is the
 * same constraint a real player has: none of them can see another player's role.
 */
const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3000';
const NAMES = ['Ada', 'Musa', 'Chidi', 'Bola', 'Emeka'];

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

const crew = await api('/api/crew', { name: 'Test night' });
const code = crew.code;

const bots = [];
for (const name of NAMES) {
  const joined = await api(`/api/crew/${code}/join`, { displayName: name });
  const socket = io(`${baseUrl}${REALTIME_NAMESPACE}`, { auth: { token: joined.token } });
  const bot = { name, playerId: joined.playerId, socket, acted: new Set() };

  socket.on('roomError', (e) => console.log(`  ! ${name}: ${e.code} — ${e.message}`));
  socket.on('roomState', (view) => void react(bot, view));
  bots.push(bot);
  await wait(150);
}

let lastPhase = null;

/** One bot's turn, decided only from that bot's own projected state. */
async function react(bot, view) {
  const game = view.game;
  if (!game) return;

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
    // A beat, so a human watching sees it happen rather than finding it done.
    setTimeout(() => {
      bot.socket.emit(event, targetId);
      const target = game.players.find((p) => p.id === targetId);
      console.log(`   ${bot.name} ${label} ${target?.name ?? targetId}`);
    }, 1200 + Math.random() * 1800);
  };

  if (game.phase === 'NIGHT_MAFIA' && me.role === 'MAFIA') {
    const town = others.filter((p) => p.role !== 'MAFIA');
    act('mafiaVote', pick(town.length > 0 ? town : others).id, 'targets');
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
│  Five bots are seated. The sixth seat is yours.              │
╰──────────────────────────────────────────────────────────────╯

   Open:  ${baseUrl}/c/${code}

   Type a name, allow the mic, then press Start — whoever
   presses Start becomes the GM, so that will be you.

   The bots act on their own turns. You narrate and Advance.
   Ctrl-C here when you are done.
`);

process.on('SIGINT', () => {
  for (const bot of bots) bot.socket.disconnect();
  console.log('\nbots disconnected.');
  process.exit(0);
});
