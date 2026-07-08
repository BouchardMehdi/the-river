'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Coins,
  Gauge,
  Play,
  RefreshCcw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';
import { emitGameSound } from '@/lib/sound-events';

type SlotMachineType = 'SLOT_3X3' | 'SLOT_3X5' | 'SLOT_5X5';
type SymbolId = 'CHERRY' | 'LEMON' | 'BELL' | 'CLUB' | 'DIAMOND' | 'CHEST' | 'SEVEN';
type Grid = SymbolId[][];

type SlotWin = {
  name: string;
  symbol: SymbolId;
  cells: Array<[number, number]>;
  payout: number;
};

type SpinResult = {
  grid: Grid;
  wins: SlotWin[];
  payout: number;
};

type SlotsResponse = {
  machine: SlotMachineType;
  spins: number;
  totalCost: number;
  betPerSpin: number;
  totalPayout: number;
  net: number;
  credits: number;
  results: SpinResult[];
  unlockedNow?: string[];
};

const symbolOrder: SymbolId[] = ['CHERRY', 'LEMON', 'BELL', 'CLUB', 'DIAMOND', 'CHEST', 'SEVEN'];

const symbolMeta: Record<SymbolId, { glyph: string; label: string; mult: string; tone: string }> = {
  CHERRY: { glyph: '🍒', label: 'Cerise', mult: 'x0.6', tone: 'red' },
  LEMON: { glyph: '🍋', label: 'Citron', mult: 'x0.8', tone: 'yellow' },
  BELL: { glyph: '🔔', label: 'Cloche', mult: 'x1.2', tone: 'gold' },
  CLUB: { glyph: '♣️', label: 'Trefle', mult: 'x1.5', tone: 'green' },
  DIAMOND: { glyph: '💎', label: 'Diamant', mult: 'x2.5', tone: 'blue' },
  CHEST: { glyph: '🎁', label: 'Coffre', mult: 'x4', tone: 'purple' },
  SEVEN: { glyph: '7️⃣', label: 'Seven', mult: 'x8', tone: 'red' },
};

const machines: Record<SlotMachineType, { label: string; rows: number; cols: number; prices: Record<1 | 10, number>; description: string }> = {
  SLOT_3X3: {
    label: 'Classic 3 x 3',
    rows: 3,
    cols: 3,
    prices: { 1: 5, 10: 40 },
    description: 'Lignes, colonnes, diagonales et jackpot compact.',
  },
  SLOT_3X5: {
    label: 'River 3 x 5',
    rows: 3,
    cols: 5,
    prices: { 1: 15, 10: 100 },
    description: 'Rouleaux larges avec zigzags, oeil et gros patterns.',
  },
  SLOT_5X5: {
    label: 'Vault 5 x 5',
    rows: 5,
    cols: 5,
    prices: { 1: 25, 10: 200 },
    description: 'Grille premium avec croix, big X, sablier et jackpot total.',
  },
};

const patternLabels: Record<string, { label: string; detail: string; rank: number }> = {
  LINE_3: { label: 'Ligne de 3', detail: '3 symboles identiques alignes horizontalement.', rank: 1 },
  COL_3: { label: 'Colonne de 3', detail: 'Une colonne complete identique.', rank: 1 },
  DIAG_3: { label: 'Diagonale de 3', detail: '3 symboles identiques en diagonale.', rank: 2 },
  X_3: { label: 'X compact', detail: 'Les deux diagonales d une grille 3 x 3.', rank: 3 },
  LINE_4: { label: 'Ligne de 4', detail: '4 symboles identiques sur une ligne.', rank: 4 },
  LINE_5: { label: 'Ligne de 5', detail: '5 symboles identiques sur une ligne.', rank: 5 },
  COL_5: { label: 'Colonne de 5', detail: 'Une colonne complete sur 5 lignes.', rank: 5 },
  DIAG_5: { label: 'Diagonale de 5', detail: 'Une grande diagonale complete.', rank: 6 },
  ZIG: { label: 'Zig', detail: 'Pattern haut-centre-haut en 3 x 5.', rank: 6 },
  ZAG: { label: 'Zag', detail: 'Pattern bas-centre-bas en 3 x 5.', rank: 6 },
  TOP_2ROWS: { label: 'Pyramide haute', detail: 'Forme concentree vers le haut.', rank: 7 },
  BOTTOM_2ROWS: { label: 'Pyramide basse', detail: 'Forme concentree vers le bas.', rank: 7 },
  EYE: { label: 'Oeil', detail: 'Contour central quasi complet.', rank: 8 },
  CROSS: { label: 'Croix', detail: 'Ligne centrale et colonne centrale.', rank: 8 },
  BIG_X: { label: 'Big X', detail: 'Les deux grandes diagonales.', rank: 9 },
  HOURGLASS: { label: 'Sablier', detail: 'Forme complete haut-bas resserree au centre.', rank: 10 },
  JACKPOT: { label: 'Jackpot', detail: 'Toute la grille avec le meme symbole.', rank: 11 },
};

const machinePatterns: Record<SlotMachineType, string[]> = {
  SLOT_3X3: ['LINE_3', 'COL_3', 'DIAG_3', 'X_3', 'JACKPOT'],
  SLOT_3X5: ['COL_3', 'LINE_3', 'LINE_4', 'LINE_5', 'DIAG_3', 'ZIG', 'ZAG', 'TOP_2ROWS', 'BOTTOM_2ROWS', 'EYE', 'JACKPOT'],
  SLOT_5X5: ['LINE_5', 'COL_5', 'DIAG_5', 'CROSS', 'BIG_X', 'HOURGLASS', 'JACKPOT'],
};

function makeGrid(rows: number, cols: number, offset = 0): Grid {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => symbolOrder[(row * 2 + col * 3 + offset) % symbolOrder.length]),
  );
}

function winRank(win: SlotWin) {
  return patternLabels[win.name]?.rank ?? 0;
}

function cellKey(row: number, col: number) {
  return `${row}-${col}`;
}

function patternPreview(pattern: string, machine: SlotMachineType) {
  const { rows, cols } = machines[machine];
  const middleRow = Math.floor(rows / 2);
  const middleCol = Math.floor(cols / 2);
  const cells: Array<[number, number]> = [];

  if (pattern === 'LINE_3') for (let col = 0; col < 3; col += 1) cells.push([middleRow, col]);
  if (pattern === 'LINE_4') for (let col = 0; col < 4; col += 1) cells.push([middleRow, col]);
  if (pattern === 'LINE_5') for (let col = 0; col < 5; col += 1) cells.push([middleRow, col]);
  if (pattern === 'COL_3') for (let row = 0; row < 3; row += 1) cells.push([row, middleCol]);
  if (pattern === 'COL_5') for (let row = 0; row < 5; row += 1) cells.push([row, middleCol]);
  if (pattern === 'DIAG_3') for (let index = 0; index < 3; index += 1) cells.push([index, index]);
  if (pattern === 'DIAG_5') for (let index = 0; index < 5; index += 1) cells.push([index, index]);
  if (pattern === 'X_3') cells.push([0, 0], [1, 1], [2, 2], [2, 0], [0, 2]);
  if (pattern === 'ZIG') cells.push([0, 0], [1, 1], [2, 2], [1, 3], [0, 4]);
  if (pattern === 'ZAG') cells.push([2, 0], [1, 1], [0, 2], [1, 3], [2, 4]);
  if (pattern === 'TOP_2ROWS') {
    for (let col = 0; col < 5; col += 1) cells.push([0, col]);
    for (let col = 1; col <= 3; col += 1) cells.push([1, col]);
    cells.push([2, 2]);
  }
  if (pattern === 'BOTTOM_2ROWS') {
    cells.push([0, 2]);
    for (let col = 1; col <= 3; col += 1) cells.push([1, col]);
    for (let col = 0; col < 5; col += 1) cells.push([2, col]);
  }
  if (pattern === 'EYE') {
    for (let col = 1; col <= 3; col += 1) cells.push([0, col]);
    for (const col of [0, 1, 3, 4]) cells.push([1, col]);
    for (let col = 1; col <= 3; col += 1) cells.push([2, col]);
  }
  if (pattern === 'CROSS') {
    for (let col = 0; col < 5; col += 1) cells.push([2, col]);
    for (let row = 0; row < 5; row += 1) cells.push([row, 2]);
  }
  if (pattern === 'BIG_X') {
    for (let index = 0; index < 5; index += 1) cells.push([index, index], [4 - index, index]);
  }
  if (pattern === 'HOURGLASS') {
    for (let col = 0; col < 5; col += 1) cells.push([0, col]);
    for (let col = 1; col <= 3; col += 1) cells.push([1, col]);
    cells.push([2, 2]);
    for (let col = 1; col <= 3; col += 1) cells.push([3, col]);
    for (let col = 0; col < 5; col += 1) cells.push([4, col]);
  }
  if (pattern === 'JACKPOT') {
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) cells.push([row, col]);
  }

  return { rows, cols, cells: new Set(cells.map(([row, col]) => cellKey(row, col))) };
}

function PatternDiagram({ pattern, machine }: { pattern: string; machine: SlotMachineType }) {
  const preview = patternPreview(pattern, machine);
  return (
    <div className="slot-pattern-diagram" style={{ '--pattern-cols': preview.cols, '--pattern-rows': preview.rows } as React.CSSProperties}>
      {Array.from({ length: preview.rows * preview.cols }, (_, index) => {
        const row = Math.floor(index / preview.cols);
        const col = index % preview.cols;
        return <i className={preview.cells.has(cellKey(row, col)) ? 'active' : ''} key={`${pattern}-${row}-${col}`} />;
      })}
    </div>
  );
}

function SlotsContent() {
  const { refreshUser, user } = useAuth();
  const [machine, setMachine] = useState<SlotMachineType>('SLOT_3X3');
  const [displayGrid, setDisplayGrid] = useState<Grid>(() => makeGrid(3, 3));
  const [result, setResult] = useState<SlotsResponse | null>(null);
  const [activeSpinIndex, setActiveSpinIndex] = useState(0);
  const [revealedSpinCount, setRevealedSpinCount] = useState(0);
  const [activeWinIndex, setActiveWinIndex] = useState(-1);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [reelsMoving, setReelsMoving] = useState(false);
  const [stoppingCols, setStoppingCols] = useState<number[]>([]);
  const timers = useRef<number[]>([]);

  const cfg = machines[machine];
  const visibleResults = useMemo(() => result?.results.slice(0, revealedSpinCount) ?? [], [result, revealedSpinCount]);
  const visibleTotalPayout = visibleResults.reduce((sum, spinResult) => sum + spinResult.payout, 0);
  const visibleNet = result ? visibleTotalPayout - result.betPerSpin * visibleResults.length : 0;
  const latest = visibleResults[activeSpinIndex] ?? null;
  const sortedWins = useMemo(() => [...(latest?.wins ?? [])].sort((a, b) => winRank(a) - winRank(b) || a.payout - b.payout), [latest]);
  const activeWin = activeWinIndex >= 0 ? sortedWins[activeWinIndex] : null;
  const highlightedCells = new Set((activeWin?.cells ?? []).map(([row, col]) => cellKey(row, col)));
  const totalRows = cfg.rows;
  const totalCols = cfg.cols;

  useEffect(() => {
    setResult(null);
    setActiveWinIndex(-1);
    setActiveSpinIndex(0);
    setRevealedSpinCount(0);
    setDisplayGrid(makeGrid(cfg.rows, cfg.cols));
  }, [cfg.cols, cfg.rows, machine]);

  useEffect(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current = [];

    if (!latest || reelsMoving) return;
    if (!sortedWins.length) {
      setActiveWinIndex(-1);
      return;
    }

    setActiveWinIndex(-1);
    sortedWins.forEach((_, index) => {
      timers.current.push(window.setTimeout(() => setActiveWinIndex(index), 260 + index * 480));
    });

    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current = [];
    };
  }, [latest, sortedWins, reelsMoving]);

  async function spin(spins: 1 | 10) {
    if (spinning) return;
    const spinCost = cfg.prices[spins];
    setError('');
    setSpinning(true);
    setReelsMoving(true);
    setStoppingCols([]);
    setActiveWinIndex(-1);
    setResult(null);
    setRevealedSpinCount(0);

    try {
      emitBalanceDelta(-spinCost, 'slots-bet');
      const startedAt = Date.now();
      const out = await apiPost<SlotsResponse>('/slots/spin', { machine, spins });
      const minDuration = 2000;
      const columnStopDelay = 240;
      const wait = (ms: number) => new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });
      const animateOneResult = async (spinResult: SpinResult, spinIndex: number, duration: number) => {
        emitGameSound('spin');
        setReelsMoving(true);
        setStoppingCols([]);
        setActiveWinIndex(-1);

        let tick = 0;
        const stopped = new Set<number>();
        const finalGrid = spinResult.grid ?? makeGrid(totalRows, totalCols);
        const interval = window.setInterval(() => {
          tick += 1;
          const movingGrid = makeGrid(totalRows, totalCols, tick + spinIndex * 3);
          setDisplayGrid(
            movingGrid.map((row, rowIndex) =>
              row.map((symbol, colIndex) => (stopped.has(colIndex) ? finalGrid[rowIndex]?.[colIndex] ?? symbol : symbol)),
            ),
          );
        }, 28);

        await wait(Math.max(0, duration - totalCols * columnStopDelay));

        for (let col = 0; col < totalCols; col += 1) {
          emitGameSound('reel-stop');
          stopped.add(col);
          setStoppingCols((previous) => [...previous, col]);
          setDisplayGrid((current) =>
            current.map((row, rowIndex) =>
              row.map((symbol, colIndex) => (colIndex === col ? finalGrid[rowIndex]?.[colIndex] ?? symbol : symbol)),
            ),
          );
          await wait(columnStopDelay);
        }

        window.clearInterval(interval);
        setResult(out);
        setActiveSpinIndex(spinIndex);
        setRevealedSpinCount(spinIndex + 1);
        setDisplayGrid(finalGrid);
        setReelsMoving(false);
        setStoppingCols([]);

        if (spinResult.payout > 0) {
          emitGameSound(spinResult.wins.some((win) => win.name === 'JACKPOT') ? 'jackpot' : 'win');
          emitBalanceDelta(spinResult.payout, 'slots-payout');
        } else {
          emitGameSound('loss');
        }
        await wait(spinResult.wins.length ? Math.min(1200, 360 + spinResult.wins.length * 260) : 280);
      };

      const firstWait = Math.max(0, minDuration - (Date.now() - startedAt));
      for (let index = 0; index < out.results.length; index += 1) {
        await animateOneResult(out.results[index], index, index === 0 ? firstWait : minDuration);
      }

      setSpinning(false);
      setReelsMoving(false);
      setStoppingCols([]);
      await refreshUser();
    } catch (err) {
      emitBalanceDelta(spinCost, 'slots-refund');
      setSpinning(false);
      setReelsMoving(false);
      setStoppingCols([]);
      setError(err instanceof Error ? err.message : 'Spin impossible');
    }
  }

  const activeSummary = latest
    ? latest.payout > 0
      ? `${latest.wins.length} combo${latest.wins.length > 1 ? 's' : ''} pour ${latest.payout} credits`
      : 'Aucun combo sur ce spin'
    : 'Pret a lancer';

  return (
    <section className="slots-page">
      <header className="slots-hero">
        <div>
          <span className="welcome-pill">
            <Sparkles size={15} /> Machine a sous
          </span>
          <h1>Fais tourner les rouleaux.</h1>
          <p>Choisis une machine, lance un spin ou une serie de 10, puis regarde les combos se reveler du plus faible au plus fort.</p>
        </div>
        <div className="slots-balance-card">
          <span>Solde</span>
          <strong>{user?.credits ?? 0} credits</strong>
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <main className="slots-layout">
        <section className="slot-machine-shell">
          <div className="slot-machine-top">
            <div>
              <span>Machine selectionnee</span>
              <h2>{cfg.label}</h2>
              <p>{cfg.description}</p>
            </div>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Regles
            </button>
          </div>

          <div className={`slot-cabinet ${reelsMoving ? 'spinning' : ''}`} style={{ '--slot-cols': totalCols, '--slot-rows': totalRows } as React.CSSProperties}>
            <div className="slot-reels">
              {Array.from({ length: totalCols }, (_, col) => (
                <div className={`slot-reel ${stoppingCols.includes(col) ? 'stopped' : ''}`} style={{ '--reel-delay': `${col * 45}ms` } as React.CSSProperties} key={`reel-${col}`}>
                  <div className="slot-reel-window">
                    {Array.from({ length: totalRows }, (_, row) => {
                      const symbol = displayGrid[row]?.[col] ?? 'CHERRY';
                      const highlighted = highlightedCells.has(cellKey(row, col));
                      return (
                        <div className={`slot-symbol ${symbolMeta[symbol].tone} ${highlighted ? 'highlighted' : ''}`} key={`${row}-${col}`}>
                          <span>{symbolMeta[symbol].glyph}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="slot-strip" aria-hidden="true">
                    {Array.from({ length: 18 }, (_, index) => {
                      const symbol = symbolOrder[(index + col * 2) % symbolOrder.length];
                      return <span key={`${col}-${index}`}>{symbolMeta[symbol].glyph}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="slot-glass" />
          </div>

          <div className="slots-action-panel">
            <div className="slot-price-card">
              <Coins size={19} />
              <div>
                <span>1 lancer</span>
                <strong>{cfg.prices[1]} credits</strong>
              </div>
            </div>
            <button className="button" disabled={spinning} onClick={() => void spin(1)} type="button">
              <Play size={18} /> {spinning ? 'Rotation...' : 'Lancer'}
            </button>
            <div className="slot-price-card premium">
              <Gauge size={19} />
              <div>
                <span>10 lancers</span>
                <strong>{cfg.prices[10]} credits</strong>
              </div>
            </div>
            <button className="button secondary" disabled={spinning} onClick={() => void spin(10)} type="button">
              <RefreshCcw size={18} /> Lancer x10
            </button>
          </div>
        </section>

        <aside className="slots-side-panel">
          <section className="slots-card">
            <h2>Machines</h2>
            <div className="slots-machine-list">
              {(Object.keys(machines) as SlotMachineType[]).map((key) => (
                <button className={machine === key ? 'active' : ''} disabled={spinning} onClick={() => setMachine(key)} type="button" key={key}>
                  <span>{machines[key].label}</span>
                  <strong>{machines[key].rows} x {machines[key].cols}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="slots-card">
            <div className="slots-result-head">
              <div>
                <h2>Resultat</h2>
                <p>{activeSummary}</p>
              </div>
              <Trophy size={22} />
            </div>
            <div className="slots-kpis">
              <span>Gain spin <strong>{latest?.payout ?? 0}</strong></span>
              <span>Total <strong>{visibleTotalPayout}</strong></span>
              <span>Net <strong className={visibleNet >= 0 ? 'positive' : 'negative'}>{visibleNet}</strong></span>
            </div>
            {visibleResults.length ? (
              <div className="slots-spin-history">
                {visibleResults.map((spinResult, index) => (
                  <button className={activeSpinIndex === index ? 'active' : ''} disabled={spinning} onClick={() => { setActiveSpinIndex(index); setDisplayGrid(spinResult.grid); }} type="button" key={index}>
                    <span>Spin {index + 1}</span>
                    <strong>{spinResult.payout} credits</strong>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </main>

      {rulesOpen ? (
        <>
          <button className="drawer-backdrop poker-rules-backdrop" onClick={() => setRulesOpen(false)} type="button" aria-label="Fermer les regles" />
          <aside className="slots-rules-drawer open">
            <div className="poker-panel-heading">
              <div>
                <h2>Combos {cfg.label}</h2>
                <p>Les symboles rares multiplient le paiement.</p>
              </div>
              <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="slot-symbol-rules">
              {symbolOrder.map((symbol) => (
                <article key={symbol}>
                  <span className={`slot-symbol-mini ${symbolMeta[symbol].tone}`}>{symbolMeta[symbol].glyph}</span>
                  <div>
                    <strong>{symbolMeta[symbol].label}</strong>
                    <p>{symbolMeta[symbol].mult}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="rules-list">
              {machinePatterns[machine].map((pattern) => (
                <article className="slot-pattern-rule" key={pattern}>
                  <PatternDiagram pattern={pattern} machine={machine} />
                  <div>
                    <strong>{patternLabels[pattern]?.label ?? pattern}</strong>
                    <p>{patternLabels[pattern]?.detail ?? 'Pattern gagnant de la machine.'}</p>
                  </div>
                  <span className="slot-pattern-rank">{patternLabels[pattern]?.rank ?? 1}</span>
                  <ChevronRight size={17} />
                </article>
              ))}
            </div>
          </aside>
        </>
      ) : null}
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
