'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowRightIcon, EyeIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { dealCards, recordRound } from '@/game-core';
import type { DealtCard } from '@/game-core';
import { ROLE_BLURB, ROLE_LABEL } from '@/narration/roles';
import { readHistory, writeHistory } from './pass-storage';

const MIN_SEATS = 5;
// In-person has no voice room to pay for, so the online 12-seat cost cap does
// not apply here. 30 is a big living room, not a limit the server enforces.
const MAX_SEATS = 30;

const seatLabels = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `Player ${i + 1}`);

const defaultMafia = (players: number): number => Math.max(1, Math.round(players / 4));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * A typed head count. Text state rather than a number, so typing "15" does not
 * get clamped to 5 on the way through the "1".
 */
function PlayerCount(props: { value: number; onChange: (next: number) => void }) {
  const { value, onChange } = props;
  const [text, setText] = useState(String(value));

  function step(next: number): void {
    setText(String(next));
    onChange(next);
  }

  function edit(raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    setText(digits);
    if (digits !== '') onChange(clamp(Number(digits), MIN_SEATS, MAX_SEATS));
  }

  return (
    <div className="nf-pass-stepper">
      <label htmlFor="pass-players">Players</label>
      <div className="nf-pass-stepper-controls">
        <button
          type="button"
          className="btn btn-secondary"
          aria-label="Fewer Players"
          disabled={value <= MIN_SEATS}
          onClick={() => step(value - 1)}
        >
          <MinusIcon size={16} />
        </button>
        <input
          id="pass-players"
          className="input nf-pass-count"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(event) => edit(event.target.value)}
          onBlur={() => setText(String(value))}
        />
        <button
          type="button"
          className="btn btn-secondary"
          aria-label="More Players"
          disabled={value >= MAX_SEATS}
          onClick={() => step(value + 1)}
        >
          <PlusIcon size={16} />
        </button>
      </div>
    </div>
  );
}

function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const { label, value, min, max, onChange } = props;
  return (
    <div className="nf-pass-stepper">
      <span>{label}</span>
      <div className="nf-pass-stepper-controls">
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Fewer ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <MinusIcon size={16} />
        </button>
        <output aria-live="polite">{value}</output>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`More ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <PlusIcon size={16} />
        </button>
      </div>
    </div>
  );
}

export default function PassPage() {
  const [players, setPlayers] = useState(8);
  const [mafia, setMafia] = useState(defaultMafia(8));
  const [doctors, setDoctors] = useState(1);
  // The dealt roles live in component state only. A refresh loses the deal
  // rather than leaving every role in storage for the next person to read.
  const [cards, setCards] = useState<DealtCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const seats = seatLabels(players);
  const config = { mafia, doctors };

  // The deal's own rules are the only rules: asking it, rather than restating
  // them here, keeps the button and the dealer from disagreeing.
  let problem: string | null = null;
  try {
    dealCards(seats, config, [], () => 0.5);
  } catch (error) {
    problem = error instanceof Error ? error.message : 'these settings cannot be dealt';
  }

  function changePlayers(next: number): void {
    const nextMafia = defaultMafia(next);
    setPlayers(next);
    setMafia(nextMafia);
    setDoctors((current) => clamp(current, 0, next - nextMafia));
  }

  function deal(): void {
    const history = readHistory();
    const dealt = dealCards(seats, config, history, Math.random);
    writeHistory(recordRound(history, dealt));
    setCards(dealt);
    setIndex(0);
    setRevealed(false);
  }

  function next(): void {
    // Hidden in the same step that moves on, so the following person never
    // sees the previous role on a phone that was handed over a beat too soon.
    setRevealed(false);
    setIndex((current) => current + 1);
  }

  function newRound(): void {
    setCards(null);
    setIndex(0);
    setRevealed(false);
  }

  const current = cards?.[index];

  return (
    <main className="nf-pass">
      <Link href="/" className="nf-pass-back">
        <ArrowLeftIcon size={16} />
        Back
      </Link>

      {cards === null ? (
        <section className="nf-pass-setup">
          <h1>Play in person</h1>
          <p className="nf-lede">
            One phone, passed around the circle. Each person taps to see their card in private, then
            hands it on.
          </p>

          <PlayerCount value={players} onChange={changePlayers} />
          <Stepper
            label="Mafia"
            value={mafia}
            min={1}
            max={Math.max(1, Math.floor((players - 1) / 2))}
            onChange={setMafia}
          />
          <Stepper
            label="Doctors"
            value={doctors}
            min={0}
            max={players - mafia}
            onChange={setDoctors}
          />

          <p className="nf-fineprint">
            A seat that was mafia in the last few rounds is much less likely to be again, so keep the same passing order.
          </p>
          {problem === null ? null : <p className="nf-fineprint">{problem}</p>}

          <button type="button" className="btn btn-primary" disabled={problem !== null} onClick={deal}>
            Deal the cards
          </button>
        </section>
      ) : current === undefined ? (
        <section className="nf-pass-setup">
          <h1>Everyone has their card</h1>
          <p className="nf-lede">Put the phone down and begin. Nobody says what they saw.</p>
          <button type="button" className="btn btn-secondary" onClick={newRound}>
            New round
          </button>
        </section>
      ) : revealed ? (
        <section className="nf-pass-stage">
          <div className="nf-card-reveal nf-reveal" data-mafia={String(current.role === 'MAFIA')}>
            <p className="nf-kicker">{current.name}</p>
            <p className="nf-card-role">{ROLE_LABEL[current.role]}</p>
            <p className="nf-card-blurb">{ROLE_BLURB[current.role]}</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={next}>
            <ArrowRightIcon size={18} />
            {index === (cards.length - 1) ? 'Done' : 'Next'}
          </button>
          <p className="nf-fineprint">Press next before you pass the phone on.</p>
        </section>
      ) : (
        <section className="nf-pass-stage">
          <button type="button" className="nf-pass-facedown" onClick={() => setRevealed(true)}>
            <EyeIcon size={28} />
            <span className="nf-kicker">Pass to</span>
            <span className="nf-card-role">{current.name}</span>
            <span className="nf-fineprint">Tap to see your card</span>
          </button>
          <p className="nf-fineprint">
            Card {index + 1} of {cards.length}
          </p>
        </section>
      )}
    </main>
  );
}
