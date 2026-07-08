'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Matter from 'matter-js';
import {
  BookOpen,
  CircleDollarSign,
  Gauge,
  Play,
  RefreshCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';

type PachinkoRisk = 'LOW' | 'MEDIUM' | 'HIGH';

type PachinkoResult = {
  bet: number;
  credits?: number | null;
  finalSlot: number;
  multiplier: number;
  multipliers: number[];
  net: number;
  path: Array<{ direction: 'L' | 'R'; row: number; slot: number }>;
  payout: number;
  risk: PachinkoRisk;
  rows: number;
};

type PachinkoStartResult = {
  bet: number;
  credits?: number | null;
  multipliers: number[];
  risk: PachinkoRisk;
  rows: number;
  ticketId: string;
};

const riskLabels: Record<PachinkoRisk, { label: string; text: string }> = {
  LOW: { label: 'Stable', text: 'Moins violent, plus regulier.' },
  MEDIUM: { label: 'Equilibre', text: 'Bon mix entre risque et gain.' },
  HIGH: { label: 'Volatil', text: 'Bords tres forts, centre dangereux.' },
};

const previewMultipliers: Record<PachinkoRisk, Record<number, number[]>> = {
  LOW: {
    8: [2.4, 1.5, 1.1, 0.8, 0.5, 0.8, 1.1, 1.5, 2.4],
    10: [3, 1.8, 1.25, 1, 0.7, 0.45, 0.7, 1, 1.25, 1.8, 3],
    12: [4, 2.3, 1.6, 1.1, 0.8, 0.55, 0.4, 0.55, 0.8, 1.1, 1.6, 2.3, 4],
  },
  MEDIUM: {
    8: [6, 2.4, 1.3, 0.7, 0.25, 0.7, 1.3, 2.4, 6],
    10: [9, 3.2, 1.6, 0.9, 0.45, 0.2, 0.45, 0.9, 1.6, 3.2, 9],
    12: [14, 5, 2.2, 1.1, 0.55, 0.3, 0.15, 0.3, 0.55, 1.1, 2.2, 5, 14],
  },
  HIGH: {
    8: [16, 4, 1.4, 0.25, 0, 0.25, 1.4, 4, 16],
    10: [28, 7, 2, 0.5, 0.1, 0, 0.1, 0.5, 2, 7, 28],
    12: [50, 12, 3.4, 0.8, 0.2, 0, 0, 0, 0.2, 0.8, 3.4, 12, 50],
  },
};

function formatMultiplier(value: number) {
  return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}x`;
}

function themeColor(token: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

function PachinkoContent() {
  const { refreshUser } = useAuth();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const slotCentersRef = useRef<number[]>([]);
  const ticketRef = useRef<string | null>(null);
  const landedOnceRef = useRef(false);
  const settlingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const [bet, setBet] = useState(20);
  const [risk, setRisk] = useState<PachinkoRisk>('MEDIUM');
  const [rows, setRows] = useState(10);
  const [activeMultipliers, setActiveMultipliers] = useState<number[] | null>(null);
  const [result, setResult] = useState<PachinkoResult | null>(null);
  const [landedSlot, setLandedSlot] = useState(-1);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [history, setHistory] = useState<PachinkoResult[]>([]);
  const [error, setError] = useState('');
  const [dropping, setDropping] = useState(false);

  const multipliers = result?.multipliers ?? activeMultipliers ?? previewMultipliers[risk][rows];
  const visibleSlot = landedSlot >= 0 ? landedSlot : -1;

  const clearPhysics = useCallback(() => {
    if (settleTimerRef.current) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (renderRef.current) {
      Matter.Render.stop(renderRef.current);
      renderRef.current.canvas.remove();
      renderRef.current = null;
    }
    if (runnerRef.current) {
      Matter.Runner.stop(runnerRef.current);
      runnerRef.current = null;
    }
    if (engineRef.current) {
      Matter.Composite.clear(engineRef.current.world, false);
      Matter.Engine.clear(engineRef.current);
      engineRef.current = null;
    }
    ballRef.current = null;
    landedOnceRef.current = false;
  }, []);

  const buildPhysicsBoard = useCallback((slotCountOverride?: number) => {
    if (!boardRef.current) return;
    clearPhysics();

    const width = 900;
    const height = 760;
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0.92 } });
    const render = Matter.Render.create({
      element: boardRef.current,
      engine,
      options: {
        background: 'transparent',
        height,
        pixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
        showAngleIndicator: false,
        wireframes: false,
        width,
      },
    });
    const runner = Matter.Runner.create();
    const slotCount = slotCountOverride ?? previewMultipliers[risk][rows].length;
    const slotInset = 20;
    const slotGap = 6;
    const slotAreaWidth = width - slotInset * 2;
    const slotWidth = (slotAreaWidth - slotGap * (slotCount - 1)) / slotCount;
    const slotPitch = slotWidth + slotGap;
    const slotCenters = Array.from({ length: slotCount }, (_, index) => slotInset + slotWidth / 2 + slotPitch * index);
    const bumperFill = themeColor('--color-gold-soft', 'goldenrod');
    const dividerFill = themeColor('--color-gold-soft', 'goldenrod');
    const pegFill = themeColor('--color-on-dark-muted', 'lightgray');
    const pegStroke = themeColor('--color-purple', 'mediumpurple');
    const pegActiveFill = themeColor('--color-gold-highlight', 'gold');
    const pegActiveStroke = themeColor('--gold', 'goldenrod');
    slotCentersRef.current = slotCenters;

    const walls = [
      Matter.Bodies.rectangle(-14, height / 2, 28, height, { isStatic: true, render: { fillStyle: 'transparent' } }),
      Matter.Bodies.rectangle(width + 14, height / 2, 28, height, { isStatic: true, render: { fillStyle: 'transparent' } }),
      Matter.Bodies.rectangle(width / 2, height + 18, width, 36, { isStatic: true, render: { fillStyle: 'transparent' } }),
      Matter.Bodies.rectangle(94, 210, 210, 18, {
        angle: -0.5,
        isStatic: true,
        render: { fillStyle: bumperFill },
      }),
      Matter.Bodies.rectangle(width - 94, 210, 210, 18, {
        angle: 0.5,
        isStatic: true,
        render: { fillStyle: bumperFill },
      }),
    ];

    const pegs: Matter.Body[] = [];
    const top = 105;
    const bottom = height - 160;
    for (let row = 0; row < rows; row += 1) {
      const count = row + 2;
      const spacing = Math.min(64, 700 / Math.max(count - 1, 1));
      const y = top + (row / Math.max(rows - 1, 1)) * (bottom - top);
      const startX = width / 2 - ((count - 1) * spacing) / 2;
      for (let index = 0; index < count; index += 1) {
        pegs.push(Matter.Bodies.circle(startX + index * spacing, y, 8, {
          isStatic: true,
          label: 'peg',
          render: {
            fillStyle: pegFill,
            strokeStyle: pegStroke,
            lineWidth: 2,
          },
          restitution: 0.95,
        }));
      }
    }

    const dividers: Matter.Body[] = [];
    for (let index = 0; index <= slotCount; index += 1) {
      const x = index === 0
        ? slotInset - slotGap / 2
        : index === slotCount
          ? width - slotInset + slotGap / 2
          : slotInset + slotWidth * index + slotGap * (index - 0.5);
      dividers.push(Matter.Bodies.rectangle(x, height - 58, 4, 76, {
        isStatic: true,
        render: { fillStyle: dividerFill },
      }));
    }

    const sensors = slotCenters.map((x, index) => Matter.Bodies.rectangle(x, height - 26, slotWidth, 52, {
      isSensor: true,
      isStatic: true,
      label: `slot-${index}`,
      render: { fillStyle: 'transparent' },
    }));

    Matter.Composite.add(engine.world, [...walls, ...pegs, ...dividers, ...sensors]);

    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA, pair.bodyB];
        const peg = bodies.find((body) => body.label === 'peg');
        const ball = bodies.find((body) => body.label === 'ball');
        const slot = bodies.find((body) => body.label.startsWith('slot-'));

        if (peg && ball) {
          peg.render.fillStyle = pegActiveFill;
          peg.render.strokeStyle = pegActiveStroke;
          window.setTimeout(() => {
            peg.render.fillStyle = pegFill;
            peg.render.strokeStyle = pegStroke;
          }, 140);
        }

        if (slot && ballRef.current && ball && !landedOnceRef.current) {
          const parsedSlot = Number(slot.label.replace('slot-', ''));
          landedOnceRef.current = true;
          setLandedSlot(parsedSlot);
          if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
          settleTimerRef.current = window.setTimeout(() => {
            Matter.Body.setVelocity(ballRef.current!, { x: 0, y: 0 });
            Matter.Body.setPosition(ballRef.current!, { x: slotCentersRef.current[parsedSlot], y: height - 58 });
          }, 120);
        }
      }
    });

    Matter.Events.on(engine, 'beforeUpdate', () => {
      const ball = ballRef.current;
      if (!ball) return;

      if (ball.position.y > height * 0.78) {
        Matter.Body.setVelocity(ball, {
          x: Math.max(-3.6, Math.min(3.6, ball.velocity.x)),
          y: Math.min(8.6, ball.velocity.y),
        });
      }
    });

    Matter.Render.run(render);
    Matter.Runner.run(runner, engine);

    engineRef.current = engine;
    renderRef.current = render;
    runnerRef.current = runner;
  }, [clearPhysics, risk, rows]);

  useEffect(() => {
    buildPhysicsBoard();
    return clearPhysics;
  }, [buildPhysicsBoard, clearPhysics]);

  function spawnBall() {
    const engine = engineRef.current;
    if (!engine) return;
    const width = 900;
    const naturalWobble = (Math.random() - 0.5) * 8;
    const ball = Matter.Bodies.circle(width / 2 + naturalWobble, 54, 13, {
      density: 0.003,
      friction: 0.02,
      frictionAir: 0.018,
      label: 'ball',
      render: {
        fillStyle: themeColor('--color-gold-highlight', 'gold'),
        strokeStyle: themeColor('--cream', 'white'),
        lineWidth: 2,
      },
      restitution: 0.58,
    });

    ballRef.current = ball;
    Matter.Composite.add(engine.world, ball);
    Matter.Body.setVelocity(ball, { x: naturalWobble * 0.015, y: 0.7 });
  }

  useEffect(() => {
    if (!dropping || landedSlot < 0 || !ticketRef.current || settlingRef.current) return;

    let cancelled = false;
    const ticketId = ticketRef.current;
    settlingRef.current = true;

    apiPost<PachinkoResult>('/pachinko/settle', { ticketId, finalSlot: landedSlot })
      .then(async (out) => {
        if (cancelled) return;
        setResult(out);
        setActiveMultipliers(out.multipliers);
        setHistory((current) => [out, ...current].slice(0, 6));
        if (out.payout > 0) {
          emitBalanceDelta(out.payout, 'pachinko-payout');
        }
        await refreshUser();
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Impossible de valider le lancer');
      })
      .finally(() => {
        if (cancelled) return;
        ticketRef.current = null;
        settlingRef.current = false;
        setDropping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dropping, landedSlot, refreshUser]);

  async function drop(event: FormEvent) {
    event.preventDefault();
    if (dropping) return;

    setError('');
    setDropping(true);
    setResult(null);
    setLandedSlot(-1);
    ticketRef.current = null;
    settlingRef.current = false;

    try {
      emitBalanceDelta(-Number(bet), 'pachinko-bet');
      const out = await apiPost<PachinkoStartResult>('/pachinko/start', { bet: Number(bet), risk, rows });
      ticketRef.current = out.ticketId;
      setActiveMultipliers(out.multipliers);
      buildPhysicsBoard(out.multipliers.length);
      window.setTimeout(() => spawnBall(), 80);

      await refreshUser();
    } catch (err) {
      emitBalanceDelta(Number(bet), 'pachinko-refund');
      setError(err instanceof Error ? err.message : 'Pachinko indisponible');
      setLandedSlot(-1);
      ticketRef.current = null;
      setDropping(false);
    }
  }

  function resetBoard() {
    setResult(null);
    setActiveMultipliers(null);
    setLandedSlot(-1);
    setError('');
    buildPhysicsBoard(previewMultipliers[risk][rows].length);
  }

  return (
    <section className="pachinko-page">
      <header className="pachinko-hero interactive-card">
        <div>
          <span className="welcome-pill"><Sparkles size={15} /> Pachinko</span>
          <h1>Drop la bille.</h1>
          <p>Choisis ton risque, lance une bille et vise les multiplicateurs sur les bords du plateau.</p>
          <div className="button-row">
            <button className="button" disabled={dropping || bet <= 0} form="pachinko-controls" type="submit">
              <Play size={18} /> {dropping ? 'Chute...' : 'Lancer'}
            </button>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Regles
            </button>
          </div>
        </div>
        <div className="pachinko-hero-meter">
          <Gauge size={34} />
          <span>Risque</span>
          <strong>{riskLabels[risk].label}</strong>
          <em>{riskLabels[risk].text}</em>
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="pachinko-layout">
        <section className="pachinko-board-panel interactive-card">
          <div className="pachinko-board" style={{ '--pachinko-rows': rows } as CSSProperties}>
            <div className="pachinko-dropper">DROP</div>
            <div className="pachinko-canvas" ref={boardRef} />
            <div className="pachinko-slots" style={{ '--slot-count': multipliers.length } as CSSProperties}>
              {multipliers.map((multiplier, index) => (
                <div className={visibleSlot === index ? 'pachinko-slot active' : 'pachinko-slot'} key={`${multiplier}-${index}`}>
                  {formatMultiplier(multiplier)}
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="pachinko-side">
          <form className="pachinko-controls interactive-card" id="pachinko-controls" onSubmit={drop}>
            <div className="card-heading">
              <h2>Parametres</h2>
              <button className="icon-button" onClick={resetBoard} type="button" title="Reinitialiser">
                <RefreshCcw size={17} />
              </button>
            </div>
            <label>
              <span>Mise</span>
              <input disabled={dropping} min={1} type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
            </label>
            <label>
              <span>Risque</span>
              <div className="pachinko-risk-tabs">
                {(Object.keys(riskLabels) as PachinkoRisk[]).map((item) => (
                  <button
                    className={risk === item ? 'active' : ''}
                    disabled={dropping}
                    key={item}
                    onClick={() => {
                      setRisk(item);
                      setActiveMultipliers(null);
                      setResult(null);
                    }}
                    type="button"
                  >
                    {riskLabels[item].label}
                  </button>
                ))}
              </div>
            </label>
            <label>
              <span>Lignes de pegs</span>
              <select
                disabled={dropping}
                value={rows}
                onChange={(event) => {
                  setRows(Number(event.target.value));
                  setActiveMultipliers(null);
                  setResult(null);
                }}
              >
                <option value={8}>8 lignes</option>
                <option value={10}>10 lignes</option>
                <option value={12}>12 lignes</option>
              </select>
            </label>
            <button className="button" disabled={dropping || bet <= 0} type="submit">
              <CircleDollarSign size={18} /> Lancer pour {Number(bet || 0).toLocaleString('fr-FR')} credits
            </button>
          </form>

          <section className="pachinko-result interactive-card">
            <div className="card-heading">
              <h2>Resultat</h2>
              {result ? <strong className={result.net >= 0 ? 'positive' : 'negative'}>{result.net >= 0 ? '+' : ''}{result.net} credits</strong> : null}
            </div>
            {result ? (
              <div className="pachinko-result-main">
                <span>Slot #{result.finalSlot + 1}</span>
                <strong>{formatMultiplier(result.multiplier)}</strong>
                <em>Payout {result.payout.toLocaleString('fr-FR')} credits</em>
              </div>
            ) : (
              <p>Le resultat apparaitra quand la bille atteint un multiplicateur.</p>
            )}
          </section>

          <section className="pachinko-history interactive-card">
            <h2>Historique</h2>
            {history.length > 0 ? history.map((item, index) => (
              <div className="pachinko-history-row" key={`${item.finalSlot}-${index}`}>
                <span>{formatMultiplier(item.multiplier)}</span>
                <strong className={item.net >= 0 ? 'positive' : 'negative'}>{item.net >= 0 ? '+' : ''}{item.net}</strong>
              </div>
            )) : <p>Aucun lancer pour le moment.</p>}
          </section>
        </aside>
      </div>

      <aside className={rulesOpen ? 'pachinko-rules-drawer open' : 'pachinko-rules-drawer'} aria-hidden={!rulesOpen}>
        <div className="panel-heading">
          <div>
            <h2>Regles du Pachinko</h2>
            <p>La bille descend de peg en peg jusqu'a un multiplicateur.</p>
          </div>
          <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="pachinko-rules-scroll">
          <article>
            <h3>Objectif</h3>
            <p>Chaque lancer coute la mise choisie. Le slot final multiplie cette mise pour calculer le payout.</p>
          </article>
          <article>
            <h3>Risque</h3>
            <p>Stable limite les pertes et gains. Volatil concentre les gros multiplicateurs sur les extremites.</p>
          </article>
          <article>
            <h3>Lignes</h3>
            <p>Plus de lignes signifie plus de slots et une chute plus longue, avec des multiplicateurs plus extremes.</p>
          </article>
        </div>
      </aside>
    </section>
  );
}

export default function PachinkoPage() {
  return (
    <RequireAuth>
      <PachinkoContent />
    </RequireAuth>
  );
}
