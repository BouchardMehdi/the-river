'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  BookOpen,
  CircleDollarSign,
  History,
  Play,
  RotateCcw,
  Rocket,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';
import { emitGameSound } from '@/lib/sound-events';

type CrashSession = {
  active: boolean;
  bet?: number;
  crashPoint?: number;
  currentMultiplier?: number;
  elapsedMs?: number;
  multiplier?: number;
  net?: number;
  outcome?: 'CASHOUT' | 'CRASH';
  payout?: number;
  potentialPayout?: number;
  resumed?: boolean;
};

function formatCredits(value?: number) {
  return `${Number(value ?? 0).toLocaleString('fr-FR')} credits`;
}

function formatMultiplier(value?: number) {
  return `${Number(value ?? 1).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
}

function CrashContent() {
  const [bet, setBet] = useState(25);
  const [session, setSession] = useState<CrashSession | null>(null);
  const [result, setResult] = useState<CrashSession | null>(null);
  const [history, setHistory] = useState<CrashSession[]>([]);
  const [running, setRunning] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [error, setError] = useState('');
  const intervalRef = useRef<number | null>(null);
  const wasRunningRef = useRef(false);

  const multiplier = Number(session?.currentMultiplier ?? result?.multiplier ?? 1);
  const potential = Number(session?.potentialPayout ?? Math.floor(Number(session?.bet ?? bet) * multiplier));
  const progress = Math.min(100, Math.max(0, (multiplier - 1) * 24));
  const curvePoint = useMemo(() => {
    const t = Math.min(1, Math.max(0, progress / 100));
    const exp = (Math.exp(t * 3.2) - 1) / (Math.exp(3.2) - 1);
    const x = 7 + t * 86;
    const y = 88 - exp * 74;

    return {
      c1x: 12 + t * 18,
      c1y: 88,
      c2x: 18 + t * 62,
      c2y: 88 - exp * 30,
      x,
      y,
    };
  }, [progress]);
  const curvePath = `M 7 88 C ${curvePoint.c1x.toFixed(2)} ${curvePoint.c1y.toFixed(2)} ${curvePoint.c2x.toFixed(2)} ${curvePoint.c2y.toFixed(2)} ${curvePoint.x.toFixed(2)} ${curvePoint.y.toFixed(2)}`;
  const curveAreaPath = `${curvePath} L ${curvePoint.x.toFixed(2)} 92 L 7 92 Z`;
  const curveGuidePath = 'M 7 88 C 28 88 62 72 93 14';
  const graphStyle = {
    '--crash-progress': `${progress}%`,
    '--rocket-left': `${curvePoint.x}%`,
    '--rocket-top': `${curvePoint.y}%`,
  } as CSSProperties;

  function stopPolling() {
    if (intervalRef.current != null) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

  async function pollSession() {
    try {
      const out = await apiGet<CrashSession>('/crash/session');
      if (out.active) {
        setSession(out);
        setRunning(true);
        wasRunningRef.current = true;
        return;
      }

      if (wasRunningRef.current) {
        const crashResult: CrashSession = {
          ...out,
          active: false,
          bet: out.bet ?? session?.bet,
          currentMultiplier: out.currentMultiplier ?? session?.currentMultiplier,
          multiplier: out.multiplier ?? out.crashPoint ?? session?.currentMultiplier,
          net: out.net ?? -Number(session?.bet ?? bet),
          outcome: 'CRASH',
          payout: 0,
        };
        setResult(crashResult);
        setHistory((current) => [crashResult, ...current].slice(0, 8));
        emitGameSound('crash');
      }

      setRunning(false);
      setSession(null);
      stopPolling();
      wasRunningRef.current = false;
    } catch {
      // Le prochain tick retentera, pas besoin de couper l'animation brutalement.
    }
  }

  useEffect(() => {
    void pollSession();
    return stopPolling;
  }, []);

  function startPolling() {
    stopPolling();
    intervalRef.current = window.setInterval(() => {
      void pollSession();
    }, 250);
  }

  async function start() {
    if (running) return;
    const nextBet = Math.trunc(Number(bet));
    if (!Number.isFinite(nextBet) || nextBet <= 0) {
      setError('Mise invalide.');
      return;
    }

    setError('');
    setResult(null);
    setSession(null);
    setRunning(true);
    wasRunningRef.current = true;

    try {
      emitBalanceDelta(-nextBet, 'crash-bet');
      emitGameSound('spin');
      const out = await apiPost<CrashSession>('/crash/start', { bet: nextBet });
      if (out.resumed) emitBalanceDelta(nextBet, 'crash-resume-refund');
      setSession(out);
      startPolling();
    } catch (err) {
      emitBalanceDelta(nextBet, 'crash-refund');
      setRunning(false);
      wasRunningRef.current = false;
      setError(err instanceof Error ? err.message : 'Crash indisponible');
    }
  }

  async function cashout() {
    if (!running) return;
    setError('');

    try {
      const out = await apiPost<CrashSession>('/crash/cashout');
      stopPolling();
      setRunning(false);
      wasRunningRef.current = false;
      setSession(null);
      setResult(out);
      setHistory((current) => [out, ...current].slice(0, 8));
      if (out.outcome === 'CASHOUT' && Number(out.payout ?? 0) > 0) {
        emitGameSound('cashout');
        emitBalanceDelta(Number(out.payout), 'crash-payout');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cashout impossible');
      void pollSession();
    }
  }

  function reset() {
    if (running) return;
    setResult(null);
    setSession(null);
    setError('');
  }

  const statusText = useMemo(() => {
    if (running) return 'Le multiplicateur monte. Cashout avant le crash.';
    if (result?.outcome === 'CASHOUT') return `Cashout a ${formatMultiplier(result.multiplier)}.`;
    if (result?.outcome === 'CRASH') return `Crash a ${formatMultiplier(result.crashPoint ?? result.multiplier)}.`;
    return 'Choisis ta mise, lance la courbe, et retire au bon moment.';
  }, [result, running]);

  return (
    <section className="crash-page">
      <header className="crash-hero interactive-card">
        <div>
          <span className="welcome-pill"><Sparkles size={15} /> Crash</span>
          <h1>Cashout avant la chute.</h1>
          <p>Le multiplicateur grimpe en temps reel. Plus tu attends, plus le gain monte, jusqu'au crash.</p>
          <div className="button-row">
            <button className="button" disabled={running || bet <= 0} onClick={() => void start()} type="button">
              <Play size={18} /> Lancer
            </button>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Regles
            </button>
          </div>
        </div>
        <div className="crash-hero-chart" aria-hidden="true">
          <span>2.46x</span>
          <Rocket size={58} />
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="crash-layout">
        <section className={running ? 'crash-stage running interactive-card' : 'crash-stage interactive-card'}>
          <div className="crash-multiplier">
            <strong>{formatMultiplier(multiplier)}</strong>
            <span>{statusText}</span>
          </div>
          <div className="crash-graph" style={graphStyle}>
            <div className="crash-grid-lines" />
            <svg className="crash-curve-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path className="crash-curve-guide" d={curveGuidePath} />
              <path className="crash-curve-area" d={curveAreaPath} />
              <path className="crash-curve-glow" d={curvePath} />
              <path className="crash-curve-line" d={curvePath} />
            </svg>
            <div className="crash-rocket">
              <Rocket size={44} />
            </div>
            <div className={result?.outcome === 'CRASH' ? 'crash-burst show' : 'crash-burst'}>CRASH</div>
          </div>
        </section>

        <aside className="crash-side">
          <section className="crash-panel interactive-card">
            <div className="card-heading">
              <h2>Ticket</h2>
              <CircleDollarSign size={19} />
            </div>
            <label>
              <span>Mise</span>
              <input disabled={running} min={1} type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
            </label>
            <div className="crash-kpis">
              <span>Cashout actuel <strong>{formatCredits(potential)}</strong></span>
              <span>Mise <strong>{formatCredits(session?.bet ?? result?.bet ?? bet)}</strong></span>
              <span>Gain <strong className={Number(result?.payout ?? 0) > 0 ? 'positive' : ''}>{formatCredits(result?.payout)}</strong></span>
              <span>Net <strong className={Number(result?.net ?? 0) >= 0 ? 'positive' : 'negative'}>{formatCredits(result?.net)}</strong></span>
            </div>
            <button className="button crash-cashout" disabled={!running} onClick={() => void cashout()} type="button">
              <BadgeDollarSign size={19} /> Cashout {formatCredits(potential)}
            </button>
            <button className="button secondary" disabled={running} onClick={reset} type="button">
              <RotateCcw size={18} /> Nouvelle courbe
            </button>
          </section>

          <section className="crash-panel interactive-card">
            <div className="card-heading">
              <h2>Historique</h2>
              <History size={19} />
            </div>
            <div className="crash-history">
              {history.length > 0 ? history.map((item, index) => (
                <article className={item.outcome === 'CASHOUT' ? 'win' : 'loss'} key={`${item.outcome}-${index}`}>
                  <strong>{formatMultiplier(item.multiplier ?? item.crashPoint)}</strong>
                  <span>{item.outcome === 'CASHOUT' ? 'Cashout' : 'Crash'}</span>
                  <em>{formatCredits(item.net)}</em>
                </article>
              )) : <p>Aucune manche pour le moment.</p>}
            </div>
          </section>
        </aside>
      </div>

      <aside className={rulesOpen ? 'crash-rules-drawer open' : 'crash-rules-drawer'} aria-hidden={!rulesOpen}>
        <div className="panel-heading">
          <div>
            <h2>Regles du Crash</h2>
            <p>Un jeu de cashout en temps reel.</p>
          </div>
          <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="crash-rules-scroll">
          <article>
            <TrendingUp size={18} />
            <div>
              <h3>Multiplicateur</h3>
              <p>La courbe commence a 1.00x et monte progressivement. Le point de crash est cache par le serveur.</p>
            </div>
          </article>
          <article>
            <BadgeDollarSign size={18} />
            <div>
              <h3>Cashout</h3>
              <p>Si tu cashout avant le crash, tu recuperes mise x multiplicateur actuel.</p>
            </div>
          </article>
          <article>
            <X size={18} />
            <div>
              <h3>Crash</h3>
              <p>Si la courbe crash avant ton cashout, la manche se termine et la mise est perdue.</p>
            </div>
          </article>
        </div>
      </aside>
    </section>
  );
}

export default function CrashPage() {
  return (
    <RequireAuth>
      <CrashContent />
    </RequireAuth>
  );
}
