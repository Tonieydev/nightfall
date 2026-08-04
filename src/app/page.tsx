'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UsersThreeIcon } from '@phosphor-icons/react';

/**
 * The four states of one room. This is the thing no competitor has and the
 * thing a stranger will not expect, so it carries the middle of the page.
 *
 * The last beat is deliberately not the comp's. The comp says the eliminated
 * are "moved to dead chat" — that was a different product. Nightfall's dead
 * stay at the table and listen, which is both the spec's rule and the better
 * line, and shipping the comp's version would have been a claim that is false.
 */
const BEATS = [
  { title: 'Everyone sleep', body: 'Every subscription dropped. Silence for the whole table.' },
  { title: 'Mafia wake up', body: 'The mafia hear each other and nobody else.' },
  { title: 'Day phase', body: 'Every living player hears every other.' },
  { title: 'Eliminated', body: 'They stay and listen. They never speak again, and never hear the night.' },
];

export default function HomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createCrew(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/crew', { method: 'POST' });
      const body: unknown = await response.json();

      if (!response.ok) {
        setError(
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'could not create a crew',
        );
        return;
      }

      const code = (body as { code?: unknown }).code;
      if (typeof code !== 'string') {
        setError('the server sent something unexpected');
        return;
      }

      // Straight into the lobby. The crew link they land on is the permanent
      // one they pin — there is no step between creating and having it.
      router.push(`/c/${code}`);
    } catch {
      setError('could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="nf-landing">
      <section className="nf-hero nf-arrive">
        <p className="nf-kicker">Nightfall</p>

        <h1>Run mafia for friends who are not in the room.</h1>

        <p className="nf-lede">
          Mafia over voice, for a group that is not at the same table. One person narrates.
          Nightfall changes who can hear whom, so nobody has to leave the call.
        </p>

        <div className="nf-cta">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void createCrew()}
          >
            <UsersThreeIcon size={18} />
            {busy ? 'Creating…' : 'Create a crew'}
          </button>
          <p className="nf-fineprint">
            Free, no account, nothing to download. Already have a link from your group? Just tap it.
          </p>
        </div>

        {error === null ? null : <p className="nf-fineprint">{error}</p>}
      </section>

      <section className="nf-section">
        <h2>One room all night. The room changes around them.</h2>
        <p className="nf-section-lede">
          No rejoining, and no second call for the mafia. The GM&rsquo;s phase controls rewrite the
          audio subscriptions on the server, and every player&rsquo;s mic indicator follows.
        </p>

        <ul className="nf-beats">
          {BEATS.map((beat) => (
            <li key={beat.title} className="nf-beat">
              <h3>{beat.title}</h3>
              <p>{beat.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="nf-section">
        <h2>How a night runs</h2>
        <ol className="nf-steps">
          <li>Pin your crew link once in the group chat. It works every Saturday after that.</li>
          <li>Everyone taps it, says what to call them, and allows the mic.</li>
          <li>One person takes the console and narrates. They do not play.</li>
          <li>Night falls and the room goes quiet for everyone who should not hear it.</li>
        </ol>
      </section>

      <section className="nf-section">
        <h2>Keep your seat between game nights.</h2>
        <ul className="nf-plain">
          <li>
            <strong>No account to make</strong>
            Your seat lives on your device. After a game you can attach an email if you want your
            record to survive a new phone — offered once the game is over, never before.
          </li>
          <li>
            <strong>Free, permanently</strong>
            No charges, no subscription, no paid tiers. Twelve seats a room, ninety minutes a night.
          </li>
          <li>
            <strong>Nothing to install</strong>
            It runs in the browser your group chat already opens links in.
          </li>
        </ul>
      </section>

      <footer className="nf-footer">Nightfall — Stravn Limited</footer>
    </main>
  );
}
