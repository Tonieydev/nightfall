'use client';

import { useState } from 'react';
import { EnvelopeSimpleIcon } from '@phosphor-icons/react';
import { readIdentityToken, writeIdentityToken } from './identity';

type Stage = 'offer' | 'address' | 'code' | 'saved' | 'skipped';

async function post(url: string, body: unknown): Promise<{ ok: boolean; data: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, data: await response.json().catch(() => null) };
}

function messageFrom(data: unknown, fallback: string): string {
  return typeof data === 'object' && data !== null && 'error' in data
    ? String((data as { error: unknown }).error)
    : fallback;
}

/**
 * Offered only here, on the debrief, once there is a record worth keeping.
 * Skippable and re-offered next time — the whole point of the claim is that it
 * never stands between a player and a game.
 */
export function ClaimCard({ summary }: { summary: string }) {
  const [stage, setStage] = useState<Stage>('offer');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

  async function requestCode(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post('/api/identity/request-code', { email });
      if (!ok) {
        setError(messageFrom(data, 'could not send a code'));
        return;
      }
      setStage('code');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await post('/api/identity/claim', {
        email,
        code,
        identityToken: readIdentityToken(),
      });
      if (!ok) {
        setError(messageFrom(data, 'that code did not work'));
        return;
      }
      const parsed = data as { identityToken?: unknown; merged?: unknown };
      if (typeof parsed.identityToken === 'string') writeIdentityToken(parsed.identityToken);
      setMerged(parsed.merged === true);
      setStage('saved');
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'skipped') return null;

  if (stage === 'saved') {
    return (
      <div className="nf-card">
        <p className="nf-kicker">Saved</p>
        <p className="nf-muted">
          {merged
            ? 'Welcome back. This device is now linked to the record you already had.'
            : 'Your record is attached to that address. Enter it on a new device to bring it with you.'}
        </p>
      </div>
    );
  }

  return (
    <div className="nf-card">
      <p className="nf-kicker">
        <EnvelopeSimpleIcon size={12} /> Keep this
      </p>

      {stage === 'offer' ? (
        <>
          <p>{summary}</p>
          <p className="nf-muted">
            Add an email and your crew history follows you to a new phone. Nothing else changes.
            no password, no account, and it is never shown to anyone else.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => setStage('address')}
          >
            Save my record
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setStage('skipped')}
          >
            Not now
          </button>
        </>
      ) : null}

      {stage === 'address' ? (
        <>
          <div className="field">
            <label htmlFor="claim-email">Email</label>
            <input
              id="claim-email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy || email.trim() === ''}
            onClick={() => void requestCode()}
          >
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setStage('skipped')}
          >
            Not now
          </button>
        </>
      ) : null}

      {stage === 'code' ? (
        <>
          <p className="nf-muted">Six digits, sent to {email}. It expires in ten minutes.</p>
          <div className="field">
            <label htmlFor="claim-code">Code</label>
            <input
              id="claim-code"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy || code.length !== 6}
            onClick={() => void submitCode()}
          >
            {busy ? 'Checking…' : 'Save my record'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => setStage('address')}
          >
            Use a different address
          </button>
        </>
      ) : null}

      {error === null ? null : <p className="nf-muted">{error}</p>}
    </div>
  );
}
