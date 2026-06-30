'use client';

import { FormEvent, useState } from 'react';
import { Dices } from 'lucide-react';
import { apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';

function CrapsContent() {
  const { refreshUser } = useAuth();
  const [guessTotal, setGuessTotal] = useState(7);
  const [bet, setBet] = useState(20);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function play(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const out = await apiPost('/craps/play', { guessTotal: Number(guessTotal), bet: Number(bet) });
      setResult(out);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Craps verrouille ou indisponible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Craps</h1>
          <p>Le jeu secret demande les quatre cles de THE RIVER.</p>
        </div>
      </div>
      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}
      <div className="grid two">
        <form className="panel" onSubmit={play}>
          <h2>Prediction</h2>
          <div className="form-grid">
            <label className="field">
              <span>Total attendu</span>
              <input min={2} max={12} type="number" value={guessTotal} onChange={(e) => setGuessTotal(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>Mise</span>
              <input min={1} type="number" value={bet} onChange={(e) => setBet(Number(e.target.value))} />
            </label>
          </div>
          <button className="button" disabled={loading} type="submit">
            <Dices size={18} /> {loading ? 'Lancer...' : 'Lancer'}
          </button>
        </form>
        <section className="panel">
          <h2>Resultat</h2>
          {result ? (
            <div className="grid">
              <div className="card-row">
                <span className="slot-cell">{result.dice?.[0]}</span>
                <span className="slot-cell">{result.dice?.[1]}</span>
              </div>
              <div className="table-meta">
                <span className="chip">Total {result.total}</span>
                <span className="chip">{result.win ? 'Gagne' : 'Perdu'}</span>
                <span className="chip">Net {result.net}</span>
                <span className="chip">Solde {result.credits} crédits</span>
              </div>
            </div>
          ) : (
            <p>Aucun lancer pour l’instant.</p>
          )}
        </section>
      </div>
    </section>
  );
}

export default function CrapsPage() {
  return (
    <RequireAuth>
      <CrapsContent />
    </RequireAuth>
  );
}
