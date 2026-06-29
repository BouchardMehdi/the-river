'use client';

import { FormEvent, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';

const symbols: Record<string, string> = {
  CHERRY: 'CH',
  LEMON: 'LE',
  BELL: 'BE',
  CLUB: 'CL',
  DIAMOND: 'DI',
  CHEST: 'CO',
  SEVEN: '7',
};

function SlotsContent() {
  const { refreshUser } = useAuth();
  const [machine, setMachine] = useState('SLOT_3X3');
  const [spins, setSpins] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const out = await apiPost('/slots/spin', { machine, spins: Number(spins) });
      setResult(out);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spin impossible');
    } finally {
      setLoading(false);
    }
  }

  const latest = result?.results?.[result.results.length - 1];

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Slots</h1>
          <p>Choisis ta machine et cherche les patterns rares.</p>
        </div>
      </div>
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      <div className="grid two">
        <form className="panel" onSubmit={submit}>
          <h2>Machine</h2>
          <div className="form-grid">
            <label className="field">
              <span>Mode</span>
              <select value={machine} onChange={(e) => setMachine(e.target.value)}>
                <option value="SLOT_3X3">3 x 3</option>
                <option value="SLOT_3X5">3 x 5</option>
                <option value="SLOT_5X5">5 x 5</option>
              </select>
            </label>
            <label className="field">
              <span>Spins</span>
              <select value={spins} onChange={(e) => setSpins(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={10}>10</option>
              </select>
            </label>
          </div>
          <button className="button" disabled={loading} type="submit">
            <Sparkles size={18} /> {loading ? 'Spin...' : 'Lancer'}
          </button>
        </form>

        <section className="panel">
          <h2>Dernier tirage</h2>
          {latest ? (
            <div className="grid">
              <div className="slot-grid">
                {latest.grid.map((row: string[], rowIndex: number) => (
                  <div className="slot-row" key={rowIndex}>
                    {row.map((cell, colIndex) => (
                      <span className="slot-cell" key={`${rowIndex}-${colIndex}`}>
                        {symbols[cell] ?? cell}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <div className="table-meta">
                <span className="chip">Gain {latest.payout}</span>
                <span className="chip">Total {result.totalPayout}</span>
                <span className="chip">Solde {result.credits}</span>
              </div>
            </div>
          ) : (
            <p>Aucun spin lance.</p>
          )}
        </section>
      </div>
    </section>
  );
}

export default function SlotsPage() {
  return (
    <RequireAuth>
      <SlotsContent />
    </RequireAuth>
  );
}
