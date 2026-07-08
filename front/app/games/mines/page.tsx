'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  BadgeDollarSign,
  Bomb,
  BookOpen,
  Gem,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';
import { emitGameSound } from '@/lib/sound-events';

type MinesSession = {
  active: boolean;
  bet?: number;
  boardSize?: number;
  cell?: number;
  completed?: boolean;
  mineCells?: number[];
  mines?: number;
  multiplier?: number;
  net?: number;
  outcome?: 'SAFE' | 'MINE' | 'CASHOUT';
  payout?: number;
  potentialPayout?: number;
  revealed?: number[];
  resumed?: boolean;
  safeLeft?: number;
};

function formatMultiplier(value?: number) {
  return `${Number(value ?? 1).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}x`;
}

function MinesContent() {
  const [bet, setBet] = useState(25);
  const [mines, setMines] = useState(5);
  const [session, setSession] = useState<MinesSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [lastCell, setLastCell] = useState<number | null>(null);

  const boardSize = Number(session?.boardSize ?? 25);
  const isActive = Boolean(session?.active);
  const revealed = useMemo(() => new Set(session?.revealed ?? []), [session?.revealed]);
  const mineCells = useMemo(() => new Set(session?.mineCells ?? []), [session?.mineCells]);
  const canCashout = isActive && revealed.size > 0;
  const statusText = useMemo(() => {
    if (!session) return 'Choisis ta mise, le nombre de mines, puis ouvre une case.';
    if (session.outcome === 'MINE') return 'Bombe trouvee. La mise est perdue.';
    if (session.outcome === 'CASHOUT') return `Cashout pour ${Number(session.payout ?? 0).toLocaleString('fr-FR')} credits.`;
    if (session.outcome === 'SAFE') return 'Case sure. Le multiplicateur monte.';
    return 'Ouvre une case ou cashout avant de tomber sur une mine.';
  }, [session]);

  async function loadSession() {
    try {
      const out = await apiGet<MinesSession>('/mines/session');
      if (out.active) setSession(out);
    } catch {
      // Pas de session active, la page reste prete.
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  async function start() {
    if (loading) return;
    setError('');
    setLoading(true);
    setLastCell(null);

    try {
      const nextBet = Number(bet);
      emitBalanceDelta(-nextBet, 'mines-bet');
      emitGameSound('chip');
      const out = await apiPost<MinesSession>('/mines/start', { bet: nextBet, mines: Number(mines) });
      if (out.resumed) emitBalanceDelta(nextBet, 'mines-resume-refund');
      setSession(out);
    } catch (err) {
      emitBalanceDelta(Number(bet), 'mines-refund');
      setError(err instanceof Error ? err.message : 'Impossible de demarrer Mines');
    } finally {
      setLoading(false);
    }
  }

  async function reveal(cell: number) {
    if (loading || !isActive || revealed.has(cell)) return;
    setError('');
    setLoading(true);
    setLastCell(cell);

    try {
      const out = await apiPost<MinesSession>('/mines/reveal', { cell });
      emitGameSound(out.outcome === 'MINE' ? 'loss' : 'card');
      setSession(out);
      if (out.outcome === 'CASHOUT' && Number(out.payout ?? 0) > 0) {
        emitBalanceDelta(Number(out.payout), 'mines-complete-payout');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Case impossible');
    } finally {
      setLoading(false);
    }
  }

  async function cashout() {
    if (loading || !canCashout) return;
    setError('');
    setLoading(true);

    try {
      const out = await apiPost<MinesSession>('/mines/cashout');
      emitGameSound('cashout');
      if (Number(out.payout ?? 0) > 0) emitBalanceDelta(Number(out.payout), 'mines-payout');
      setSession(out);
      setLastCell(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cashout impossible');
    } finally {
      setLoading(false);
    }
  }

  function resetLocal() {
    setSession(null);
    setLastCell(null);
    setError('');
  }

  return (
    <section className="mines-page">
      <header className="mines-hero interactive-card">
        <div>
          <span className="welcome-pill"><Sparkles size={15} /> Mines</span>
          <h1>Ouvre les bonnes cases.</h1>
          <p>Chaque gemme augmente ton multiplicateur. Cashout avant qu'une bombe coupe la serie.</p>
          <div className="button-row">
            <button className="button" disabled={loading || isActive || bet <= 0} onClick={() => void start()} type="button">
              <Play size={18} /> Demarrer
            </button>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Regles
            </button>
          </div>
        </div>
        <div className="mines-hero-grid" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <span className={index === 4 ? 'gem' : index === 7 ? 'mine' : ''} key={index}>
              {index === 4 ? <Gem size={28} /> : index === 7 ? <Bomb size={28} /> : null}
            </span>
          ))}
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="mines-layout">
        <section className="mines-board-panel interactive-card">
          <div className={isActive ? 'mines-board active' : 'mines-board'}>
            {Array.from({ length: boardSize }, (_, cell) => {
              const isRevealed = revealed.has(cell);
              const isMine = mineCells.has(cell);
              const isLast = lastCell === cell;
              const className = [
                'mines-cell',
                isRevealed ? 'revealed' : '',
                isMine ? 'mine' : '',
                isLast ? 'last' : '',
              ].filter(Boolean).join(' ');

              return (
                <button className={className} disabled={loading || !isActive || isRevealed} key={cell} onClick={() => void reveal(cell)} type="button">
                  {isMine ? <Bomb size={28} /> : isRevealed ? <Gem size={28} /> : <span />}
                </button>
              );
            })}
          </div>

          <div className="mines-action-strip">
            <button className="button mines-cashout" disabled={loading || !canCashout} onClick={() => void cashout()} type="button">
              <BadgeDollarSign size={19} /> Cashout {Number(session?.potentialPayout ?? 0).toLocaleString('fr-FR')}
            </button>
            <button className="button secondary" onClick={resetLocal} type="button">
              <RotateCcw size={18} /> Nouvelle manche
            </button>
          </div>
        </section>

        <aside className="mines-side">
          <section className="mines-panel interactive-card">
            <div className="card-heading">
              <h2>Parametres</h2>
              <ShieldCheck size={19} />
            </div>
            <label>
              <span>Mise</span>
              <input disabled={loading || isActive} min={1} type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
            </label>
            <label>
              <span>Mines</span>
              <input disabled={loading || isActive} max={24} min={1} type="number" value={mines} onChange={(event) => setMines(Number(event.target.value))} />
            </label>
            <div className="mines-kpis">
              <span>Multiplicateur <strong>{formatMultiplier(session?.multiplier)}</strong></span>
              <span>Gemme(s) <strong>{revealed.size}</strong></span>
              <span>Cases sures <strong>{Number(session?.safeLeft ?? 25 - mines - revealed.size)}</strong></span>
              <span>Cashout <strong>{Number(session?.potentialPayout ?? 0).toLocaleString('fr-FR')}</strong></span>
            </div>
            <p>{statusText}</p>
          </section>

          <section className="mines-panel interactive-card">
            <h2>Risque</h2>
            <div className="mines-risk-meter">
              <span style={{ '--risk-width': `${Math.min(100, (Number(session?.mines ?? mines) / 24) * 100)}%` } as CSSProperties} />
            </div>
            <p>Plus il y a de mines, plus les gains montent vite. Et plus la table a les dents longues.</p>
          </section>
        </aside>
      </div>

      <aside className={rulesOpen ? 'mines-rules-drawer open' : 'mines-rules-drawer'} aria-hidden={!rulesOpen}>
        <div className="panel-heading">
          <div>
            <h2>Regles de Mines</h2>
            <p>Un jeu de cashout rapide sur une grille 5x5.</p>
          </div>
          <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="mines-rules-scroll">
          <article>
            <Gem size={18} />
            <div>
              <h3>Cases sures</h3>
              <p>Chaque case sans mine augmente le multiplicateur et ton cashout potentiel.</p>
            </div>
          </article>
          <article>
            <Bomb size={18} />
            <div>
              <h3>Mines</h3>
              <p>Si tu ouvres une bombe, la manche se termine immediatement et la mise est perdue.</p>
            </div>
          </article>
          <article>
            <BadgeDollarSign size={18} />
            <div>
              <h3>Cashout</h3>
              <p>Tu peux encaisser apres au moins une gemme revelee. Le payout depend du nombre de mines et de cases sures.</p>
            </div>
          </article>
        </div>
      </aside>
    </section>
  );
}

export default function MinesPage() {
  return (
    <RequireAuth>
      <MinesContent />
    </RequireAuth>
  );
}
