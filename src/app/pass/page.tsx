'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowRightIcon, EyeIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { dealCards, recordRound } from '@/game-core';
import type { DealtCard } from '@/game-core';
import { ROLE_BLURB, ROLE_LABEL } from '@/narration/roles';
import { readHistory, readNames, writeHistory, writeNames } from './pass-storage';

const MIN_SEATS = 5;
const MAX_SEATS = 12;

const blankSeats = (count: number): string[] => Array.from({ length: count }, () => '');

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
  const [names, setNames] = useState<string[]>(blankSeats(MIN_SEATS));
  const [mafia, setMafia] = useState(1);
  const [doctors, setDoctors] = useState(1);
  // The dealt roles live in component state only. A refresh loses the deal
  // rather than leaving every role in storage for the next person to read.
  const [cards, setCards] = useState<DealtCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // Storage is read after mount: the server render has no localStorage.
  useEffect(() => {
    const saved = readNames();
    if (saved.length >= MIN_SEATS) setNames(saved.slice(0, MAX_SEATS));
  }, []);

  const trimmed = names.map((name) => name.trim());
  const config = { mafia, doctors };

  // The deal's own rules are the only rules: asking it, rather than restating
  // them here, keeps the button and the dealer from disagreeing.
  let problem: string | null = null;
  try {
    dealCards(trimmed, config, [], () => 0.5);
  } catch (error) {
    problem = error instanceof Error ? error.message : 'these settings cannot be dealt';
  }

  function setName(at: number, value: string): void {
    setNames((current) => current.map((name, i) => (i === at ? value : name)));
  }

  function deal(): void {
    const history = readHistory();
    const dealt = dealCards(trimmed, config, history, Math.random);
    writeHistory(recordRound(history, dealt));
    writeNames(trimmed);
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
            One phone, passed around. Each person taps to see their card in private, then hands it
            on.
          </p>

          <ul className="nf-pass-names">
            {names.map((name, at) => (
              <li key={at}>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(at, event.target.value)}
                  placeholder={`Player ${at + 1}`}
                  autoComplete="off"
                  maxLength={20}
                  aria-label={`Player ${at + 1} name`}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`Remove player ${at + 1}`}
                  disabled={names.length <= MIN_SEATS}
                  onClick={() => setNames((cur) => cur.filter((_, i) => i !== at))}
                >
                  <MinusIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={names.length >= MAX_SEATS}
            onClick={() => setNames((cur) => [...cur, ''])}
          >
            <PlusIcon size={16} />
            Add a player
          </button>

          <Stepper label="Mafia" value={mafia} min={1} max={MAX_SEATS} onChange={setMafia} />
          <Stepper label="Doctors" value={doctors} min={0} max={MAX_SEATS} onChange={setDoctors} />

          <p className="nf-fineprint">
            Anyone who was mafia in the last few rounds is much less likely to be again.
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
