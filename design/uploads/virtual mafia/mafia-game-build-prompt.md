# Build Prompt: Online Multiplayer Mafia Game

Paste everything below this line into your other Claude session.

---

I want to build a real-time, browser-based multiplayer Mafia (Werewolf-style) game that supports rooms of anywhere from 5 to 20+ players. Build this incrementally, confirming each phase with me before moving to the next. Here's the full spec.

## 1. Core Concept

A social deduction game where players are secretly assigned roles (Mafia vs Town) and alternate between:
- **Night phase**: Mafia secretly choose a target to eliminate; special roles (Doctor, Detective) take private actions.
- **Day phase**: All surviving players discuss publicly, then vote to eliminate a suspect.
- Game ends when either all Mafia are eliminated (Town wins) or Mafia equal/outnumber Town (Mafia wins).

## 2. Roles (scale with player count)

| Role | Team | Ability |
|---|---|---|
| Villager | Town | No special power, votes during the day |
| Mafia | Mafia | Sees fellow Mafia, votes on a night kill target |
| Doctor | Town | Each night, protects one player from being killed |
| Detective/Sheriff | Town | Each night, investigates one player's alignment |
| Jester (optional) | Neutral | Wins if voted out during the day |

Suggested role ratios:
- 5–7 players: 1 Mafia, 1 Doctor, 1 Detective, rest Villagers
- 8–12 players: 2 Mafia, 1 Doctor, 1 Detective, rest Villagers
- 13–20+ players: 3–4 Mafia (roughly 25% of lobby), 1–2 Doctor, 1–2 Detective, optional Jester, rest Villagers

Build role assignment as a configurable ratio function, not hardcoded, so the host can also manually override counts before starting.

## 3. Game Flow

1. **Lobby**: Host creates a room, gets a shareable 4-6 character room code. Players join with name + code.
2. **Host controls**: Start game (locks lobby), kick player, adjust role settings, set timer durations.
3. **Role reveal**: Each player privately sees their own role and (if Mafia) teammates.
4. **Night phase**: Timed. Mafia get a private chat + vote. Doctor and Detective get private single-target actions. Other players see a "Night falls..." waiting screen.
5. **Resolution**: Server resolves night actions (kill vs. protect), announces result to everyone (who died, not who did what).
6. **Day phase**: Timed public discussion + open chat, then a voting phase where all living players vote to eliminate someone (or skip).
7. **Elimination + win check**: Reveal outcome, check win condition, either loop back to Night or end game with results.
8. **End screen**: Reveal all roles, show timeline of eliminations, option to play again with same lobby.

## 4. Tech Stack

- **Frontend**: React + Tailwind, single-page app with route-like views (Lobby, Role Reveal, Night, Day, Voting, End)
- **Realtime layer**: Socket.io (WebSockets) for all game state sync — this is the backbone, not REST
- **Backend**: Node.js + Express, Socket.io server
- **State store**: Redis for room/game state (fast, supports TTL for auto-cleanup of dead rooms) — an in-memory JS object is fine for an MVP/single-instance version, but design the state layer so Redis can be swapped in without rewriting game logic
- **Deployment**: Render or Railway for backend (needs persistent WebSocket connections, so avoid serverless functions), Vercel or Netlify for frontend

## 5. Architecture Requirements

- **Server-authoritative state**: All role assignments, votes, and night actions are resolved server-side. Clients never receive information they shouldn't see (e.g., a Villager's client should never even receive Mafia identities in the payload — not just hide it in the UI).
- **Room model**: `{ roomCode, hostId, players[], phase, roleConfig, timers, nightActions, dayVotes, eliminationHistory }`
- **Reconnection handling**: If a player refreshes or drops, they should be able to rejoin with the same session (store a player token in localStorage) and resume their current game state without breaking the room for others.
- **Timers**: Server-driven countdown broadcast to all clients, so phases auto-advance even if players go idle.
- **Spectator mode**: Eliminated players can keep watching and use a "dead chat" without affecting the live game.

## 6. Build Order (confirm with me after each step)

1. Lobby + room creation/joining + host controls (no game logic yet)
2. Role assignment logic + private role reveal screen
3. Night phase: Mafia private chat/vote + Doctor/Detective actions + server resolution
4. Day phase: public chat + voting + elimination
5. Win condition checks + end screen + play-again loop
6. Reconnection handling + spectator/dead chat
7. Polish: timers, animations, sound cues, mobile responsiveness

## 7. Non-Goals for MVP

- No user accounts/auth — name + room code is enough
- No persistent database beyond the current game session
- No monetization/ads
- No native mobile app — responsive web only

Start with Step 1. Ask me clarifying questions only if something above is ambiguous; otherwise make reasonable calls and show me working code.
