# Build Prompt: Voice-Based Online Mafia Game with Game Master Controls

Paste everything below this line into your other Claude session.

---

I want to build a real-time, voice-based multiplayer Mafia (Werewolf-style) game for remote friend groups. A human Game Master (GM) runs the session and controls who can hear whom at each phase, using a dashboard that also shows every player's secretly assigned role. The goal is a tool that lets remote friend groups keep playing Mafia together the way they would in person — not an automated/bot-run game.

## 1. Core Concept

- Players join a voice room remotely (phone or browser).
- The GM sees every player's role/card on a private dashboard and controls the game phases manually — this is a moderator tool, not an AI-run game.
- The GM's dashboard has phase controls: "Everyone sleep," "Mafia wake up," "Mafia sleep," "Day phase (everyone talk)," "Voting phase."
- Pressing a control changes who is actually able to hear whom in real time, without anyone needing to physically leave/rejoin a call.

## 2. Roles

| Role | Team | Ability |
|---|---|---|
| Villager | Town | No special power, votes during the day |
| Mafia | Mafia | Sees fellow Mafia on GM dashboard notes, gets a private voice channel with other Mafia during "Mafia wake up" |
| Doctor | Town | GM privately asks who they protect during their wake window (can be voice or a simple tap-to-select UI) |
| Detective/Sheriff | Town | GM privately asks who they investigate; GM tells them the result verbally or via private text |

Role assignment ratios scale with player count (roughly 25% Mafia, 1 Doctor, 1 Detective, rest Villagers for larger lobbies — GM can override manually before starting).

## 3. Audio Architecture — Read This Carefully

Do NOT build raw WebRTC peer connections. Use a hosted SFU (Selective Forwarding Unit) provider with a server-side API for controlling per-participant subscriptions. Recommended: **LiveKit** (self-hostable, cheaper at scale, open-source) or **Daily.co** (faster to integrate, hosted only).

The mental model: everyone joins ONE persistent voice room for the whole game session. The GM's phase buttons don't move people between rooms — they change **audio subscription permissions** via the server SDK:

- **"Everyone sleep"** → server unsubscribes all audio tracks from all participants (silence for everyone)
- **"Mafia wake up"** → server subscribes each Mafia player's audio track only to other Mafia players
- **"Mafia sleep"** → server drops those specific subscriptions
- **"Day phase"** → server subscribes every alive player's audio to every other alive player (open mic for all)
- Eliminated players are automatically excluded from all subscriptions but can stay in a "dead chat" subscription among themselves, if that feature is wanted

Mic hardware mute/unmute on the client should mirror server state (so players see visually that they're muted, not just silently unable to be heard) — sync this via Socket.io alongside the voice SDK.

## 4. Game Flow

1. **Lobby**: GM creates a session, gets a shareable room code/link. Players join with name + code, grant mic permission.
2. **GM dashboard**: Before starting, GM sees the player list and can assign/adjust role counts. GM presses "Start" — server randomly assigns roles.
3. **Role reveal**: Each player privately sees their own role on their device (text/UI, not voice, to keep it silent and private).
4. **GM runs phases manually** using dashboard buttons as described above. GM dashboard always shows: who's alive, everyone's role, current phase, current audio subscription state per player.
5. **Voting**: During the day, players vote via a simple tap UI (not just verbally) so the GM/server can tally cleanly and avoid disputes.
6. **Elimination + win check**: Server checks Mafia-vs-Town win condition after each elimination; GM sees a clear "game over" flag when it's met, ends the session.
7. **End screen**: Reveal all roles, timeline of eliminations, option to start a new session with the same lobby.

## 5. Payments

- **Model**: Host pays per session (per game night), not per round and not per individual player. One payment unlocks one full session for however many seats the host selects.
- **Provider**: Paystack (Nigerian audience — supports cards, bank transfer, USSD).
- Flow: host selects number of seats before creating the room → Paystack checkout → on successful payment, room code is generated and becomes shareable/joinable up to the seat cap.
- Keep pricing configurable server-side (a simple price-per-seat variable), not hardcoded, since pricing isn't finalized yet.
- No need for player-level accounts for MVP — host identity via payment reference is enough to unlock the room.

## 6. Tech Stack

| Layer | Tool |
|---|---|
| Voice infra | LiveKit (or Daily.co) |
| Game/signaling server | Node.js + Express |
| Realtime state sync (roles, phases, votes, timers) | Socket.io |
| GM dashboard | React |
| Player client | React, mobile-responsive |
| Payments | Paystack |
| Deployment | Render/Railway for backend (needs persistent connections), Vercel/Netlify for frontend |

## 7. Build Order (confirm with me after each step)

1. Lobby + room creation/joining + Paystack payment gate
2. Voice room integration (all players join one shared room, basic mic on/off)
3. GM dashboard: role assignment, role reveal, player list with live status
4. Audio subscription control tied to GM phase buttons (the core "who hears whom" logic)
5. Voting UI + elimination + win condition checks
6. End screen + new-session flow
7. Polish: reconnect handling, dead-chat for eliminated players, mobile audio permission edge cases

## 8. Non-Goals for MVP

- No automated/AI game master — a human always runs the phases
- No user accounts beyond host payment reference
- No per-round billing
- No native mobile app — responsive web only

Start with Step 1. Ask me clarifying questions only if something above is ambiguous; otherwise make reasonable calls and show me working code.
