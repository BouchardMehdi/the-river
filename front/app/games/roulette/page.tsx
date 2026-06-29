'use client';

import { FormEvent, useState } from 'react';
import { CircleDot, RotateCcw } from 'lucide-react';
import { apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';

const betTypes = ['RED', 'BLACK', 'EVEN', 'ODD', 'LOW', 'HIGH', 'STRAIGHT', 'DOZEN', 'COLUMN'];

function RouletteContent() {
  const { refreshUser } = useAuth();
  const [type, setType] = useState('RED');
  const [amount, setAmount] = useState(10);
  const [selection, setSelection] = useState(7);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function spin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const bet: any = { type, amount: Number(amount), selection: {} };
      if (type === 'STRAIGHT') bet.selection = { number: Number(selection) };
      if (type === 'DOZEN') bet.selection = { dozen: Number(selection) };
      if (type === 'COLUMN') bet.selection = { column: Number(selection) };
      const out = await apiPost('/roulette/solo/spin', { bets: [bet] });
      setResult(out);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spin impossible');
    } finally {
      setLoading(false);
    }
  }

  const color = String(result?.result?.color ?? '').toLowerCase();

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Roulette</h1>
          <p>Pose un pari, lance la bille, regarde le solde bouger.</p>
        </div>
      </div>
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      <div className="grid two">
        <form className="panel" onSubmit={spin}>
          <h2>Pari</h2>
          <div className="form-grid">
            <label className="field">
              <span>Type</span>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {betTypes.map((bet) => (
                  <option key={bet} value={bet}>
                    {bet}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Mise</span>
              <input min={1} type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            {['STRAIGHT', 'DOZEN', 'COLUMN'].includes(type) ? (
              <label className="field">
                <span>{type === 'STRAIGHT' ? 'Numero 0-36' : 'Selection 1-3'}</span>
                <input type="number" value={selection} onChange={(e) => setSelection(Number(e.target.value))} />
              </label>
            ) : null}
          </div>
          <button className="button" disabled={loading} type="submit">
            <CircleDot size={18} /> {loading ? 'Spin...' : 'Spin'}
          </button>
        </form>

        <section className="panel">
          <h2>Resultat</h2>
          {result ? (
            <div className="grid">
              <div className={`roulette-number ${color}`}>{result.result.number}</div>
              <div className="table-meta">
                <span className="chip">Couleur {result.result.color}</span>
                <span className="chip">Retour {result.settlement?.totalReturn ?? 0}</span>
                <span className="chip">Solde {result.balance}</span>
              </div>
            </div>
          ) : (
            <p>Le prochain numero attend son tour.</p>
          )}
          <button className="button secondary" onClick={() => setResult(null)} type="button">
            <RotateCcw size={18} /> Effacer
          </button>
        </section>
      </div>
    </section>
  );
}

export default function RoulettePage() {
  return (
    <RequireAuth>
      <RouletteContent />
    </RequireAuth>
  );
}
