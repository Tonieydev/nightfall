'use client';

import { use, useEffect, useState } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react';
import { Lobby } from './Lobby';
import { clearIdentity, readIdentity, readToken, writeIdentity, writeToken } from './identity';

interface JoinResponse {
  token: string;
  playerId: string;
  displayName: string;
}

function parseJoin(body: unknown): JoinResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const { token, playerId, displayName } = body as Record<string, unknown>;
  if (typeof token !== 'string' || typeof playerId !== 'string' || typeof displayName !== 'string') {
    return null;
  }
  return { token, playerId, displayName };
}

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const crewCode = use(params).code.toUpperCase();

  const [token, setToken] = useState<string | null>(null);
  const [known, setKnown] = useState<{ playerId: string; displayName: string } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setKnown(readIdentity(crewCode));
    setToken(readToken(crewCode));
    setReady(true);
  }, [crewCode]);

  async function join(displayName: string, playerId: string | null): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/crew/${crewCode}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, playerId }),
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
      writeToken(crewCode, parsed.token);
      setToken(parsed.token);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="p-6" />;

  if (token !== null) {
    return (
      <main className="p-6">
        <Lobby token={token} crewCode={crewCode} />
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="card">
        <p className="card-kicker">Crew {crewCode}</p>
        <h4 className="card-title">Join the game</h4>

        {known !== null ? (
          <>
            <p className="card-body">This device has played here before.</p>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() => void join(known.displayName, known.playerId)}
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
              if (name.trim() !== '') void join(name.trim(), null);
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

        {error !== null ? <p className="card-meta">{error}</p> : null}
      </div>
    </main>
  );
}
