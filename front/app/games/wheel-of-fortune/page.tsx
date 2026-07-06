'use client';

import type { CSSProperties } from 'react';
import { useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  BookOpen,
  CircleDollarSign,
  History,
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

type WheelSegment = {
  color: string;
  index?: number;
  label: string;
  multiplier: number;
};

type WheelResult = {
  bet: number;
  net: number;
  payout: number;
  segment: WheelSegment & { index: number };
  segments?: WheelSegment[];
};

const defaultSegments: WheelSegment[] = [
  { color: '#ff625a', label: '0x', multiplier: 0 },
  { color: '#8ad8ff', label: '1.2x', multiplier: 1.2 },
  { color: '#f1d28a', label: '2x', multiplier: 2 },
  { color: '#1de59d', label: '1.5x', multiplier: 1.5 },
  { color: '#ff625a', label: '0.5x', multiplier: 0.5 },
  { color: '#d8a84f', label: '5x', multiplier: 5 },
  { color: '#8ad8ff', label: '1x', multiplier: 1 },
  { color: '#a58cff', label: '3x', multiplier: 3 },
  { color: '#ff625a', label: '0x', multiplier: 0 },
  { color: '#1de59d', label: '1.8x', multiplier: 1.8 },
  { color: '#f1d28a', label: '10x', multiplier: 10 },
  { color: '#8ad8ff', label: '1.2x', multiplier: 1.2 },
  { color: '#ff625a', label: '0.5x', multiplier: 0.5 },
  { color: '#d8a84f', label: '20x', multiplier: 20 },
  { color: '#1de59d', label: '2.5x', multiplier: 2.5 },
  { color: '#f1d28a', label: '50x', multiplier: 50 },
];

function formatCredits(value?: number) {
  return `${Number(value ?? 0).toLocaleString('fr-FR')} credits`;
}

function wheelGradient(segments: WheelSegment[]) {
  const step = 100 / segments.length;
  return `conic-gradient(from -90deg, ${segments
    .map((segment, index) => `${segment.color} ${index * step}% ${(index + 1) * step}%`)
    .join(', ')})`;
}

function WheelContent() {
  const [bet, setBet] = useState(25);
  const [segments, setSegments] = useState<WheelSegment[]>(defaultSegments);
  const [result, setResult] = useState<WheelResult | null>(null);
  const [history, setHistory] = useState<WheelResult[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [error, setError] = useState('');
  const [rotation, setRotation] = useState(0);
  const timerRef = useRef<number | null>(null);

  const gradient = useMemo(() => wheelGradient(segments), [segments]);
  const bestSegment = useMemo(() => [...segments].sort((a, b) => b.multiplier - a.multiplier)[0], [segments]);

  function resetWheel() {
    if (spinning) return;
    setResult(null);
    setError('');
    setRotation((current) => current % 360);
  }

  async function spin() {
    if (spinning) return;

    const nextBet = Math.trunc(Number(bet));
    if (!Number.isFinite(nextBet) || nextBet <= 0) {
      setError('Mise invalide.');
      return;
    }

    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    setError('');
    setSpinning(true);
    setResult(null);

    try {
      emitBalanceDelta(-nextBet, 'wheel-bet');
      const out = await apiPost<WheelResult>('/wheel/spin', { bet: nextBet });
      if (out.segments?.length) setSegments(out.segments);

      const segmentCount = out.segments?.length || segments.length;
      const slice = 360 / segmentCount;
      const targetCenter = out.segment.index * slice + slice / 2;
      const landingRotation = 360 - targetCenter;
      const nextRotation = rotation + 360 * 6 + landingRotation;
      setRotation(nextRotation);

      timerRef.current = window.setTimeout(() => {
        setResult(out);
        setHistory((current) => [out, ...current].slice(0, 8));
        setSpinning(false);
        if (Number(out.payout ?? 0) > 0) emitBalanceDelta(Number(out.payout), 'wheel-payout');
      }, 4300);
    } catch (err) {
      emitBalanceDelta(nextBet, 'wheel-refund');
      setSpinning(false);
      setError(err instanceof Error ? err.message : 'Roue indisponible');
    }
  }

  const statusText = useMemo(() => {
    if (spinning) return 'La roue tourne.';
    if (!result) return 'Choisis ta mise et lance la roue.';
    if (result.payout > result.bet) return `${result.segment.label} touche. Gain net positif.`;
    if (result.payout === result.bet) return `${result.segment.label}. Mise remboursee.`;
    return `${result.segment.label}. La roue garde une partie de la mise.`;
  }, [result, spinning]);

  return (
    <section className="wheel-page">
      <header className="wheel-hero interactive-card">
        <div>
          <span className="welcome-pill"><Sparkles size={15} /> Wheel of Fortune</span>
          <h1>Fais tourner la roue.</h1>
          <p>Une mise, un spin, un multiplicateur. Les gros segments brillent, mais ils ne sortent pas souvent.</p>
          <div className="button-row">
            <button className="button" disabled={spinning || bet <= 0} onClick={() => void spin()} type="button">
              <Play size={18} /> Spin
            </button>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Regles
            </button>
          </div>
        </div>
        <div className="wheel-hero-preview" aria-hidden="true">
          <span>50x</span>
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="wheel-layout">
        <section className="wheel-stage interactive-card">
          <div className="wheel-pointer" />
          <div className="fortune-wheel-shell">
            <div
              className={spinning ? 'fortune-wheel spinning' : 'fortune-wheel'}
              style={{ '--wheel-gradient': gradient, '--wheel-rotation': `${rotation}deg` } as CSSProperties}
            >
              {segments.map((segment, index) => {
                const slice = 360 / segments.length;
                return (
                  <span
                    className={result?.segment.index === index ? 'hit' : ''}
                    key={`${segment.label}-${index}`}
                    style={{ '--segment-angle': `${index * slice + slice / 2}deg` } as CSSProperties}
                  >
                    {segment.label}
                  </span>
                );
              })}
            </div>
            <button className="fortune-wheel-center" disabled={spinning || bet <= 0} onClick={() => void spin()} type="button">
              {spinning ? '...' : result?.segment.label ?? 'SPIN'}
            </button>
          </div>
        </section>

        <aside className="wheel-side">
          <section className="wheel-panel interactive-card">
            <div className="card-heading">
              <h2>Ticket</h2>
              <CircleDollarSign size={19} />
            </div>
            <label>
              <span>Mise</span>
              <input disabled={spinning} min={1} type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
            </label>
            <div className="wheel-kpis">
              <span>Meilleur segment <strong>{bestSegment?.label ?? '-'}</strong></span>
              <span>Resultat <strong>{result?.segment.label ?? '-'}</strong></span>
              <span>Gain <strong className={Number(result?.payout ?? 0) > 0 ? 'positive' : ''}>{formatCredits(result?.payout)}</strong></span>
              <span>Net <strong className={Number(result?.net ?? 0) >= 0 ? 'positive' : 'negative'}>{formatCredits(result?.net)}</strong></span>
            </div>
            <p>{statusText}</p>
            <button className="button secondary" disabled={spinning} onClick={resetWheel} type="button">
              <RotateCcw size={18} /> Recentrer
            </button>
          </section>

          <section className="wheel-panel interactive-card">
            <div className="card-heading">
              <h2>Historique</h2>
              <History size={19} />
            </div>
            <div className="wheel-history">
              {history.length > 0 ? history.map((item, index) => (
                <article key={`${item.segment.label}-${index}`}>
                  <span style={{ background: item.segment.color }} />
                  <strong>{item.segment.label}</strong>
                  <em>{formatCredits(item.net)}</em>
                </article>
              )) : <p>Aucun spin pour le moment.</p>}
            </div>
          </section>
        </aside>
      </div>

      <aside className={rulesOpen ? 'wheel-rules-drawer open' : 'wheel-rules-drawer'} aria-hidden={!rulesOpen}>
        <div className="panel-heading">
          <div>
            <h2>Regles Wheel of Fortune</h2>
            <p>La roue est composee de segments ponderes.</p>
          </div>
          <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="wheel-rules-scroll">
          <article>
            <BadgeDollarSign size={18} />
            <div>
              <h3>Mise</h3>
              <p>La mise est retiree au lancement. Le gain est calcule avec le multiplicateur du segment.</p>
            </div>
          </article>
          <article>
            <Trophy size={18} />
            <div>
              <h3>Multiplicateurs</h3>
              <p>Les segments faibles sont plus frequents, les gros multiplicateurs sont rares.</p>
            </div>
          </article>
          <div className="wheel-segment-list">
            {segments.map((segment, index) => (
              <span key={`${segment.label}-${index}`}>
                <i style={{ background: segment.color }} />
                {segment.label}
              </span>
            ))}
          </div>
        </div>
      </aside>
    </section>
  );
}

export default function WheelOfFortunePage() {
  return (
    <RequireAuth>
      <WheelContent />
    </RequireAuth>
  );
}
