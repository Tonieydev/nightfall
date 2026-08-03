# Nightfall

Voice-based online Mafia with a human Game Master, for remote friend groups. Stravn Limited.

Everyone joins one persistent voice room for the whole session. The GM's phase controls change who can hear whom via server-side audio subscriptions — nobody moves between rooms.

**Full spec: `docs/nightfall-design-spec.md`.** Read it before any architectural decision. This file is the standing rules; the spec is the reasoning.

**Current step: 4 — LiveKit integration and the audio graph.** Steps are defined in the spec, section 8. Do not build ahead of the current step.

---

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 + TypeScript, single repo |
| Server | Custom Node server with Socket.io attached |
| Voice | LiveKit Cloud + server SDK |
| Live state | Upstash Redis |
| Durable | Neon Postgres + Prisma |
| Auth | `jose` JWT |
| OTP | Resend (email) |
| Styling | Tailwind mapped onto Nocturne CSS variables |
| Icons | Phosphor |
| Tests | Vitest |
| Errors | Sentry |
| Deploy | Railway, one Node process |

**Not using: shadcn, Clerk, Paystack, Vercel, raw WebRTC.** Each was ruled out deliberately — see the spec's decision log. Do not reintroduce them.

## Layout

```
src/game-core/    pure logic — no I/O, ever
src/room-store/   Redis read/modify/write, optimistic concurrency
src/voice/        the ONLY module that imports LiveKit
src/realtime/     Socket.io handlers
src/auth/         jose JWT — mints and verifies the player token
src/app/          Next.js routes and UI
src/config.ts     env read once at boot; throws on a missing secret
design/nocturne/  design system — styles.css is authoritative
design/           Nightfall.dc.html is a 152KB reference comp; never read it whole
docs/             spec
```

---

## Architecture invariants

These are not preferences. Breaking one is a defect.

- **The server is the only source of truth.** The GM dashboard is a view. A GM refresh, crash, or locked phone must not affect the game.
- **Roles are projected per recipient.** No payload sent to a player ever contains another player's role. Assert this against serialized JSON, not typed access.
- **Chat routes through `computeAudioGraph`.** One function, two transports. Never a second routing implementation.
- **Never broadcast-then-filter on the client.** Filtering happens server-side, before emit.
- **`game-core/` is pure.** No I/O, no clock reads, no `Math.random`. Randomness and time are injected parameters.
- **Postgres is never in the hot path.** Live state is Redis. Postgres is written once, at game end, in one transaction.
- **Every state mutation goes through a `game-core` function**, then a versioned compare-and-set write.
- **Cost governors are load-bearing:** 12 players max, 90-minute hard session lifetime, global concurrent-room ceiling with kill switch, start gated on 5 players. Never relax these to make a test pass.

## Design system — Nocturne

`design/nocturne/styles.css` is authoritative. `design/nocturne/readme.md` explains it.

- Take every color, font, space, radius and shadow from `var(--*)`. **Never hard-code a hex, font name, or px value the tokens already carry.**
- Primary buttons are outlined, never filled.
- No pure black, no pure white. Every value comes from the ramps.
- Mono accent (`#9184d9`). No second accent. No red for death — the neutral ramp, weight and typography carry it.
- Inter throughout. Hierarchy is size and space; never bolden headings past 500.
- Elevation is an edge plus ambient darkness. Do not stack shadows.
- Phosphor icons only.
- Motion budget is near zero during play. Exceptions: 400ms phase transitions matched to the audio fade, and the one-time role reveal.
- Respect `prefers-reduced-motion`.

`design/nocturne/_adherence.oxlintrc.json` enforces this. Keep it in the lint gate.

## Product invariants

- The GM never plays and is audible to every player in every phase.
- Voice persuades, tap decides. Every choice is cast through the tap UI and resolved deterministically. The GM never adjudicates.
- Voting is public and live, never a secret ballot.
- Dead players hear the day but never speak, and never hear Mafia at night.
- A tie or zero votes means no elimination. This is correct behavior, not an edge case to fix.
- Chat clears at every phase transition and caps at 140 characters.
- Join is never gated on a phone number.

---

## Workflow

- **Surface conflicts; do not invent requirements.** When the spec, this file and the task disagree — or a requirement cannot hold as written — stop before writing code. Name the conflict, give the options with a recommendation, and get a decision. A guess that compiles is still a guess.
- **Emit a PLAN before multi-step work.** Anything spanning more than one file or one commit opens with a short numbered plan: what changes, in what order, and how each step gets verified. Wait for it to be accepted before the first edit.
- **TDD, no exceptions.** No production code without a failing test first. Watch it fail for the right reason before implementing. Wrote code before the test? Delete it and start over.
- **Verify before claiming.** Run the command and read the output before saying anything passes, builds, or works. No success claims without evidence in the transcript.
- **Report and stop before pushing.** Never `git push` without explicit instruction.
- Clean `rm -rf .next && npm run build` is the merge gate.
- No parallel verify and build runs.
- One concern per commit.

## Code

- TypeScript strict. `noUncheckedIndexedAccess` on. No `any`.
- No placeholder or stub implementations. No demo code.
- Comment non-obvious *why*, never *what*.
- Simplest solution that scales. Do not build for load that does not exist.
- Ask before adding a dependency.

## Known constraints

- Single backend instance. Correct at this scale; it is the first thing that must break to scale horizontally.
- Dev and prod share a Neon database. Be deliberate with migrations.
- iOS Safari requires a user gesture both to capture the mic and to play remote audio. Missing the second means players join and hear silence.
