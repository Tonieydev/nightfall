# Nightfall — Design Spec

**Product:** Voice-based online Mafia with a human Game Master
**Company:** Stravn Limited
**Design system:** Nocturne
**Status:** Approved for build
**Date:** 2026-08-03

---

## 0. Position

Remote friend groups play Mafia the way they play it in person: one open call, a human narrator, and a room that changes around the players instead of players moving between rooms.

**Differentiator:** human moderator + server-enforced who-hears-whom + zero install + WhatsApp-native audience. No competitor holds all four. The video-chat Mafia apps automate the moderator away and require a download. Moderator toolkits have a human GM but no audio layer. Discord bots are free but require a Discord habit this market doesn't have.

**Moat:** none at launch, and this is accepted. The technology is reproducible in two weeks by any competent developer. There are no network effects — Mafia is a closed-group game, so the product spreads virally without becoming defensible. The only durable asset is **crew memory**: accumulated history for a group that returns weekly. That is captured from day one in `SessionPlayer` and built on later.

**Monetization:** none in MVP. When it arrives it will be a seat cap — free to 8 players, paid above — because that is the only lever where the paywall sits directly on the cost curve.

---

## 1. Architecture

### State ownership

The server is the sole source of truth. The GM dashboard is a thin view that emits commands and renders projected state. It holds nothing authoritative. A GM refresh, tab crash, or locked phone does not touch the game.

- **Live state — Upstash Redis.** One JSON document per room, key `room:{code}`, 2-hour TTL. Not in-memory: a redeploy would kill every live game.
- **Durable record — Neon Postgres via Prisma.** Written once, at game end, in a single transaction. Never in the hot path. A crashed session writes nothing, which is correct — an abandoned game is not a record.

### Modules

**`game-core/`** — pure functions, zero I/O, zero dependencies.

```
assignRoles(playerIds, config, rng)  → RoleMap
advancePhase(state, now)             → GameState
computeAudioGraph(state)             → Map<speakerId, Set<listenerId>>
resolveNight(state)                  → GameState
tallyVotes(votes, alivePlayers)      → VoteOutcome
checkWinCondition(state)             → Team | null
projectState(state, viewerId)        → ViewState
```

Everything rule-critical and everything security-critical is a pure function of state. This makes "who hears whom" provable by unit test rather than by playing a game with ten friends and hoping.

**`room-store/`** — Redis read/modify/write with optimistic concurrency via a `version` field and compare-and-set. Every command is: read state → run a `game-core` function → write state → broadcast. Concurrent GM clicks cannot corrupt.

**`voice/`** — the only module aware LiveKit exists. Exposes `applyAudioGraph()`, `mintToken()`, `mutePublisher()`, `destroyRoom()`. If pricing turns hostile, one module is swapped.

**`realtime/`** — Socket.io. Authenticates, routes commands, dispatches **per-recipient projected state**. Never a global broadcast of raw state.

**`http/`** — Next.js route handlers. Crew create, join, token mint, health.

### Role secrecy

No shared payload ever contains roles. `projectState` runs per recipient before every emit:

| Viewer | Sees |
|---|---|
| Player | Own role. Fellow Mafia if Mafia. |
| GM | Everything. |
| Dead player | Everything except living players' roles. |

A player's socket physically never receives another player's role. This is a data-flow guarantee, not a UI decision.

### Auth

No accounts. Three tokens:

- **Host JWT** — issued on crew create, persisted client-side, enables GM reconnect
- **Player JWT** — carries `crewCode + playerId`
- **LiveKit access token** — short TTL, minted server-side, identity equals `playerId` so the audio graph maps directly with no translation layer

### Cost governors — step 1, not polish

Enforced in `http/` and `room-store/`:

- Hard cap: 12 players per room
- Hard 90-minute session lifetime, server destroys the room
- Global concurrent-room ceiling as an atomic Redis counter, with a kill switch
- Room creation fails closed at the ceiling
- Session start requires ≥5 players present
- Usage alarm at 70% of monthly LiveKit allowance

Without these, one post that lands takes the card down overnight.

**Known constraint:** single backend instance. Correct at this scale. This is the first thing that must break for horizontal scaling.

---

## 2. Phase engine and audio graph

### Governing rule

**Voice persuades. Tap decides.**

Every phase with a choice works identically: audio opens to whoever should be arguing, and the decision is cast through the tap UI and resolved deterministically by the server. No GM adjudication, no disputes. One mental model, one code path.

### Phase table

| Phase | GM audible to | Speaks | Decision | Ends by |
|---|---|---|---|---|
| `LOBBY` | all | all | — | GM |
| `ROLE_REVEAL` | all | all | — | GM |
| `NIGHT_MAFIA` | all alive + dead | mafia ↔ mafia | mafia tap, plurality | 45s or GM |
| `NIGHT_DOCTOR` | all alive + dead | nobody | doctor taps | doctor or GM |
| `NIGHT_DETECTIVE` | all alive + dead | nobody | detective taps | detective or GM |
| `DAWN` | all | nobody | — | GM |
| `DAY` | all | all alive | — | GM |
| `VOTE` | all | all alive | all alive tap, public | GM locks |
| `GAME_OVER` | all | all | — | — |

### The GM is never silenced

The moderator publishes to every player in every phase, including night. Town hears *"Mafia, wake up… Mafia, choose… Mafia, sleep."* They cannot hear the Mafia.

This restores the narrator's continuous voice — the spine of a real game — and kills the dead-air problem. Two minutes of total silence on a call reads as a dropped connection, not tension.

### Deviation from the physical game, and why

At a table, closed eyes block **vision**, not hearing — the town listens to the narrator while Mafia point silently. Online there is nothing to see, so hearing is blocked instead. Giving Mafia a voice channel therefore makes them stronger than at a table. This is accepted deliberately, bounded by the 45-second cap.

### Night resolution

Fixed order: mafia target → doctor save negates → detective result delivered.

At the 45-second expiry the plurality target dies. **A tie or zero votes means no kill** — a legitimate and occasionally devastating outcome, not a bug. No extensions, no GM intervention. The clock is part of the pressure.

Doctor and Detective are silent. They point. The detective's result lands as private text on their device the instant they tap, so the GM never whispers anything.

Dead players hear the GM at all times and hear living players during the day. They **do not** hear Mafia at night — otherwise the first eliminated player learns the entire Mafia roster, and that leaks through their timing, their face, and the next lobby.

### Timers

State carries `phaseEndsAt` as an absolute timestamp. Clients render a countdown from it and never drive it. The server holds a `setTimeout` per room, and every state read reconciles: if `phaseEndsAt` has passed, resolve before returning. Mid-timer redeploys self-heal without a job queue.

### Day phase

Everyone alive publishes to everyone alive. No push-to-talk, no turn queue, no speaking timer. People interrupt and talk over each other — that mess is the game.

Technically: Opus at conversational bitrate, echo cancellation on, noise suppression light, **VAD gating disabled**. Aggressive gating clips the first syllable of an interruption, and interruptions are the point.

Phase transitions fade over 400ms. A hard cut to silence feels like network failure.

### Voting

Public, live, contested. Not a secret ballot — catching Mafia bloc-voting is one of town's main reads, and a secret ballot destroys it.

Votes appear on the accused player's card the instant they are cast, visible to everyone. Audio stays open throughout. A vote can be pulled until the GM locks it. The tap UI exists for a disputeless tally, not for privacy.

### GM controls

One oversized **Advance** button. The server knows the next legal phase; the GM cannot jump wrong while narrating. Behind a collapsed panel: force-kill, force-revive, revert phase, end game. Real game nights go sideways, but overrides do not sit where a mis-tap costs a round.

Win check runs after every elimination — Mafia reaching parity with town wins Mafia, Mafia reaching zero wins town. The GM gets a blocking modal.

---

## 3. Identity and the durable record

### The link is the product

The room code is ephemeral. The **crew code** is permanent.

`nightfall.gg/c/LAGOS7` works forever. Pinned once in the WhatsApp group, never resent. Saturday night: host opens it, hits start, everyone taps the pinned link. No new code circulated, no "who has the link."

A permanent pinned link in an active WhatsApp group is a standing invitation, and it does more for retention than any feature in the backlog.

### Identity without accounts

A `playerId` UUID is minted on first join and persisted client-side, carried in the player JWT. No signup screen. Return on the same device and you are the same person with history intact.

`displayName` binds to the **crew membership**, not the player — within a crew you are always the same name, which is what makes stats legible.

Shared devices are common in this market. On join, if the device already holds an identity for that crew: *continue as Toniey*, or *I'm someone else*.

### Schema

```prisma
Crew            id, code, name, hostPlayerId, createdAt, lastPlayedAt
Player          id, phone?, createdAt
CrewMembership  crewId, playerId, displayName, role(HOST|MEMBER), joinedAt
                @@unique([crewId, playerId])
Session         id, crewId, roomCode, gmPlayerId, startedAt, endedAt,
                seatCount, winner, config
SessionPlayer   sessionId, playerId, role, survived,
                eliminatedAtPhase, eliminatedBy(VOTE|MAFIA), wasWinner
```

`SessionPlayer` is the asset. Every stat derives from it — win rate as Mafia, survival rate, how often someone is voted out while innocent, head-to-head records. No aggregate tables, no denormalization. Compute on read; at this scale that holds for years.

### Session ownership

Any crew member can start a session. This removes the single point of failure — the crew does not need one specific person free on a Saturday.

Consequences:

- GM is a **session** property (`Session.gmPlayerId`), not a crew role. `CrewMembership.role` shrinks to crew admin: rename, remove member, delete crew.
- Session start is atomic. Redis `SETNX` on `crew:{id}:session`. First writer creates, second lands in the lobby as a player.
- Start gated on 5 players present — blocks accidental solo starts and protects the cost ceiling.
- **Mid-session GM handoff is required, not optional.** The current GM can hand off to any member. If the GM disconnects for 60 seconds, the server offers the role to the longest-connected player. This is a state reassignment plus a re-projection — the section 1 architecture paying for itself.

The GM does not play. Narrated sessions are tracked as a visible stat so running the game earns something rather than costing something.

Host transfer exists at crew level. Without it, a lost phone orphans a crew permanently.

### Phone claim

Join is **never** gated on a phone number. Crew link → name → mic → play. Fifteen seconds.

The claim is offered after the first game ends, when a player has something worth protecting: *"You won 3 of 5 as Mafia. Save your record?"* Optional, skippable, re-offered later. Value first, friction second.

**Delivery: WhatsApp Cloud API**, the same integration already in production on Payvex. Nigerian SMS is expensive and unreliable; WhatsApp lands instantly and the audience is already there. SMS as fallback on delivery failure.

Mechanics: 6 digits, 10-minute TTL, single use, hashed at rest. Rate limits in Upstash — 3 per phone per hour, 5 per IP. `Player.phone` nullable, unique when set, E.164.

### The merge case — build with the schema

A player joins on a new device before claiming and gets a fresh `Player` row. They then claim a phone already bound to their old row. Two identities, one human.

The merge reassigns `SessionPlayer` and `CrewMembership` from the orphan to the canonical player, resolves `@@unique([crewId, playerId])` collisions by keeping the older membership, and soft-deletes the orphan — **in one transaction**. This fires within the first week of real use. It is not a later concern.

### Privacy

Phone numbers are never displayed to other players and never appear in projected state. Leaving a crew wipes that member's `SessionPlayer` rows. Deleting the account wipes the phone. NDPA applies.

---

## 4. Chat

Text chat is a **utility layer, not a discussion layer**.

The risk it introduces: voice is ephemeral, text is a record. A scrollable log replaces social reads with an audit trail — *"scroll up, he claimed Doctor at 9:04."* That makes lying much harder and makes the game less like the real one.

The reason it stays: mics fail, networks drop, and a player who cannot be heard is eliminated by their hardware.

Resolution:

- **Messages clear at every phase transition.** Nothing accumulates, nothing scrolls across the game. Day chat is gone at dusk.
- **140-character cap.** Long enough for *"mic dead, voting Musa."* Too short to argue in. The constraint pushes people back to voice.
- **Routing is `computeAudioGraph`.** One function, two transports. Chat and audio cannot drift, and there is no second independently-buggy leak surface.
- **Server-routed per recipient.** Never broadcast-then-filter on the client.
- **One durable strip: the record.** GM and system events only — deaths, phase changes, vote results. Pinned, persistent, factual. Stops the "wait, who died?" derailment.

Per phase: Mafia chat with Mafia during their 45 seconds. Doctor and Detective get nothing. Day chat is open to living players. Dead cannot chat to the living.

Rate-limited at the socket handler. The GM sees every channel, consistent with seeing every role.

---

## 5. Client surfaces

### Join

Crew link → name (pre-filled for returning members) → mic permission → lobby. Under fifteen seconds.

Mic permission is the highest-drop step in the funnel. Request it inside an explicit tap with context on screen, never cold on page load.

**iOS Safari requires a user gesture both to capture the mic and to play remote audio.** Missing the second means players join successfully and hear silence, which reads as a broken product. This is handled in step 4, not in polish.

### Player screen

Players are talking to their friends, not looking at their phone. Glanceable, not engaging.

Persistent and quiet: role card, current phase, who is alive, and a mic indicator that mirrors **server** state — never local mute. A player must always know with certainty whether they can be heard. This is the one piece of UI that cannot be subtle.

Interactive only when a decision is required. Vote and night-action targets appear as large thumb-reachable tiles, then disappear. No persistent chrome, no menus, nothing to explore.

### GM console

Operated one-handed while narrating aloud. One oversized Advance button, phase name, timer, and the roster with every role and alive state. Overrides collapsed.

The GM is speaking, not reading. A dashboard requiring visual parsing mid-narration breaks the rhythm that makes the game feel real.

### Debrief

Every card revealed, elimination timeline, how it went, and who moderates next.

---

## 6. Visual direction

Built on **Nocturne**. The system is authoritative; where this spec previously disagreed, the system wins.

### Tokens

| Role | Value |
|---|---|
| Ground | `#161826` |
| Surface | `#232532` |
| Text | `#e9e9ed` |
| Accent | `#9184d9` |

Inter over Inter. 8px radii, 0.70× density scale, Phosphor icons. Primary buttons are **outlined, never filled**. No pure black, no pure white — every value from the ramps. Elevation is an edge plus ambient darkness, not stacked shadows.

### The core idea

The interface is lit like the room. Players do not read the phase — they feel it.

Day sits at a lighter ramp step and opens up. Night drops toward the ground with a single light source. When the GM advances, the screen shifts in the same 400ms as the audio fade. Phase state becomes ambient rather than something parsed off a label, which matters because players are listening to each other, not watching their screens.

One idea doing three jobs: atmosphere, phase legibility, glanceability.

### Resolved against Nocturne

- **No red for death.** Nocturne is deliberately mono — one accent, low chroma elsewhere, no saturated floods. Death and Mafia are carried by the neutral ramp, weight, and typography.
- **No serif.** Inter throughout. Hierarchy is size and space, per the system's own rule.
- **Day/night shift moves between ramp steps**, not warm-to-cold.

### Refused

Distressed gangster faces, Art Deco, typewriter, stencil. Film grain, vignettes, smoke, neon-noir cyan and purple, fedora and playing-card motifs. Every Mafia product reaches for these and they read as costume.

### Motion budget

Near zero during play — motion competes with a live conversation and loses.

Exceptions: phase transitions matched to the audio fade; and role reveal, one tap-to-reveal card held for a beat before settling into the quiet persistent card it remains for the rest of the game. One moment of theatre, then it stops asking for attention.

Votes landing on a player's card should read as weight accumulating, not a counter incrementing.

`prefers-reduced-motion` is respected — already handled in the comp.

---

## 7. Stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 + TypeScript, one repo | Existing stack |
| Server | Custom Node server, Socket.io attached | Persistent connections |
| Styling | Tailwind mapped onto Nocturne CSS variables | Tokens stay authoritative |
| Components | Nocturne classes — **no shadcn** | shadcn would fight the system |
| Voice | LiveKit Cloud + server SDK | Subscription permissions |
| Live state | Upstash Redis | Existing |
| Durable | Neon Postgres + Prisma | Existing |
| Auth | `jose` JWT — **no Clerk** | No accounts by design |
| OTP | WhatsApp Cloud API | Existing production integration |
| Icons | Phosphor | Mandated by Nocturne |
| Errors | Sentry | Existing |
| Tests | Vitest | `game-core` |
| Deploy | Railway, single Node process | Vercel cannot hold sockets |
| Payments | None | Free MVP |

**Not splitting frontend and backend.** One repo, one deploy, one type system, no CORS, no duplicated models. The split buys nothing for a solo developer and costs daily.

---

## 8. Build order

1. **`game-core` + Vitest suite.** Pure functions, zero infrastructure, zero cost. Phase machine, role assignment, audio graph, night resolution, vote tally, win check, projection.
2. Repo skeleton, Nocturne tokens wired, custom server, Socket.io echo, deployed to Railway. Prove the pipe before anything lands on it.
3. Crew link → join → lobby → Redis state → per-recipient projected state.
4. LiveKit integration and audio graph application. iOS audio unlock. **The core.**
5. Full phase loop — night actions, timers, vote, elimination, win.
6. Debrief, Postgres write, crew history.
7. WhatsApp OTP claim and the merge transaction.
8. Reconnect, GM handoff, chat, remaining mobile edges.

Step 1 comes first because it is the only step where a mistake is expensive to unwind, and it needs no infrastructure to get right.

---

## 9. Non-goals

- No AI or automated game master. A human always narrates.
- No accounts beyond optional phone claim.
- No payments in MVP.
- No native app. Responsive web only.
- No cross-crew leaderboards, global profiles, or friend graph.
- No dead chat by default. Config flag, off — the dead sit and listen, as at a table.
- No composite "engagement" or "health" scores.

---

## 10. Decision log

| Decision | Rationale |
|---|---|
| Free MVP, no Paystack | A payment gate on an unproven party game produces a zero-signal launch |
| Seats as the future paywall | The only lever sitting directly on the cost curve |
| Mafia get 45s of private voice | Deviates from the physical game; bounded, and better remote |
| GM audible in every phase | Kills dead air, restores the narrator's spine |
| Public live voting | Secret ballot would remove town's main read |
| Any member can GM | Removes single-point-of-failure on one person's availability |
| Crew link permanent, room code ephemeral | A pinned WhatsApp link is a standing invitation |
| Phone claim deferred to post-game | Value before friction |
| Chat clears per phase, 140 chars | Preserves the fallback, kills the audit trail |
| Nocturne is authoritative on visuals | The system beats the improvised direction |
| Single repo, Railway | Solo developer; the split costs daily and buys nothing |
