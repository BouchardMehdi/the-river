'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  BookOpen,
  CircleDot,
  Dices,
  Eraser,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';

type KenoResult = {
  bet: number;
  draw: number[];
  drawOrder?: number[];
  hits: number[];
  multiplier: number;
  net: number;
  payout: number;
  picks: number[];
  spotCount: number;
};

const maxPicks = 10;
const numbers = Array.from({ length: 80 }, (_, index) => index + 1);
const paytable: Record<number, Record<number, number>> = {
  1: { 1: 3 },
  2: { 1: 1, 2: 9 },
  3: { 2: 2, 3: 16 },
  4: { 2: 1, 3: 4, 4: 40 },
  5: { 3: 2, 4: 10, 5: 100 },
  6: { 3: 1, 4: 4, 5: 40, 6: 300 },
  7: { 3: 1, 4: 3, 5: 20, 6: 100, 7: 700 },
  8: { 4: 2, 5: 10, 6: 50, 7: 250, 8: 1500 },
  9: { 4: 1, 5: 5, 6: 25, 7: 150, 8: 1000, 9: 5000 },
  10: { 0: 1, 5: 2, 6: 15, 7: 80, 8: 500, 9: 2500, 10: 10000 },
};

function formatCredits(value?: number) {
  return `${Number(value ?? 0).toLocaleString('fr-FR')} credits`;
}

function quickPick(count: number) {
  const pool = [...numbers];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

function KenoContent() {
  const [bet, setBet] = useState(20);
  const [selected, setSelected] = useState<number[]>([]);
  const [visibleDraw, setVisibleDraw] = useState<number[]>([]);
  const [result, setResult] = useState<KenoResult | null>(null);
  const [pendingResult, setPendingResult] = useState<KenoResult | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const timersRef = useRef<number[]>([]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleDrawSet = useMemo(() => new Set(visibleDraw), [visibleDraw]);
  const finalHits = useMemo(() => new Set((result ?? pendingResult)?.hits ?? []), [pendingResult, result]);
  const drawCount = visibleDraw.length;
  const activeResult = result ?? pendingResult;
  const currentPaytable = paytable[Math.max(1, selected.length)] ?? {};
  const bestMultiplier = Math.max(...Object.values(currentPaytable), 0);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
    };
  }, []);

  function toggleNumber(value: number) {
    if (drawing) return;
    setError('');
    setResult(null);
    setPendingResult(null);
    setVisibleDraw([]);
    setSelected((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (current.length >= maxPicks) return current;
      return [...current, value].sort((a, b) => a - b);
    });
  }

  function clearBoard() {
    if (drawing) return;
    setSelected([]);
    setVisibleDraw([]);
    setResult(null);
    setPendingResult(null);
    setError('');
  }

  async function play() {
    if (drawing) return;
    if (selected.length <= 0) {
      setError('Selectionne au moins un numero.');
      return;
    }

    const nextBet = Math.trunc(Number(bet));
    if (!Number.isFinite(nextBet) || nextBet <= 0) {
      setError('Mise invalide.');
      return;
    }

    setError('');
    setDrawing(true);
    setVisibleDraw([]);
    setResult(null);
    setPendingResult(null);

    try {
      emitBalanceDelta(-nextBet, 'keno-bet');
      const out = await apiPost<KenoResult>('/keno/play', { bet: nextBet, picks: selected });
      setPendingResult(out);

      const order = out.drawOrder && out.drawOrder.length > 0 ? out.drawOrder : out.draw;
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];

      order.forEach((number, index) => {
        const timer = window.setTimeout(() => {
          setVisibleDraw((current) => [...current, number]);
        }, 110 * index);
        timersRef.current.push(timer);
      });

      const finishTimer = window.setTimeout(() => {
        setResult(out);
        setPendingResult(null);
        setDrawing(false);
        if (Number(out.payout ?? 0) > 0) emitBalanceDelta(Number(out.payout), 'keno-payout');
      }, 110 * order.length + 420);
      timersRef.current.push(finishTimer);
    } catch (err) {
      emitBalanceDelta(nextBet, 'keno-refund');
      setDrawing(false);
      setError(err instanceof Error ? err.message : 'Tirage Keno impossible');
    }
  }

  const statusText = useMemo(() => {
    if (drawing) return `Tirage en cours: ${drawCount}/20 numeros.`;
    if (!result) return 'Choisis de 1 a 10 numeros, puis lance le tirage.';
    if (result.payout > 0) {
      return `${result.hits.length} hit(s), multiplicateur ${result.multiplier}x.`;
    }
    return `${result.hits.length} hit(s). Aucun gain sur cette grille.`;
  }, [drawCount, drawing, result]);

  return (
    <section className="keno-page">
      <header className="keno-hero interactive-card">
        <div>
          <span className="welcome-pill"><Sparkles size={15} /> Keno</span>
          <h1>Tire les bons numeros.</h1>
          <p>Selectionne jusqu'a 10 numeros. Le casino en tire 20, et chaque hit rapproche du multiplicateur.</p>
          <div className="button-row">
            <button className="button" disabled={drawing || selected.length <= 0 || bet <= 0} onClick={() => void play()} type="button">
              <Play size={18} /> Lancer
            </button>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Regles
            </button>
          </div>
        </div>
        <div className="keno-hero-balls" aria-hidden="true">
          {[7, 22, 45, 68].map((item) => <span key={item}>{item}</span>)}
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="keno-layout">
        <section className="keno-board-panel interactive-card">
          <div className="keno-board-toolbar">
            <div>
              <h2>Grille Keno</h2>
              <p>{selected.length}/{maxPicks} numeros selectionnes</p>
            </div>
            <div className="keno-toolbar-actions">
              <button className="button secondary small" disabled={drawing} onClick={() => setSelected(quickPick(6))} type="button">
                <Dices size={15} /> Quick 6
              </button>
              <button className="button secondary small" disabled={drawing} onClick={() => setSelected(quickPick(10))} type="button">
                <Dices size={15} /> Quick 10
              </button>
              <button className="icon-button" disabled={drawing} onClick={clearBoard} type="button" title="Effacer">
                <Eraser size={17} />
              </button>
            </div>
          </div>

          <div className={drawing ? 'keno-board drawing' : 'keno-board'}>
            {numbers.map((number) => {
              const isSelected = selectedSet.has(number);
              const isDrawn = visibleDrawSet.has(number);
              const isHit = isSelected && isDrawn;
              const isMiss = result && isSelected && !finalHits.has(number);
              const className = [
                'keno-number',
                isSelected ? 'selected' : '',
                isDrawn ? 'drawn' : '',
                isHit ? 'hit' : '',
                isMiss ? 'miss' : '',
              ].filter(Boolean).join(' ');

              return (
                <button className={className} disabled={drawing} key={number} onClick={() => toggleNumber(number)} type="button">
                  {number}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="keno-side">
          <section className="keno-panel interactive-card">
            <div className="card-heading">
              <h2>Ticket</h2>
              <Trophy size={19} />
            </div>
            <label>
              <span>Mise</span>
              <input disabled={drawing} min={1} type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
            </label>
            <div className="keno-kpis">
              <span>Choix <strong>{selected.length}</strong></span>
              <span>Tires <strong>{drawCount}/20</strong></span>
              <span>Hits <strong>{activeResult?.hits.length ?? 0}</strong></span>
              <span>Max actuel <strong>{bestMultiplier.toLocaleString('fr-FR')}x</strong></span>
            </div>
            <p>{statusText}</p>
          </section>

          <section className="keno-panel interactive-card">
            <div className="card-heading">
              <h2>Resultat</h2>
              <BadgeDollarSign size={19} />
            </div>
            <div className="keno-result-card">
              <span>Gain</span>
              <strong className={Number(result?.payout ?? 0) > 0 ? 'positive' : ''}>{formatCredits(result?.payout)}</strong>
            </div>
            <div className="keno-result-card">
              <span>Net</span>
              <strong className={Number(result?.net ?? 0) >= 0 ? 'positive' : 'negative'}>{formatCredits(result?.net)}</strong>
            </div>
            <div className="keno-picked-list">
              {(result?.hits ?? []).length > 0 ? result?.hits.map((hit) => <span key={hit}>{hit}</span>) : <em>Aucun hit valide pour le moment.</em>}
            </div>
          </section>
        </aside>
      </div>

      <aside className={rulesOpen ? 'keno-rules-drawer open' : 'keno-rules-drawer'} aria-hidden={!rulesOpen}>
        <div className="panel-heading">
          <div>
            <h2>Regles du Keno</h2>
            <p>Selection, tirage et multiplicateurs.</p>
          </div>
          <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="keno-rules-scroll">
          <article>
            <CircleDot size={18} />
            <div>
              <h3>Selection</h3>
              <p>Choisis entre 1 et 10 numeros sur une grille de 80. Le tirage sort 20 numeros.</p>
            </div>
          </article>
          <article>
            <BadgeDollarSign size={18} />
            <div>
              <h3>Gain</h3>
              <p>Le payout depend du nombre de numeros choisis et du nombre de hits obtenus.</p>
            </div>
          </article>
          <div className="keno-paytable">
            {Object.entries(paytable).map(([spots, rows]) => (
              <section key={spots}>
                <strong>{spots} choix</strong>
                <div>
                  {Object.entries(rows).map(([hits, multiplier]) => (
                    <span key={hits}>{hits} hit: {multiplier}x</span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
}

export default function KenoPage() {
  return (
    <RequireAuth>
      <KenoContent />
    </RequireAuth>
  );
}
