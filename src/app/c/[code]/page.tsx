'use client';

import { use, useEffect, useState } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { Lobby } from './Lobby';
import { Wordmark } from '../../Wordmark';
import {
  clearIdentity,
  readIdentity,
  readClaimAvailable,
  readIdentityToken,
  readToken,
  writeClaimAvailable,
  writeIdentity,
  writeIdentityToken,
  writeToken,
} from './identity';

interface JoinResponse {
  token: string;
  /** Device-wide proof of identity, presented on the next join. */
  identityToken: string;
  playerId: string;
  displayName: string;
  /** Whether the debrief may offer to save a record. */
  claimAvailable: boolean;
}

function parseJoin(body: unknown): JoinResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const { token, identityToken, playerId, displayName, claimAvailable } = body as Record<
    string,
    unknown
  >;
  if (
    typeof token !== 'string' ||
    typeof identityToken !== 'string' ||
    typeof playerId !== 'string' ||
    typeof displayName !== 'string'
  ) {
    return null;
  }
  return { token, identityToken, playerId, displayName, claimAvailable: claimAvailable === true };
}

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const crewCode = use(params).code.toUpperCase();

  const [token, setToken] = useState<string | null>(null);
  const [known, setKnown] = useState<{ playerId: string; displayName: string } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [claimAvailable, setClaimAvailable] = useState(false);

  useEffect(() => {
    setKnown(readIdentity(crewCode));
    setToken(readToken(crewCode));
    setClaimAvailable(readClaimAvailable());
    setReady(true);
  }, [crewCode]);

  // No playerId is sent: the server refuses to take one on trust, because a
  // teammate could read it off the roster and join as this player.
  async function join(displayName: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/crew/${crewCode}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, identityToken: readIdentityToken() }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'could not join';
        setError(message);
        return;
      }

      const parsed = parseJoin(body);
      if (parsed === null) {
        setError('the server sent something unexpected');
        return;
      }

      writeIdentity(crewCode, { playerId: parsed.playerId, displayName: parsed.displayName });
      writeIdentityToken(parsed.identityToken);
      writeClaimAvailable(parsed.claimAvailable);
      writeToken(crewCode, parsed.token);
      setClaimAvailable(parsed.claimAvailable);
      setToken(parsed.token);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="nf-stage" data-lit="day" />;

  if (token !== null) {
    return (
      <main className="nf-stage" data-lit="day">
        <Lobby token={token} crewCode={crewCode} claimAvailable={claimAvailable} />
      </main>
    );
  }

  return (
    <main className="nf-stage" data-lit="day">
      <div className="nf-card">
        <Wordmark />
        <p className="nf-kicker">Crew {crewCode}</p>
        <h4>Join the game</h4>

        {known !== null ? (
          <>
            <p className="nf-muted">This device has played here before.</p>
            <button
              type="button"
              className="nf-advance btn btn-primary"
              disabled={busy}
              onClick={() => void join(known.displayName)}
            >
              <ArrowRightIcon size={16} />
              Continue as {known.displayName}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => {
                clearIdentity(crewCode);
                setKnown(null);
              }}
            >
              I&rsquo;m someone else
            </button>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() !== '') void join(name.trim());
            }}
          >
            <div className="field">
              <label htmlFor="displayName">What should the crew call you?</label>
              <input
                id="displayName"
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                // The join field sits one tap from a pinned crew code; autofill
                // dropping that in is the one way a roster fills with codes.
                autoComplete="off"
                maxLength={24}
                enterKeyHint="go"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy || name.trim() === ''}
            >
              <ArrowRightIcon size={16} />
              {busy ? 'Joining…' : 'Join'}
            </button>
          </form>
        )}

        {error !== null ? <p className="nf-muted">{error}</p> : null}
      </div>
    </main>
  );
}
