'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  BookOpen,
  CircleDollarSign,
  Dices,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';

type CrapsBetType =
  | 'PASS_LINE'
  | 'DONT_PASS'
  | 'FIELD'
  | 'ANY_SEVEN'
  | 'ANY_CRAPS'
  | 'YO'
  | 'EXACT_TOTAL'
  | 'HARDWAY';

type CrapsBet = {
  amount: number;
  id: string;
  target?: number;
  type: CrapsBetType;
};

type CrapsResult = {
  credits?: number | null;
  dice: number[];
  net: number;
  payout: number;
  results: Array<CrapsBet & { label: string; net: number; outcome: 'win' | 'lose' | 'push'; payout: number }>;
  total: number;
  totalBet: number;
  win: boolean;
};

const betOptions: Array<{ description: string; label: string; type: CrapsBetType }> = [
  { description: 'Gagne sur 7 ou 11, perd sur 2, 3 ou 12.', label: 'Pass line', type: 'PASS_LINE' },
  { description: 'Gagne sur 2 ou 3, push sur 12, perd sur 7 ou 11.', label: "Don't pass", type: 'DONT_PASS' },
  { description: 'Gagne sur 2, 3, 4, 9, 10, 11 ou 12.', label: 'Field', type: 'FIELD' },
  { description: 'Un 7 exact paie 4:1.', label: 'Any 7', type: 'ANY_SEVEN' },
  { description: '2, 3 ou 12 paient 7:1.', label: 'Any craps', type: 'ANY_CRAPS' },
  { description: 'Le total 11 paie 15:1.', label: 'Yo 11', type: 'YO' },
  { description: 'Choisis un total entre 2 et 12.', label: 'Total exact', type: 'EXACT_TOTAL' },
  { description: 'Double 2, 3, 4 ou 5 selon la valeur choisie.', label: 'Hardway', type: 'HARDWAY' },
];

function defaultTarget(type: CrapsBetType) {
  if (type === 'EXACT_TOTAL') return 7;
  if (type === 'HARDWAY') return 6;
  return undefined;
}

function targetOptions(type: CrapsBetType) {
  if (type === 'EXACT_TOTAL') return [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (type === 'HARDWAY') return [4, 6, 8, 10];
  return [];
}

function makeBet(type: CrapsBetType = 'PASS_LINE', target = defaultTarget(type)): CrapsBet {
  return {
    amount: 10,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    target,
    type,
  };
}

function Die({ rolling, value }: { rolling: boolean; value: number }) {
  return (
    <div className={`craps-die die-${value} ${rolling ? 'rolling' : ''}`} aria-label={`De ${value}`}>
      {Array.from({ length: 9 }, (_, index) => <span className={`pip pip-${index + 1}`} key={index} />)}
    </div>
  );
}

function CrapsContent() {
  const { refreshUser } = useAuth();
  const [bets, setBets] = useState<CrapsBet[]>([makeBet('PASS_LINE')]);
  const [dice, setDice] = useState([1, 1]);
  const [result, setResult] = useState<CrapsResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const totalBet = useMemo(() => bets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0), [bets]);

  function addBet(type: CrapsBetType = 'PASS_LINE', target = defaultTarget(type)) {
    setBets((current) => [...current, makeBet(type, target)]);
  }

  function updateBet(id: string, patch: Partial<CrapsBet>) {
    setBets((current) => current.map((bet) => {
      if (bet.id !== id) return bet;
      const nextType = patch.type ?? bet.type;
      const needsTarget = targetOptions(nextType).length > 0;
      return {
        ...bet,
        ...patch,
        target: needsTarget ? patch.target ?? bet.target ?? defaultTarget(nextType) : undefined,
      };
    }));
  }

  function removeBet(id: string) {
    setBets((current) => (current.length > 1 ? current.filter((bet) => bet.id !== id) : current));
  }

  async function play(event: FormEvent) {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);

    const rollTimer = window.setInterval(() => {
      setDice([Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]);
    }, 90);

    try {
      const payload = {
        bets: bets.map(({ amount, target, type }) => ({
          amount: Number(amount),
          target,
          type,
        })),
      };
      const [out] = await Promise.all([
        apiPost<CrapsResult>('/craps/play', payload),
        new Promise((resolve) => window.setTimeout(resolve, 1200)),
      ]);
      setDice(out.dice);
      setResult(out);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Craps indisponible');
    } finally {
      window.clearInterval(rollTimer);
      setLoading(false);
    }
  }

  return (
    <section className="craps-page">
      <header className="craps-hero interactive-card">
        <div>
          <span className="welcome-pill"><Sparkles size={15} /> Table de craps</span>
          <h1>Craps</h1>
          <p>Place tes mises, lance les des et suis le resultat de chaque zone de table.</p>
          <div className="button-row">
            <button className="button" disabled={loading || totalBet <= 0} form="craps-ticket" type="submit">
              <Dices size={18} /> {loading ? 'Lancer...' : 'Lancer les des'}
            </button>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Regles
            </button>
          </div>
        </div>
        <div className="craps-dice-stage">
          <Die rolling={loading} value={dice[0]} />
          <Die rolling={loading} value={dice[1]} />
          <strong>{dice[0] + dice[1]}</strong>
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="craps-layout">
        <section className="craps-table-panel interactive-card">
          <div className="craps-table">
            <div className="craps-table-top">
              <button onClick={() => addBet('ANY_SEVEN')} type="button">Any 7</button>
              <button onClick={() => addBet('ANY_CRAPS')} type="button">Any craps</button>
              <button onClick={() => addBet('YO')} type="button">Yo 11</button>
            </div>
            <div className="craps-number-grid">
              {[4, 5, 6, 8, 9, 10].map((number) => (
                <button onClick={() => addBet('EXACT_TOTAL', number)} type="button" key={number}>
                  <span>{number}</span>
                  <em>Total exact</em>
                </button>
              ))}
            </div>
            <button className="craps-field" onClick={() => addBet('FIELD')} type="button">
              <span>FIELD</span>
              <strong>2 3 4 9 10 11 12</strong>
              <em>2 et 12 paient double</em>
            </button>
            <div className="craps-hardways">
              {[4, 6, 8, 10].map((number) => (
                <button onClick={() => addBet('HARDWAY', number)} type="button" key={number}>
                  Hard {number}
                </button>
              ))}
            </div>
            <button className="craps-pass-line" onClick={() => addBet('PASS_LINE')} type="button">
              PASS LINE
            </button>
            <button className="craps-dont-pass" onClick={() => addBet('DONT_PASS')} type="button">
              DON'T PASS
            </button>
          </div>
        </section>

        <aside className="craps-side">
          <form className="craps-ticket interactive-card" id="craps-ticket" onSubmit={play}>
            <div className="card-heading">
              <h2>Ticket de mises</h2>
              <button className="icon-button" onClick={() => addBet()} type="button" title="Ajouter une mise">
                <Plus size={18} />
              </button>
            </div>

            <div className="craps-bet-list">
              {bets.map((bet) => {
                const targets = targetOptions(bet.type);
                return (
                  <article className="craps-bet-row" key={bet.id}>
                    <label>
                      <span>Mise</span>
                      <select
                        value={bet.type}
                        onChange={(event) => updateBet(bet.id, { type: event.target.value as CrapsBetType })}
                      >
                        {betOptions.map((option) => (
                          <option key={option.type} value={option.type}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    {targets.length > 0 ? (
                      <label>
                        <span>Cible</span>
                        <select value={bet.target} onChange={(event) => updateBet(bet.id, { target: Number(event.target.value) })}>
                          {targets.map((target) => <option key={target} value={target}>{target}</option>)}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      <span>Credits</span>
                      <input min={1} type="number" value={bet.amount} onChange={(event) => updateBet(bet.id, { amount: Number(event.target.value) })} />
                    </label>
                    <button className="icon-button danger" onClick={() => removeBet(bet.id)} type="button" title="Supprimer">
                      <Trash2 size={17} />
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="craps-ticket-footer">
              <span><CircleDollarSign size={17} /> Total</span>
              <strong>{totalBet.toLocaleString('fr-FR')} credits</strong>
            </div>
          </form>

          <section className="craps-result-panel interactive-card">
            <div className="card-heading">
              <h2>Resultat</h2>
              {result ? <strong className={result.net >= 0 ? 'positive' : 'negative'}>{result.net >= 0 ? '+' : ''}{result.net} credits</strong> : null}
            </div>
            {result ? (
              <>
                <div className="craps-result-strip">
                  <span>Total lance</span>
                  <strong>{result.total}</strong>
                  <em>Retour {result.payout} credits</em>
                </div>
                <div className="craps-result-list">
                  {result.results.map((bet, index) => (
                    <div className={`craps-result-row ${bet.outcome}`} key={`${bet.label}-${index}`}>
                      <span>{bet.label}</span>
                      <em>{bet.outcome === 'push' ? 'Push' : bet.outcome === 'win' ? 'Gagne' : 'Perdu'}</em>
                      <strong>{bet.net >= 0 ? '+' : ''}{bet.net}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p>Place une ou plusieurs mises, puis lance les des.</p>
            )}
          </section>
        </aside>
      </div>

      <aside className={rulesOpen ? 'craps-rules-drawer open' : 'craps-rules-drawer'} aria-hidden={!rulesOpen}>
        <div className="panel-heading">
          <div>
            <h2>Regles du craps</h2>
            <p>Version rapide sur un lancer.</p>
          </div>
          <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="craps-rules-scroll">
          {betOptions.map((option) => (
            <article key={option.type}>
              <h3>{option.label}</h3>
              <p>{option.description}</p>
            </article>
          ))}
          <article>
            <h3>Lecture du ticket</h3>
            <p>Chaque mise est debitee au lancement. Les gains et pushes sont ensuite recredites automatiquement.</p>
          </article>
        </div>
      </aside>
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
