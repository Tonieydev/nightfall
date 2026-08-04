'use client';

import { useState } from 'react';
import { UsersThreeIcon } from '@phosphor-icons/react';

export default function HomePage() {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createCrew(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/crew', { method: 'POST' });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'could not create a crew';
        setError(message);
        return;
      }
      setCode(String((body as { code: unknown }).code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="nf-stage" data-lit="day">
      <div className="nf-card">
        <p className="nf-kicker">Nightfall</p>
        <h4>Start a crew</h4>
        <p className="nf-muted">
          A crew link is permanent. Pin it once in your group and it works every Saturday.
        </p>

        {code === null ? (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void createCrew()}>
            <UsersThreeIcon size={16} />
            {busy ? 'Creating…' : 'Create a crew'}
          </button>
        ) : (
          <p className="nf-muted">
            Your crew code is <strong>{code}</strong> —{' '}
            <a href={`/c/${code}`}>open the join page</a>
          </p>
        )}

        {error !== null ? <p className="nf-muted">{error}</p> : null}
      </div>
    </main>
  );
}
